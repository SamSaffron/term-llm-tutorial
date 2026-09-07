import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validate,
  fullPass,
  isReplyTo,
} from "../scripts/tutorial-eval-checks.mjs";
test("reject empty and truncated tool prose", () => {
  assert.throws(() => validate("picnic", ""));
  assert.throws(() => validate("picnic", "<tool_call> pretend success"));
});
test("three bullets means three", () => {
  assert.throws(() =>
    validate("summary", "- At Harbour Park\n- Bring a blanket"),
  );
  assert.equal(
    validate("summary", "- Sunday at noon\n- Four people\n- Bring water"),
    true,
  );
});
test("vegetarian keyword alone cannot pass", () => {
  assert.throws(() =>
    validate(
      "vegetarian",
      "Ham and turkey sandwiches. This ensures the vegetarian person can eat a sandwich.",
    ),
  );
  assert.equal(
    validate(
      "vegetarian",
      "For the vegetarian guest, replace chicken with chickpeas in a separate wrap.",
    ),
    true,
  );
});
test("vegetarian is not vegan", () =>
  assert.throws(() =>
    validate(
      "resume",
      "One is vegetarian, which means they will not be able to consume any animal products (meat, dairy, eggs).",
    ),
  ));
test("wrong fixture or six checklist items fails", () => {
  assert.throws(() => validate("changed-rain", "Meet at the community hall."));
  assert.throws(() =>
    validate(
      "checklist",
      "- Water\n- Fruit\n- Bread\n- Cheese\n- Napkins\n- Blanket",
    ),
  );
});
test("skips/failures never yield full pass", () => {
  assert.equal(fullPass([{ status: "PASS" }], 13), false);
  assert.equal(fullPass([{ status: "FAIL" }], 1), false);
});
test("comma-separated five-item checklist is valid; six is not", () => {
  assert.equal(
    validate(
      "checklist",
      "Sandwiches (vegetarian), fruit, water, blanket, and a rain contingency (community hall meeting).\n\n",
    ),
    true,
  );
  assert.throws(() =>
    validate("checklist", "Sandwiches, fruit, water, blanket, plates, chairs."),
  );
});
test("compaction output is not a reply to the real user", () => {
  const t = {
    nativeRequest: {
      messages: [
        { role: "user", content: "Create a compact continuation brief." },
      ],
    },
    result: {
      choices: [{ message: { content: "Current objective: plan a picnic." } }],
    },
  };
  assert.equal(isReplyTo(t, "Help me plan a picnic."), false);
  t.nativeRequest.messages[0].content = "Help me plan a picnic.";
  assert.ok(isReplyTo(t, "Help me plan a picnic."));
});
test("tool calls and blank content do not complete a chat turn", () => {
  const t = {
    nativeRequest: { messages: [{ role: "user", content: "picnic" }] },
    result: { choices: [{ message: { content: "", tool_calls: [{}] } }] },
  };
  assert.ok(!isReplyTo(t, "picnic"));
});
