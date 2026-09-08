# Optional Bonsai 8B Q1 in Learn

Select **Bonsai 8B Q1** before starting. Qwen3 8B remains the default; Simulator remains scripted and requires neither a GPU nor model downloads. Bonsai uses a dedicated `bonsai-worker.js` bundle: neither `bitgpu` nor its tokenizer or hashing dependencies enter the main-page or Simulator bundle. Selecting a mode alone does not download weights; starting Bonsai does. There is no CPU, native-process, server, or alternate-model inference fallback.

## Pinned provenance and licenses

- Runtime: npm **bitgpu 0.19.1**, MIT, exact dependency and lockfile integrity. Uses `createEngine` and `createChat` (`bitgpu/chat`). See `licenses/bitgpu-MIT.txt` and `licenses/bitgpu-THIRD-PARTY.md`; the latter describes bundled Hugging Face tokenizer/Jinja code under Apache-2.0. Full Apache-2.0 text is in `licenses/Qwen-Apache-2.0.txt` (the same standard license).
- Streaming integrity: npm **@noble/hashes 2.0.1**, MIT (`licenses/noble-hashes-MIT.txt`). Hashing is not an inference fallback.
- GGUF: [prism-ml/Bonsai-8B-gguf](https://huggingface.co/prism-ml/Bonsai-8B-gguf/tree/48516770dd04643643e9f9019a2a349cf26c5dbd), revision `48516770dd04643643e9f9019a2a349cf26c5dbd`, file `Bonsai-8B-Q1_0.gguf`. Repository metadata declares Apache-2.0.
- Manifest/auxiliary data: [bitgpu models/bonsai-8b-gguf](https://github.com/stfurkan/bitgpu/tree/20dbb9b21ae427bdddaa332d11a33a14702652d0/models/bonsai-8b-gguf), revision `20dbb9b21ae427bdddaa332d11a33a14702652d0`, fetched from raw.githubusercontent.com. Runtime repository is MIT; underlying model remains Apache-2.0.
- Tokenizer: [onnx-community/Bonsai-8B-ONNX](https://huggingface.co/onnx-community/Bonsai-8B-ONNX/tree/a5694a132e4050cef2dc335528016ce7e56504c9), revision `a5694a132e4050cef2dc335528016ce7e56504c9`, resolved through the Hugging Face model API. Repository metadata declares Apache-2.0. Both fetched files match the actually evaluated tokenizer hashes. Independent comparison with the original GGUF found all 151,669 token IDs identical, all 151,387 merge rules identical, and an identical chat template.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| Bonsai-8B-Q1_0.gguf | 1,158,654,496 | `284a335aa3fb2ced3b1b01fcb40b08aa783e3b70832767f0dd2e3fdfa134bd54` |
| manifest.json | 104,294 | `1ee07d35cf91d551875159be35de689edcf690d219e03f69c3fc52c4eb6bb1d3` |
| Bonsai-8B-Q1_0.aux.bin | 1,536 | `0d6b0343095642b26ea9a7cbfff224782cd0e23fe25a008e639289fb241aabf4` |
| tokenizer.json | 9,117,036 | `40ae5d1ee027b985684a3bbeef4ee16b2b5697d1d90658bec5bc5d2a73018bd7` |
| tokenizer_config.json | 4,598 | `a8342e0e0e791a478f628dd1adf825ab1f9afe4a1075959ad32d77f1318b9841` |

The URLs, lengths and hashes are enforced in `public/bonsai-model.mjs` / `bonsai-downloads.mjs`. Auxiliary and tokenizer bytes were fetched and hashed during implementation; the GGUF hash/size were checked against pinned HF LFS metadata, not by downloading another local copy of the 1.16 GB weights. Browser loads verify **every asset**, including cache hits, before reporting ready. The GGUF is streamed and incrementally hashed rather than buffered into a giant JS ArrayBuffer. A failed load disposes the engine. Only these external assets are permitted by the download adapter; the existing hosting CSP already allows their origins, so no wider CSP is needed.

Cache Storage `learn-bonsai-pinned-v1` is best effort: quota/permission failures are reported, do not pretend caching succeeded, and may require another download. Transfers show measured bytes for the current file, not an invented overall percentage. Clearing this cache removes Bonsai downloads; cancel/unload does not. Initial weight transfer is ~1.16 GB decimal plus ~9.2 MB tokenizer/auxiliary and the worker runtime. GPU allocation is larger than weight download size and varies by context/device. **No universal 16K memory estimate is established.**

## Request semantics and limitations

- Production defaults match the evaluated adapter: f32 activation, **q8 KV**, temperature 0, seed 42, max output 2048, top-k 20, top-p .9, min-p 0, repetition penalty 1, thinking off. q8 KV is lossy and differs from a native backend's cache; native GGUF results are not interchangeable evidence for this browser mode.
- Existing 4K / 8K / 16K controls set `maxSeqLen`. Load refuses any mismatch in active activation, KV, context, or `overflow: error`. Diagnostics show `activeGPUCaps`, effective context, original request, adapted options and raw native result. No allocation estimate is disguised as measured GPU memory.
- Requested output limits (`max_completion_tokens` before `max_tokens`), temperature, seed, top-p, presence penalty, stop strings and thinking are honored when supported. The **actual native rendered token count plus requested output** must fit the selected context. No history trimming, rolling windows, or hidden context fallback. A smaller output/context selection may be needed for long conversations.
- Each HTTP request supplies full native history: `chat.reset()` and `reuseCache:false`. OpenAI assistant function wrappers map to `{name, arguments}`; tool result content is retained. The original request is not mutated. The existing guest bridge buffers a complete response and then emits SSE when requested.
- Tools and schemas go directly to bitgpu's native grammar. `auto`, `none`, and named function choices are supported. `required` with exactly one declared tool becomes that named choice. **Required-any among multiple tools fails explicitly**; it is not weakened to auto. Unsupported schema features fail in native validation. Tools are executed only by the real guest CLI following its normal approvals, never by the worker or host.
- Incomplete/unparsed, undeclared, forbidden or wrong-name calls fail rather than becoming fabricated executable calls. Aborted inference also fails. Text-only string message content is supported; multimodal content and unsupported message/request fields are explicitly rejected. Multiple completions, `parallel_tool_calls:false`, and forced-tool-plus-thinking requests are not supported. Unknown controls (including structured response formats) fail rather than being silently ignored.
- GPU device loss reports a fatal error, releases the text worker and rejects pending calls; guest files remain available to save. Restarting the tutorial discards guest RAM. Janus's existing callbacks release Bonsai before loading images and release Janus before reloading the selected Bonsai context. No simultaneous text/image workers are intended.

## Evidence and testing hooks

The prior **attached-browser GPU evaluation** completed 13 workflows and the changed-note probe: raw **11/13 PASS, 2 FAIL**. The summary produced four bullets instead of three (genuine failure); the vegetarian check was a regex false positive. This is not a full-pass claim and **is not a test of this Learn integration**. No private bridge wrappers, traces, or evaluation subsystem are imported here. The pure browser adapter is derived from the evaluated adapter with browser-safe checks, context budgeting and fail-closed validation.

Automated local checks (no shared browser):

```sh
npm ci
npm test
(cd guest && go test ./...)
node scripts/fetch-runtime.mjs
npm run build
node scripts/stage-hosting.mjs
```

`tests/bonsai.test.mjs` covers the actual bitgpu tool parser/schema validator plus adapter, cache integrity/progress, worker protocol, no-GPU path, device loss, context bounds and three-mode wiring. Injected engine tests are protocol tests, **not inference evidence**.

The actual staged Learn integration was subsequently exercised on the shared NVIDIA browser at 16K: all 13 lesson workflows and the changed-file grounding probe completed through the new bundled Bonsai worker, with no substituted inference and no inference errors. The automated result remained 11/13 PASS and 2 FAIL for the same summary-count error and vegetarian-regex false positive. Exported Blob bytes matched the guest file, and the browser reported download completion. An earlier attempt stopped on a remote-browser `download.saveAs` harness-path error; the corrected rerun verified the actual exported Blob instead of trying to copy a browser-host temporary path from the test container.

A separate no-GPU Simulator smoke verified automatic selection, real guest boot and answer, zero Bonsai/Qwen/Janus model requests, and no downloads merely from selecting Bonsai before boot. The 16K Bonsai run likewise fetched no Qwen or Janus model/runtime. Runtime capability diagnostics reported f32 activation, q8 KV and exactly 16384 context. These are functional integration checks, not a clean model-quality score.

Live 4K/8K inference, full-window long-context quality, total device-memory suitability, and the combined Bonsai → Janus → Bonsai live handoff remain unverified. Unit tests cover the context/lifecycle boundaries. For further local testing: To test locally: `npm run serve`, open `http://127.0.0.1:8765/`, select Bonsai and a context, then Start. Inspect **Behind the scenes** for active f32/q8 and matching context. Repeat at 4096, 8192 and 16384 where hardware permits; failure on insufficient GPU memory must be explicit. Check the network panel: Qwen/Simulator must not fetch `bonsai-worker` or Bonsai assets; Bonsai must not fetch Qwen weights or Janus before opting in. Reload Bonsai and inspect cache progress / transferred bytes.

In the real terminal, test normal inference and changed files (not hard-coded answers):

```sh
term-llm ask -f notes.txt "What should we do if it rains?"
printf 'If it rains, meet at the museum.\n' > notes.txt
term-llm ask -f notes.txt "What should we do if it rains?"
term-llm exec "Show the current directory and list its files."
term-llm chat
```

Verify the second answer uses the museum, command proposals go through real approvals, and chat follow-ups retain history. Also test the tutorial MCP, file-writing/checklist, chat/resume and real guest web lessons. Free-text quality needs human checking, not just regexes.

The existing image integration hook now accepts Bonsai and context without changing its Qwen/Simulator defaults:

```sh
IMAGE_TEST_BONSAI=1 IMAGE_TEST_CONTEXT=4096 IMAGE_TEST_STAGED=1 node scripts/image-generator-live.mjs
# Repeat with 8192 / 16384 if supported by available GPU memory.
# Existing regression hooks:
IMAGE_TEST_QWEN=1 IMAGE_TEST_STAGED=1 node scripts/image-generator-live.mjs
IMAGE_TEST_STAGED=1 node scripts/image-generator-live.mjs
```

These commands **use the shared browser**, create their own tab, and exercise real text → Janus → text plus guest-file retention. They were intentionally not run during implementation. They write ignored local evidence, not committed traces. They do not constitute a full tutorial model evaluation. Nothing here commits, pushes or deploys; review/test/commit/publication remain with the requester.
