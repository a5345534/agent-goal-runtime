import test from "node:test";
import assert from "node:assert/strict";
import { extractAssistantTextForRecovery } from "../adapters/pi/index.js";

test("extracts text from failed assistant message content for recovery", () => {
  const text = extractAssistantTextForRecovery({
    role: "assistant",
    stopReason: "error",
    content: [
      { type: "text", text: "I changed the parser." },
      { type: "toolCall", name: "bash" },
      { type: "text", text: "Tests were about to run." },
    ],
  });

  assert.equal(text, "I changed the parser.\nTests were about to run.");
});

test("treats recovery text as bounded transcript evidence", () => {
  const text = extractAssistantTextForRecovery({
    role: "assistant",
    stopReason: "aborted",
    text: "x".repeat(2_100),
  });

  assert.ok(text);
  assert.ok(text.length < 2_100);
  assert.match(text, /\[truncated recovery excerpt\]/);
});

test("does not extract recovery text from non-assistant messages", () => {
  const text = extractAssistantTextForRecovery({
    role: "user",
    content: [{ type: "text", text: "ignore" }],
  });

  assert.equal(text, undefined);
});
