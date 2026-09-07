# Optional Janus integration — verified 2026-09-07

## Shipping pins (no `main` model downloads)

- Model: `onnx-community/Janus-Pro-1B-ONNX`
- Revision: `04efdf2e36cb07a034b0d94f7322356b292f0418`, applied to both processor and model.
- Runtime: npm `@huggingface/transformers@3.8.1`, lockfile integrity pinned;
  use its self-contained `dist/transformers.min.js`, not bare-import `transformers.web.js`.
- WASM: same npm dist, one thread (matching the successful non-isolated HF proof harness).
  Learn is cross-origin isolated; allowing the default pthread pool caused a real
  nested-worker failure during initial testing. Single-threaded WASM fixes that
  without changing the GPU inference configuration or weakening CSP.
- No `shader-f16` requirement or feature-dependent dtype changes.

| ONNX file | Backend / dtype | Bytes | LFS SHA-256 |
|---|---|---:|---|
| `prepare_inputs_embeds_q4.onnx` | WASM / q4 | 1,038,802,881 | `380c548a75687004c47f7a988f474d03d052b2154292e2a4d001d74d4d2cc845` |
| `language_model_q4.onnx` | WebGPU / q4 | 779,633,963 | `acdf40d04c8b0a42afbc1289332ac706b9ff2a9d7dd4bbd4806a5e5c9e388ca0` |
| `lm_head.onnx` | WebGPU / fp32 | 838,861,112 | `35120d0b88a8fb243b7edb7d1aeda1b0e288ef5137f996836046794e195fc0fc` |
| `gen_head.onnx` | WebGPU / fp32 | 151,070,926 | `c49d215163009f0a15f0861f8c31732650123f3d669cfa93d760f0dcd83b46c0` |
| `gen_img_embeds.onnx` | WebGPU / fp32 | 17,385,630 | `9217a706c0676b16d0aa5caeb6e103eec78cc9f221d245105579d2c65bc5cb74` |
| `image_decode.onnx` | WebGPU / fp32 | 170,460,651 | `5395223c9212df6dca1f29a540f7c5c78971c0d2ee7a3ac88a4e8f5f2b227fb8` |

**Total: 2,996,215,163 bytes**, plus tokenizer/configs and ~22 MB local runtime.
The LFS hashes above are authoritative HF artifact metadata, not a claim that
we stream-hash 3 GB at each launch. Immutable revision URLs select the files;
Transformers.js uses browser cache when available.

Runtime SHA-256s copied at build:

```
aa5002b70e789798da263f5f99c62bd3e8fcd0c119258a493c40c180648365fa  transformers.min.js
08fb86ec433c78bfb032c5d84a68b8e8e5a8d81268fa39e24314179a5767a5b9  ort-wasm-simd-threaded.jsep.mjs
c46655e8a94afc45338d4cb2b840475f88e5012d524509916e505079c00bfa39  ort-wasm-simd-threaded.jsep.wasm
```

## License decision and obligations

The converter card's MIT tag does not supersede upstream model terms. Read the
actual [DeepSeek Model License](licenses/Janus-LICENSE-MODEL.txt), pinned source
and model-card provenance in `SOURCES.md`. This is not a noncommercial-only
license and does not prohibit this tutorial integration:

- §§2–3 grant copyright/patent rights subject to conditions.
- §4 expressly allows distribution and hosting for third-party remote access.
  §4(a) requires downstream use restrictions as an enforceable agreement;
  §4(b) requires a full license copy; §4(c–d) require modification notices and
  preservation of applicable notices. We redistribute the license unchanged,
  preserve notices, and do not modify weights. Upstream performs ONNX conversion
  and quantization; this is documented, not presented as our own original model.
- §5 and Attachment A restrict specified uses (including unlawful/infringing,
  military, exploitation/harm of minors, malicious false information,
  unauthorized personal information, harassment, and discriminatory/harmful or
  rights-affecting automated decisions). The full text, not this summary,
  governs. The checkbox makes §5 and **all Attachment A restrictions** binding
  terms of model use, and acceptance plus download consent are required to enable.
- §6 assigns output responsibility to the user; DeepSeek generally claims no
  output rights except as provided in the agreement. The UI warns to inspect
  outputs and not assume accuracy or suitability. No endorsement is implied.
- The software/runtime licenses remain distinct (Apache-2.0 / MIT); their
  existing full copies ship under `licenses/`.

No concrete license restriction blocks this implementation. We do not infer
that local browser execution waives these obligations or that the checkbox is a
technical content filter. No new content moderation capability is claimed.

## Guest boundary and lifecycle

The existing `term-llm` guest launcher still dispatches only `image` to the guest
bridge. `--generate` selects a distinct bounded request/response mailbox; without
it the six canned illustrations retain their labels and behavior. All other
commands execute the stock upstream binary unchanged. There is no patch to the
native CLI and no automatic synthetic fallback.

A guest image request is limited to 2,000 prompt bytes, an optional uint32 seed,
and one active request. The browser rejects requests until explicitly enabled.
The response is bounded to 2 MiB, correlated by ID, checked for prompt/seed match,
and decoded/validated as a 384×384 PNG before being saved and Kitty-encoded.
The sidecar carries prompt, seed, model ID and revision. Ordinary browser text
requests remain on their existing mailbox, and explicitly fail while paused.

The panel serializes model switching: no active text request may be interrupted
by enabling images; text worker termination precedes image worker creation;
image termination precedes text reload. Worker termination aborts model fetches
and all sessions together. Saved guest files, tutorial step/navigation and
conversations are not destroyed by switching. Only the full existing shutdown
path destroys Linux. Consent is not persisted and resets on shutdown.

Seeded Mulberry32 replaces `Math.random` **only in the dedicated worker during
sampling**, then restores it. Transformers.js 3.8.1's multinomial sampler uses
that function. This is reproducible on the tested runtime/GPU, not a guarantee
of identical floating-point results on all hardware or future runtimes.

## Actual verification (not a feasibility claim)

Shared authenticated browser, NVIDIA Lovelace, no `shader-f16`; no flags changed,
no browser/service restart, no unrelated tabs closed. Tests intercept only local
static build/staging files under `https://term-llm.com/learn/` in their own tab.
No generation or CLI responses are mocked. Existing pinned browser caches are
reused. Nothing has been pushed or deployed by these tests.

- JS build + boundary tests; guest Go build/tests, including stale response ID/error,
  timeout/locking, seed parsing, PNG validation and existing six canned/Kitty tests.
- Simulator tutorial launched normally; real stock CLI text answers worked before
  images, explicitly failed while paused, and worked after Reload text.
- Actual Qwen3 8B loaded with **9,999,575,156 tracked GPU buffer bytes**; terminated
  before Janus loaded; genuine generation completed; Janus terminated before
  Qwen was reloaded and answered another real CLI request. Tracked allocation is
  Qwen buffers, not total device memory; browser/driver reclamation is asynchronous.
- Request capture showed **zero image-worker/runtime/Janus requests before consent**,
  including an attempted `image --generate` command while disabled.
- Real guest command `term-llm image --generate "A pelican riding a bike." --seed 1 -o pelican.png`
  saved **300,208 PNG bytes**, a correct sidecar, and a 384×384 Kitty image with an
  actual wterm placement. Panel preview/download uses the same PNG.
- SHA-256: `0ba6ba0d9866e25798a2cd1dbf3e7c98369e09d53af0a4b055c7a988fc68b421`.
  A second seeded command saved a byte-identical PNG. End-to-end first command
  was ~16 seconds including typed input, model work, mailbox, serial graphics and
  validation; this is not the narrower ~7-second warm model-only benchmark.
- Cancel during actual generation returned nonzero, saved no `canceled.png`, and
  terminated the worker. Cancel during a new cached load also terminated it.
  Prior PNG files survived unload/text reload. Shutdown released workers and
  cleared consent. Controlled absent-WebGPU and null-adapter workers returned
  helpful errors without requesting runtime or weights.
- The hashed staging build was also exercised through the same full live test.
  Lesson progress and the `/` logo link stayed intact; after switching back,
  installing zsh completions, `exec $SHELL`, and actual Tab completion of
  `term-llm ch` to `term-llm chat` passed.
  One staging load returned an opaque ONNX numeric runtime error; it was surfaced,
  worker terminated, and a fresh explicit retry passed. Numeric runtime failures
  now include a memory/retry hint; arbitrary hardware success is not guaranteed.

Reproduction commands are in the README. Ignored raw evidence lives under
`evidence/optional-janus`, `evidence/optional-janus-qwen`, and
`evidence/optional-janus-staged`. Browser tokens, historical probes, model files
and sample binaries are deliberately not committed. The existing npm audit
reports four high findings in the Node-side Transformers/ONNX/sharp dependency
chain; these Node packages are not shipped in the image browser runtime. Do not
claim the entire development dependency tree is audit-clean.
