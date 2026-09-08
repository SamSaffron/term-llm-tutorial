package main

import (
	"embed"
	"fmt"
	"strings"
)

//go:embed demo-images/*.png
var demoImages embed.FS

func demoAnimal(prompt string) (string, error) {
	supported := map[string]bool{"cat": true, "dog": true, "elephant": true, "rabbit": true, "fox": true, "owl": true}
	found := ""
	for _, word := range strings.FieldsFunc(strings.ToLower(prompt), func(r rune) bool { return r < 'a' || r > 'z' }) {
		if supported[word] {
			if found != "" && found != word {
				return "", fmt.Errorf("one animal at a time, please")
			}
			found = word
		}
	}
	if found == "" {
		return "", fmt.Errorf("this canned demo knows cat, dog, elephant, rabbit, fox and owl; select Janus image support for real generation")
	}
	return found, nil
}
