package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
)

var (
	// Current DuckDuckGo HTML layout (result__a / result__snippet).
	resultBodyRe = regexp.MustCompile(`(?s)<div class="links_main[^"]*result__body"[^>]*>(.*?)<div class="clear"`)
	resultLinkRe = regexp.MustCompile(`(?s)<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>|<a[^>]*href="([^"]+)"[^>]*class="result__a"[^>]*>(.*?)</a>`)
	resultSnipRe = regexp.MustCompile(`(?s)<a[^>]*class="result__snippet"[^>]*>(.*?)</a>|<td class="result__snippet"[^>]*>(.*?)</td>`)

	// Legacy layout kept as a secondary parse path.
	legacyResultBlockRe = regexp.MustCompile(`(?s)<a[^>]+rel="nofollow"[^>]+class="result-link"[^>]*href="([^"]+)"[^>]*>(.*?)</a>.*?<td class="result-snippet"[^>]*>(.*?)</td>`)

	tagRe    = regexp.MustCompile(`<[^>]+>`)
	entityRe = strings.NewReplacer(
		"&amp;", "&",
		"&lt;", "<",
		"&gt;", ">",
		"&quot;", `"`,
		"&#39;", "'",
		"&#x27;", "'",
		"&#x2F;", "/",
		"&nbsp;", " ",
	)
)

// searchDuckDuckGo uses the DuckDuckGo HTML endpoint as a zero-config builtin engine.
func searchDuckDuckGo(ctx context.Context, client *http.Client, query string, count int) ([]SearchResult, error) {
	form := url.Values{}
	form.Set("q", query)
	form.Set("kl", "us-en")

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://html.duckduckgo.com/html/", strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; GoltiSearch/0.1; +local)")

	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, fmt.Errorf("builtin search status %d", res.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(res.Body, 2<<20))
	if err != nil {
		return nil, err
	}

	out := parseDuckDuckGoHTML(string(body), count)
	if len(out) == 0 {
		// Fallback: Instant Answer JSON (often sparse, but better than empty)
		return searchDuckDuckGoInstant(ctx, client, query, count)
	}
	return out, nil
}

func parseDuckDuckGoHTML(html string, count int) []SearchResult {
	out := make([]SearchResult, 0, count)
	seen := map[string]struct{}{}

	appendResult := func(link, title, snippet string) {
		link = unwrapDuckDuckGoRedirect(cleanText(link))
		title = cleanText(title)
		snippet = cleanText(snippet)
		if link == "" {
			return
		}
		if _, ok := seen[link]; ok {
			return
		}
		seen[link] = struct{}{}
		item, ok := normalizeResult(title, link, snippet)
		if !ok {
			return
		}
		out = append(out, item)
	}

	for _, body := range resultBodyRe.FindAllStringSubmatch(html, count*3) {
		if len(out) >= count {
			break
		}
		if len(body) < 2 {
			continue
		}
		block := body[1]
		linkMatch := resultLinkRe.FindStringSubmatch(block)
		if linkMatch == nil {
			continue
		}
		link, title := pickLinkTitle(linkMatch)
		snipMatch := resultSnipRe.FindStringSubmatch(block)
		snippet := ""
		if snipMatch != nil {
			snippet = firstNonEmpty(snipMatch[1:]...)
		}
		appendResult(link, title, snippet)
	}

	if len(out) == 0 {
		for _, m := range legacyResultBlockRe.FindAllStringSubmatch(html, count*2) {
			if len(out) >= count {
				break
			}
			if len(m) < 4 {
				continue
			}
			appendResult(m[1], m[2], m[3])
		}
	}

	return out
}

func pickLinkTitle(m []string) (link, title string) {
	// Groups: 1/2 for class-before-href alternate order handled in regex as 1,2 or 3,4
	if len(m) >= 3 && m[1] != "" {
		return m[1], m[2]
	}
	if len(m) >= 5 {
		return m[3], m[4]
	}
	return "", ""
}

func firstNonEmpty(parts ...string) string {
	for _, p := range parts {
		if strings.TrimSpace(p) != "" {
			return p
		}
	}
	return ""
}

func unwrapDuckDuckGoRedirect(link string) string {
	if strings.HasPrefix(link, "//") {
		link = "https:" + link
	}
	if strings.Contains(link, "uddg=") || strings.Contains(link, "duckduckgo.com/l/?") {
		if u, err := url.Parse(link); err == nil {
			if uddg := u.Query().Get("uddg"); uddg != "" {
				if decoded, err := url.QueryUnescape(uddg); err == nil {
					return decoded
				}
				return uddg
			}
		}
	}
	return link
}

func searchDuckDuckGoInstant(ctx context.Context, client *http.Client, query string, count int) ([]SearchResult, error) {
	u := "https://api.duckduckgo.com/?q=" + url.QueryEscape(query) + "&format=json&no_redirect=1&no_html=1"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, fmt.Errorf("instant answer status %d", res.StatusCode)
	}

	var payload struct {
		AbstractText  string `json:"AbstractText"`
		AbstractURL   string `json:"AbstractURL"`
		Heading       string `json:"Heading"`
		RelatedTopics []struct {
			Text     string `json:"Text"`
			FirstURL string `json:"FirstURL"`
		} `json:"RelatedTopics"`
	}
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		return nil, err
	}

	out := make([]SearchResult, 0, count)
	if item, ok := normalizeResult(payload.Heading, payload.AbstractURL, payload.AbstractText); ok {
		out = append(out, item)
	}
	for _, t := range payload.RelatedTopics {
		if len(out) >= count {
			break
		}
		if item, ok := normalizeResult(firstSentence(t.Text), t.FirstURL, t.Text); ok {
			out = append(out, item)
		}
	}
	return out, nil
}

func cleanText(s string) string {
	s = tagRe.ReplaceAllString(s, "")
	s = entityRe.Replace(s)
	return strings.Join(strings.Fields(s), " ")
}

func firstSentence(s string) string {
	s = cleanText(s)
	if i := strings.Index(s, " - "); i > 0 {
		return s[:i]
	}
	if i := strings.Index(s, ". "); i > 0 {
		return s[:i]
	}
	if len(s) > 80 {
		return s[:80]
	}
	return s
}
