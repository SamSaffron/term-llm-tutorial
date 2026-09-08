package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestNativeDemoImageAPI(t *testing.T) {
	b := &bridge{dir: t.TempDir()}
	r := httptest.NewRequest("POST", "/images/demo/v1/images/generations", strings.NewReader(`{"model":"demo","prompt":"a cat","n":1,"response_format":"b64_json"}`))
	w := httptest.NewRecorder()
	b.images(w, r)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var response struct {
		Data []struct {
			PNG string `json:"b64_json"`
		} `json:"data"`
	}
	json.Unmarshal(w.Body.Bytes(), &response)
	got, err := base64.StdEncoding.DecodeString(response.Data[0].PNG)
	want, _ := demoImages.ReadFile("demo-images/cat.png")
	if err != nil || !bytes.Equal(got, want) {
		t.Fatal("demo response is not the exact canned image")
	}
	if _, err := os.Stat(filepath.Join(b.dir, "image-request.json")); !os.IsNotExist(err) {
		t.Fatal("demo contacted Janus")
	}
	for _, tc := range []struct{ method, path, body string }{
		{"GET", r.URL.Path, `{}`},
		{"POST", r.URL.Path, `{"model":"demo","prompt":"cat","n":2}`},
		{"POST", r.URL.Path, `{"model":"Janus-Pro-1B","prompt":"cat"}`},
		{"POST", "/images/off/v1/images/generations", `{"model":"off","prompt":"cat"}`},
		{"POST", "/images/other/v1/images/generations", `{"model":"other","prompt":"cat"}`},
	} {
		w := httptest.NewRecorder()
		b.images(w, httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body)))
		if w.Code < 400 || strings.Contains(w.Body.String(), "b64_json") {
			t.Fatalf("invalid request returned an image: %s", w.Body.String())
		}
	}
}

func TestNativeJanusNeverFallsBackToDemo(t *testing.T) {
	for _, failure := range []string{"Janus is not loaded", ""} {
		dir := t.TempDir()
		b := &bridge{dir: dir}
		done := make(chan struct{})
		go func() {
			defer close(done)
			for i := 0; i < 200; i++ {
				raw, err := os.ReadFile(filepath.Join(dir, "image-request.json"))
				var req imageRequest
				if err == nil && json.Unmarshal(raw, &req) == nil {
					// Even a syntactically valid canned PNG cannot stand in for Janus output.
					canned, _ := demoImages.ReadFile("demo-images/cat.png")
					out, _ := json.Marshal(imageResult{ID: req.ID, Prompt: req.Prompt, PNG: base64.StdEncoding.EncodeToString(canned), Error: failure})
					os.WriteFile(filepath.Join(dir, "image-response.json"), out, 0600)
					return
				}
				time.Sleep(time.Millisecond)
			}
		}()
		w := httptest.NewRecorder()
		b.images(w, httptest.NewRequest("POST", "/images/janus/v1/images/generations", strings.NewReader(`{"model":"Janus-Pro-1B","prompt":"cat"}`)))
		<-done
		if w.Code != 503 || strings.Contains(w.Body.String(), "b64_json") {
			t.Fatal("Janus error returned a demo image", w.Body.String())
		}
	}
}
