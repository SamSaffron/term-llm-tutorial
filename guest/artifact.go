package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"
)

// Only the fixed guest destination is supplied by main, never by model arguments.
func writeArtifact(input io.Reader, destination string) error {
	var args struct {
		Content string `json:"content"`
	}
	d := json.NewDecoder(io.LimitReader(input, 16385))
	d.DisallowUnknownFields()
	if d.Decode(&args) != nil {
		return fmt.Errorf("Expected only content: full HTML")
	}
	var extra any
	if d.Decode(&extra) != io.EOF {
		return fmt.Errorf("Invalid trailing JSON")
	}
	s := strings.ToLower(strings.TrimSpace(args.Content))
	if len(args.Content) > 12000 || !strings.HasPrefix(s, "<!doctype html>") || !strings.Contains(s, "<html") || !strings.Contains(s, "</html>") || !strings.Contains(s, "<head") || !strings.Contains(s, "</head>") || !strings.Contains(s, "<body") || !strings.Contains(s, "</body>") || strings.Contains(s, "```") {
		return fmt.Errorf("Need complete HTML document, at most 12000 bytes")
	}
	if info, err := os.Lstat(destination); err == nil && !info.Mode().IsRegular() {
		return fmt.Errorf("Destination is not a regular file")
	}
	// Same-directory rename ensures the preview never sees a partial document.
	f, err := os.CreateTemp(destination[:strings.LastIndex(destination, "/")], ".artifact-")
	if err != nil {
		return err
	}
	name := f.Name()
	defer os.Remove(name)
	if _, err = f.WriteString(args.Content); err != nil {
		f.Close()
		return err
	}
	if err = f.Close(); err != nil {
		return err
	}
	return os.Rename(name, destination)
}
