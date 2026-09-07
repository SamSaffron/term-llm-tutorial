package main

import (
	"embed"
	"encoding/base64"
	"fmt"
	"io"
	"os"
	"strings"
	"syscall"
	"unsafe"
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
		return "", fmt.Errorf("this canned demo knows cat, dog, elephant, rabbit, fox and owl; use image --generate for optional real Janus generation")
	}
	return found, nil
}
func imageTTY(f *os.File) bool {
	var t syscall.Termios
	_, _, err := syscall.Syscall(syscall.SYS_IOCTL, f.Fd(), syscall.TCGETS, uintptr(unsafe.Pointer(&t)))
	return err == 0
}
func writeKittyPNG(w io.Writer, data []byte) error {
	payload := base64.StdEncoding.EncodeToString(data)
	first := true
	for len(payload) > 0 {
		n := 4096
		if n > len(payload) {
			n = len(payload)
		}
		more := 0
		if n < len(payload) {
			more = 1
		}
		control := fmt.Sprintf("m=%d", more)
		if first {
			control = fmt.Sprintf("a=T,q=2,f=100,c=24,r=12,m=%d", more)
			first = false
		}
		if _, err := fmt.Fprintf(w, "\x1b_G%s;%s\x1b\\", control, payload[:n]); err != nil {
			return err
		}
		payload = payload[n:]
	}
	_, err := fmt.Fprint(w, "\n")
	return err
}
func runImageDemo(args []string, stdout, stderr *os.File) int {
	for _, arg := range args {
		if arg == "--generate" {
			return runImageGenerate(args, stdout, stderr)
		}
	}
	output := ""
	display := true
	var words []string
	for i := 0; i < len(args); i++ {
		a := args[i]
		switch {
		case a == "--help" || a == "-h":
			fmt.Fprintln(stdout, "Tutorial image Easter egg (canned illustrations, NOT AI generation)\nUsage: term-llm image <cat|dog|elephant|rabbit|fox|owl> [-o file.png|-] [--no-display]\nReal opt-in: term-llm image --generate \"prompt\" [--seed 1] [-o file.png|-] [--no-display]\nEnable Optional image generation in the browser first (~3 GB; releases text model).")
			return 0
		case a == "--no-display":
			display = false
		case a == "-o" || a == "--output":
			i++
			if i >= len(args) {
				fmt.Fprintln(stderr, "Missing output path")
				return 2
			}
			output = args[i]
		case strings.HasPrefix(a, "--output="):
			output = strings.TrimPrefix(a, "--output=")
		case strings.HasPrefix(a, "-"):
			fmt.Fprintf(stderr, "Unsupported demo option %s; use image --help\n", a)
			return 2
		default:
			words = append(words, a)
		}
	}
	animal, err := demoAnimal(strings.Join(words, " "))
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 2
	}
	data, err := demoImages.ReadFile("demo-images/" + animal + ".png")
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	fmt.Fprintln(stderr, "Easter egg: a canned illustration, not an AI-generated image.")
	if output == "-" {
		_, err = stdout.Write(data)
	} else {
		var f *os.File
		if output == "" {
			f, err = os.CreateTemp(".", animal+"-*.png")
			if err == nil {
				output = f.Name()
			}
		} else {
			f, err = os.OpenFile(output, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0644)
		}
		if err == nil {
			_, err = f.Write(data)
			closeErr := f.Close()
			if err == nil {
				err = closeErr
			}
		}
		if err == nil {
			fmt.Fprintf(stderr, "Saved: %s\n", output)
			if display && imageTTY(stdout) {
				err = writeKittyPNG(stdout, data)
			}
		}
	}
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	return 0
}
