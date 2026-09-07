# term-llm interactive tutorial

A real Linux terminal on the left, thirteen short lessons on the right. Learn shell completion, `ask`, file context and pipes, `exec`, approvals, MCP, chat and resume, save a checklist, then start the real web interface.

**Live:** https://term-llm.com/learn/

## Two modes

- **Simulator:** explicitly scripted responses, no WebGPU or model download. Selected automatically when no GPU adapter is available. Uses the actual supplied files and conversation history, requests real tool calls, and explains unsupported questions.
- **Qwen:** real browser-local inference using **Qwen3 8B q4f32**. Approximately4.6GB of weights; the tested16K runtime allocates roughly10GB of GPU buffers. Lower context limits are available. No cloud inference.

Both modes run the real native term-llm CLI inside v86 Linux. Files, commands, approvals and the local picnic MCP server are real. Reloading/shutting down discards the guest; the final lesson can download its checklist. Simulator is not represented as a language model.

## Run locally

Requirements: Node22+ (tested with26), npm, Go compatible with `guest/go.mod` (tested with1.27), and Python3. Modern desktop browser; GPU only needed for Qwen mode.

```sh
npm ci
node scripts/fetch-runtime.mjs
npm run build
npm test
npm run serve
```

Open http://127.0.0.1:8765/ . The local server supplies the cross-origin-isolation headers required by v86/WebGPU. Plain `file://` serving will not work.

The bootstrap downloads hash-pinned existing public runtime binaries and required source archives; none are committed to Git. It does not download model weights or firmware. Browser boot fetches and verifies the Linux image and firmware directly from upstream. See [SOURCES.md](SOURCES.md) and `sources/runtime-manifest.json`.

## Source layout

- `public/app.mjs`, `index.html`, `app.css`: terminal, lifecycle and mode selection.
- `public/tutorial.mjs`: thirteen lessons and navigation; navigation never executes commands.
- `public/inference-worker.mjs`, `protocol.mjs`, `qwen-tools.mjs`: Qwen transport, native JSON calls, real tool history; legacy XML support retained.
- `public/simulator.mjs`, `simulator-worker.mjs`: bounded scripted provider, no network/filesystem/model access.
- `public/boot.sh`, `guest-config.yaml`: guest setup, seeded notes, completion, prompt approval default.
- `guest/`: Go localhost HTTP/9p bridge; `guest/picnic-mcp/`: real stdio MCP server.
- Native CLI: unmodified upstream `6f79d50988f33d890b85c66df1168fa371e700a9`; no tutorial patch.
- `scripts/build-guest.sh`, `build-git.sh`: native build recipes. No host service installation.
- `scripts/stage-hosting.mjs`, `stage-cdn.mjs`: explicit runtime allowlist and content-hashed asset URLs.
- `hosting/browser-linux-lab*.conf`: scoped nginx templates; adapt paths/includes for your host. Personal SSH/deployment configuration is not in this repository.

The terminal uses **wterm 0.5.0 with its Ghostty core**, DOM text rendering and Kitty graphics. The old artifact agent, preview watcher and workspace mailbox have been removed.

## Tests

```sh
npm test
(cd guest && go test ./...)
```

The full browser walkthrough uses an authenticated CDP proxy configured with `JARVIS_BROWSER_BASE_URL` and `JARVIS_BROWSER_TOKEN`. It types actual commands into Ghostty Web, checks tool approvals, MCP, resumed chat and the downloaded file:

```sh
node scripts/tutorial-e2e.mjs             # live Qwen
SIMULATOR=1 node scripts/tutorial-e2e.mjs # removes page WebGPU; asserts no model requests
```

These target the hosted URL. For a private staged-static preflight, first run `node scripts/stage-hosting.mjs`, then use `LOCAL_TEST=1`. Tests route static assets only, not fabricated Qwen responses. Browser credentials and recorded transcripts are intentionally excluded from Git.

The Ghostty/unmodified-CLI migration passed the first eleven lessons in both Simulator and Qwen, including completion, approvals, chat/resume, built-in agents and checklist export. The twelfth lesson separately verifies actual web conversation and Ctrl+C shutdown. This establishes the tutorial path on the tested browser, not perfect arbitrary model answers or universal hardware support.

## Rebuilding the native CLI

In a clean, separate checkout of upstream term-llm, check out `6f79d50988f33d890b85c66df1168fa371e700a9`, then set `TERM_LLM_SOURCE` to that checkout when running `scripts/build-guest.sh`. This builds Linux/i386 with soft-float. The CLI frontend build also needs the toolchain required by that pinned upstream repository. The build refuses a different revision or modified tracked sources.

`node scripts/build.mjs` builds browser bundles, the guest HTTP bridge and the small picnic MCP executable; it does not rebuild the entire CLI or Git. The bootstrap is the quickest way to obtain the already-tested native artifacts. It depends on the pinned public download URLs staying available; all downloaded bytes are verified.

## Hosting

Keep this deployment directory outside documentation-site `rsync --delete` roots. Serve HTTPS with COOP/COEP and the scoped security headers. Put large runtime files behind a CDN. The staging script writes direct hashed app/worker/CSS URLs so cached redirects cannot keep clients on obsolete providers. Model weights remain upstream downloads rather than passing through the tutorial origin.

Source is MIT; third-party artifacts retain their own licenses. See `LICENSE`, `SOURCES.md` and `licenses/`.

## Web interface lesson

Step12 runs `tl serve web --port 8081 --auth none` inside the guest. Open web interface launches its actual UI in a new tab. A per-guest service worker and bounded9p HTTP relay connect the tab to guest loopback8081; cookies/host bearer tokens are not forwarded. Browser storage is namespaced to avoid reading or changing existing origin chat preferences. Keep the tutorial tab open. Ctrl+C stops the server. PWA installation/notifications are unsupported in this temporary browser-hosted instance.

`node scripts/tutorial-web.mjs` checks actual Simulator web messages, follow-up and server stop; use `QWEN=1` for real model inference. `LOCAL_TEST=1` uses staged tutorial assets for preflight. These tests do not replace web UI responses or model output.

The Meet agents lesson lists built-ins, inspects shell, and invokes `tl ask @shell` without executing a command. It distinguishes agent configuration from model capability and introduces `agents copy` for customization.

## Push-to-deploy

Pushes to `main` run `.github/workflows/deploy.yml`: JS/Go tests, verified runtime bootstrap, and a browser/guest build on a runner without deployment secrets. Pull requests only test and build. The separate deployment job consumes that run's static artifact, uses the `production` environment, and runs only when `PRODUCTION_DEPLOY_ENABLED=true`. **Merging a PR to `main` deploys automatically after the build passes; there is no separate deployment approval.**

Deployment credentials belong to `production` environment secrets: `DEPLOY_SSH_KEY`, `DEPLOY_HOST` (the `tutorial-deploy` account), and pinned `DEPLOY_KNOWN_HOSTS`. The upload account is restricted server-side to write-only rsync within the tutorial webroot. It cannot run arbitrary commands, delete files, write nginx configuration, or reload services.

The docs repository owns the permanent `include /etc/nginx/term-llm-locations.d/*.conf;` in the term-llm HTTPS vhost. An administrator owns the tutorial route and headers under `/etc/nginx/term-llm-tutorial/`, including the static hashed-asset rules in `hosting/static-assets.conf`. Ordinary deployments change only `/var/www/term-llm-tutorial/learn/`, outside the docs site's deletion root. Build and stage before invoking `scripts/deploy-learn.sh`; it no longer builds or configures nginx. See [activation and verification](hosting/SECURITY.md).

## A small Easter egg

Try `term-llm image cat` (or `tl image dog`, `elephant`, `rabbit`, `fox`, `owl`). These are original, **canned illustrations, not AI-generated images**. A guest-only launcher intercepts the image subcommand, saves a real PNG and displays it with Kitty graphics. Every other command invokes the unmodified native term-llm binary. Unknown animals/options fail honestly. `-o file.png`, `-o -` (raw PNG) and `--no-display` are supported; the demo does not claim the full native image command's options.

Images are bundled offline in `guest/demo-images/`; rebuild with `uv run --with pillow scripts/draw-animals.py`. Real generation is a separate explicit opt-in, described below.

## Full-tutorial model evaluation

The [tutorial eval](docs/tutorial-eval.md) runs all **13 lessons** with the real Linux guest and CLI while using a local Ollama model for inference—no WebGPU weights required. It checks actual tools, approvals, MCP, chat/resume, export and the native web UI. Automated checks are necessary but not sufficient: free-text answers still require semantic review.

- [Harness and reproduction instructions](docs/tutorial-eval.md)
- [First-batch results and corrections](docs/tutorial-eval-results.md)
- [Five additional models, quantization/thinking comparisons and caveats](docs/tutorial-eval-round2.md)

Run the focused grading tests with `node --test tests/tutorial-eval.test.mjs`. Model evidence stays local under ignored `evidence/tutorial-eval/`; review/redact raw traces before sharing them.

## Optional local image generation

Open **Optional image generation** beneath the terminal. Read/accept the linked
DeepSeek Model License and ~3 GB download consent, then select **Accept & enable
Janus**. Nothing in the image runtime or weights is requested before this action.
This is not an additional lesson and never enables itself from a terminal command.

Once the panel says ready, return to the shell (`/quit` from chat):

```sh
term-llm image --generate "A pelican riding a bike." --seed 1 -o pelican.png
```

This guest-only extension leaves the native CLI binary unmodified. It generates a
real 384×384 PNG, writes `pelican.png` and `pelican.png.json` (prompt, seed, model,
revision) in the current directory, and displays it inline using wterm/Kitty.
The optional panel also provides a preview and PNG download. Omit `--seed` to pick
and record a random uint32 seed; omit `-o` for a unique filename. `-o -` streams raw
PNG only (no sidecar), and `--no-display` suppresses terminal graphics. These are
bounded tutorial options, not the full upstream CLI image provider interface.

Enabling Janus terminates the text worker **before** creating the image worker.
Text requests then fail with a switch-back instruction, rather than silently
using Simulator. **Cancel / unload Janus** terminates loading or inference and
retains cached downloads and saved guest files. **Reload text** terminates Janus
before loading the originally selected text provider. Qwen and Janus are never
kept in workers together. Browser/driver reclamation can be asynchronous; other
tabs also consume memory. In Simulator mode, text stays honestly scripted while
Janus images are genuine local inference. No image download is needed to use
Simulator or the six canned illustrations.

Failures return nonzero with no canned fallback. WebGPU absence/no adapter is
reported before importing the runtime. A model load has a 15-minute deadline;
generation has a 3-minute deadline. Retry and text reload are explicit. Ctrl+C
interrupts the guest command; use the browser's Cancel control to stop outstanding
GPU work too. Shut down/reload releases workers and discards the guest; download
files first. Cancel does not delete the browser's model cache (clear site storage
in browser settings to remove it).

See [JANUS-IMAGE-GENERATION.md](JANUS-IMAGE-GENERATION.md) for pins, license
obligations and verified browser results. Local-only browser tests (authenticated
shared CDP proxy; only static files are intercepted; no deployment):

```sh
npm run build
node scripts/image-generator-live.mjs                      # Simulator + real Janus
IMAGE_TEST_QWEN=1 node scripts/image-generator-live.mjs    # real Qwen → Janus → Qwen
node scripts/image-unsupported-live.mjs                    # controlled worker capability failures
node scripts/stage-hosting.mjs
IMAGE_TEST_STAGED=1 node scripts/image-generator-live.mjs # actual hashed staging output
```

These tests create/close only their own tabs and use cached pinned weights where
available; they never change browser flags or restart services. Evidence and
sample PNGs go under ignored `evidence/optional-janus*` directories.
