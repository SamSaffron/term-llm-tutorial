package main

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestBridgeRoundTrip(t *testing.T) {
	for _, stream := range []bool{false, true} {
		t.Run(map[bool]string{false: "JSON", true: "SSE"}[stream], func(t *testing.T) {
			dir := t.TempDir()
			b := &bridge{dir: dir}
			body := `{"model":"test-only","stream":false}`
			if stream {
				body = `{"model":"test-only","stream":true}`
			}
			req := httptest.NewRequest("POST", "/v1/chat/completions", strings.NewReader(body))
			w := httptest.NewRecorder()
			done := make(chan struct{})
			go func() { b.complete(w, req); close(done) }()
			var e envelope
			deadline := time.Now().Add(3 * time.Second)
			for time.Now().Before(deadline) {
				raw, _ := os.ReadFile(filepath.Join(dir, "request.json"))
				if json.Unmarshal(raw, &e) == nil && e.ID != "" {
					break
				}
				time.Sleep(time.Millisecond * 10)
			}
			if e.ID == "" {
				t.Fatal("mailbox not written")
			}
			// Explicit unit fixture: never imported into the application.
			response := json.RawMessage(`{"id":"fixture","model":"test-only","choices":[{"message":{"role":"assistant","content":null,"tool_calls":[{"id":"call_test","type":"function","function":{"name":"write_file","arguments":"{}"}}]},"finish_reason":"tool_calls"}]}`)
			raw, _ := json.Marshal(envelope{ID: "wrong-id", Response: response})
			os.WriteFile(filepath.Join(dir, "response.json"), raw, 0600)
			select {
			case <-done:
				t.Fatal("accepted stale ID")
			case <-time.After(120 * time.Millisecond):
			}
			raw, _ = json.Marshal(envelope{ID: e.ID, Response: response})
			os.WriteFile(filepath.Join(dir, "response.json"), raw, 0600)
			select {
			case <-done:
			case <-time.After(3 * time.Second):
				t.Fatal("response timeout")
			}
			if w.Code != 200 {
				t.Fatalf("%d: %s", w.Code, w.Body.String())
			}
			if stream {
				if !strings.Contains(w.Body.String(), `"index":0`) || !strings.Contains(w.Body.String(), "data: [DONE]") {
					t.Fatal(w.Body.String())
				}
			} else if !json.Valid(w.Body.Bytes()) {
				t.Fatal("not JSON")
			}
			if _, err := os.Stat(filepath.Join(dir, "request.json")); !os.IsNotExist(err) {
				t.Fatal("request not cleaned")
			}
		})
	}
}
func TestBridgeRejects(t *testing.T) {
	b := &bridge{dir: t.TempDir()}
	for _, tc := range []struct {
		method, body string
		code         int
	}{{"GET", "", 405}, {"POST", "bad", 400}, {"POST", strings.Repeat("x", 256*1024+1), 400}} {
		w := httptest.NewRecorder()
		b.complete(w, httptest.NewRequest(tc.method, "/", strings.NewReader(tc.body)))
		if w.Code != tc.code {
			t.Fatal(w.Code)
		}
	}
	b.mu.Lock()
	w := httptest.NewRecorder()
	b.complete(w, httptest.NewRequest("POST", "/", strings.NewReader("{}")))
	b.mu.Unlock()
	if w.Code != 429 {
		t.Fatal(w.Code)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	w = httptest.NewRecorder()
	b.complete(w, httptest.NewRequest("POST", "/", strings.NewReader("{}")).WithContext(ctx))
	if w.Code != 504 {
		t.Fatal(w.Code)
	}
}
