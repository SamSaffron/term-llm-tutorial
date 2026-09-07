// Full real-guest tutorial, CPU VM + external GPU inference. Never executes model commands on host.
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lessons } from "../public/tutorial.mjs";
import { validate, fullPass, isReplyTo } from "./tutorial-eval-checks.mjs";
const thinking = process.env.EVAL_THINK === "1",
  temperature = Number(process.env.EVAL_TEMPERATURE || 0),
  seed = Number(process.env.EVAL_SEED || 42);
const model = process.env.EVAL_MODEL || "qwen3.5:2b",
  port = 11439,
  endpoint = process.env.EVAL_ENDPOINT || `http://127.0.0.1:${port}`;
const dir = path.resolve(
  process.env.EVAL_DIR ||
    `evidence/tutorial-eval/${model.replace(/[^a-z0-9.-]/gi, "_")}-${Date.now()}`,
);
await fs.mkdir(dir, { recursive: true });
const rows = [],
  traces = [];
let findings = [];
const check = (kind, text) => {
  try {
    validate(kind, text);
  } catch (e) {
    findings.push({ kind, error: e.message, text });
  }
};
let phase = "setup",
  b,
  p,
  web,
  owned,
  ownedLog,
  server;
const log = (...x) => console.log(new Date().toISOString(), ...x);
async function persist() {
  await fs.writeFile(
    dir + "/results.json",
    JSON.stringify(
      {
        model,
        phase,
        automatedPass: fullPass(rows, lessons.length),
        semanticReview: "REQUIRED: predicates are necessary but not sufficient",
        lessons: rows,
      },
      null,
      2,
    ),
  );
}
async function wait(fn, ms = 120000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw Error("deadline exceeded");
}
async function api(route, body) {
  const r = await fetch(endpoint + route, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(120000),
  });
  if (!r.ok) throw Error(`Inference HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}
async function infer(request) {
  const sent = {
    ...request,
    model,
    stream: false,
    temperature,
    max_tokens: 2048,
    seed,
    chat_template_kwargs: { enable_thinking: thinking },
    think: thinking,
  };
  const t = Date.now();
  try {
    const native = {
      model,
      stream: false,
      think: thinking,
      messages: sent.messages.map((m) => ({
        ...m,
        ...(m.tool_calls
          ? {
              tool_calls: m.tool_calls.map((c) => ({
                ...c,
                function: {
                  ...c.function,
                  arguments:
                    typeof c.function.arguments === "string"
                      ? JSON.parse(c.function.arguments)
                      : c.function.arguments,
                },
              })),
            }
          : {}),
      })),
      ...(sent.tools?.length ? { tools: sent.tools } : {}),
      options: { num_ctx: 16384, num_predict: 2048, temperature, seed },
    };
    const raw = await api("/api/chat", native);
    const message = {
      role: "assistant",
      content: raw.message?.content || "",
      ...(raw.message?.tool_calls?.length
        ? {
            tool_calls: raw.message.tool_calls.map((c, i) => ({
              id: c.id || `call_${Date.now()}_${i}`,
              type: "function",
              function: {
                name: c.function.name,
                arguments: JSON.stringify(c.function.arguments),
              },
            })),
          }
        : {}),
    };
    const result = {
      id: `eval_${Date.now()}`,
      object: "chat.completion",
      model,
      choices: [
        {
          index: 0,
          message,
          finish_reason:
            raw.done_reason === "length"
              ? "length"
              : message.tool_calls?.length
                ? "tool_calls"
                : "stop",
        },
      ],
      usage: {
        prompt_tokens: raw.prompt_eval_count || 0,
        completion_tokens: raw.eval_count || 0,
        total_tokens: (raw.prompt_eval_count || 0) + (raw.eval_count || 0),
      },
    };
    traces.push({
      phase,
      request: sent,
      nativeRequest: native,
      raw,
      result,
      elapsedMs: Date.now() - t,
    });
    await fs.appendFile(
      dir + "/traces.jsonl",
      JSON.stringify(traces.at(-1)) + "\n",
    );
    return result;
  } catch (e) {
    traces.push({ phase, request: sent, error: e.message });
    await fs.appendFile(
      dir + "/traces.jsonl",
      JSON.stringify(traces.at(-1)) + "\n",
    );
    throw e;
  }
}
const cmd = (lesson, task = 0) => lessons[lesson].tasks[task][1];
async function send(text) {
  await p.locator("#terminal textarea").focus();
  await p.keyboard.type(text, { delay: 1 });
  await p.keyboard.press("Enter");
}
let seq = 0;
async function shell(command) {
  const tag = `EVAL${++seq}`,
    start = traces.length;
  await send(
    `printf '\\n${tag}_START\\n'; ${command}; code=$?; printf '\\n${tag}_DONE:%s\\n' "$code"`,
  );
  await p.waitForFunction(
    (t) => lab.serial.includes("\r\n" + t + "_DONE:"),
    tag,
    { timeout: 150000 },
  );
  const serial = await p.evaluate(() => lab.serial);
  const out = serial
    .split("\r\n" + tag + "_START\r\n")
    .at(-1)
    .split("\r\n" + tag + "_DONE:")[0];
  assert.equal(
    new RegExp(tag + "_DONE:(\\d+)").exec(serial)?.[1],
    "0",
    out.slice(-2000),
  );
  assert.ok(
    !traces.slice(start).some((t) => t.error),
    "inference request failed",
  );
  return out;
}
function content(start) {
  for (const t of traces.slice(start)) {
    if (t.error) findings.push({ kind: "inference", error: t.error });
    for (const c of t.result?.choices || [])
      if (c.finish_reason === "length")
        findings.push({
          kind: "truncation",
          error: "output token budget exhausted",
        });
  }
  return traces
    .slice(start)
    .flatMap((t) => t.result?.choices || [])
    .map((c) => c.message?.content || "")
    .join("\n");
}
async function ask(command, kind) {
  const start = traces.length;
  const out = await shell(command);
  assert.ok(traces.length > start, "no real model request");
  const text = content(start);
  check(kind, text);
  log("ANSWER", text.slice(0, 900));
  return { text, terminal: out };
}
async function chat(text, kind) {
  const start = traces.length;
  await send(text);
  await wait(() => {
    const turn = traces.slice(start);
    if (turn.some((t) => t.error)) throw Error("chat inference failed");
    if (turn.length > 12)
      throw Error(
        "chat exceeded 12 inference calls without completing the requested answer",
      );
    return turn.some((t) => isReplyTo(t, text));
  });
  await p.waitForTimeout(700);
  const reply = traces
    .slice(start)
    .filter((t) => isReplyTo(t, text))
    .at(-1);
  if (reply.result.choices.some((c) => c.finish_reason === "length"))
    findings.push({
      kind: "truncation",
      error: "output token budget exhausted",
    });
  const answer = reply.result.choices
    .map((c) => c.message.content || "")
    .join("\n");
  check(kind, answer);
  log("CHAT", answer.slice(0, 900));
  return answer;
}
async function lesson(index, fn) {
  phase = `${index + 1}: ${lessons[index].title}`;
  log("LESSON", phase);
  const t = Date.now(),
    start = traces.length;
  findings = [];
  try {
    const detail = await fn();
    rows.push({
      lesson: index + 1,
      title: lessons[index].title,
      status: findings.length ? "FAIL" : "PASS",
      findings,
      modelRequests: traces.length - start,
      elapsedMs: Date.now() - t,
      detail,
    });
  } catch (e) {
    rows.push({
      lesson: index + 1,
      title: lessons[index].title,
      status: "FAIL",
      error: e.stack,
      modelRequests: traces.length - start,
    });
    await fs.writeFile(
      dir + `/failure-${index + 1}.txt`,
      await p.evaluate(() => lab.screen),
    );
    log("LESSON FAIL", e.message);
    throw e;
  } finally {
    await persist();
  }
}
try {
  if (!process.env.EVAL_ENDPOINT) {
    ownedLog = await fs.open(dir + "/server.log", "w");
    owned = spawn("ollama", ["serve"], {
      env: {
        ...process.env,
        OLLAMA_HOST: `127.0.0.1:${port}`,
        OLLAMA_MODELS:
          process.env.EVAL_MODELS_DIR ||
          `${process.env.HOME}/.cache/tutorial-eval-models`,
        OLLAMA_CONTEXT_LENGTH: "16384",
      },
      stdio: ["ignore", ownedLog.fd, ownedLog.fd],
    });
    await wait(async () => {
      try {
        return !!(await api("/api/version"));
      } catch {
        return false;
      }
    }, 30000);
  }
  if (process.env.EVAL_PULL === "1") {
    log("PULL", model);
    await new Promise((resolve, reject) => {
      const child = spawn("ollama", ["pull", model], {
        env: { ...process.env, OLLAMA_HOST: endpoint },
        stdio: ["ignore", "ignore", "ignore"],
      });
      child.on("exit", (c) =>
        c === 0 ? resolve() : reject(Error(`pull exit ${c}`)),
      );
    });
  }
  if (process.env.EVAL_MODELFILE) {
    log("IMPORT", process.env.EVAL_MODELFILE);
    await new Promise((resolve, reject) => {
      const child = spawn(
        "ollama",
        ["create", model, "-f", process.env.EVAL_MODELFILE],
        {
          env: { ...process.env, OLLAMA_HOST: endpoint },
          stdio: ["ignore", "ignore", "inherit"],
        },
      );
      child.on("exit", (c) =>
        c === 0 ? resolve() : reject(Error(`model import exit ${c}`)),
      );
    });
  }
  const meta = await api("/api/show", { model });
  await fs.writeFile(
    dir + "/manifest.json",
    JSON.stringify(
      {
        model,
        metadata: meta,
        source: execFileSync("git", ["rev-parse", "HEAD"], {
          encoding: "utf8",
        }).trim(),
        lessonHash: createHash("sha256")
          .update(await fs.readFile("public/tutorial.mjs"))
          .digest("hex"),
        settings: {
          context: 16384,
          maxOutput: 2048,
          temperature,
          seed,
          thinking,
        },
        runtime:
          "actual tutorial i386 CLI in v86, Ollama native inference; not WebGPU",
      },
      null,
      2,
    ),
  );
  phase = "warmup";
  log("WARMUP", model, meta.details);
  await infer({ messages: [{ role: "user", content: "Say ready." }] });
  const mime = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".css": "text/css",
    ".wasm": "application/wasm",
    ".json": "application/json",
  };
  server = createServer(async (req, res) => {
    try {
      const name =
        decodeURIComponent(
          new URL(req.url, "http://localhost").pathname,
        ).replace(/^\/learn\//, "") || "index.html";
      const target = path.resolve("public", name);
      assert.ok(target.startsWith(path.resolve("public") + "/"));
      res.writeHead(200, {
        "Content-Type":
          mime[path.extname(target)] || "application/octet-stream",
        "Cross-Origin-Embedder-Policy": "require-corp",
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Resource-Policy": "same-origin",
      });
      res.end(await fs.readFile(target));
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  b = await chromium.launch({
    executablePath: process.env.EVAL_CHROMIUM || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await b.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  // Host fetch handles network assets. This route cannot access arbitrary host files.
  await context.route(
    /https:\/\/(raw\.githubusercontent\.com|i\.copy\.sh)\//,
    async (r) => {
      const response = await fetch(r.request().url());
      await r.fulfill({
        status: response.status,
        body: Buffer.from(await response.arrayBuffer()),
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Cross-Origin-Resource-Policy": "cross-origin",
        },
      });
    },
  );
  p = await context.newPage();
  await p.exposeFunction("nativeEvalInference", infer);
  await p.addInitScript(
    ({ model }) => {
      const Native = Worker;
      window.Worker = class extends EventTarget {
        constructor(url, options) {
          super();
          if (!String(url).includes("simulator-worker"))
            return new Native(url, options);
        }
        postMessage({ id, type, request }) {
          Promise.resolve(
            type === "load"
              ? {
                  loaded: true,
                  model,
                  context: 16384,
                  precision: "native local inference",
                  simulated: false,
                }
              : window.nativeEvalInference(request),
          )
            .then((result) => this.onmessage?.({ data: { id, result } }))
            .catch((e) => this.onmessage?.({ data: { id, error: e.message } }));
        }
        terminate() {}
      };
    },
    { model },
  );
  const url = `http://127.0.0.1:${server.address().port}/learn/`;
  log("BOOT", url);
  await p.goto(url);
  await p.locator("#model").selectOption("simulator");
  await p.locator("#boot").click();
  await p.waitForFunction(
    () => ["ready", "failed"].includes(document.body.dataset.phase),
    null,
    { timeout: 240000 },
  );
  assert.equal(
    await p.evaluate(() => document.body.dataset.phase),
    "ready",
    await p.locator("#status").textContent(),
  );
  await p.evaluate((m) => {
    document.querySelector("#effective").textContent =
      "EVAL: REAL LOCAL " + m + " — no simulator responses";
  }, model);
  await lesson(0, async () => ({
    output: await shell(cmd(0, 0) + "; " + cmd(0, 1) + "; " + cmd(0, 2)),
  }));
  await lesson(1, async () => {
    await shell(cmd(1));
    const count = await p.evaluate(
      () => (lab.serial.match(/LAB_READY/g) || []).length,
    );
    await send(cmd(1, 1));
    await p.waitForFunction(
      (n) => (lab.serial.match(/LAB_READY/g) || []).length > n,
      count,
      { timeout: 45000 },
    );
    await p.waitForTimeout(500);
    await p.keyboard.type(cmd(1, 2));
    await p.keyboard.press("Tab");
    await p.waitForFunction(
      () => /term-llm chat\s*$/.test(lab.screen.trimEnd()),
      null,
      { timeout: 10000 },
    );
    await p.keyboard.press("Control+c");
    return { completion: true };
  });
  await lesson(2, async () => {
    await shell(cmd(2));
    await shell(cmd(2, 1));
    return { output: await shell(cmd(2, 2)) };
  });
  await lesson(3, () => ask(cmd(3), "picnic"));
  await lesson(4, async () => ({
    summary: await ask(cmd(4), "summary"),
    rain: await ask(cmd(4, 1), "rain"),
  }));
  await lesson(5, async () => {
    const outputs = [];
    for (const command of lessons[5].tasks.map((t) => t[1])) {
      const start = traces.length,
        tag = `EXEC${++seq}`;
      await send(command + `; printf '\\n${tag}_DONE\\n'`);
      await wait(
        async () =>
          (await p.evaluate(
            (t) => lab.serial.includes("\r\n" + t + "_DONE"),
            tag,
          )) ||
          traces
            .slice(start)
            .some((t) =>
              t.result?.choices?.[0]?.message?.tool_calls?.some(
                (c) => c.function.name === "suggest_commands",
              ),
            ),
      );
      const calls = traces
        .slice(start)
        .flatMap((t) => t.result?.choices?.[0]?.message?.tool_calls || []);
      assert.ok(calls.some((c) => c.function.name === "suggest_commands"));
      await p.waitForTimeout(700);
      await p.keyboard.press("Enter");
      await p.waitForFunction(
        (t) => lab.serial.includes("\r\n" + t + "_DONE"),
        tag,
        { timeout: 30000 },
      );
      outputs.push(calls);
    }
    return outputs;
  });
  await lesson(6, async () => {
    const start = traces.length,
      tag = `READ${++seq}`;
    await send(cmd(6) + `; printf '\\n${tag}_DONE\\n'`);
    await wait(
      async () =>
        (await p.evaluate(
          (t) => lab.serial.includes("\r\n" + t + "_DONE"),
          tag,
        )) ||
        traces
          .slice(start)
          .some((t) => t.result?.choices?.[0]?.message?.tool_calls?.length),
    );
    const calls = traces
      .slice(start)
      .flatMap((t) => t.result?.choices?.[0]?.message?.tool_calls || []);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].function.name, "read_file");
    const args = JSON.parse(calls[0].function.arguments);
    assert.ok(
      ["notes.txt", "/workspace/notes.txt"].includes(args.path),
      JSON.stringify(args),
    );
    await p.waitForFunction(
      (t) =>
        lab.serial.includes("\r\n" + t + "_DONE") ||
        /Allow workspace access\?|Allow this session/.test(lab.screen),
      tag,
      { timeout: 30000 },
    );
    if (
      !(await p.evaluate((t) => lab.serial.includes("\r\n" + t + "_DONE"), tag))
    ) {
      await fs.writeFile(
        dir + "/approval.txt",
        await p.evaluate(() => lab.screen),
      );
      await p.keyboard.press("ArrowDown");
      await p.keyboard.press("Enter");
    }
    await p.waitForFunction(
      (t) => lab.serial.includes("\r\n" + t + "_DONE"),
      tag,
      { timeout: 120000 },
    );
    check("rain", content(start));
    assert.ok(
      traces
        .slice(start)
        .some((t) =>
          t.request?.messages?.some(
            (m) =>
              m.role === "tool" && String(m.content).includes("community hall"),
          ),
        ),
      "no genuine tool result",
    );
    return { answer: content(start), calls };
  });
  await lesson(7, async () => {
    const output = [];
    for (const task of lessons[7].tasks) output.push(await shell(task[1]));
    assert.match(output[2], /4 guests/);
    return { output, deterministic: true };
  });
  await lesson(8, async () => {
    await send(cmd(8));
    await p.waitForFunction(() => /Type a message/.test(lab.screen), null, {
      timeout: 30000,
    });
    return {
      first: await chat(cmd(8, 1), "picnic"),
      followup: await chat(cmd(8, 2), "vegetarian"),
    };
  });
  await lesson(9, async () => {
    await send(cmd(9));
    await p.waitForTimeout(400);
    await p.keyboard.press("Escape");
    await send(cmd(9, 1));
    await p.waitForFunction(
      () => /\/workspace#\s*$/.test(lab.screen.trimEnd()),
      null,
      { timeout: 30000 },
    );
    await send(cmd(9, 2));
    await p.waitForFunction(() => /Type a message/.test(lab.screen), null, {
      timeout: 30000,
    });
    const answer = await chat(cmd(9, 3), "resume");
    await send("/quit");
    await p.waitForFunction(
      () => /\/workspace#\s*$/.test(lab.screen.trimEnd()),
      null,
      { timeout: 30000 },
    );
    return { answer };
  });
  await lesson(10, async () => {
    await shell(cmd(10));
    await shell(cmd(10, 1));
    const start = traces.length;
    const result = await ask(cmd(10, 2), "pwd");
    assert.ok(
      !traces
        .slice(start)
        .some((t) => t.result?.choices?.[0]?.message?.tool_calls?.length),
      "ran tool despite explicit prohibition",
    );
    return result;
  });
  await lesson(11, async () => {
    const answer = await ask(cmd(11), "checklist");
    const bytes = await p.evaluate(async () =>
      Array.from(await lab.vm.read_file("workspace/checklist.txt")),
    );
    const text = Buffer.from(bytes).toString();
    check("checklist", text);
    await fs.writeFile(dir + "/checklist.txt", text);
    await shell(cmd(11, 1));
    for (let i = 0; i < 11; i++)
      await p.locator(".lesson-nav button").last().click();
    const download = p.waitForEvent("download");
    await p
      .getByRole("button", { name: "Save checklist", exact: true })
      .click();
    const file = await download;
    await file.saveAs(dir + "/export.txt");
    assert.equal(await fs.readFile(dir + "/export.txt", "utf8"), text);
    return { text, exportMatches: true, answer };
  });
  await lesson(12, async () => {
    await send(cmd(12));
    await p.waitForFunction(
      () => lab.serial.includes("serve listening"),
      null,
      { timeout: 90000 },
    );
    await p.locator(".lesson-nav button").last().click();
    const popup = context.waitForEvent("page");
    await p
      .getByRole("button", { name: "Open web interface", exact: true })
      .click();
    web = await popup;
    await web.locator("#promptInput").waitFor({ timeout: 90000 });
    const start = traces.length;
    await web.locator("#promptInput").fill(cmd(12, 1));
    await web.locator("#promptInput").press("Enter");
    await wait(() => traces.slice(start).some((t) => isReplyTo(t, cmd(12, 1))));
    await web.waitForFunction(
      () =>
        document.querySelector(".message.assistant")?.textContent?.trim() &&
        document.querySelector("#sendBtn")?.getAttribute("aria-label") ===
          "Send message",
      null,
      { timeout: 120000 },
    );
    check("picnic", content(start));
    const text = await web.locator(".message.assistant").last().innerText();
    check("picnic", text);
    await p.locator("#terminal textarea").focus();
    await p.keyboard.press("Control+c");
    await p.waitForFunction(
      () => /\/workspace#\s*$/.test(lab.screen.trimEnd()),
      null,
      { timeout: 30000 },
    );
    return { text, stopped: true };
  });
  phase = "changed-notes probe";
  findings = [];
  await shell(
    "printf 'Picnic for four people. If it rains, meet at the museum.\\n' > notes.txt",
  );
  const grounding = await ask(
    'tl ask -f notes.txt "What should we do if it rains?"',
    "changed-rain",
  );
  await fs.writeFile(
    dir + "/grounding-probe.json",
    JSON.stringify({ answer: grounding, findings }, null, 2),
  );
  if (findings.length) rows[4].status = "FAIL";
  phase = "complete";
  if (!fullPass(rows, lessons.length)) process.exitCode = 1;
  log(
    "AUTOMATED RESULT",
    fullPass(rows, lessons.length) ? "PASS" : "FAIL",
    "semantic transcript review still required",
  );
} catch (e) {
  log("FAIL", phase, e.message);
  await fs.writeFile(dir + "/error.txt", e.stack);
  process.exitCode = 1;
} finally {
  if (p) {
    await fs.writeFile(
      dir + "/terminal.txt",
      await p.evaluate(() => window.lab?.screen).catch(() => ""),
    );
    await p.screenshot({ path: dir + "/screen.png" }).catch(() => {});
  }
  for (let i = rows.length; i < lessons.length; i++)
    rows.push({
      lesson: i + 1,
      title: lessons[i].title,
      status: "NOT_RUN",
      reason: "upstream run aborted",
    });
  await persist();
  await b?.close();
  server?.close();
  owned?.kill();
  await ownedLog?.close();
  log("EVIDENCE", dir);
}
