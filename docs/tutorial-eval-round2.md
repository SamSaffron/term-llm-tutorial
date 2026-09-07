# Tutorial eval: second batch — 7 September 2026

## Outcome

**A ~2B-class configuration can complete the tutorial:** Qwen3-1.7B Q8_0 with thinking enabled and temperature 0.6. Three different seeds completed all 13 real lessons. It has semantic rough edges, so it is a candidate for integration, not a general reliability guarantee.

**Best compact non-thinking fallback tested:** Qwen3-4B-Instruct-2507 Q4_K_M, about 2.50 GB of model/package download. It completed all 13 lessons and the changed-notes probe. Its Q8 version also passed. No WebGPU compatibility or deployment claim is made.

## Five additional models

| Model | Configuration(s) | Outcome |
|---|---|---|
| Qwen3-1.7B | Q8 non-thinking; Q8 thinking; Q4 thinking | Non-thinking fails required `suggest_commands`; Q8 thinking completes 13 lessons; Q4 thinking describes a `read_file` call rather than emitting it |
| Granite 4.0-1B | BF16 | Real command and read tools work, but picnic chat repeatedly calls failing web search instead of answering |
| LFM2.5-1.2B-Instruct | Official Q8 GGUF | Completes through chat/resume; fails @shell lesson by requesting `shell(command="pwd")` despite “without running it” |
| Qwen3-4B-Instruct-2507 | Q8 and Q4_K_M | Both complete 13 lessons and changed-notes probe |
| Qwen3.5-4B | Q8 | Completes 13 lessons after correcting a flaky web completion waiter |

Granite was tested at **BF16**, not Q8: the native Ollama tag uses BF16. This is a favorable precision test, not a same-quant comparison. It reports 1.6B parameters. Other package-reported counts: Qwen3-1.7B 2.0B; LFM 1.2B; Qwen3-4B 4.0B; Qwen3.5-4B 4.7B. Advertised names and package tensor counts are not interchangeable.

## Smallest promising recipe

```bash
EVAL_MODEL=qwen3:1.7b-q8_0 \
EVAL_THINK=1 EVAL_TEMPERATURE=0.6 EVAL_SEED=42 \
node scripts/tutorial-eval.mjs
```

- Model/package download: **2.22 GB** (not total runtime/GPU memory).
- Thinking enabled; total generated-token cap remains **2048** including reasoning.
- Server context: **16384**; actual guest CLI configuration remains unchanged.
- Seeds **42, 43, 44** were tested. No tutorial prompts, fixtures or answers were customized to help the model.
- Thinking is materially different from the earlier non-thinking baseline; this is a configuration search, not an equal-compute ranking.

### Representative actual answers, seed 42

Vegetarian adjustment:

> Vegetarian Sandwich (e.g., veggie pita with hummus, avocado, and lettuce)
> Fruit Platter ...
> Vegetable Salad ...

After session resume:

> The dietary requirement is that one person is vegetarian.

Tool use was real: native `suggest_commands`, `read_file`, approval, returned file bytes, actual MCP process, saved session, exported checklist and native browser chat all ran.

### Important caveats

- Seed 42 exported a valid five-item **comma-separated** checklist. The old grader demanded Markdown bullets although the lesson does not. The raw FAIL is preserved; `adjudication.json` documents the corrected interpretation and exported bytes. A regression test now accepts the five-item list but rejects six items.
- Seed 43 completed the tutorial but appended **“Cancel the picnic”** in the extra museum/rain grounding probe. That addition is not supported by the edited note. Destination recognition passed the automatic check; semantic review flags the addition. Do not call this a clean grounding pass.
- Seed 44 left “gravy” unspecified in its adjusted food options; cheese is an alternative, but gravy should be explicitly vegetarian. This is a quality caveat, not proof of universally correct dietary advice.
- The greedy thinking run (`temperature=0`) completed mechanically but made the contradictory recall statement “Other items are non-vegetarian.” It is not counted as a clean semantic pass.
- Q4 thinking failed the read-tool lesson, saying **“Call read_file with path notes.txt…”** rather than actually calling it. Q8 success does not transfer automatically to Q4.

Thus: **three full walkthrough completions at Q8/T0.6, with stated semantic caveats—not three flawless robustness trials.**

## 4B fallback

```bash
EVAL_MODEL=qwen3:4b-instruct-2507-q4_K_M \
EVAL_PULL=1 node scripts/tutorial-eval.mjs
```

About **2.50 GB**, no thinking required, versus 2.22 GB for the 1.7B Q8 package. Q4's actual vegetarian meal uses vegetable wraps with hummus and yogurt parfaits. Recall correctly identifies the vegetarian requirement but unnecessarily recommends dairy alternatives; it does not explicitly prohibit dairy. Q8's wording is cleaner.

Qwen3.5-4B Q8 correctly states that vegetarian excludes meat/fish but permits dairy/eggs. Its Q8 package is about **5.28 GB**, so it is not the smallest download. Its Q4 build was not tested in this batch.

## Harness corrections discovered and fixed

1. Chat completion must match the **actual user prompt**. An automatic context-compaction summary is not a user-facing answer. Previous MiniCPM and initial Granite logs included such summaries after tool loops; those summaries must not be attributed as their direct picnic answers.
2. Bound chat to 12 inference calls before declaring an uncompleted tool loop. This is a new disclosed acceptance budget, not a mutation of model outputs.
3. Recognize the exact workspace approval dialog. Matching the generic word “permissions” accidentally matched an old `ls -l` explanation and sent approval keys too early.
4. Wait for the native web UI's completed assistant message and restored Send button. The last reverse-proxy SSE buffer is not guaranteed to retain `response.completed`.
5. Accept a genuine <=5-item comma-separated checklist. Still require exactly three bullets where the summary prompt explicitly requests them.
6. Close the temporary server log FileHandle explicitly for current Node.

**37 tests pass**, including new compaction and checklist negative controls. Reports preserve earlier raw/debug results rather than quietly turning them into passes.

## Evidence and source

Workspace: the `tutorial-eval` checkout

Evidence under `evidence/tutorial-eval/`:
- `round2-qwen3-1.7b-q8` — non-thinking failure
- `round2-qwen3-1.7b-q8-thinking` — greedy thinking with recall caveat
- `round2-qwen3-1.7b-q8-thinking-t06-s42` / `s43` / `s44`
- `round2-qwen3-1.7b-q4-thinking` — read-tool failure
- `round2-granite4-1b-bf16` — repeated web-search loop
- `round2-lfm25-1.2b-q8` — prohibited shell call
- `round2-qwen3-4b-instruct-q8`
- `round2-qwen3-4b-instruct-q4-final`
- `round2-qwen35-4b-q8-final`

Liquid artifact: official `LiquidAI/LFM2.5-1.2B-Instruct-GGUF`, revision `6767265158422fb8a19c62ceb45f16f05363615b`, file `LFM2.5-1.2B-Instruct-Q8_0.gguf`. Ollama model details and blob-backed Modelfiles are saved in each run manifest.

The earlier `round2-qwen3-4b-instruct-q4` was interrupted during harness debugging. The earlier `round2-qwen35-4b-q8` produced a correct web answer but timed out in the old SSE waiter. Do not score these as model failures.

No commits, pushes, site changes or permanent services. Native GPU inference only; no WebGPU model install. General-purpose semantic grading, further prompt diversity and deployment compatibility remain separate work.
