package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

type searxResponse struct {
	Results []struct {
		Title   string `json:"title"`
		URL     string `json:"url"`
		Content string `json:"content"`
	} `json:"results"`
}

func searchSearxNG(ctx context.Context, client *http.Client, baseURL, query string, count int) ([]SearchResult, error) {
	u, err := url.Parse(strings.TrimRight(baseURL, "/") + "/search")
	if err != nil {
		return nil, err
	}
	q := u.Query()
	q.Set("q", query)
	q.Set("format", "json")
	q.Set("language", "en")
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")

	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, fmt.Errorf("searxng status %d", res.StatusCode)
	}

	var payload searxResponse
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("malformed searxng response: %w", err)
	}

	out := make([]SearchResult, 0, count)
	for _, r := range payload.Results {
		item, ok := normalizeResult(r.Title, r.URL, r.Content)
		if !ok {
			continue
		}
		out = append(out, item)
		if len(out) >= count {
			break
		}
	}
	return out, nil
}
