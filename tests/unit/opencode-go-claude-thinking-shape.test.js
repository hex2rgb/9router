// OpenCode Go's /zen/go/v1/messages is a strict Anthropic Messages endpoint: it
// answers 400 "reasoning_effort: requires a native Anthropic Messages target" to
// the Chat-shaped thinking fields the shared translator emits for its deepseek
// models (their capabilities describe the /chat/completions wire). resolveFormat
// now downgrades those to the Anthropic budget shape for this provider only, so
// thinking stays enabled and keeps the client's budget. claude-haiku-5-5 and the
// minimax models on the same endpoint already resolve to Claude-native shapes and
// must stay untouched. These tests drive the real applyThinking().
import { describe, expect, it } from "vitest";
import { applyThinking } from "../../open-sse/translator/concerns/thinkingUnified.js";

// A Claude-wire request asking for thinking on (what Claude Code sends).
const claudeWireBody = (model = "deepseek-v4.1-flash") => ({
  model,
  max_tokens: 16384,
  thinking: { type: "enabled", budget_tokens: 8000 },
  messages: [{ role: "user", content: "hi" }],
});

// Every field the Anthropic Messages API does not define.
function expectNoChatThinkingFields(body) {
  expect(body.reasoning_effort).toBeUndefined();
  expect(body.enable_thinking).toBeUndefined();
  expect(body.thinking_budget).toBeUndefined();
  expect(body.reasoning).toBeUndefined();
}

describe("opencode-go /messages thinking shape", () => {
  it("keeps the client's thinking budget and drops reasoning_effort", () => {
    const body = applyThinking("claude", "deepseek-v4.1-flash", claudeWireBody(), "opencode-go");

    expect(body.thinking).toEqual({ type: "enabled", budget_tokens: 8000 });
    expectNoChatThinkingFields(body);
  });

  it.each(["deepseek-v4-pro", "deepseek-v4-flash", "deepseek-v4-flash-vision-exp"])(
    "%s also resolves to the budget shape",
    (model) => {
      const body = applyThinking("claude", model, claudeWireBody(model), "opencode-go");

      expect(body.thinking).toEqual({ type: "enabled", budget_tokens: 8000 });
      expectNoChatThinkingFields(body);
    },
  );

  it("maps an effort level to budget_tokens instead of emitting reasoning_effort", () => {
    const body = applyThinking(
      "claude",
      "deepseek-v4.1-flash",
      { messages: [{ role: "user", content: "hi" }], reasoning_effort: "high" },
      "opencode-go",
    );

    expect(body.thinking).toEqual({ type: "enabled", budget_tokens: 24576 });
    expectNoChatThinkingFields(body);
  });

  // Regression cells: models that were already on a Claude-native shape.
  it("claude-haiku-5-5 keeps adaptive + output_config.effort", () => {
    const body = applyThinking("claude", "claude-haiku-5-5", claudeWireBody("claude-haiku-5-5"), "opencode-go");

    expect(body.thinking?.type).toBe("adaptive");
    expect(body.output_config?.effort).toBeTruthy();
    expectNoChatThinkingFields(body);
  });

  it("minimax-m3 keeps thinking.type=adaptive", () => {
    const body = applyThinking(
      "claude",
      "minimax-m3",
      { messages: [{ role: "user", content: "hi" }], reasoning_effort: "high" },
      "opencode-go",
    );

    expect(body.thinking).toEqual({ type: "adaptive" });
    expectNoChatThinkingFields(body);
  });

  // The fix is scoped to the Claude wire of this one provider.
  it("OpenAI wire still gets the deepseek Chat shape", () => {
    const body = applyThinking(
      "openai",
      "deepseek-v4.1-flash",
      { messages: [{ role: "user", content: "hi" }], reasoning_effort: "high" },
      "opencode-go",
    );

    expect(body.thinking).toEqual({ type: "enabled" });
    expect(body.reasoning_effort).toBe("high");
  });

  it("Responses wire still gets nested reasoning", () => {
    const body = applyThinking(
      "openai-responses",
      "deepseek-v4.1-flash",
      { input: [], reasoning: { effort: "high" } },
      "opencode-go",
    );

    expect(body.reasoning).toEqual({ effort: "high", summary: "auto" });
    expect(body.reasoning_effort).toBeUndefined();
    expect(body.thinking).toBeUndefined();
  });

  it("other providers on the Claude wire are untouched", () => {
    const deepseek = applyThinking(
      "claude",
      "deepseek-v4-pro",
      { messages: [{ role: "user", content: "hi" }], reasoning_effort: "high" },
      "deepseek",
    );
    expect(deepseek.reasoning_effort).toBe("high");

    const glm = applyThinking("claude", "glm-5.1", { reasoning_effort: "none" }, "glm");
    expect(glm.enable_thinking).toBe(false);
  });
});
