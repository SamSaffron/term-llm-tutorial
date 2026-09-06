# Provenance and redistribution

This Git repository contains authored source, the npm lockfile, native build recipes, third-party license notices. Generated bundles, executables, upstream archives, model weights, firmware and recorded sessions are not committed.

| Component | Pin / source | License / handling |
|---|---|---|
| Tutorial UI, simulator, guest bridge and picnic MCP | This repository | MIT (`LICENSE`) |
| term-llm guest CLI | [Upstream6f79d50988f33d890b85c66df1168fa371e700a9](https://github.com/samsaffron/term-llm/tree/6f79d50988f33d890b85c66df1168fa371e700a9) — unmodified | MIT; dependency notices in `licenses/go/` |
| v86 | npm0.5.458, source d96be774e549a83371b038b86e819804c96b921f | BSD-2-Clause; npm integrity pinned |
| WebLLM | npm0.2.84 | Apache-2.0 |
| Qwen3 8B q4f32 | mlc-ai/Qwen3-8B-q4f32_1-MLC revision34026572351006ba1865d11319309b151d9ccf16 | Apache-2.0; visiting browser downloads weights directly from Hugging Face only in Qwen mode |
| Qwen runtime library | mlc-ai/binary-mlc-llm-libs025bcaf3780fa8254f5e5efd3bfea0a5397248f4, v0_2_84 Qwen3-8B-q4f32_1_cs1k-webgpu.wasm | Apache-2.0; browser fetch |
| Ghostty Web | npm0.4.0; lockfile authoritative; bundled Ghostty WASM | MIT (`licenses/ghostty-web-LICENSE`) |
| Git |2.50.1, zlib1.3.1, Zig0.14.1 build toolchain | GPL-2.0 / zlib / MIT; exact source checksums and recipe in `scripts/build-git.sh`. Runtime bootstrap fetches corresponding Git/zlib source archives alongside binary |
| zsh guest environment | zsh5.9-r5 Alpine packages with musl/ncurses/libcap | Notices in `licenses/`; package metadata/patches in `sources/zsh/`; complete public source bundle pinned in runtime manifest |
| Transformers.js / ONNX Runtime | Lockfile pins; legacy experimental worker source retained | Apache-2.0 / MIT; not used by current Qwen or Simulator mode |

## Public runtime bootstrap

`sources/runtime-manifest.json` records the exact byte sizes, SHA-256 hashes and public URLs for already-tested native runtime files, v86 assets, shell bundle and required source archives. `scripts/fetch-runtime.mjs` verifies every download before installing it under ignored directories. It never executes downloaded programs. Native CLI rebuilding instructions are in the README. The native CLI is built without patches.

## Linux / firmware boundary

`public/boot-assets.mjs` is authoritative for pinned URLs and SHA-256 verification:

- Linux/Buildroot image: https://i.copy.sh/buildroot-bzimage68.bin , SHA256507a759c70ab7a490a233be454d0b5b88bc667956a410b531cb4edc091e2eb1c. Boot identifies Linux6.8.12. Exact corresponding Buildroot configuration for that upstream image is not established.
- SeaBIOS and VGA BIOS: fetched from the pinned v86 source tree d96be774e549a83371b038b86e819804c96b921f. Their hashes are in the boot module. Exact upstream firmware build correspondence is not claimed.

These three files are fetched directly by the visiting browser, never committed or redistributed by the tutorial host. Do not add cached copies to Git or the staging allowlist without resolving their corresponding-source obligations. Generic upstream Linux/Buildroot links are not proof of the exact image's complete corresponding source.

Simulator mode uses no model weights or inference runtime. Both modes still run the real guest operating system and CLI. All third-party license terms remain applicable even while this repository is private.
