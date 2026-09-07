import assert from "node:assert/strict";
export function validate(kind, text) {
  assert.equal(typeof text, "string");
  assert.ok(text.trim().length > 10, "empty/short answer");
  assert.doesNotMatch(
    text,
    /<tool_call>|<function|\[ERROR\]|context.*exceed/i,
    "unconsumed call or error",
  );
  const items = text
    .split("\n")
    .filter((l) => /^\s*(?:[-*•]|\d+[.)])\s+/.test(l));
  if (kind === "summary")
    assert.equal(items.length, 3, "summary must have exactly three bullets");
  if (kind === "vegetarian") {
    assert.doesNotMatch(
      text,
      /(?:ensures?[^.]*vegetarian[^.]*sandwich|vegetarian[^.]*can eat[^.]*meat)/i,
      "claims meat sandwiches satisfy vegetarian constraint",
    );
    assert.ok(
      /(?:hummus|chickpea|tofu|vegetable|veggie|meat.free|without meat|replace|instead of|separate)/i.test(
        text,
      ),
      "no explicit meat-free adjustment",
    );
  }
  if (kind === "resume")
    assert.doesNotMatch(
      text,
      /(?:not[^.]*any animal products|no[^.]*dairy|cannot[^.]*eggs)/i,
      "confuses vegetarian with vegan",
    );
  if (kind === "pwd")
    assert.doesNotMatch(
      text,
      /absolute or relative|\.py\s*\n/i,
      "incorrect working-directory explanation",
    );
  if (kind === "rain")
    assert.match(text, /community hall/i, "missing real rain destination");
  if (kind === "changed-rain") {
    assert.match(text, /museum/i);
    assert.doesNotMatch(text, /community hall/i);
  }
  if (kind === "vegetarian" || kind === "resume")
    assert.match(text, /vegetarian|meat.free/i, "lost dietary constraint");
  if (kind === "pwd")
    assert.match(text, /working directory|current directory/i);
  if (kind === "checklist") {
    const marked = text
      .split("\n")
      .filter((l) => /^\s*(?:[-*•]|\d+[.)])\s+/.test(l));
    // The lesson asks for <=5 items, not Markdown bullets. A single comma-separated list is valid.
    const items = marked.length
      ? marked
      : !text.trim().includes("\n") && text.includes(",")
        ? text
            .trim()
            .replace(/[.]$/, "")
            .split(/,\s*(?:and\s+)?/)
        : [];
    assert.ok(
      items.length > 0 && items.length <= 5,
      `expected 1–5 checklist items; got ${items.length}`,
    );
    assert.match(
      text,
      /sandwich|water|blanket/i,
      "ignores supplied checklist needs",
    );
  }
  return true;
}
export function isReplyTo(trace, prompt) {
  const lastUser = trace.nativeRequest?.messages
    ?.filter((m) => m.role === "user")
    .at(-1)?.content;
  return (
    lastUser === prompt &&
    trace.result?.choices?.some(
      (c) => !c.message?.tool_calls?.length && c.message?.content?.trim(),
    )
  );
}
export function fullPass(rows, count) {
  return rows.length === count && rows.every((r) => r.status === "PASS");
}
