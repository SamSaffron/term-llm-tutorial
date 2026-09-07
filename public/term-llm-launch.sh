#!/bin/sh
# Guest-only canned images / opt-in Janus bridge. All other commands execute the unmodified native CLI.
if [ "${1:-}" = image ]; then
  shift
  exec /tmp/guest-bridge image-demo "$@"
fi
exec /tmp/term-llm-native "$@"
