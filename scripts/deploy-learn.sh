#!/usr/bin/env bash
# Deploy only /learn: never overwrite a site's vhost or either Hugo webroot.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DEPLOY_HOST:?Set DEPLOY_HOST to the SSH origin target}"
node scripts/build.mjs
node --test tests/*.test.mjs
node scripts/stage-hosting.mjs
ssh "$DEPLOY_HOST" 'mkdir -p /var/www/term-llm-tutorial/learn /etc/nginx/term-llm-locations.d /etc/nginx/term-llm-tutorial'
# Keep old fingerprinted files for already-open sessions.
rsync -rc --chmod=D755,F644 hosting/site/learn/ "$DEPLOY_HOST:/var/www/term-llm-tutorial/learn/"
scp hosting/browser-linux-lab.conf "$DEPLOY_HOST:/etc/nginx/term-llm-tutorial/route.next"
scp hosting/browser-linux-lab-headers.conf "$DEPLOY_HOST:/etc/nginx/term-llm-tutorial/headers.next"
scp hosting/browser-linux-lab-assets.conf "$DEPLOY_HOST:/etc/nginx/term-llm-tutorial/assets.next"
ssh "$DEPLOY_HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
python3 - <<'PY'
from pathlib import Path
s=Path('/etc/nginx/sites-enabled/term-llm.conf').read_text()
assert 'include /etc/nginx/term-llm-locations.d/*.conf;' in s, 'Deploy the docs-owned app include first'
PY
backup=$(mktemp -d /etc/nginx/term-llm-tutorial/rollback.XXXXXX)
for file in /etc/nginx/term-llm-locations.d/learn.conf /etc/nginx/term-llm-tutorial/{headers,assets}.conf; do
  if [ -f "$file" ]; then cp "$file" "$backup/$(basename "$file")"; fi
done
cp /etc/nginx/term-llm-tutorial/route.next /etc/nginx/term-llm-locations.d/learn.conf
cp /etc/nginx/term-llm-tutorial/headers.next /etc/nginx/term-llm-tutorial/headers.conf
cp /etc/nginx/term-llm-tutorial/assets.next /etc/nginx/term-llm-tutorial/assets.conf
if nginx -t; then
  systemctl reload nginx
else
  for file in /etc/nginx/term-llm-locations.d/learn.conf /etc/nginx/term-llm-tutorial/{headers,assets}.conf; do
    if [ -f "$backup/$(basename "$file")" ]; then cp "$backup/$(basename "$file")" "$file"; else rm -f "$file"; fi
  done
  exit 1
fi
REMOTE
curl --fail --silent --show-error --output /dev/null https://term-llm.com/learn/
printf '%s\n' 'Deployed: https://term-llm.com/learn/'
