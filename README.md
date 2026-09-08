# term-llm interactive tutorial

A real Linux terminal on the left, thirteen short lessons on the right. Learn shell completion, `ask`, file context and pipes, `exec`, approvals, MCP, chat and resume, save a checklist, then start the real web interface.

**Live:** https://term-llm.com/learn/

## Three modes

- **Simulator:** explicitly scripted responses, no WebGPU or model download. Selected automatically when no GPU adapter is available. Uses the actual supplied files and conversation history, requests real tool calls, and explains unsupported questions.
- **Qwen:** real browser-local inference using **Qwen3 8B q4f32**. Approximately4.6GB of weights; the tested16K runtime allocates roughly10GB of GPU buffers. Lower context limits are available. No cloud inference.
- **Bonsai (optional):** real browser-local **Bonsai 8B Q1_0**, using pinned bitgpu 0.19.1 with f32 activation and q8 KV. ~1.16 GB weights plus tokenizer/runtime, cached when possible. GPU memory depends on context/device; weight size is not an allocation estimate. No CPU/cloud fallback. See [pins, licenses, limitations and live testing hooks](docs/bonsai.md).

All three modes run the real native term-llm CLI inside v86 Linux. Files, commands, approvals and the local picnic MCP server are real. Reloading/shutting down discards the guest; the final lesson can download its checklist. Simulator is not represented as a language model.

## Run locally

Build requirements: Linux x86_64, Node24+ (tested with26), npm, Git, curl, tar, Go compatible with `guest/go.mod` (tested with1.27), and Python3. Modern desktop browser; GPU only needed for real-model modes.

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
- `public/bonsai-worker.mjs`, `bonsai-runtime.mjs`, `bonsai-adapter.mjs`, `bonsai-model.mjs`, `bonsai-downloads.mjs`: optional GPU-only Bonsai, native tool schemas, fail-closed transport, pinned streaming cache.
- `public/simulator.mjs`, `simulator-worker.mjs`: bounded scripted provider, no network/filesystem/model access.
- `public/boot.sh`, `guest-config.yaml`: guest setup, seeded notes, completion, prompt approval default.
- `guest/`: Go localhost HTTP/9p bridge; `guest/picnic-mcp/`: real stdio MCP server.
- Native CLI: unmodified upstream `ba07b58441a660e3f279837851a8d32eb948f083`; no tutorial patch.
- `scripts/build-guest.sh`, `build-git.sh`: native build recipes. No host service installation.
- `scripts/stage-hosting.mjs`, `stage-cdn.mjs`: explicit runtime allowlist and content-hashed asset URLs.
- `hosting/browser-linux-lab*.conf`: scoped nginx templates; adapt paths/includes for your host. Personal SSH/deployment configuration is not in this repository.

The terminal uses **wterm with its Ghostty core**, built from pinned source with the reviewed Kitty Unicode placement patch in `patches/`. See [terminal build and verification](docs/inline-images.md). The old artifact agent, preview watcher and workspace mailbox have been removed.

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

## Native CLI

`npm run build` builds clean upstream `ba07b58441a660e3f279837851a8d32eb948f083`
(includes native configurable image providers). The pinned checkout is cached in
ignored `.native-cli/`; `TERM_LLM_SOURCE` may point to a clean checkout of that
exact commit. Git, Go, Node/npm, Python3 and make are required. There are no
patches, image-command wrappers, or synthetic CLI responses. Build output is
cached only when its hash, source commit and tool versions match.

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

## Demo images

Choose **Image support: Demo** to use the native demo provider. `term-llm image cat`
returns one of six explicitly canned drawings: cat, dog, elephant, rabbit, fox,
owl. No image model is loaded. Demo and Janus are separate Images API endpoints;
Janus never falls back to a demo image.

## Full-tutorial model evaluation

The [tutorial eval](docs/tutorial-eval.md) runs all **13 lessons** with the real Linux guest and CLI while using a local Ollama model for inference—no WebGPU weights required. It checks actual tools, approvals, MCP, chat/resume, export and the native web UI. Automated checks are necessary but not sufficient: free-text answers still require semantic review.

- [Harness and reproduction instructions](docs/tutorial-eval.md)
- [First-batch results and corrections](docs/tutorial-eval-results.md)
- [Five additional models, quantization/thinking comparisons and caveats](docs/tutorial-eval-round2.md)

Run the focused grading tests with `node --test tests/tutorial-eval.test.mjs`. Model evidence stays local under ignored `evidence/tutorial-eval/`; review/redact raw traces before sharing them.

## Image support

The launch gate has two dropdowns: **LLM** and **Image support: Off / Demo / Janus**.
When Janus is selected, Start shows a single license/download consent modal on
the launch screen. Back starts nothing; Accept & start boots with Janus. There
is no image settings panel in the tutorial. LLM, image provider and context are
fixed until shutdown; a new session starts from the launch screen.

```sh
term-llm image "A pelican riding a bike." -o pelican.png
```

This is the normal native command, not a tutorial extension. `image.provider`
selects the endpoint: `janus`, `demo`, or disabled `images-off`. The selected provider
is written to native configuration at boot. No `--generate`, `--demo`
or `--seed` flags are added. The provider chooses the seed.
The CLI saves the PNG and displays it inline in the terminal. The sidebar stays on your lesson. There is no
custom `.png.json` sidecar. Native `--provider`, stdin, output and help work normally.

`scripts/build-wterm.sh` rebuilds the terminal's WASM core and DOM renderer to
support the native CLI's Kitty Unicode placements. `TERM=xterm-kitty` is enabled;
there is no image-command wrapper, sidebar image output or byte-stream rewriting.
The build uses ReleaseSafe and one resize owner; repeated images and resizing
have browser coverage. Full details and remaining protocol limits are in
[docs/inline-images.md](docs/inline-images.md).

Janus and the selected LLM take turns using GPU memory automatically. An image
command always uses Janus; a text command always uses the chosen LLM. No provider
fallback, switching buttons or repeated consent dialogs. The first text request
may load/download the chosen LLM; subsequent loads use cache where available.
Guest files and conversation history survive this internal residency management.
Shutdown discards the guest and returns to the launch screen.

Model pins, license details and tests: [JANUS-IMAGE-GENERATION.md](JANUS-IMAGE-GENERATION.md).

```sh
npm test
(cd guest && go test -race ./...)
npm run build
node scripts/stage-hosting.mjs
IMAGE_TEST_STAGED=1 node scripts/image-generator-live.mjs
IMAGE_TEST_LAUNCH=1 IMAGE_TEST_STAGED=1 node scripts/image-generator-live.mjs
IMAGE_TEST_DEMO=1 IMAGE_TEST_STAGED=1 node scripts/image-generator-live.mjs
IMAGE_TEST_BONSAI=1 IMAGE_TEST_CONTEXT=4096 IMAGE_TEST_STAGED=1 node scripts/image-generator-live.mjs
```

Browser tests use the authenticated shared browser, local static routing and real
inference. They do not deploy or change browser flags. Evidence stays ignored.
