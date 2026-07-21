package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestHealth(t *testing.T) {
	s := NewServer("secret", "")
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rr := httptest.NewRecorder()
	s.handleHealth(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d", rr.Code)
	}
	var body healthResponse
	if err := json.NewDecoder(rr.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body.Status != "ok" {
		t.Fatalf("status=%s", body.Status)
	}
}

func TestSearchRequiresToken(t *testing.T) {
	s := NewServer("secret", "")
	payload, _ := json.Marshal(searchRequest{Query: "hello", MaxResults: 3})
	req := httptest.NewRequest(http.MethodPost, "/v1/search", bytes.NewReader(payload))
	rr := httptest.NewRecorder()
	s.handleSearch(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rr.Code)
	}
}

func TestSearchRejectsEmptyQuery(t *testing.T) {
	s := NewServer("secret", "")
	payload, _ := json.Marshal(searchRequest{Query: "  ", MaxResults: 3})
	req := httptest.NewRequest(http.MethodPost, "/v1/search", bytes.NewReader(payload))
	req.Header.Set("Authorization", "Bearer secret")
	rr := httptest.NewRecorder()
	s.handleSearch(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rr.Code)
	}
}

func TestNormalizeSearxResults(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/search", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"results": []map[string]string{
				{"title": "One", "url": "https://example.com/1", "content": "Snippet 1"},
				{"title": "", "url": "", "content": "skip"},
				{"title": "Two", "url": "https://example.com/2", "content": "Snippet 2"},
			},
		})
	})
	server := httptest.NewServer(mux)
	defer server.Close()

	client := &http.Client{Timeout: 2 * time.Second}
	results, err := searchSearxNG(t.Context(), client, server.URL, "q", 5)
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 2 {
		t.Fatalf("len=%d", len(results))
	}
	if results[0].Title != "One" || results[0].URL != "https://example.com/1" {
		t.Fatalf("unexpected first result: %+v", results[0])
	}
}

func TestMalformedSearxResponse(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/search", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("not-json"))
	})
	server := httptest.NewServer(mux)
	defer server.Close()

	client := &http.Client{Timeout: 2 * time.Second}
	_, err := searchSearxNG(t.Context(), client, server.URL, "q", 3)
	if err == nil || !strings.Contains(err.Error(), "malformed") {
		t.Fatalf("expected malformed error, got %v", err)
	}
}

func TestUserSafeError(t *testing.T) {
	msg := userSafeError(errString("context deadline exceeded"))
	if !strings.Contains(strings.ToLower(msg), "timed out") {
		t.Fatalf("msg=%s", msg)
	}
}

func TestParseDuckDuckGoHTMLCurrentLayout(t *testing.T) {
	html := `
<div class="result results_links results_links_deep web-result ">
  <div class="links_main links_deep result__body">
    <h2 class="result__title">
      <a rel="nofollow" class="result__a" href="https://openai.com/">OpenAI | Research &amp; Deployment</a>
    </h2>
    <a class="result__snippet" href="https://openai.com/">We believe our research will eventually lead to AGI.</a>
    <div class="clear"></div>
  </div>
</div>
<div class="result results_links results_links_deep web-result ">
  <div class="links_main links_deep result__body">
    <h2 class="result__title">
      <a rel="nofollow" class="result__a" href="https://example.com/news">Latest AI news</a>
    </h2>
    <a class="result__snippet" href="https://example.com/news">Today&#x27;s headlines about artificial intelligence.</a>
    <div class="clear"></div>
  </div>
</div>`

	results := parseDuckDuckGoHTML(html, 5)
	if len(results) != 2 {
		t.Fatalf("len=%d results=%+v", len(results), results)
	}
	if results[0].URL != "https://openai.com/" || results[0].Title != "OpenAI | Research & Deployment" {
		t.Fatalf("first=%+v", results[0])
	}
	if !strings.Contains(results[1].Snippet, "Today's headlines") {
		t.Fatalf("snippet=%q", results[1].Snippet)
	}
}

func TestParseDuckDuckGoHTMLLegacyLayout(t *testing.T) {
	html := `
<a rel="nofollow" class="result-link" href="https://example.com/a">Alpha</a>
<td class="result-snippet">Snippet A</td>
<a rel="nofollow" class="result-link" href="https://example.com/b">Beta</a>
<td class="result-snippet">Snippet B</td>`

	results := parseDuckDuckGoHTML(html, 5)
	if len(results) != 2 {
		t.Fatalf("len=%d", len(results))
	}
	if results[0].URL != "https://example.com/a" || results[0].Title != "Alpha" {
		t.Fatalf("first=%+v", results[0])
	}
}

type errString string

func (e errString) Error() string { return string(e) }
