# Production hardening activation

This change deliberately leaves `PRODUCTION_DEPLOY_ENABLED` unset until all gates
below are verified. Merging it pauses automatic deployment, not the live website.
Builds and PR tests continue without deployment secrets.

## GitHub protection (blocked on the current private-repository plan)

After the owner makes this repository public, or upgrades its plan:

1. Protect `main`: require one approving review, dismiss stale approvals, require
   the `build` status check with an up-to-date branch, block force pushes/deletion,
   and enforce for administrators. SamSaffron reviews Jarvis-authored PRs.
2. Configure the existing `production` environment with SamSaffron as required
   reviewer, prevent self-review, disable administrator bypass, and restrict
   deployments to `main`. The environment currently exists **without approval
   protection** because GitHub rejected required reviewers on the private plan.
3. Set fork workflow approval policy to `all_external_contributors`.
4. After this workflow is on main, require SHA pinning and remove the temporary
   `actions/checkout@v4`, `actions/setup-node@v4`, `actions/setup-go@v5` exceptions
   from the Actions allowlist. Keep only the five exact SHAs in deploy.yml.

## Replace root SSH with static-only upload

Administrator procedure; do not execute repository-supplied setup scripts as root
from CI. Keep the old credential until the new path passes its positive and negative
checks. Never publish private key material.

1. Create a dedicated unprivileged `tutorial-deploy` Unix account, no sudo rights.
   Its home and `.ssh/authorized_keys` must be root-owned and not writable by that
   account. Use a fresh dedicated Ed25519 key, not the old root deployment key.
2. Grant that account ownership of `/var/www/term-llm-tutorial/learn/` only.
   Check the tree has no symlinks. Parent directories and all nginx configuration
   stay root-owned. Ensure the account owns no other sensitive writable paths.
3. Add the new public key with this forced command and restrictions:

   ```text
   restrict,command="/usr/bin/rrsync -wo -munge -no-del /var/www/term-llm-tutorial/learn" ssh-ed25519 PUBLIC_KEY
   ```

   `-wo` blocks reads; `-munge` makes uploaded symlinks unusable; `-no-del` preserves
   existing assets. The OS account cannot edit nginx or other sites even if rsync
   has a path-validation bug. No arbitrary command dispatcher or sudo helper.
4. Back up `/etc/nginx/term-llm-tutorial/assets.conf`, then install
   `hosting/static-assets.conf` there. It handles hashed MIME types and cache
   headers without per-release nginx edits. Keep existing route and headers
   configuration. Run `nginx -t`, reload only on success, and check the current
   live release with `scripts/smoke-hosting.mjs`. Restore backup if smoke fails.
5. Verify the new key cannot execute `id`, write outside the tutorial, delete
   files, or change nginx configuration. Upload a harmless unique probe file,
   fetch it over HTTPS, then remove it as administrator. Verify ordinary rsync
   writes succeed while arbitrary SSH commands fail.
6. Put the new `DEPLOY_SSH_KEY`, `DEPLOY_HOST=tutorial-deploy@<origin>`, and
   authenticated/pinned `DEPLOY_KNOWN_HOSTS` into **production environment secrets**.
   Remove the old repository-level deployment secrets after the new path is
   verified; revoke only the matching old root deployment key, preserving admin
   access and unrelated keys.
7. Only after the environment's reviewer and branch policies are confirmed,
   set `PRODUCTION_DEPLOY_ENABLED=true`. Trigger the main workflow, approve its
   deployment, and verify the live asset/hash/header smoke succeeds.

The workflow builds without secrets on a separate runner, transfers only the
static site and manifest using a same-run immutable artifact, and deploys after
approval. The upload script does not rebuild or modify nginx. A malicious approved
release could still change tutorial content: this is deliberately its authority.

## Verification and rollback

Do not call the setup complete based on configuration files alone. Record the
live positive/negative SSH checks, GitHub policy readbacks, and approved deployment
run. Disable `PRODUCTION_DEPLOY_ENABLED` to pause deployment without affecting the
served site. Administrator-managed nginx backups provide rollback; old hashed
assets remain available for open browser sessions.
