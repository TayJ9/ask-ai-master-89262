import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeElevenLabsToolBody,
  readElevenLabsToolInterviewId,
  summarizeElevenLabsToolBody,
} from "./elevenLabsToolRequest.js";

describe("elevenLabsToolRequest", () => {
  it("merges parameters envelope into flat body", () => {
    const normalized = normalizeElevenLabsToolBody({
      tool_call_id: "call_1",
      tool_name: "GetResumeProfile",
      parameters: { interview_id: "510e2faf-3d53-45c5-9c85-a9b41264301f" },
      conversation_id: "conv_6601kz9psnvde6xtm9180g4p10n1",
    });
    assert.equal(
      readElevenLabsToolInterviewId(normalized),
      "510e2faf-3d53-45c5-9c85-a9b41264301f",
    );
  });

  it("ignores unresolved template placeholders", () => {
    const normalized = normalizeElevenLabsToolBody({
      parameters: { interviewid: "{{interviewid}}" },
    });
    assert.equal(readElevenLabsToolInterviewId(normalized), undefined);
  });

  it("summarizes tool body for logging", () => {
    assert.deepEqual(
      summarizeElevenLabsToolBody({
        tool_name: "GetResumeProfile",
        parameters: { interviewid: "abc" },
        conversation_id: "conv_1",
      }),
      {
        tool_name: "GetResumeProfile",
        tool_call_id: undefined,
        has_parameters: true,
        interviewId: "abc",
        conversationId: "conv_1",
      },
    );
  });
});
