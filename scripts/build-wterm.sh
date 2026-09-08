#!/bin/bash
# Rebuild wterm's terminal core/renderer, not the CLI, from pinned source.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD
REV=89cd4ad788563ce3e492664fdaa31debc909d62a
PATCH=$ROOT/patches/wterm-kitty-unicode.patch
HASH=$(sha256sum "$PATCH" | cut -d ' ' -f1)
SOURCE=$ROOT/.wterm/$REV-$HASH
mkdir -p "$ROOT/.wterm"
if [ ! -d "$SOURCE/.git" ]; then
  mkdir -p "$SOURCE"
  git -C "$SOURCE" init -q
  git -C "$SOURCE" fetch --depth 1 https://github.com/vercel-labs/wterm.git "$REV" >&2
  git -C "$SOURCE" checkout -q --detach FETCH_HEAD
  git -C "$SOURCE" apply "$PATCH"
fi
[ "$(git -C "$SOURCE" rev-parse HEAD)" = "$REV" ]
# Never accept a partially applied source tree after an interrupted build.
git -C "$SOURCE" apply --reverse --check "$PATCH"
# The cache is keyed by source + reviewed patch, with output hashes verified.
if [ -f "$SOURCE/.tutorial-build.sha256" ] && (cd "$SOURCE" && sha256sum -c .tutorial-build.sha256 >/dev/null 2>&1); then
  printf '%s\n' "$SOURCE"
  exit 0
fi
# Match wterm's required Zig version, verifying the official archive before use.
ZIG_HOME="$ROOT/.wterm/zig-0.15.2"
if [ ! -x "$ZIG_HOME/zig" ]; then
  ARCH=$(uname -m)
  [ "$ARCH" = x86_64 ] || { echo 'wterm build currently requires a Linux x86_64 builder' >&2; exit 1; }
  [ "$(uname -s)" = Linux ] || exit 1
  curl -fL --retry 3 https://ziglang.org/download/0.15.2/zig-x86_64-linux-0.15.2.tar.xz -o "$ROOT/.wterm/zig.tar.xz" >&2
  printf '%s  %s\n' 02aa270f183da276e5b5920b1dac44a63f1a49e55050ebde3aecc9eb82f93239 "$ROOT/.wterm/zig.tar.xz" | sha256sum -c - >&2
  mkdir -p "$ZIG_HOME"
  tar -xJf "$ROOT/.wterm/zig.tar.xz" --strip-components=1 -C "$ZIG_HOME"
  rm "$ROOT/.wterm/zig.tar.xz"
fi
export PATH="$ZIG_HOME:$PATH"
(cd "$SOURCE"
 npx --yes pnpm@11.1.3 install --frozen-lockfile --ignore-scripts >&2
 bash packages/@wterm/ghostty/scripts/build-wasm.sh >&2
 npx --yes pnpm@11.1.3 --filter @wterm/core --filter @wterm/ghostty --filter @wterm/dom build >&2
 npx --yes pnpm@11.1.3 --filter @wterm/ghostty --filter @wterm/dom test >&2
 find packages/@wterm/{core,ghostty,dom}/dist -type f -print0 | sort -z | xargs -0 sha256sum > .tutorial-build.sha256
 sha256sum packages/@wterm/ghostty/wasm/ghostty-vt.wasm >> .tutorial-build.sha256
)
printf '%s\n' "$SOURCE"
