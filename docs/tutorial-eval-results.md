# Tutorial eval — 7 September 2026

## Verdict

**Keep Qwen3-8B. None of the four smaller tested configurations passed the full tutorial.** These are measurements of exact model + Ollama serving configurations, not proof the weights fail with every possible template/runtime.

| Model, all Q8_0 | Outcome | Observed failure |
|---|---|---|
| Qwen3-8B | PASS, 2 complete runs | All 13 lessons, semantic review; second run also passes changed-notes grounding |
| Qwen3.5-2B | FAIL, 2 complete native non-thinking runs | Two summary bullets instead of three; meat sandwich described as suitable for vegetarian; vegetarian confused with vegan; incorrect `pwd` example |
| MiniCPM5-1B Agentic Tooluse v3 | FAIL | Tool-use loop in chat; the old collector also included automatic compaction output as if it were a user answer; later lessons NOT_RUN |
| Empero Qwen3.8-2B distillation | FAIL | `exec` returns plain text instead of required `suggest_commands`; later lessons NOT_RUN |
| Qwen3.8-2B xLAM fine-tune | FAIL | Same required-tool failure at `exec`; later lessons NOT_RUN |

## Actual output samples

Qwen3-8B adjusts the meal correctly:

> Vegetarian Sandwiches: Offer sandwiches with fillings like avocado, hummus, and grilled vegetables for the vegetarian guest.

On resume:

> One person is vegetarian, so the food suggestions should include vegetarian options.

Qwen3.5-2B does not:

> Offer different types of deli meats (ham, turkey) on whole wheat bread with lettuce, tomato, and mayo. This ensures the vegetarian person can eat a sandwich while others enjoy meat-based options.

On resume:

> ...vegetarian... will not be able to consume any animal products (meat, dairy, eggs).

Its `pwd` example gives a Python source-file path rather than a directory.

The xLAM fine-tune receives the real CLI system instruction:

> You MUST call the suggest_commands tool to provide your suggestions - do not respond with plain text

It answers with a fenced `ls -la` code block and prose. Actual CLI error:

> Error: failed to get suggestions: no suggestions returned

Correction after the second batch: MiniCPM can call real tools but loops during chat. The old collector mistakenly included an automatic context-compaction response (Objective / Constraints / Current State) as though it were a user-facing picnic answer. That attribution was wrong. No full passing MiniCPM run was established. See `tutorial-eval-round2.md` for the correction and new prompt-matched completion checks.

## Conditions

RTX 4090, Ollama native `/api/chat`, 16K server context, 2048 output tokens, temperature 0, seed 42, `think:false`, Q8_0. Identical current tutorial prompts and guest configuration, actual 13-lesson v86 CLI and native web UI. No host model commands; no WebGPU model installation; no deployment.

Qwen3.5's Ollama package reports 2.3B including its package architecture; community Qwen text GGUFs report 1.9B. These are model/package labels, not hand-counted weight tensors. The control reports 8.2B and MiniCPM 1.1B. All use Q8_0, but architecture/templates differ. The deployed Qwen3-8B is WebGPU Q4, so this Q8 control is not a quantization-parity result.

Only the control and Qwen3.5 completed the entire path twice. The recent fine-tunes were stopped after disqualifying failures; this is not a statistically powered ranking or a claim about every sampling setting. No custom prompt optimization was attempted.

## Artifacts

Workspace: the `tutorial-eval` checkout

- Control: `evidence/tutorial-eval/qwen3-8b-q8/` and `qwen3-8b-q8-repeat/`
- Qwen3.5: `qwen35-native/` and final `qwen35-q8-final/`
- MiniCPM: `minicpm-q8-final/`
- Distillation: `qwen38-q8/`
- xLAM fine-tune: `qwen38-fc-q8/`

Earlier `qwen35-first`, `minicpm-q8`, `minicpm-q8-fixed` are integration/debug runs and are excluded from final claims. In particular, the first Qwen3.5 OpenAI-compatible run did not actually disable thinking.

Manifest files contain model metadata and source/lesson identity. Raw JSONL preserves requests, native API requests, tool calls and results. Generated evidence and model caches are not committed. Semantic review was performed by Jarvis on the displayed/retrieved final answers, actual tool traces and exported files, not an additional paid judge model.

## Deliverable and limitations

Reusable prototype: `scripts/tutorial-eval.mjs`; negative controls: `tests/tutorial-eval.test.mjs`; usage: `docs/tutorial-eval.md`. **34 tests pass**, including six negative-control tests. No commits, pushes or deployment.

Automated predicates are necessary checks, not a general semantic proof. `results.json` deliberately says semantic review is required. A model is not accepted merely because all current regexes pass. The first naive Qwen3.5 result was exactly that false positive; final checks and the human-readable review reject it.
