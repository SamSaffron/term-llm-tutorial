// Guest-only HTTP to virtio-9p mailbox bridge. No external network transport.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type envelope struct {
	ID       string          `json:"id"`
	Request  json.RawMessage `json:"request,omitempty"`
	Response json.RawMessage `json:"response,omitempty"`
	Error    string          `json:"error,omitempty"`
}
type bridge struct {
	dir string
	mu  sync.Mutex
}

func (b *bridge) complete(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "POST required", 405)
		return
	}
	if !b.mu.TryLock() {
		http.Error(w, "one request at a time", 429)
		return
	}
	defer b.mu.Unlock()
	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 256*1024))
	if err != nil || !json.Valid(raw) {
		http.Error(w, "invalid or oversized JSON", 400)
		return
	}

	id := fmt.Sprintf("%d", time.Now().UnixNano())
	data, _ := json.Marshal(envelope{ID: id, Request: raw})
	if err = os.WriteFile(filepath.Join(b.dir, "request.tmp"), data, 0600); err == nil {
		err = os.Rename(filepath.Join(b.dir, "request.tmp"), filepath.Join(b.dir, "request.json"))
	}
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	defer os.Remove(filepath.Join(b.dir, "request.json"))
	ctx, cancel := context.WithTimeout(r.Context(), 190*time.Second)
	defer cancel()
	tick := time.NewTicker(100 * time.Millisecond)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			http.Error(w, "browser inference timeout or canceled", 504)
			return
		case <-tick.C:
			raw, err := os.ReadFile(filepath.Join(b.dir, "response.json"))
			if err != nil || len(raw) > 512*1024 {
				continue
			}
			var e envelope
			if json.Unmarshal(raw, &e) != nil || e.ID != id {
				continue
			}
			if e.Error != "" {
				http.Error(w, e.Error, http.StatusUnprocessableEntity)
				return
			}
			if !json.Valid(e.Response) {
				http.Error(w, "invalid browser response", 502)
				return
			}
			var req struct {
				Stream bool `json:"stream"`
			}
			json.Unmarshal(dataRequest(data), &req)
			if !req.Stream {
				w.Header().Set("Content-Type", "application/json")
				w.Write(e.Response)
				return
			}
			// WebLLM output is bounded and buffered so incomplete XML never becomes a tool call.
			var result struct {
				ID      string `json:"id"`
				Model   string `json:"model"`
				Choices []struct {
					Message      map[string]any `json:"message"`
					FinishReason string         `json:"finish_reason"`
				} `json:"choices"`
				Usage any `json:"usage"`
			}
			if json.Unmarshal(e.Response, &result) != nil || len(result.Choices) != 1 {
				http.Error(w, "invalid completion", 502)
				return
			}
			choice := result.Choices[0]
			if calls, ok := choice.Message["tool_calls"].([]any); ok {
				for i, c := range calls {
					if m, ok := c.(map[string]any); ok {
						m["index"] = i
					}
				}
			}
			w.Header().Set("Content-Type", "text/event-stream")
			chunk := map[string]any{"id": result.ID, "object": "chat.completion.chunk", "created": time.Now().Unix(), "model": result.Model, "choices": []any{map[string]any{"index": 0, "delta": choice.Message, "finish_reason": nil}}}
			out, _ := json.Marshal(chunk)
			fmt.Fprintf(w, "data: %s\n\n", out)
			chunk["choices"] = []any{map[string]any{"index": 0, "delta": map[string]any{}, "finish_reason": choice.FinishReason}}
			chunk["usage"] = result.Usage
			out, _ = json.Marshal(chunk)
			fmt.Fprintf(w, "data: %s\n\ndata: [DONE]\n\n", out)
			return
		}
	}
}
func dataRequest(data []byte) json.RawMessage {
	var e envelope
	json.Unmarshal(data, &e)
	return e.Request
}
func main() {
	if len(os.Args) > 1 && os.Args[1] == "image-demo" {
		os.Exit(runImageDemo(os.Args[2:], os.Stdout, os.Stderr))
	}
	dir := "/mnt"
	if len(os.Args) > 1 {
		dir = os.Args[1]
	}
	go watchWeb(dir)
	go watchGeometry(dir)
	b := &bridge{dir: dir}
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/chat/completions", b.complete)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, "guest bridge ready") })
	log.Print("guest bridge listening on 127.0.0.1:8080 (9p mailbox only)")
	log.Fatal((&http.Server{Addr: "127.0.0.1:8080", Handler: mux, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 200 * time.Second, MaxHeaderBytes: 8192}).ListenAndServe())
}
