#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
(cd guest && CGO_ENABLED=0 GOOS=linux GOARCH=386 GO386=softfloat go build -trimpath -ldflags='-s -w' -o ../public/assets/guest-bridge .)
# Point at an isolated, approved checkout, never the shared clone or installed CLI.
if [ -n "${TERM_LLM_SOURCE:-}" ]; then
  DEST="$(pwd)/public/assets/term-llm"
  (cd "$TERM_LLM_SOURCE" && test "$(git rev-parse HEAD)" = 08059d2dceb6606e8f190ab3e88103dc53d03b66 && make frontend && CGO_ENABLED=0 GOOS=linux GOARCH=386 GO386=softfloat go build -trimpath -ldflags='-s -w' -o "$DEST" .)
fi
