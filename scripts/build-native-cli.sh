#!/bin/sh
# Build a clean, pinned upstream CLI. No tutorial patches or command wrappers.
set -eu
cd "$(dirname "$0")/.."
ROOT=$(pwd)
REV=ba07b58441a660e3f279837851a8d32eb948f083
SOURCE=${TERM_LLM_SOURCE:-"$ROOT/.native-cli/$REV"}
if [ ! -d "$SOURCE/.git" ] && [ ! -f "$SOURCE/.git" ]; then
  [ -z "${TERM_LLM_SOURCE:-}" ] || { echo 'TERM_LLM_SOURCE is not a Git checkout' >&2; exit 1; }
  mkdir -p "$SOURCE"
  git -C "$SOURCE" init -q
  git -C "$SOURCE" fetch --depth 1 https://github.com/SamSaffron/term-llm.git "$REV"
  git -C "$SOURCE" checkout -q --detach FETCH_HEAD
fi
[ "$(git -C "$SOURCE" rev-parse HEAD)" = "$REV" ]
[ -z "$(git -C "$SOURCE" status --porcelain)" ]
mkdir -p public/assets
KEY="$REV|$(go version)|$(node --version)"
if [ -f public/assets/term-llm.build ] && [ -f public/assets/term-llm ]; then
  EXPECTED="$KEY|$(sha256sum public/assets/term-llm | cut -d ' ' -f 1)"
  [ "$(cat public/assets/term-llm.build)" != "$EXPECTED" ] || exit 0
fi
(cd "$SOURCE" && make frontend && CGO_ENABLED=0 GOOS=linux GOARCH=386 GO386=softfloat go build -trimpath -ldflags="-s -w -X github.com/samsaffron/term-llm/cmd.Commit=$REV" -o "$ROOT/public/assets/term-llm.tmp" .)
mv public/assets/term-llm.tmp public/assets/term-llm
printf '%s|%s\n' "$KEY" "$(sha256sum public/assets/term-llm | cut -d ' ' -f 1)" > public/assets/term-llm.build
