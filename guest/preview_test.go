package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestActiveArtifact(t *testing.T) {
	dir := t.TempDir()
	root := filepath.Join(dir, "artifact")
	os.Mkdir(root, 0700)
	os.WriteFile(filepath.Join(dir, "active-cwd"), []byte(root), 0600)
	s, err := activeArtifact(dir)
	if err != nil || s.Content != "" {
		t.Fatalf("empty: %+v %v", s, err)
	}
	dest := filepath.Join(root, "index.html")
	html := "<!doctype html><html><head></head><body>Active</body></html>"
	if err := writeArtifact(strings.NewReader(`{"content":"`+html+`"}`), dest); err != nil {
		t.Fatal(err)
	}
	s, err = activeArtifact(dir)
	if err != nil || s.Content != html || s.Path != dest {
		t.Fatalf("snapshot: %+v %v", s, err)
	}
	os.Remove(dest)
	os.Symlink("/etc/passwd", dest)
	if _, err = activeArtifact(dir); err == nil {
		t.Fatal("followed file symlink")
	}
	os.WriteFile(filepath.Join(dir, "active-cwd"), []byte("/etc"), 0600)
	if _, err = activeArtifact(dir); err == nil {
		t.Fatal("accepted unrelated directory")
	}
}
