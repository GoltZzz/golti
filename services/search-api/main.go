package main

import (
	"context"
	"encoding/json"
	"flag"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"
)

func main() {
	host := flag.String("host", "127.0.0.1", "bind host")
	port := flag.Int("port", 8741, "bind port")
	token := flag.String("token", "", "local auth token (required)")
	searxURL := flag.String("searxng", envOr("SEARXNG_URL", ""), "optional SearXNG base URL")
	flag.Parse()

	if strings.TrimSpace(*token) == "" {
		log.Fatal("missing required -token")
	}
	if *host != "127.0.0.1" && *host != "localhost" {
		log.Fatal("host must be 127.0.0.1 for local-only binding")
	}

	srv := NewServer(*token, strings.TrimRight(*searxURL, "/"))
	mux := http.NewServeMux()
	mux.HandleFunc("/health", srv.handleHealth)
	mux.HandleFunc("/v1/search", srv.handleSearch)

	addr := net.JoinHostPort(*host, strconv.Itoa(*port))
	httpServer := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      45 * time.Second,
	}

	go func() {
		log.Printf("golti-search-api listening on http://%s", addr)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_ = httpServer.Shutdown(ctx)
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

type Server struct {
	token    string
	searxURL string
	client   *http.Client
}

func NewServer(token, searxURL string) *Server {
	return &Server{
		token:    token,
		searxURL: searxURL,
		client: &http.Client{
			Timeout: 20 * time.Second,
		},
	}
}

type healthResponse struct {
	Status      string `json:"status"`
	Engine      string `json:"engine"`
	SearxReady  bool   `json:"searxReady"`
	Version     string `json:"version"`
}

type searchRequest struct {
	Query      string `json:"query"`
	MaxResults int    `json:"maxResults"`
}

type SearchResult struct {
	Title   string `json:"title"`
	URL     string `json:"url"`
	Snippet string `json:"snippet"`
}

type searchResponse struct {
	Results []SearchResult `json:"results"`
	Engine  string         `json:"engine"`
}

type errorResponse struct {
	Error string `json:"error"`
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, errorResponse{Error: "method not allowed"})
		return
	}
	engine := "builtin"
	searxReady := false
	if s.searxURL != "" {
		if ok := s.probeSearx(r.Context()); ok {
			engine = "searxng"
			searxReady = true
		}
	}
	writeJSON(w, http.StatusOK, healthResponse{
		Status:     "ok",
		Engine:     engine,
		SearxReady: searxReady,
		Version:    "0.1.1",
	})
}

func (s *Server) handleSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, errorResponse{Error: "method not allowed"})
		return
	}
	if !s.authorized(r) {
		writeJSON(w, http.StatusUnauthorized, errorResponse{Error: "unauthorized"})
		return
	}

	var req searchRequest
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	if err := dec.Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "invalid request body"})
		return
	}
	query := strings.TrimSpace(req.Query)
	if query == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "query is required"})
		return
	}
	count := clamp(req.MaxResults, 1, 10)

	ctx, cancel := context.WithTimeout(r.Context(), 18*time.Second)
	defer cancel()

	var (
		results []SearchResult
		engine  string
		err     error
	)

	if s.searxURL != "" {
		results, err = searchSearxNG(ctx, s.client, s.searxURL, query, count)
		if err == nil && len(results) > 0 {
			engine = "searxng"
		} else if err != nil {
			log.Printf("searxng fallback: %v", err)
		} else {
			log.Printf("searxng fallback: empty results")
		}
	}

	if engine == "" {
		results, err = searchDuckDuckGo(ctx, s.client, query, count)
		engine = "builtin"
	}

	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorResponse{Error: userSafeError(err)})
		return
	}

	writeJSON(w, http.StatusOK, searchResponse{Results: results, Engine: engine})
}

func (s *Server) authorized(r *http.Request) bool {
	auth := r.Header.Get("Authorization")
	if strings.HasPrefix(auth, "Bearer ") && strings.TrimPrefix(auth, "Bearer ") == s.token {
		return true
	}
	return r.Header.Get("X-Golti-Token") == s.token
}

func (s *Server) probeSearx(ctx context.Context) bool {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.searxURL+"/", nil)
	if err != nil {
		return false
	}
	res, err := s.client.Do(req)
	if err != nil {
		return false
	}
	defer res.Body.Close()
	return res.StatusCode >= 200 && res.StatusCode < 500
}

func clamp(v, min, max int) int {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}

func userSafeError(err error) string {
	msg := err.Error()
	switch {
	case strings.Contains(msg, "timeout") || strings.Contains(msg, "deadline"):
		return "Search timed out. Please try again."
	case strings.Contains(msg, "connection refused"):
		return "Search is temporarily unavailable."
	default:
		return "Search is temporarily unavailable."
	}
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func normalizeResult(title, url, snippet string) (SearchResult, bool) {
	title = strings.TrimSpace(title)
	url = strings.TrimSpace(url)
	snippet = strings.TrimSpace(snippet)
	if url == "" {
		return SearchResult{}, false
	}
	if title == "" {
		title = url
	}
	return SearchResult{Title: title, URL: url, Snippet: snippet}, true
}
