package main

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

type webTransport func(*http.Request) (*http.Response, error)

func (f webTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestWebRelayPreservesSessionHeadersNotBrowserCredentials(t *testing.T) {
	old := http.DefaultTransport
	defer func() { http.DefaultTransport = old }()
	http.DefaultTransport = webTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Host != "127.0.0.1:8081" || r.URL.Path != "/guest/key/v1/responses" {
			t.Errorf("unexpected target %s", r.URL)
		}
		for _, h := range []string{"Cookie", "Authorization", "Origin"} {
			if r.Header.Get(h) != "" {
				t.Errorf("forwarded %s", h)
			}
		}
		if r.Header.Get("X-Term-LLM-Request-ID") != "request-1" || r.Header.Get("Idempotency-Key") != "request-1" {
			t.Error("lost request identity")
		}
		return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": []string{"text/event-stream"}, "X-Session-Id": []string{"session-1"}, "X-Response-Id": []string{"response-1"}, "Set-Cookie": []string{"private=secret"}}, Body: io.NopCloser(strings.NewReader("event: response.completed\ndata: {}\n\n"))}, nil
	})
	dir := t.TempDir()
	id := "11111111-1111-1111-1111-111111111111"
	name := filepath.Join(dir, "request")
	os.WriteFile(filepath.Join(dir, "web-base"), []byte("/guest/key"), 0600)
	request := map[string]any{"method": "POST", "path": "/guest/key/v1/responses", "headers": map[string]string{"cookie": "host-secret", "authorization": "Bearer secret", "origin": "https://other.example", "x-term-llm-request-id": "request-1", "idempotency-key": "request-1"}}
	raw, _ := json.Marshal(request)
	os.WriteFile(name, raw, 0600)
	done := make(chan struct{})
	go func() { relayWeb(dir, id, name); close(done) }()
	var frames []byte
	for deadline := time.Now().Add(3 * time.Second); time.Now().Before(deadline); {
		frames, _ = os.ReadFile(filepath.Join(dir, "web-res-"+id+".jsonl"))
		if strings.Contains(string(frames), `"end":true`) {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if !strings.Contains(string(frames), "session-1") || !strings.Contains(string(frames), "response-1") {
		t.Error("lost response identity")
	}
	if strings.Contains(string(frames), "secret") || strings.Contains(string(frames), "Set-Cookie") {
		t.Error("forwarded cookie")
	}
	if !strings.Contains(string(frames), `"end":true`) {
		t.Fatal("stream never completed")
	}
	os.WriteFile(filepath.Join(dir, "web-cancel-"+id), nil, 0600)
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("acknowledgment did not clean up")
	}
	if _, err := os.Stat(filepath.Join(dir, "web-res-"+id+".jsonl")); !os.IsNotExist(err) {
		t.Error("response mailbox not removed")
	}
}
