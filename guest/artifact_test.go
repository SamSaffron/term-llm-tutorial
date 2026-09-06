package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestArtifactBoundary(t *testing.T) {
	dest := filepath.Join(t.TempDir(), "index.html")
	html := "<!doctype html><html><head><title>Fixture</title></head><body>Test</body></html>"
	data, _ := json.Marshal(map[string]string{"content": html})
	if err := writeArtifact(strings.NewReader(string(data)), dest); err != nil {
		t.Fatal(err)
	}
	for _, bad := range []string{`{"content":"<h1>partial</h1>"}`, `{"content":"x","path":"/etc/passwd"}`, string(data) + `{}`, `{"content":null}`, `{"content":12}`} {
		if err := writeArtifact(strings.NewReader(bad), dest); err == nil {
			t.Fatalf("accepted %s", bad)
		}
	}
	got, _ := os.ReadFile(dest)
	if string(got) != html {
		t.Fatal("invalid call changed artifact")
	}
	other := filepath.Join(t.TempDir(), "victim")
	os.WriteFile(other, []byte("safe"), 0600)
	os.Remove(dest)
	os.Symlink(other, dest)
	if err := writeArtifact(strings.NewReader(string(data)), dest); err == nil {
		t.Fatal("followed symlink")
	}
	got, _ = os.ReadFile(other)
	if string(got) != "safe" {
		t.Fatal("modified unrelated file")
	}
}
