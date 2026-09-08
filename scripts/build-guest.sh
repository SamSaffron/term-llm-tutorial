#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
(cd guest && CGO_ENABLED=0 GOOS=linux GOARCH=386 GO386=softfloat go build -trimpath -ldflags='-s -w' -o ../public/assets/guest-bridge .)
# Same stock native build used by local builds and CI.
sh scripts/build-native-cli.sh
