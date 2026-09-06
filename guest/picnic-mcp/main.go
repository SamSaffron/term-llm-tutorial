package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
)

// A real stdio MCP server for the tutorial. It has no network or model access.
func main() {
	dec, enc := json.NewDecoder(os.Stdin), json.NewEncoder(os.Stdout)
	for {
		var req struct {
			ID     json.RawMessage `json:"id"`
			Method string          `json:"method"`
			Params json.RawMessage `json:"params"`
		}
		if err := dec.Decode(&req); err != nil {
			if err != io.EOF {
				fmt.Fprintln(os.Stderr, err)
			}
			return
		}
		if len(req.ID) == 0 {
			continue
		}
		var result any
		var rpcError any
		switch req.Method {
		case "initialize":
			var p struct {
				ProtocolVersion string `json:"protocolVersion"`
			}
			_ = json.Unmarshal(req.Params, &p)
			if p.ProtocolVersion == "" {
				p.ProtocolVersion = "2024-11-05"
			}
			result = map[string]any{"protocolVersion": p.ProtocolVersion, "capabilities": map[string]any{"tools": map[string]any{}}, "serverInfo": map[string]string{"name": "picnic", "version": "1.0.0"}}
		case "ping":
			result = map[string]any{}
		case "tools/list":
			result = map[string]any{"tools": []any{map[string]any{"name": "checklist", "description": "Create a basic picnic packing checklist for a number of guests.", "inputSchema": map[string]any{"type": "object", "properties": map[string]any{"guests": map[string]any{"type": "integer", "minimum": 1, "maximum": 100}}, "required": []string{"guests"}}, "annotations": map[string]any{"readOnlyHint": true}}}}
		case "tools/call":
			var p struct {
				Name      string `json:"name"`
				Arguments struct {
					Guests int `json:"guests"`
				} `json:"arguments"`
			}
			err := json.Unmarshal(req.Params, &p)
			if err != nil || p.Name != "checklist" || p.Arguments.Guests < 1 || p.Arguments.Guests > 100 {
				rpcError = map[string]any{"code": -32602, "message": "Use checklist with guests from 1 to 100"}
				break
			}
			n := p.Arguments.Guests
			text := fmt.Sprintf("Picnic checklist for %d guests:\n- %d sandwiches (include vegetarian options)\n- %d pieces of fruit\n- %d refillable water bottles\n- 1 picnic blanket\n- Check the weather and agree on a rain plan", n, n, n, n)
			result = map[string]any{"content": []any{map[string]any{"type": "text", "text": text}}, "isError": false}
		default:
			rpcError = map[string]any{"code": -32601, "message": "Method not found"}
		}
		response := map[string]any{"jsonrpc": "2.0", "id": req.ID}
		if rpcError != nil {
			response["error"] = rpcError
		} else {
			response["result"] = result
		}
		if err := enc.Encode(response); err != nil {
			return
		}
	}
}
