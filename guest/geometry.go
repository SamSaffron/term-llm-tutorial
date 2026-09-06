package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"syscall"
	"time"
	"unsafe"
)

type geometry struct {
	Cols uint16 `json:"cols"`
	Rows uint16 `json:"rows"`
}

func (g geometry) valid() bool { return g.Cols >= 20 && g.Cols <= 240 && g.Rows >= 8 && g.Rows <= 80 }

// Linux sends SIGWINCH to the foreground CLI when the serial TTY size changes.
// This mailbox accepts dimensions only, never commands or a model-controlled path.
func watchGeometry(dir string) {
	var previous geometry
	for range time.Tick(200 * time.Millisecond) {
		raw, err := os.ReadFile(filepath.Join(dir, "geometry.json"))
		if err != nil || len(raw) > 128 {
			continue
		}
		var g geometry
		if json.Unmarshal(raw, &g) != nil || !g.valid() || g == previous {
			continue
		}
		tty, err := os.OpenFile("/dev/ttyS0", os.O_RDWR, 0)
		if err != nil {
			continue
		}
		size := [4]uint16{g.Rows, g.Cols, 0, 0}
		_, _, errno := syscall.Syscall(syscall.SYS_IOCTL, tty.Fd(), syscall.TIOCSWINSZ, uintptr(unsafe.Pointer(&size)))
		tty.Close()
		if errno == 0 {
			previous = g
		}
	}
}
