# term-llm interactive tutorial

A real Linux terminal on the left, twelve short lessons on the right. Learn shell completion, `ask`, file context and pipes, `exec`, approvals, MCP, chat and resume, save a checklist, then start the real web interface.

**Live:** https://wasnotwas.com/browser-linux-lab/

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
- `public/tutorial.mjs`: twelve lessons and navigation; navigation never executes commands.
- `public/inference-worker.mjs`, `protocol.mjs`, `qwen-tools.mjs`: Qwen transport, native JSON calls, real tool history; legacy XML support retained.
- `public/simulator.mjs`, `simulator-worker.mjs`: bounded scripted provider, no network/filesystem/model access.
- `public/boot.sh`, `guest-config.yaml`: guest setup, seeded notes, completion, prompt approval default.
- `guest/`: Go localhost HTTP/9p bridge; `guest/picnic-mcp/`: real stdio MCP server.
- `sources/term-llm-artifact.patch`: complete guest CLI patch against upstream commit `08059d2dceb6606e8f190ab3e88103dc53d03b66`.
- `scripts/build-guest.sh`, `build-git.sh`: native build recipes. No host service installation.
- `scripts/stage-hosting.mjs`, `stage-cdn.mjs`: explicit runtime allowlist and content-hashed asset URLs.
- `hosting/browser-linux-lab*.conf`: scoped nginx templates; adapt paths/includes for your host. Personal SSH/deployment configuration is not in this repository.

The historical artifact bridge/agent code remains as build compatibility support; the current UI has no artifact-preview pane.

## Tests

```sh
npm test
(cd guest && go test ./...)
```

The full browser walkthrough uses an authenticated CDP proxy configured with `JARVIS_BROWSER_BASE_URL` and `JARVIS_BROWSER_TOKEN`. It types actual commands into xterm, checks tool approvals, MCP, resumed chat and the downloaded file:

```sh
node scripts/tutorial-e2e.mjs             # live Qwen
SIMULATOR=1 node scripts/tutorial-e2e.mjs # removes page WebGPU; asserts no model requests
```

These target the hosted URL. For a private staged-static preflight, first run `node scripts/stage-hosting.mjs`, then use `LOCAL_TEST=1`. Tests route static assets only, not fabricated Qwen responses. Browser credentials and recorded transcripts are intentionally excluded from Git.

Both hosted original ten-lesson paths passed September6 2026;25 unit tests passed. This establishes the tutorial path on the tested browser, not perfect arbitrary model answers or universal hardware support.

## Rebuilding the native CLI

In a separate checkout of upstream term-llm, check out the pinned commit, apply `sources/term-llm-artifact.patch`, then set `TERM_LLM_SOURCE` to that checkout when running `scripts/build-guest.sh`. This builds Linux/i386 with soft-float. The CLI frontend build also needs the toolchain required by that pinned upstream repository. Do not apply the patch to your production checkout.

`node scripts/build.mjs` builds browser bundles, the guest HTTP bridge and the small picnic MCP executable; it does not rebuild the entire CLI or Git. The bootstrap is the quickest way to obtain the already-tested native artifacts. It depends on the pinned public download URLs staying available; all downloaded bytes are verified.

## Hosting

Keep this deployment directory outside documentation-site `rsync --delete` roots. Serve HTTPS with COOP/COEP and the scoped security headers. Put large runtime files behind a CDN. The staging script writes direct hashed app/worker/CSS URLs so cached redirects cannot keep clients on obsolete providers. Model weights remain upstream downloads rather than passing through the tutorial origin.

Source is MIT; third-party artifacts retain their own licenses. See `LICENSE`, `SOURCES.md` and `licenses/`.

## Web interface lesson

Step12 runs `tl serve web --port 8081 --auth none` inside the guest. Open web interface launches its actual UI in a new tab. A per-guest service worker and bounded9p HTTP relay connect the tab to guest loopback8081; cookies/host bearer tokens are not forwarded. Browser storage is namespaced to avoid reading or changing existing origin chat preferences. Keep the tutorial tab open. Ctrl+C stops the server. PWA installation/notifications are unsupported in this temporary browser-hosted instance.

`node scripts/tutorial-web.mjs` checks actual Simulator web messages, follow-up and server stop; use `QWEN=1` for real model inference. `LOCAL_TEST=1` uses staged tutorial assets for preflight. These tests do not replace web UI responses or model output.

The Meet agents lesson lists built-ins, inspects shell, and invokes `tl ask @shell` without executing a command. It distinguishes agent configuration from model capability and introduces `agents copy` for customization.
