package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"image"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestImageMailbox(t *testing.T) {
	for _, failure := range []string{"", "Janus not enabled"} {
		dir := t.TempDir()
		os.WriteFile(filepath.Join(dir, "image-response.json"), []byte(`{"id":"stale","error":"Janus not enabled"}`), 0600)
		done := make(chan struct{})
		go func() {
			defer close(done)
			for i := 0; i < 100; i++ {
				raw, err := os.ReadFile(filepath.Join(dir, "image-request.json"))
				var req imageRequest
				if err == nil && json.Unmarshal(raw, &req) == nil {
					out, _ := json.Marshal(imageResult{ID: req.ID, Prompt: req.Prompt, Seed: 7, Error: failure})
					os.WriteFile(filepath.Join(dir, "image-response.json"), out, 0600)
					return
				}
				time.Sleep(5 * time.Millisecond)
			}
		}()
		result, err := requestImage(context.Background(), dir, imageRequest{Prompt: "a pelican"}, time.Second)
		<-done
		if (err != nil) != (failure != "") || (err == nil && result.Seed != 7) {
			t.Fatalf("%+v %v", result, err)
		}
		if _, err := os.Stat(filepath.Join(dir, "image.lock")); !os.IsNotExist(err) {
			t.Fatal("lock retained")
		}
	}
}
func TestImageMailboxTimeoutAndLock(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "image-response.json"), []byte(`{"id":"stale","png":"bogus"}`), 0600)
	if _, err := requestImage(context.Background(), dir, imageRequest{Prompt: "x"}, time.Millisecond); err == nil {
		t.Fatal("stale response accepted")
	}
	os.WriteFile(filepath.Join(dir, "image.lock"), nil, 0600)
	if _, err := requestImage(context.Background(), dir, imageRequest{Prompt: "x"}, time.Second); err == nil {
		t.Fatal("concurrent request accepted")
	}
}
func TestGeneratedPNGBoundary(t *testing.T) {
	var b bytes.Buffer
	png.Encode(&b, image.NewRGBA(image.Rect(0, 0, 384, 384)))
	if _, err := generatedPNG(imageResult{PNG: base64.StdEncoding.EncodeToString(b.Bytes())}); err != nil {
		t.Fatal(err)
	}
	for _, data := range []string{"not base64", base64.StdEncoding.EncodeToString([]byte("not png"))} {
		if _, err := generatedPNG(imageResult{PNG: data}); err == nil {
			t.Fatal("invalid PNG accepted")
		}
	}
	canned, _ := demoImages.ReadFile("demo-images/cat.png")
	if _, err := generatedPNG(imageResult{PNG: base64.StdEncoding.EncodeToString(canned)}); err == nil {
		t.Fatal("canned image accepted as Janus")
	}
}
