# Tutorial model eval

Run the **current 13-lesson tutorial** with actual guest Linux, stock term-llm, completion installation, approvals, local MCP, saved sessions, downloaded checklist and native web chat. Model inference runs in local Ollama, not WebGPU. No model command executes on the host.

## Run

Prerequisites: Node, Chromium (`/usr/bin/chromium`, override with `EVAL_CHROMIUM`), Ollama, the tutorial dependencies and verified runtime assets. In an ordinary checkout, run `npm ci`, `node scripts/fetch-runtime.mjs` and `npm run build` first. The build needs the guest Go toolchain. Existing prepared tutorial assets can be reused without changing the deployed site.

```bash
node --test tests/tutorial-eval.test.mjs
EVAL_MODEL=qwen3:8b-q8_0 EVAL_PULL=1 node scripts/tutorial-eval.mjs
EVAL_MODEL=qwen3.5:2b node scripts/tutorial-eval.mjs
```

For a downloaded, revision-pinned GGUF, create a Modelfile:

```text
FROM /absolute/path/to/model.gguf
PARAMETER num_ctx 16384
```

Then:

```bash
EVAL_MODEL=tutorial-candidate:q8 \
EVAL_MODELFILE=/absolute/path/to/Modelfile \
EVAL_DIR=evidence/tutorial-eval/candidate-q8 \
node scripts/tutorial-eval.mjs
```

The script owns a temporary Ollama process on **127.0.0.1:11439** and stops it after the run. Do not use that port for another service while running. Model cache is `$HOME/.cache/tutorial-eval-models` (override with `EVAL_MODELS_DIR`); adapt the local path for another machine. `EVAL_ENDPOINT` reuses an existing **Ollama native API** endpoint instead. No services are registered. Nothing is deployed or published.

## What is real and what is substituted

- The full v86 Linux guest, CLI, tool execution, MCP process, terminal input, files, sessions and serve-web are real.
- The **inference-worker transport only** is replaced: tutorial provider requests go to local Ollama. There are no simulator replies, canned answers or model-accessible host filesystem mounts.
- The Simulator selector is used only as a no-WebGPU boot entry point; the intercepted worker never executes simulator code. The page is relabeled `EVAL: REAL LOCAL ...` after boot.
- Completion/alias setup and direct MCP calls are deterministic integration coverage, not model intelligence scores.
- The tutorial prompts come from `public/tutorial.mjs`. Task orchestration currently indexes the lesson list; if lessons are reordered or their actions change, update the harness. This is not yet a generic lesson DSL.
- Native `/api/chat` is intentional. The tested Ollama OpenAI-compatible route ignored non-thinking fields and produced a misleading budget-exhaustion failure. Native `think:false` is used consistently.

## Acceptance

Exit 1 on a failed required step, semantic predicate failure, truncated response, tool/transport failure or missing model output. On mechanical failure, later lessons are **NOT_RUN**, not failed model answers. Every required lesson must pass for `automatedPass:true`.

`automatedPass` is **not sufficient for final model acceptance**. Free-text semantic correctness still requires transcript review, explicitly marked in results. The current predicates catch known mistakes (wrong bullet count, wrong rain destination, obvious vegetarian/vegan confusion, raw tool markup, bad `pwd` explanations, too many checklist items), but cannot prove arbitrary prose correct. Do not mistake regex checks for a semantic judge. Final result is:

1. All 13 lessons pass;
2. Artifact export bytes match;
3. Changed-notes grounding probe passes;
4. Reviewer reads all answer/tool traces against instructions, confirms dietary changes, and records approval of the run.

The changed-notes probe replaces the real guest notes with a museum rain destination and checks that the answer changes. It does not overwrite a model answer or provider result.

## Comparison conditions and evidence

First-batch default comparison: Q8_0, temperature 0, seed 42, native non-thinking, 16K inference context and 2048 generated-token cap; second-batch thinking/temperature/precision differences are explicitly documented; actual guest config is left unchanged. Each model is warmed before tutorial boot. Templates/parsers are automatically selected by Ollama and differ by architecture. This is a **model + serving configuration** test, not an isolated weights ranking. Native Q8 results do not establish WebGPU Q4 compatibility or latency.

Each output directory contains `manifest.json`, `results.json`, raw request/response/tool `traces.jsonl`, final terminal, screenshot, failures and (when reached) checklist/export bytes and grounding probe. Earlier harness/debug runs must not be mixed with accepted final runs. Data is private and ignored by Git.

## Current status

Working prototype with all 13 lessons exercised successfully by Qwen3-8B Q8 in two complete runs. All four first-batch smaller configurations failed full acceptance. The second batch found working smaller configurations, with caveats. See `tutorial-eval-results.md` and `tutorial-eval-round2.md`. Improvements still needed: generalized lesson mapping, configurable runtime paths, stronger independently calibrated semantic grading, clean-machine bootstrap validation and broader repeated/quantization testing.

## Second-batch update

See `tutorial-eval-round2.md`. Five more model families/configurations were tested. Qwen3-1.7B Q8 with `EVAL_THINK=1 EVAL_TEMPERATURE=0.6` completed all 13 lessons across seeds 42/43/44, with documented semantic caveats. Qwen3-4B-Instruct-2507 also passed at Q4; Qwen3.5-4B passed at Q8.

New optional environment settings: `EVAL_THINK=1`, `EVAL_TEMPERATURE=0.6`, `EVAL_SEED=43`. Defaults remain non-thinking, temperature 0, seed 42. These are comparison variables and are recorded in each manifest. Do not compare thinking and non-thinking as equal-effort runs.

Chat is now limited to 12 inference calls per turn and only counts a response to the actual user prompt—not internal context compaction. The exact approval dialog and actual web UI completion are checked. A one-line comma-separated checklist is accepted if it contains <=5 items; the summary still requires three bullets. 37 tests pass.
