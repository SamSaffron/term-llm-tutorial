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

## Native provider boundary

Clean upstream CLI: `ba07b58441a660e3f279837851a8d32eb948f083` (PR1120).
`/tmp/term-llm` is the actual binary, not a wrapper. Normal `term-llm image`
uses `image.provider` and the named OpenAI-compatible configurations:
- `demo`: `/images/demo/v1/images/generations`, model `demo`, exact canned PNGs.
- `janus`: `/images/janus/v1/images/generations`, model `Janus-Pro-1B`, real browser inference or an error.
- `images-off`: `/images/off/v1/images/generations`, always an explicit disabled error.

The browser's enable action updates native configuration via a bounded, fixed-name
configuration channel before loading Janus. The guest bridge invokes the native
`config set image.provider` command with an allowlisted value; it never executes
model-supplied commands. Initial selection is written into the guest config at boot.

Requests are bounded to 8 KiB, prompts to 2000 bytes, and one image per request. Janus
uses the existing correlated 9p mailbox; the response must decode to a 384×384 PNG.
The native CLI owns saving/output. A canceled, disabled, or failed Janus request
never returns a demo image. There are no custom image CLI flags or sidecars.

The browser previews the actual provider PNG and offers download. Native Kitty
Unicode placements are unsupported by wterm 0.5.0 and reproduced a WASM core
crash, so the guest keeps `TERM=xterm-256color`, not `xterm-kitty`. We do not patch
the CLI or rewrite its terminal output to hide that incompatibility.

## Verification

Shared authenticated NVIDIA/Lovelace browser, cached pinned weights, no browser
flags or service changes. Local hashed-staging routing only; not deployed.
- Plain native `term-llm image "A cat riding a bicycle." -o generated-cat.png`
  generated a genuine 384×384 PNG; guest file and preview/download bytes matched.
- Native `config get image.provider` returned `janus` after enabling.
- Explicit demo-provider response matches the bundled demo PNG. Janus output is
  distinct; Janus errors and even a canned PNG supplied as a Janus response are rejected.
- Default launch requested no Janus runtime/weights before consent.
- Cancel/unload then plain `image cat` returned an error without an output file.
- Simulator text reload, preserved PNG/lesson progress, real zsh completion and
  shutdown passed. Images-first -> real Janus -> real Qwen3 8B also passed on the new native CLI,
  with no text runtime requested before Janus consent and no worker overlap.

Reproduce via README commands. Ignored evidence: `evidence/native-image-live.log`
and `evidence/optional-janus-staged/`. No credentials, sample binaries or model
weights are committed. The unchanged runtime dependency chain retains the previously
documented Node-side npm audit findings; no audit-clean claim is made.
