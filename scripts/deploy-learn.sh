#!/usr/bin/env bash
# Transfer an already-built release through a server-enforced rrsync account.
# No builds, arbitrary remote commands, nginx writes or reloads here.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DEPLOY_HOST:?Set DEPLOY_HOST to tutorial-deploy@origin}"
case "$DEPLOY_HOST" in tutorial-deploy@*) ;; *) echo 'Refusing non-restricted deployment account' >&2; exit 1;; esac
[[ -f hosting/site/learn/index.html && -f hosting/asset-manifest.json ]]
if [[ -n $(find hosting/site/learn -type l -print -quit) ]]; then
  echo 'Refusing symlinks in release' >&2
  exit 1
fi
# rrsync confines this relative destination to the tutorial directory.
# Keep old hashed files for already-open sessions; never use --delete.
rsync -rc --chmod=D755,F644 -e 'ssh -o BatchMode=yes -o StrictHostKeyChecking=yes' \
  hosting/site/learn/ "$DEPLOY_HOST:./"
printf '%s\n' 'Uploaded tutorial static files; run scripts/smoke-hosting.mjs next.'
