package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"time"
)

type imageRequest struct {
	ID     string  `json:"id"`
	Prompt string  `json:"prompt"`
	Seed   *uint32 `json:"seed,omitempty"`
}
type imageResult struct {
	ID       string `json:"id"`
	Error    string `json:"error,omitempty"`
	PNG      string `json:"png,omitempty"`
	Prompt   string `json:"prompt"`
	Seed     uint32 `json:"seed"`
	Model    string `json:"model"`
	Revision string `json:"revision"`
}

func requestImage(ctx context.Context, dir string, req imageRequest, timeout time.Duration) (imageResult, error) {
	var result imageResult
	lock, err := os.OpenFile(filepath.Join(dir, "image.lock"), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return result, fmt.Errorf("another image request is active (after an interrupted command, remove /mnt/image.lock)")
	}
	lock.Close()
	defer os.Remove(filepath.Join(dir, "image.lock"))
	req.ID = fmt.Sprint(time.Now().UnixNano())
	raw, _ := json.Marshal(req)
	if err = os.WriteFile(filepath.Join(dir, "image-request.tmp"), raw, 0600); err == nil {
		err = os.Rename(filepath.Join(dir, "image-request.tmp"), filepath.Join(dir, "image-request.json"))
	}
	if err != nil {
		return result, err
	}
	defer os.Remove(filepath.Join(dir, "image-request.json"))
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		raw, err = os.ReadFile(filepath.Join(dir, "image-response.json"))
		result = imageResult{} // Omitted JSON fields must not retain a stale response error.
		if err == nil && len(raw) <= 2*1024*1024 && json.Unmarshal(raw, &result) == nil && result.ID == req.ID {
			if result.Error != "" {
				return result, fmt.Errorf("%s", result.Error)
			}
			if result.Prompt != req.Prompt || (req.Seed != nil && result.Seed != *req.Seed) {
				return result, fmt.Errorf("image response metadata mismatch")
			}
			return result, nil
		}
		select {
		case <-ctx.Done():
			return result, ctx.Err()
		case <-time.After(100 * time.Millisecond):
		}
	}
	return result, fmt.Errorf("image request timed out; use Cancel / unload in the image panel")
}
func generatedPNG(result imageResult) ([]byte, error) {
	data, err := base64.StdEncoding.DecodeString(result.PNG)
	if err != nil {
		return nil, err
	}
	config, err := png.DecodeConfig(bytes.NewReader(data))
	if err != nil || config.Width != 384 || config.Height != 384 {
		return nil, fmt.Errorf("invalid generated PNG (expected 384 × 384)")
	}
	if _, err = png.Decode(bytes.NewReader(data)); err != nil {
		return nil, err
	}
	return data, nil
}
