package main

import (
	"bytes"
	"encoding/base64"
	"image/png"
	"strings"
	"testing"
)

func TestDemoAnimals(t *testing.T) {
	for _, name := range []string{"cat", "dog", "elephant", "rabbit", "fox", "owl"} {
		got, err := demoAnimal("a cute " + strings.ToUpper(name))
		if err != nil || got != name {
			t.Fatalf("%q: %s %v", name, got, err)
		}
		data, _ := demoImages.ReadFile("demo-images/" + name + ".png")
		img, err := png.Decode(bytes.NewReader(data))
		if err != nil || img.Bounds().Dx() != 256 {
			t.Fatalf("invalid %s illustration: %v", name, err)
		}
	}
	for _, prompt := range []string{"cathedral", "dinosaur", "cat and dog", ""} {
		if _, err := demoAnimal(prompt); err == nil {
			t.Fatalf("unsupported prompt accepted: %q", prompt)
		}
	}
}
func TestKittyPNGChunks(t *testing.T) {
	data, _ := demoImages.ReadFile("demo-images/elephant.png")
	var out bytes.Buffer
	if err := writeKittyPNG(&out, data); err != nil {
		t.Fatal(err)
	}
	chunks := strings.Split(strings.TrimSuffix(out.String(), "\n"), "\x1b\\")
	var encoded string
	for i, chunk := range chunks[:len(chunks)-1] {
		parts := strings.SplitN(chunk, ";", 2)
		if len(parts) != 2 || len(parts[1]) > 4096 {
			t.Fatal("invalid framing")
		}
		if i == 0 && !strings.Contains(parts[0], "a=T,q=2,f=100") {
			t.Fatal("missing PNG/quiet controls")
		}
		encoded += parts[1]
	}
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || !bytes.Equal(data, raw) {
		t.Fatal("PNG bytes changed")
	}
	if !strings.Contains(out.String(), "m=0;") {
		t.Fatal("missing final frame")
	}
}
