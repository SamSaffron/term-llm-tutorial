package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

var webID = regexp.MustCompile(`^[a-f0-9-]{36}$`)

// Reverse mailbox transport, strictly to the guest's web UI port. It never
// connects to a host address or accepts arbitrary URL schemes/authorities.
func watchWeb(dir string) {
	slots := make(chan struct{}, 16)
	for {
		files, _ := filepath.Glob(filepath.Join(dir, "web-req-*.json"))
		for _, name := range files {
			id := strings.TrimSuffix(strings.TrimPrefix(filepath.Base(name), "web-req-"), ".json")
			if !webID.MatchString(id) {
				continue
			}
			select {
			case slots <- struct{}{}:
			default:
				continue
			}
			active := name + ".active"
			if os.Rename(name, active) != nil {
				<-slots
				continue
			}
			go func() { defer func() { <-slots }(); relayWeb(dir, id, active) }()
		}
		time.Sleep(60 * time.Millisecond)
	}
}
func relayWeb(dir, id, name string) {
	responsePath := filepath.Join(dir, "web-res-"+id+".jsonl")
	cancelPath := filepath.Join(dir, "web-cancel-"+id)
	defer os.Remove(name)
	defer os.Remove(responsePath)
	defer os.Remove(cancelPath)
	file, err := os.OpenFile(responsePath, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0600)
	if err != nil {
		return
	}
	defer file.Close()
	enc := json.NewEncoder(file)
	finish := func() {
		enc.Encode(map[string]any{"end": true})
		for i := 0; i < 300; i++ {
			if _, e := os.Stat(cancelPath); e == nil {
				return
			}
			time.Sleep(100 * time.Millisecond)
		}
	}
	raw, err := os.ReadFile(name)
	var input struct {
		Method  string            `json:"method"`
		Path    string            `json:"path"`
		Headers map[string]string `json:"headers"`
		Body    []byte            `json:"body"`
	}
	base, _ := os.ReadFile(filepath.Join(dir, "web-base"))
	if err != nil || len(raw) > 2*1024*1024 || json.Unmarshal(raw, &input) != nil || len(base) == 0 || !strings.HasPrefix(input.Path, strings.TrimSpace(string(base))+"/") || strings.ContainsAny(input.Path, "\r\n") {
		enc.Encode(map[string]any{"status": 400, "headers": map[string]string{"content-type": "text/plain"}})
		enc.Encode(map[string]any{"body": []byte("Invalid guest web request")})
		finish()
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	go func() {
		tick := time.NewTicker(100 * time.Millisecond)
		defer tick.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-tick.C:
				if _, e := os.Stat(cancelPath); e == nil {
					cancel()
					return
				}
			}
		}
	}()
	req, err := http.NewRequestWithContext(ctx, input.Method, "http://127.0.0.1:8081"+input.Path, bytes.NewReader(input.Body))
	if err != nil {
		enc.Encode(map[string]any{"status": 400})
		finish()
		return
	}
	for h, v := range input.Headers {
		if h == "content-type" || h == "accept" || h == "last-event-id" || h == "session_id" || h == "idempotency-key" || strings.HasPrefix(h, "x-term-llm-") {
			req.Header.Set(h, v)
		}
	}
	client := http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	resp, err := client.Do(req)
	if err != nil {
		enc.Encode(map[string]any{"status": 503, "headers": map[string]string{"content-type": "text/plain"}})
		enc.Encode(map[string]any{"body": []byte("The guest web server is not running. Return to the tutorial terminal and run tl serve web --port 8081 --auth none. Keep that tab open.")})
		finish()
		return
	}
	defer resp.Body.Close()
	headers := map[string]string{}
	for _, h := range []string{"Content-Type", "Cache-Control", "Location", "Content-Disposition", "session_id", "X-Term-LLM-Response-ID", "X-Term-LLM-Request-ID"} {
		if v := resp.Header.Get(h); v != "" {
			headers[h] = strings.TrimPrefix(v, "http://127.0.0.1:8081")
		}
	}
	for h, values := range resp.Header {
		if strings.HasPrefix(strings.ToLower(h), "x-") {
			headers[h] = strings.Join(values, ", ")
		}
	}
	// No browser/origin cookies or bearer tokens cross this boundary.
	enc.Encode(map[string]any{"status": resp.StatusCode, "headers": headers})
	buffer := make([]byte, 32*1024)
	total := 0
	for {
		n, e := resp.Body.Read(buffer)
		if n > 0 {
			total += n
			if total > 16*1024*1024 {
				enc.Encode(map[string]any{"error": "Guest response exceeded 16 MiB"})
				break
			}
			if enc.Encode(map[string]any{"body": buffer[:n]}) != nil {
				return
			}
		}
		if e != nil {
			if e != io.EOF {
				enc.Encode(map[string]any{"error": fmt.Sprint(e)})
			}
			break
		}
	}
	finish()
}
