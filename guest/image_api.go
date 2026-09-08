package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// The stock CLI selects one named image provider. This bridge supplies its API;
// it does not interpret CLI arguments or substitute demo images on failure.
func (b *bridge) images(w http.ResponseWriter, r *http.Request) {
	fail := func(code int, err error) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(code)
		json.NewEncoder(w).Encode(map[string]any{"error": map[string]string{"message": err.Error()}})
	}
	if r.Method != http.MethodPost {
		fail(405, fmt.Errorf("POST required"))
		return
	}
	var in struct {
		Model          string `json:"model"`
		Prompt         string `json:"prompt"`
		N              int    `json:"n"`
		ResponseFormat string `json:"response_format"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192)).Decode(&in); err != nil || strings.TrimSpace(in.Prompt) == "" || len(in.Prompt) > 2000 || (in.N != 0 && in.N != 1) || (in.ResponseFormat != "" && in.ResponseFormat != "b64_json") {
		fail(400, fmt.Errorf("use one image and a prompt of 1–2000 bytes"))
		return
	}
	var data []byte
	var err error
	switch r.URL.Path {
	case "/images/demo/v1/images/generations":
		if in.Model != "demo" {
			fail(400, fmt.Errorf("demo provider requires model demo"))
			return
		}
		var animal string
		animal, err = demoAnimal(in.Prompt)
		if err == nil {
			data, err = demoImages.ReadFile("demo-images/" + animal + ".png")
		}
	case "/images/janus/v1/images/generations":
		if in.Model != "Janus-Pro-1B" {
			fail(400, fmt.Errorf("Janus provider requires model Janus-Pro-1B"))
			return
		}
		var result imageResult
		result, err = requestImage(r.Context(), b.dir, imageRequest{Prompt: strings.TrimSpace(in.Prompt)}, 190*time.Second)
		if err == nil {
			data, err = generatedPNG(result)
		}
	case "/images/off/v1/images/generations":
		fail(503, fmt.Errorf("image support is off; select Demo or enable Janus"))
		return
	default:
		fail(404, fmt.Errorf("unknown image endpoint"))
		return
	}
	if err != nil {
		fail(503, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"data": []map[string]string{{"b64_json": base64.StdEncoding.EncodeToString(data)}}})
}
