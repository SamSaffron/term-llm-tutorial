package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type artifactSnapshot struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

// The mailbox is written only by the real CLI binding hook, never model arguments.
func activeArtifact(dir string) (artifactSnapshot, error) {
	raw, err := os.ReadFile(filepath.Join(dir, "active-cwd"))
	if err != nil {
		return artifactSnapshot{}, err
	}
	cwd := strings.TrimSpace(string(raw))
	canonical, err := filepath.EvalSymlinks(cwd)
	if err != nil {
		return artifactSnapshot{}, err
	}
	root := filepath.Join(dir, "artifact")
	managed := "/root/.local/share/term-llm/worktrees/"
	if canonical != root && !strings.HasPrefix(canonical, managed) {
		return artifactSnapshot{}, fmt.Errorf("outside guest artifact workspaces")
	}
	s := artifactSnapshot{Path: filepath.Join(canonical, "index.html")}
	info, err := os.Lstat(s.Path)
	if os.IsNotExist(err) {
		return s, nil
	}
	if err != nil {
		return s, err
	}
	if !info.Mode().IsRegular() || info.Size() > 12000 {
		return s, fmt.Errorf("invalid preview file")
	}
	content, err := os.ReadFile(s.Path)
	s.Content = string(content)
	return s, err
}

func watchArtifact(dir string) {
	var previous string
	for range time.Tick(200 * time.Millisecond) {
		snapshot, err := activeArtifact(dir)
		if err != nil {
			continue
		}
		raw, _ := json.Marshal(snapshot)
		if string(raw) == previous {
			continue
		}
		temp := filepath.Join(dir, "preview.tmp")
		if os.WriteFile(temp, raw, 0600) == nil && os.Rename(temp, filepath.Join(dir, "preview.json")) == nil {
			previous = string(raw)
		}
	}
}
