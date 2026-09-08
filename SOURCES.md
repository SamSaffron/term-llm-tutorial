# Provenance and redistribution

This Git repository contains authored source, the npm lockfile, native build recipes, third-party license notices. Generated bundles, executables, upstream archives, model weights, firmware and recorded sessions are not committed.

| Component | Pin / source | License / handling |
|---|---|---|
| Tutorial UI, simulator, guest bridge and picnic MCP | This repository | MIT (`LICENSE`) |
| term-llm guest CLI | [Upstreamba07b58441a660e3f279837851a8d32eb948f083](https://github.com/samsaffron/term-llm/tree/ba07b58441a660e3f279837851a8d32eb948f083) — unmodified | MIT; dependency notices in `licenses/go/` |
| v86 | npm0.5.458, source d96be774e549a83371b038b86e819804c96b921f | BSD-2-Clause; npm integrity pinned |
| WebLLM | npm0.2.84 | Apache-2.0 |
| Qwen3 8B q4f32 | mlc-ai/Qwen3-8B-q4f32_1-MLC revision34026572351006ba1865d11319309b151d9ccf16 | Apache-2.0; visiting browser downloads weights directly from Hugging Face only in Qwen mode |
| Bonsai 8B Q1_0 / tokenizer / auxiliary assets | Immutable upstream revisions and every asset hash in [docs/bonsai.md](docs/bonsai.md), enforced by `public/bonsai-model.mjs` | Model/tokenizer Apache-2.0; bitgpu auxiliary MIT; browser fetch only after starting Bonsai |
| bitgpu / streaming SHA-256 | npm bitgpu **0.19.1**, @noble/hashes **2.0.1**, exact lockfile integrity | MIT; bundled tokenizer/Jinja Apache-2.0; notices in `licenses/bitgpu-*` and `licenses/noble-hashes-MIT.txt`; dedicated worker only |
| Qwen runtime library | mlc-ai/binary-mlc-llm-libs025bcaf3780fa8254f5e5efd3bfea0a5397248f4, v0_2_84 Qwen3-8B-q4f32_1_cs1k-webgpu.wasm | Apache-2.0; browser fetch |
| wterm DOM + Ghostty core | Source `89cd4ad788563ce3e492664fdaa31debc909d62a` + `patches/wterm-kitty-unicode.patch`; rebuilt using `scripts/build-wterm.sh` (including Ghostty v1.3.1, ReleaseSafe) | Apache-2.0 (`licenses/wterm-LICENSE`); Ghostty MIT (`licenses/ghostty-LICENSE`) |
| Git |2.50.1, zlib1.3.1, Zig0.14.1 build toolchain | GPL-2.0 / zlib / MIT; exact source checksums and recipe in `scripts/build-git.sh`. Runtime bootstrap fetches corresponding Git/zlib source archives alongside binary |
| zsh guest environment | zsh5.9-r5 Alpine packages with musl/ncurses/libcap | Notices in `licenses/`; package metadata/patches in `sources/zsh/`; complete public source bundle pinned in runtime manifest |
| Transformers.js / ONNX Runtime | Lockfile pins; legacy experimental worker source retained | Apache-2.0 / MIT; not used by text Qwen, Bonsai or Simulator mode; optional Janus uses a separate exact 3.8.1 bundle |

## Public runtime bootstrap

`sources/runtime-manifest.json` records the exact byte sizes, SHA-256 hashes and public URLs for already-tested native runtime files, v86 assets, shell bundle and required source archives. `scripts/fetch-runtime.mjs` verifies every download before installing it under ignored directories. It never executes downloaded programs. Native CLI rebuilding instructions are in the README. The native CLI is built without patches.

## Linux / firmware boundary

`public/boot-assets.mjs` is authoritative for pinned URLs and SHA-256 verification:

- Linux/Buildroot image: https://i.copy.sh/buildroot-bzimage68.bin , SHA256507a759c70ab7a490a233be454d0b5b88bc667956a410b531cb4edc091e2eb1c. Boot identifies Linux6.8.12. Exact corresponding Buildroot configuration for that upstream image is not established.
- SeaBIOS and VGA BIOS: fetched from the pinned v86 source tree d96be774e549a83371b038b86e819804c96b921f. Their hashes are in the boot module. Exact upstream firmware build correspondence is not claimed.

These three files are fetched directly by the visiting browser, never committed or redistributed by the tutorial host. Do not add cached copies to Git or the staging allowlist without resolving their corresponding-source obligations. Generic upstream Linux/Buildroot links are not proof of the exact image's complete corresponding source.

Simulator text uses no model weights or inference runtime. The separate optional Janus image feature downloads its own weights only after explicit consent, including when text uses Simulator. All three modes still run the real guest operating system and CLI. All third-party license terms remain applicable.


## Optional Janus images

Model: `onnx-community/Janus-Pro-1B-ONNX` at immutable revision
`04efdf2e36cb07a034b0d94f7322356b292f0418`; the six exact ONNX artifacts,
byte counts and LFS SHA-256s are listed in `JANUS-IMAGE-GENERATION.md`.
Upstream model card: `deepseek-ai/Janus-Pro-1B` at
`960ab33191f61342a4c60ae74d8dc356a39fafcb`. The card's License section explicitly
subjects the model to the DeepSeek Model License despite conflicting MIT metadata.
The authoritative full agreement is copied, unchanged, from
https://github.com/deepseek-ai/Janus/blob/1daa72fa409002d40931bd7b36a9280362469ead/LICENSE-MODEL
to `licenses/Janus-LICENSE-MODEL.txt`, shipped and linked at opt-in. It allows
commercial use and distribution subject to conditions, **not unrestricted MIT
weight use**. We do not modify the ONNX weights. The conversion/quantization is
upstream's. §§4–6, Attachment A and output responsibilities apply to downstream
users; acceptance is required before the model can be enabled.

The npm alias `transformers-image` pins Transformers.js **3.8.1** separately from
the existing text experiment dependency. The build copies its self-contained
`dist/transformers.min.js` and matching `ort-wasm-simd-threaded.jsep.{mjs,wasm}`.
These are imported lazily by the dedicated image worker. Transformers.js is
Apache-2.0 (`licenses/transformers-js-LICENSE`); matching ONNX Runtime Web is
`1.22.0-dev.20250409-89f8206ba4`, MIT (`licenses/onnxruntime-web-LICENSE`).
The implementation follows the Janus Transformers.js processor/generate_images
API demonstrated by https://huggingface.co/spaces/webml-community/Janus-Pro-WebGPU
and the separately verified browser harness; it adds guest transport, consent,
fixed q4/fp32 sessions, worker-local seeds and termination-based cancellation.
No hosted image inference API or model weight mirror is provided.

## Native image-provider integration

The CLI is built from clean upstream commit `ba07b58441a660e3f279837851a8d32eb948f083`, including term-llm PR1120. `scripts/build-native-cli.sh` fetches that exact Git object, rejects modified/wrong source, builds the upstream frontend and Linux/i386 softfloat binary, and does not apply patches. The old downloadable CLI binary is removed from the bootstrap manifest. Guest demo/Janus HTTP endpoints implement the native OpenAI-compatible Images API; no image-command wrapper is installed.
