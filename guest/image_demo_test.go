package main

import (
	"bytes"
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
