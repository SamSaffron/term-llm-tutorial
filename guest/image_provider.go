package main

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

// Browser-owned configuration channel. Only three fixed provider names are
// accepted; there is no shell evaluation or arbitrary command/path execution.
func watchImageProvider(dir string) {
	last := ""
	for range time.Tick(100 * time.Millisecond) {
		raw, err := os.ReadFile(filepath.Join(dir, "image-provider.json"))
		if err != nil || len(raw) > 512 {
			continue
		}
		var req struct {
			ID       string `json:"id"`
			Provider string `json:"provider"`
		}
		if json.Unmarshal(raw, &req) != nil || req.ID == "" || req.ID == last {
			continue
		}
		last = req.ID
		result := map[string]string{"id": req.ID}
		if req.Provider != "demo" && req.Provider != "janus" && req.Provider != "images-off" {
			result["error"] = "invalid image provider"
		} else {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			output, err := exec.CommandContext(ctx, "/tmp/term-llm", "config", "set", "image.provider", req.Provider).CombinedOutput()
			cancel()
			if err != nil {
				result["error"] = "could not configure image provider: " + string(output)
			}
		}
		data, _ := json.Marshal(result)
		if os.WriteFile(filepath.Join(dir, "image-provider-status.tmp"), data, 0600) == nil {
			os.Rename(filepath.Join(dir, "image-provider-status.tmp"), filepath.Join(dir, "image-provider-status.json"))
		}
	}
}
