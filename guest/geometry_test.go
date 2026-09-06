package main

import "testing"

func TestGeometryBounds(t *testing.T) {
	for _, g := range []geometry{{90, 26}, {20, 8}, {240, 80}} {
		if !g.valid() {
			t.Fatal(g)
		}
	}
	for _, g := range []geometry{{0, 0}, {19, 26}, {90, 7}, {241, 26}, {90, 81}} {
		if g.valid() {
			t.Fatal(g)
		}
	}
}
