import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type TranscriptMessage,
  type TranscriptUpdate,
  extractAgentChatResponsePartUpdate,
  extractAudioAlignmentUpdate,
  extractTentativeAgentDebugUpdate,
  extractTranscriptUpdate,
  getLiveTranscriptHistory,
  shouldApplyAiStreamUpdate,
  shouldIgnoreEmptyAiFinal,
  upsertTranscriptMessage,
} from "./transcriptStreaming.ts";

function applyEvents(
  messages: TranscriptMessage[],
  events: unknown[],
): TranscriptMessage[] {
  let next = messages;
  for (const event of events) {
    const update = extractTranscriptUpdate(event);
    if (update) next = upsertTranscriptMessage(next, update);
  }
  return next;
}

function applyUpdates(
  messages: TranscriptMessage[],
  updates: TranscriptUpdate[],
): TranscriptMessage[] {
  return updates.reduce((acc, update) => upsertTranscriptMessage(acc, update), messages);
}

function assertGrowsMonotonically(steps: string[]): void {
  for (let i = 1; i < steps.length; i++) {
    assert.ok(
      steps[i].length >= steps[i - 1].length,
      `expected step ${i} (${steps[i]}) to be at least as long as step ${i - 1} (${steps[i - 1]})`,
    );
    assert.ok(
      steps[i].startsWith(steps[i - 1]) || steps[i - 1].startsWith(steps[i]),
      `expected cumulative growth between "${steps[i - 1]}" and "${steps[i]}"`,
    );
  }
}

function countBubblesByType(messages: TranscriptMessage[], type: 'ai' | 'student'): number {
  return messages.filter((m) => m.type === type).length;
}

function runGatedAiSequence(
  updates: TranscriptUpdate[],
  options: { isAiSpeaking?: boolean } = {},
): { messages: TranscriptMessage[]; skipped: TranscriptUpdate[] } {
  let alignmentActive = false;
  let chatPartActive = false;
  let receivedLiveStream = false;
  const skipped: TranscriptUpdate[] = [];
  let messages: TranscriptMessage[] = [];
  const isAiSpeaking = options.isAiSpeaking ?? true;

  for (const update of updates) {
    if (
      shouldIgnoreEmptyAiFinal({
        update,
        isAiSpeaking,
        alignmentActive,
        chatPartActive,
      })
    ) {
      skipped.push(update);
      continue;
    }

    if (update.type === "ai" && update.isFinal) {
      alignmentActive = false;
      chatPartActive = false;
    }

    if (
      !shouldApplyAiStreamUpdate({
        update,
        isAiSpeaking,
        alignmentActive,
        chatPartActive,
      })
    ) {
      skipped.push(update);
      continue;
    }

    if (update.type === "ai" && update.streamKind === "alignment" && !update.isFinal) {
      alignmentActive = true;
    }
    if (
      update.type === "ai" &&
      update.streamKind === "chat_part" &&
      !update.isFinal &&
      update.text.trim()
    ) {
      chatPartActive = true;
    }
    if (update.type === "ai" && !update.isFinal && update.text.trim()) {
      receivedLiveStream = true;
    }

    const nextUpdate =
      update.type === "ai" &&
      update.isFinal &&
      update.streamKind === "final" &&
      receivedLiveStream &&
      !update.text.trim()
        ? { ...update, finalizeOnly: true }
        : update;

    if (update.type === "ai" && update.isFinal) {
      receivedLiveStream = false;
    }

    messages = upsertTranscriptMessage(messages, nextUpdate);
  }

  return { messages, skipped };
}

describe("live transcript streaming", () => {
  it("grows AI text incrementally via agent_chat_response_part deltas in one bubble", () => {
    const events = [
      { type: "agent_chat_response_part", text_response_part: { type: "start", text: "Hello" } },
      { type: "agent_chat_response_part", text_response_part: { type: "delta", text: " there" } },
      { type: "agent_chat_response_part", text_response_part: { type: "delta", text: "!" } },
      { type: "agent_chat_response_part", text_response_part: { type: "stop", text: "" } },
    ];

    const steps: string[] = [];
    let messages: TranscriptMessage[] = [];
    for (const event of events) {
      messages = applyEvents(messages, [event]);
      const ai = messages.filter((m) => m.type === "ai");
      assert.equal(ai.length, 1, "AI updates should stay in a single bubble");
      steps.push(ai[0].text);
    }

    assertGrowsMonotonically(steps);
    assert.equal(steps[steps.length - 1], "Hello there!");
    assert.equal(messages.filter((m) => m.type === "ai")[0].isFinal, true);
  });

  it("grows AI text via cumulative tentative_agent_response debug updates in one bubble", () => {
    const fragments = ["Tell", "Tell me", "Tell me about", "Tell me about yourself"];
    let messages: TranscriptMessage[] = [];
    const steps: string[] = [];

    for (const text of fragments) {
      const update = extractTentativeAgentDebugUpdate({
        type: "tentative_agent_response",
        response: text,
      });
      assert.ok(update);
      // Cumulative full strings must use auto/replace-prefix, never append.
      assert.equal(update.mergeMode, "auto");
      assert.notEqual(update.mergeMode, "append");
      messages = upsertTranscriptMessage(messages, update);
      assert.equal(countBubblesByType(messages, "ai"), 1);
      steps.push(messages.filter((m) => m.type === "ai")[0].text);
    }

    assertGrowsMonotonically(steps);
    assert.equal(steps[steps.length - 1], "Tell me about yourself");
    assert.ok(!steps.some((t) => t.includes("TellTell")));
  });

  it("keeps longer tentative AI text when a shorter cumulative prefix re-delivers", () => {
    let messages = upsertTranscriptMessage([], {
      type: "ai",
      text: "Tell me about yourself",
      isFinal: false,
      mergeMode: "auto",
      streamKind: "tentative",
    });
    const shorter = extractTentativeAgentDebugUpdate({
      type: "tentative_agent_response",
      response: "Tell me",
    });
    assert.ok(shorter);
    messages = upsertTranscriptMessage(messages, shorter);
    assert.equal(messages.filter((m) => m.type === "ai")[0].text, "Tell me about yourself");
  });

  it("treats empty tentative / chars:0 as no-ops without clearing later real text", () => {
    // Empty debug tentative → null (never reaches upsert).
    assert.equal(
      extractTentativeAgentDebugUpdate({ type: "tentative_agent_response", response: "" }),
      null,
    );
    assert.equal(
      extractTentativeAgentDebugUpdate({ type: "tentative_agent_response" }),
      null,
    );
    // Empty alignment chars → null (no empty AI bubble).
    assert.equal(extractAudioAlignmentUpdate({ chars: [] }), null);
    assert.equal(extractAudioAlignmentUpdate({}), null);

    // Empty non-final upsert is a no-op (same array; no bubble created).
    const empty: TranscriptUpdate = {
      type: "ai",
      text: "",
      isFinal: false,
      mergeMode: "auto",
      streamKind: "tentative",
    };
    const emptyMessages: TranscriptMessage[] = [];
    const afterEmpty = upsertTranscriptMessage(emptyMessages, empty);
    assert.equal(afterEmpty.length, 0);
    assert.equal(afterEmpty, emptyMessages);

    // Empty events must not clear existing streamed text.
    let messages = upsertTranscriptMessage([], {
      type: "ai",
      text: "Hello there",
      isFinal: false,
      mergeMode: "auto",
      streamKind: "tentative",
    });
    const before = messages;
    messages = upsertTranscriptMessage(messages, empty);
    assert.equal(messages, before);
    assert.equal(messages[0].text, "Hello there");

    // Real text → alignment → final still works after empty no-ops.
    const real = extractTentativeAgentDebugUpdate({
      type: "tentative_agent_response",
      response: "Hello there, welcome",
    });
    assert.ok(real);
    messages = upsertTranscriptMessage(messages, real);
    const alignment = extractAudioAlignmentUpdate({
      chars: "Hello there, welcome".split(""),
    });
    assert.ok(alignment);
    messages = upsertTranscriptMessage(messages, alignment);
    messages = applyEvents(messages, [
      { source: "ai", message: "Hello there, welcome", isFinal: true },
    ]);

    assert.equal(countBubblesByType(messages, "ai"), 1);
    assert.equal(messages[0].text, "Hello there, welcome");
    assert.equal(messages[0].isFinal, true);
  });

  it("replaces user tentative_user_transcript in the same bubble", () => {
    const transcripts = ["I", "I think", "I think this", "I think this role fits me"];
    let messages: TranscriptMessage[] = [];
    const steps: string[] = [];

    for (const user_transcript of transcripts) {
      messages = applyEvents(messages, [
        {
          type: "tentative_user_transcript",
          tentative_user_transcription_event: { user_transcript },
        },
      ]);
      assert.equal(countBubblesByType(messages, "student"), 1);
      steps.push(messages.filter((m) => m.type === "student")[0].text);
    }

    assertGrowsMonotonically(steps);
    assert.equal(steps[steps.length - 1], "I think this role fits me");
    assert.equal(messages.filter((m) => m.type === "student")[0].isFinal, false);
  });

  it("grows user text from wrapped debug tentative events then finalizes the same bubble", () => {
    const tentativeEvents = ["I", "I built", "I built a dashboard"].map((user_transcript) => ({
      type: "debug",
      event: {
        type: "tentative_user_transcript",
        tentative_user_transcription_event: { user_transcript },
      },
    }));

    let messages: TranscriptMessage[] = [];
    const steps: string[] = [];
    for (const event of tentativeEvents) {
      const update = extractTranscriptUpdate(event);
      assert.ok(update);
      assert.equal(update.type, "student");
      assert.equal(update.isFinal, false);
      assert.equal(update.mergeMode, "replace");
      assert.equal(update.streamKind, "tentative");

      messages = upsertTranscriptMessage(messages, update);
      assert.equal(countBubblesByType(messages, "student"), 1);
      steps.push(messages.filter((m) => m.type === "student")[0].text);
    }

    assertGrowsMonotonically(steps);
    assert.equal(steps.at(-1), "I built a dashboard");

    messages = applyEvents(messages, [
      { source: "user", message: "I built a dashboard", isFinal: true },
    ]);

    const student = messages.filter((m) => m.type === "student");
    assert.equal(student.length, 1);
    assert.equal(student[0].text, "I built a dashboard");
    assert.equal(student[0].isFinal, true);
  });

  it("extracts tentative user transcript from JSON debug message payloads", () => {
    const update = extractTranscriptUpdate({
      type: "debug",
      message: JSON.stringify({
        type: "tentative_user_transcript",
        tentative_user_transcription_event: { user_transcript: "Yes, I can explain" },
      }),
    });

    assert.ok(update);
    assert.equal(update.type, "student");
    assert.equal(update.text, "Yes, I can explain");
    assert.equal(update.isFinal, false);
    assert.equal(update.mergeMode, "replace");
    assert.equal(update.streamKind, "tentative");
  });

  it("shows the full live transcript history in conversation order", () => {
    const messages: TranscriptMessage[] = [
      { type: "ai", text: "First question", isFinal: true, timestamp: 1 },
      { type: "student", text: "First answer", isFinal: true, timestamp: 2 },
      { type: "ai", text: "", isFinal: true, timestamp: 3 },
      { type: "ai", text: "Follow-up question", isFinal: true, timestamp: 4 },
      { type: "student", text: "Draft answer", isFinal: false, timestamp: 5 },
    ];

    const live = getLiveTranscriptHistory(messages);

    assert.deepEqual(
      live.map((message) => `${message.type}:${message.text}`),
      [
        "ai:First question",
        "student:First answer",
        "ai:Follow-up question",
        "student:Draft answer",
      ],
    );
    assert.equal(live.length, 4);
  });

  it("does not create a duplicate AI bubble when final agent_response arrives", () => {
    let messages: TranscriptMessage[] = applyEvents([], [
      {
        type: "internal_tentative_agent_response",
        tentative_agent_response_internal_event: {
          tentative_agent_response: "Great answer. Let me ask",
        },
      },
      {
        type: "internal_tentative_agent_response",
        tentative_agent_response_internal_event: {
          tentative_agent_response: "Great answer. Let me ask a follow-up.",
        },
      },
    ]);

    assert.equal(countBubblesByType(messages, "ai"), 1);

    messages = applyEvents(messages, [
      {
        type: "agent_response",
        agent_response_event: {
          agent_response: "Great answer. Let me ask a follow-up.",
        },
      },
    ]);

    assert.equal(countBubblesByType(messages, "ai"), 1);
    assert.equal(messages.filter((m) => m.type === "ai")[0].isFinal, true);
    assert.equal(
      getLiveTranscriptHistory(messages).filter((b) => b.type === "ai").length,
      1,
    );
  });

  it("does not create duplicate AI bubble when SDK onMessage finalizes streaming", () => {
    const parts = [
      extractAgentChatResponsePartUpdate({ type: "start", text: "Welcome" }),
      extractAgentChatResponsePartUpdate({ type: "delta", text: " to" }),
      extractAgentChatResponsePartUpdate({ type: "delta", text: " the interview" }),
      extractAgentChatResponsePartUpdate({ type: "stop", text: "" }),
    ].filter(Boolean) as TranscriptUpdate[];

    let messages = applyUpdates([], parts);
    assert.equal(countBubblesByType(messages, "ai"), 1);

    messages = applyEvents(messages, [
      { source: "ai", message: "Welcome to the interview", isFinal: true },
    ]);

    assert.equal(countBubblesByType(messages, "ai"), 1);
    assert.equal(messages.filter((m) => m.type === "ai")[0].text, "Welcome to the interview");
  });

  it("handles chat_part-only stream with final and correction in one bubble", () => {
    const updates = [
      extractAgentChatResponsePartUpdate({ type: "start", text: "" }),
      extractAgentChatResponsePartUpdate({ type: "delta", text: "Let's begin" }),
      extractAgentChatResponsePartUpdate({ type: "delta", text: " with your background." }),
      extractAgentChatResponsePartUpdate({ type: "stop", text: "" }),
      extractTranscriptUpdate({
        type: "agent_response_correction",
        agent_response_correction_event: {
          corrected_agent_response: "Let's begin with your project background.",
        },
      }),
    ].filter(Boolean) as TranscriptUpdate[];

    const { messages, skipped } = runGatedAiSequence(updates);

    assert.equal(skipped.length, 0);
    assert.equal(countBubblesByType(messages, "ai"), 1);
    assert.equal(messages[0].text, "Let's begin with your project background.");
    assert.equal(messages[0].isFinal, true);
  });

  it("handles alignment-only stream with final and correction in one bubble", () => {
    const updates = [
      extractAudioAlignmentUpdate({ chars: "Tell".split("") }),
      extractAudioAlignmentUpdate({ chars: "Tell me".split("") }),
      extractAudioAlignmentUpdate({ chars: "Tell me about yourself".split("") }),
      extractTranscriptUpdate({
        type: "agent_response",
        agent_response_event: { agent_response: "Tell me about yourself." },
      }),
      extractTranscriptUpdate({
        type: "agent_response_correction",
        agent_response_correction_event: {
          corrected_agent_response: "Tell me about yourself and your experience.",
        },
      }),
    ].filter(Boolean) as TranscriptUpdate[];

    const { messages, skipped } = runGatedAiSequence(updates);

    assert.equal(skipped.length, 0);
    assert.equal(countBubblesByType(messages, "ai"), 1);
    assert.equal(messages[0].text, "Tell me about yourself and your experience.");
    assert.equal(messages[0].isFinal, true);
  });

  it("handles tentative-only stream with final and correction in one bubble", () => {
    const updates = [
      extractTentativeAgentDebugUpdate({
        type: "tentative_agent_response",
        response: "Thanks",
      }),
      extractTentativeAgentDebugUpdate({
        type: "tentative_agent_response",
        response: "Thanks for sharing that example.",
      }),
      extractTranscriptUpdate({
        source: "ai",
        message: "Thanks for sharing that example.",
        isFinal: true,
      }),
      extractTranscriptUpdate({
        type: "agent_response_correction",
        agent_response_correction_event: {
          corrected_agent_response: "Thanks for sharing that example. Let's go deeper.",
        },
      }),
    ].filter(Boolean) as TranscriptUpdate[];

    const { messages, skipped } = runGatedAiSequence(updates);

    assert.equal(skipped.length, 0);
    assert.equal(countBubblesByType(messages, "ai"), 1);
    assert.equal(messages[0].text, "Thanks for sharing that example. Let's go deeper.");
    assert.equal(messages[0].isFinal, true);
  });

  it("idempotently finalizes AI after tentative/alignment without resetting text", () => {
    let messages: TranscriptMessage[] = [];
    const alignmentSteps = ["Hello", "Hello there", "Hello there, welcome"];
    for (const text of alignmentSteps) {
      const update = extractAudioAlignmentUpdate({ chars: text.split("") });
      assert.ok(update);
      messages = upsertTranscriptMessage(messages, update);
    }

    const before = messages.filter((m) => m.type === "ai")[0];
    assert.equal(before.isFinal, false);
    assert.equal(before.text, "Hello there, welcome");

    const afterSame = applyEvents(messages, [
      { source: "ai", message: "Hello there, welcome", isFinal: true },
    ]);
    const finalized = afterSame.filter((m) => m.type === "ai")[0];
    assert.equal(countBubblesByType(afterSame, "ai"), 1);
    assert.equal(finalized.text, "Hello there, welcome");
    assert.equal(finalized.isFinal, true);
    assert.equal(finalized.timestamp, before.timestamp, "timestamp must stay stable (no remount flash)");

    // Second identical dump must be a no-op (same array reference).
    const afterDup = applyEvents(afterSame, [
      { source: "ai", message: "Hello there, welcome", isFinal: true },
    ]);
    assert.equal(afterDup, afterSame);

    // Shorter final must not shrink already-streamed text.
    const afterShorter = applyEvents(
      [
        {
          type: "ai",
          text: "Hello there, welcome to Ask AI",
          isFinal: false,
          timestamp: 1,
        },
      ],
      [{ source: "ai", message: "Hello there", isFinal: true }],
    );
    assert.equal(afterShorter[0].text, "Hello there, welcome to Ask AI");
    assert.equal(afterShorter[0].isFinal, true);
  });

  it("cold path: final onMessage dump shows full AI message once", () => {
    const messages = applyEvents([], [
      { source: "ai", message: "Tell me about a challenge you faced.", isFinal: true },
    ]);

    assert.equal(countBubblesByType(messages, "ai"), 1);
    assert.equal(
      messages.filter((m) => m.type === "ai")[0].text,
      "Tell me about a challenge you faced.",
    );
    assert.equal(messages.filter((m) => m.type === "ai")[0].isFinal, true);
  });

  it("does not overwrite a prior final AI turn with an unrelated final dump", () => {
    let messages = applyEvents([], [
      { source: "ai", message: "First question about your background.", isFinal: true },
    ]);
    messages = applyEvents(messages, [
      { source: "ai", message: "Second question about teamwork.", isFinal: true },
    ]);

    assert.equal(countBubblesByType(messages, "ai"), 2);
    assert.equal(messages[0].text, "First question about your background.");
    assert.equal(messages[1].text, "Second question about teamwork.");
    assert.equal(getLiveTranscriptHistory(messages).filter((b) => b.type === "ai").length, 2);
  });

  it("applies available AI streams while suppressing tentative behind active alignment", () => {
    const tentative = extractTentativeAgentDebugUpdate({
      type: "tentative_agent_response",
      response: "Hello there, welcome to the interview.",
    });
    const alignment = extractAudioAlignmentUpdate({ chars: ["H", "e", "l", "l", "o"] });
    const chatPart = extractAgentChatResponsePartUpdate({ type: "delta", text: "Hello" });
    assert.ok(tentative);
    assert.ok(alignment);
    assert.ok(chatPart);

    // Sparse tentatives must not jump ahead once spoken alignment is driving the bubble.
    assert.equal(
      shouldApplyAiStreamUpdate({
        update: tentative,
        isAiSpeaking: true,
        alignmentActive: true,
      }),
      false,
    );
    // Alignment applies when chat_part is not active.
    assert.equal(
      shouldApplyAiStreamUpdate({
        update: alignment,
        isAiSpeaking: true,
        alignmentActive: true,
      }),
      true,
    );
    // chat_part always applies.
    assert.equal(
      shouldApplyAiStreamUpdate({
        update: chatPart,
        isAiSpeaking: true,
        alignmentActive: true,
      }),
      true,
    );
    // Once chat_part is driving the turn, alignment may still arrive; merge protects chat_part.
    assert.equal(
      shouldApplyAiStreamUpdate({
        update: alignment,
        isAiSpeaking: true,
        alignmentActive: true,
        chatPartActive: true,
      }),
      true,
    );
    assert.equal(
      shouldApplyAiStreamUpdate({
        update: chatPart,
        isAiSpeaking: true,
        alignmentActive: true,
        chatPartActive: true,
      }),
      true,
    );
    // Before first alignment chunk, tentatives still apply even while AI is speaking.
    assert.equal(
      shouldApplyAiStreamUpdate({
        update: tentative,
        isAiSpeaking: true,
        alignmentActive: false,
      }),
      true,
    );
    assert.equal(
      shouldApplyAiStreamUpdate({
        update: tentative,
        isAiSpeaking: false,
        alignmentActive: false,
      }),
      true,
    );
    // Alignment active but agent not speaking → tentatives still apply (gate needs both).
    assert.equal(
      shouldApplyAiStreamUpdate({
        update: tentative,
        isAiSpeaking: false,
        alignmentActive: true,
      }),
      true,
    );
  });

  it("clears alignment gate on final AI and interruption so next-turn tentatives apply", () => {
    // Mirrors VoiceInterviewWebSocket.applyTranscriptUpdate + handleInterruption.
    let alignmentActive = false;
    let chatPartActive = false;
    let isAiSpeaking = true;
    let messages: TranscriptMessage[] = [];

    const applyGated = (update: TranscriptUpdate) => {
      if (update.type === "ai" && update.isFinal) {
        alignmentActive = false;
        chatPartActive = false;
      }
      if (
        !shouldApplyAiStreamUpdate({
          update,
          isAiSpeaking,
          alignmentActive,
          chatPartActive,
        })
      ) {
        return;
      }
      if (update.type === "ai" && update.streamKind === "alignment" && !update.isFinal) {
        alignmentActive = true;
      }
      if (
        update.type === "ai" &&
        update.streamKind === "chat_part" &&
        !update.isFinal &&
        update.text.trim()
      ) {
        chatPartActive = true;
      }
      messages = upsertTranscriptMessage(messages, update);
    };

    const earlyTentative = extractTentativeAgentDebugUpdate({
      type: "tentative_agent_response",
      response: "Welcome to",
    });
    assert.ok(earlyTentative);
    applyGated(earlyTentative);
    assert.equal(messages[0]?.text, "Welcome to");

    applyGated(
      extractAudioAlignmentUpdate({ chars: "Welcome to the interview".split("") })!,
    );
    assert.equal(alignmentActive, true);
    assert.equal(messages[0]?.text, "Welcome to the interview");

    // Large tentative jump must be skipped while alignment is active + speaking.
    const jumpAhead = extractTentativeAgentDebugUpdate({
      type: "tentative_agent_response",
      response: "Welcome to the interview. Tell me about a time you led a team through conflict.",
    });
    assert.ok(jumpAhead);
    applyGated(jumpAhead);
    assert.equal(messages[0]?.text, "Welcome to the interview");

    // Final clears the gate (same as applyTranscriptUpdate).
    applyGated({
      type: "ai",
      text: "Welcome to the interview.",
      isFinal: true,
      mergeMode: "replace",
      streamKind: "final",
    });
    assert.equal(alignmentActive, false);

    // Next turn: tentatives apply again before alignment arrives.
    isAiSpeaking = true;
    const nextTurnTentative = extractTentativeAgentDebugUpdate({
      type: "tentative_agent_response",
      response: "What is your greatest strength?",
    });
    assert.ok(nextTurnTentative);
    applyGated(nextTurnTentative);
    assert.equal(countBubblesByType(messages, "ai"), 2);
    assert.equal(messages[1]?.text, "What is your greatest strength?");

    // Simulate interruption mid-alignment: gate clears so tentatives are not stuck skipped.
    applyGated(
      extractAudioAlignmentUpdate({ chars: "What is your".split("") })!,
    );
    assert.equal(alignmentActive, true);
    alignmentActive = false; // handleInterruption
    const afterInterrupt = extractTentativeAgentDebugUpdate({
      type: "tentative_agent_response",
      response: "What is your greatest strength? Please take your time.",
    });
    assert.ok(afterInterrupt);
    applyGated(afterInterrupt);
    assert.equal(messages[1]?.text, "What is your greatest strength? Please take your time.");
  });

  it("ignores empty AI final while alignment is active without clearing stream refs", () => {
    let alignmentActive = false;
    let chatPartActive = false;
    let receivedLiveStream = false;
    let isAiSpeaking = true;
    let messages: TranscriptMessage[] = [];

    const applyGated = (update: TranscriptUpdate) => {
      if (
        shouldIgnoreEmptyAiFinal({
          update,
          isAiSpeaking,
          alignmentActive,
          chatPartActive,
        })
      ) {
        return false;
      }
      if (update.type === "ai" && update.isFinal) {
        alignmentActive = false;
        chatPartActive = false;
      }
      if (
        !shouldApplyAiStreamUpdate({
          update,
          isAiSpeaking,
          alignmentActive,
          chatPartActive,
        })
      ) {
        return false;
      }
      if (update.type === "ai" && update.streamKind === "alignment" && !update.isFinal) {
        alignmentActive = true;
      }
      if (
        update.type === "ai" &&
        update.streamKind === "chat_part" &&
        !update.isFinal &&
        update.text.trim()
      ) {
        chatPartActive = true;
      }
      if (update.type === "ai" && !update.isFinal && update.text.trim()) {
        receivedLiveStream = true;
      }
      let nextUpdate = update;
      if (
        update.type === "ai" &&
        update.isFinal &&
        update.streamKind === "final" &&
        receivedLiveStream &&
        !update.text.trim()
      ) {
        nextUpdate = { ...update, finalizeOnly: true };
      }
      if (update.type === "ai" && update.isFinal) {
        receivedLiveStream = false;
      }
      messages = upsertTranscriptMessage(messages, nextUpdate);
      return true;
    };

    applyGated(extractAudioAlignmentUpdate({ chars: "Welcome to".split("") })!);
    assert.equal(alignmentActive, true);
    assert.equal(receivedLiveStream, true);
    assert.equal(messages[0]?.text, "Welcome to");
    assert.equal(messages[0]?.isFinal, false);

    const ignored = applyGated({
      type: "ai",
      text: "",
      isFinal: true,
      mergeMode: "replace",
      streamKind: "final",
    });
    assert.equal(ignored, false);
    assert.equal(alignmentActive, true, "spurious final must not clear alignment gate");
    assert.equal(receivedLiveStream, true, "spurious final must not reset live-stream receipt");
    assert.equal(messages[0]?.text, "Welcome to");
    assert.equal(messages[0]?.isFinal, false);

    applyGated(extractAudioAlignmentUpdate({ chars: "Welcome to Ask AI".split("") })!);
    assert.equal(messages[0]?.text, "Welcome to Ask AI");
    assert.equal(messages[0]?.isFinal, false);

    isAiSpeaking = false;
    applyGated({
      type: "ai",
      text: "Welcome to Ask AI.",
      isFinal: true,
      mergeMode: "replace",
      streamKind: "final",
    });
    assert.equal(alignmentActive, false);
    assert.equal(receivedLiveStream, false);
    assert.equal(messages[0]?.text, "Welcome to Ask AI.");
    assert.equal(messages[0]?.isFinal, true);
  });

  it("ignores empty AI final during chat_part but preserves explicit stop finalization", () => {
    let alignmentActive = false;
    let chatPartActive = false;
    let receivedLiveStream = false;
    let messages: TranscriptMessage[] = [];

    const applyGated = (update: TranscriptUpdate) => {
      if (
        shouldIgnoreEmptyAiFinal({
          update,
          isAiSpeaking: true,
          alignmentActive,
          chatPartActive,
        })
      ) {
        return false;
      }
      if (update.type === "ai" && update.isFinal) {
        alignmentActive = false;
        chatPartActive = false;
      }
      if (
        !shouldApplyAiStreamUpdate({
          update,
          isAiSpeaking: true,
          alignmentActive,
          chatPartActive,
        })
      ) {
        return false;
      }
      if (update.type === "ai" && update.streamKind === "alignment" && !update.isFinal) {
        alignmentActive = true;
      }
      if (
        update.type === "ai" &&
        update.streamKind === "chat_part" &&
        !update.isFinal &&
        update.text.trim()
      ) {
        chatPartActive = true;
      }
      if (update.type === "ai" && !update.isFinal && update.text.trim()) {
        receivedLiveStream = true;
      }
      let nextUpdate = update;
      if (
        update.type === "ai" &&
        update.isFinal &&
        update.streamKind === "final" &&
        receivedLiveStream &&
        !update.text.trim()
      ) {
        nextUpdate = { ...update, finalizeOnly: true };
      }
      if (update.type === "ai" && update.isFinal) {
        receivedLiveStream = false;
      }
      messages = upsertTranscriptMessage(messages, nextUpdate);
      return true;
    };

    applyGated(extractAgentChatResponsePartUpdate({ type: "delta", text: "That sounds" })!);
    applyGated(extractAgentChatResponsePartUpdate({ type: "delta", text: " useful" })!);
    assert.equal(chatPartActive, true);
    assert.equal(receivedLiveStream, true);
    assert.equal(messages[0]?.text, "That sounds useful");

    const ignored = applyGated({
      type: "ai",
      text: "",
      isFinal: true,
      mergeMode: "replace",
      streamKind: "final",
    });
    assert.equal(ignored, false);
    assert.equal(chatPartActive, true, "spurious final must not clear chat_part gate");
    assert.equal(receivedLiveStream, true);
    assert.equal(messages[0]?.text, "That sounds useful");
    assert.equal(messages[0]?.isFinal, false);

    applyGated(extractAgentChatResponsePartUpdate({ type: "stop", text: "" })!);
    assert.equal(chatPartActive, false);
    assert.equal(receivedLiveStream, false);
    assert.equal(messages[0]?.text, "That sounds useful");
    assert.equal(messages[0]?.isFinal, true);
  });

  it("finalizes an empty AI final once no active stream remains", () => {
    let messages = upsertTranscriptMessage([], {
      type: "ai",
      text: "Thanks for sharing",
      isFinal: false,
      mergeMode: "auto",
      streamKind: "tentative",
    });
    let receivedLiveStream = true;
    const update: TranscriptUpdate = {
      type: "ai",
      text: "",
      isFinal: true,
      mergeMode: "replace",
      streamKind: "final",
    };

    assert.equal(
      shouldIgnoreEmptyAiFinal({
        update,
        isAiSpeaking: false,
        alignmentActive: false,
        chatPartActive: false,
      }),
      false,
    );

    const nextUpdate =
      receivedLiveStream && !update.text.trim() ? { ...update, finalizeOnly: true } : update;
    receivedLiveStream = false;
    messages = upsertTranscriptMessage(messages, nextUpdate);

    assert.equal(receivedLiveStream, false);
    assert.equal(messages[0]?.text, "Thanks for sharing");
    assert.equal(messages[0]?.isFinal, true);
  });

  it("still applies alignment after a tentative AI update was already received", () => {
    // Regression: a permanent "receivedTentative" guard used to block all later alignment.
    const tentative = extractTentativeAgentDebugUpdate({
      type: "tentative_agent_response",
      response: "Hello there, welcome to the interview.",
    });
    const alignmentChunks = ["Hello", "Hello ", "Hello world"];
    assert.ok(tentative);

    let alignmentActive = false;
    let chatPartActive = false;
    let messages: TranscriptMessage[] = [];

    const applyGated = (update: TranscriptUpdate) => {
      if (update.type === "ai" && update.isFinal) {
        alignmentActive = false;
        chatPartActive = false;
      }
      if (
        !shouldApplyAiStreamUpdate({
          update,
          isAiSpeaking: true,
          alignmentActive,
          chatPartActive,
        })
      ) {
        return;
      }
      if (update.type === "ai" && update.streamKind === "alignment" && !update.isFinal) {
        alignmentActive = true;
      }
      if (
        update.type === "ai" &&
        update.streamKind === "chat_part" &&
        !update.isFinal &&
        update.text.trim()
      ) {
        chatPartActive = true;
      }
      messages = upsertTranscriptMessage(messages, update);
    };

    applyGated(tentative);
    assert.equal(messages.filter((m) => m.type === "ai")[0]?.text, tentative.text);

    for (const text of alignmentChunks) {
      const alignment = extractAudioAlignmentUpdate({ chars: text.split("") });
      assert.ok(alignment);
      assert.equal(
        shouldApplyAiStreamUpdate({
          update: alignment,
          isAiSpeaking: true,
          alignmentActive,
          chatPartActive,
        }),
        true,
        "alignment must remain applicable after tentative receipt",
      );
      applyGated(alignment);
    }

    // Later tentatives are suppressed once alignment is active; alignment text wins.
    applyGated(tentative);
    assert.equal(countBubblesByType(messages, "ai"), 1);
    assert.equal(messages.filter((m) => m.type === "ai")[0].text, "Hello world");
    assert.equal(alignmentActive, true);
  });

  it("lets alignment continue a turn after chat_part activity without wiping chat_part", () => {
    const updates = [
      extractAgentChatResponsePartUpdate({ type: "start", text: "" }),
      extractAgentChatResponsePartUpdate({ type: "delta", text: "That's a strong example" }),
      extractAudioAlignmentUpdate({ chars: "strong example".split("") }),
      extractAudioAlignmentUpdate({
        chars: "That's a strong example with clear ownership".split(""),
      }),
      extractTranscriptUpdate({
        source: "ai",
        message: "That's a strong example with clear ownership.",
        isFinal: true,
      }),
    ].filter(Boolean) as TranscriptUpdate[];

    const { messages, skipped } = runGatedAiSequence(updates);

    assert.equal(skipped.length, 0, "alignment must not be blocked just because chat_part fired");
    assert.equal(countBubblesByType(messages, "ai"), 1);
    assert.equal(messages[0].text, "That's a strong example with clear ownership.");
    assert.ok(!messages[0].text.startsWith("strong example"));
  });

  it("does not duplicate when chat_part starts after alignment seeded the bubble", () => {
    const updates = [
      extractAudioAlignmentUpdate({ chars: "Hello".split("") }),
      extractAgentChatResponsePartUpdate({ type: "delta", text: "Hello there" }),
      extractAgentChatResponsePartUpdate({ type: "delta", text: ", welcome" }),
      extractAgentChatResponsePartUpdate({ type: "stop", text: "" }),
    ].filter(Boolean) as TranscriptUpdate[];

    const { messages, skipped } = runGatedAiSequence(updates);

    assert.equal(skipped.length, 0);
    assert.equal(countBubblesByType(messages, "ai"), 1);
    assert.equal(messages[0].text, "Hello there, welcome");
    assert.ok(!messages[0].text.includes("HelloHello"));
    assert.equal(messages[0].isFinal, true);
  });

  it("does not garble when chat_part starts after a longer tentative", () => {
    const updates = [
      extractTentativeAgentDebugUpdate({
        type: "tentative_agent_response",
        response: "Hello there, welcome to the interview.",
      }),
      extractAgentChatResponsePartUpdate({ type: "delta", text: "Hello" }),
      extractAgentChatResponsePartUpdate({ type: "delta", text: " there" }),
      extractAgentChatResponsePartUpdate({ type: "delta", text: ", welcome" }),
      extractAgentChatResponsePartUpdate({ type: "delta", text: " to the interview." }),
      extractTranscriptUpdate({
        source: "ai",
        message: "Hello there, welcome to the interview.",
        isFinal: true,
      }),
    ].filter(Boolean) as TranscriptUpdate[];

    const { messages, skipped } = runGatedAiSequence(updates);

    assert.equal(skipped.length, 0);
    assert.equal(countBubblesByType(messages, "ai"), 1);
    assert.equal(messages[0].text, "Hello there, welcome to the interview.");
    assert.ok(!messages[0].text.includes("interview.Hello"));
  });

  it("does not let partial alignment wipe growing chat_part text", () => {
    // Live session bug: chat_part appends "That's a great example..." then alignment
    // replace lands a mid-utterance slice like "ally effective dynamic." / "Taylor. ".
    let alignmentActive = false;
    let chatPartActive = false;
    let messages: TranscriptMessage[] = [];

    const applyGated = (update: TranscriptUpdate) => {
      if (update.type === "ai" && update.isFinal) {
        alignmentActive = false;
        chatPartActive = false;
      }
      if (
        !shouldApplyAiStreamUpdate({
          update,
          isAiSpeaking: true,
          alignmentActive,
          chatPartActive,
        })
      ) {
        return;
      }
      if (update.type === "ai" && update.streamKind === "alignment" && !update.isFinal) {
        alignmentActive = true;
      }
      if (
        update.type === "ai" &&
        update.streamKind === "chat_part" &&
        !update.isFinal &&
        update.text.trim()
      ) {
        chatPartActive = true;
      }
      messages = upsertTranscriptMessage(messages, update);
    };

    applyGated(extractAgentChatResponsePartUpdate({ type: "start", text: "" })!);
    applyGated(extractAgentChatResponsePartUpdate({ type: "delta", text: "That's a great example" })!);
    applyGated(extractAgentChatResponsePartUpdate({ type: "delta", text: " because it served two purposes" })!);
    assert.equal(chatPartActive, true);
    assert.equal(
      messages[0]?.text,
      "That's a great example because it served two purposes",
    );

    const fragment = extractAudioAlignmentUpdate({
      chars: "ally effective dynamic. ".split(""),
    });
    assert.ok(fragment);
    assert.equal(
      shouldApplyAiStreamUpdate({
        update: fragment,
        isAiSpeaking: true,
        alignmentActive: false,
        chatPartActive: true,
      }),
      true,
    );
    applyGated(fragment);
    assert.equal(
      messages[0]?.text,
      "That's a great example because it served two purposes",
      "alignment must not wipe chat_part while chat_part is active",
    );

    applyGated(
      extractTranscriptUpdate({
        source: "ai",
        message:
          "That's a great example because it served two purposes: showcasing your technical ability.",
        isFinal: true,
      })!,
    );
    assert.equal(chatPartActive, false);
    assert.equal(
      messages[0]?.text,
      "That's a great example because it served two purposes: showcasing your technical ability.",
    );
  });

  it("keeps longer text when alignment lands a suffix fragment (defense in depth)", () => {
    let messages = upsertTranscriptMessage([], {
      type: "ai",
      text: "That sounds like a really effective dynamic.",
      isFinal: false,
      mergeMode: "append",
      streamKind: "chat_part",
    });

    messages = upsertTranscriptMessage(
      messages,
      extractAudioAlignmentUpdate({ chars: "ally effective dynamic. ".split("") })!,
    );

    assert.equal(messages[0].text, "That sounds like a really effective dynamic.");
    assert.ok(!messages[0].text.startsWith("ally"));
  });

  it("extractAudioAlignmentUpdate uses replace merge for cumulative SDK chars", () => {
    const update = extractAudioAlignmentUpdate({ chars: ["H", "i"] });
    assert.ok(update);
    // Must not be append: SDK chars are cumulative full spoken text.
    assert.equal(update.mergeMode, "replace");
    assert.notEqual(update.mergeMode, "append");
    assert.equal(update.streamKind, "alignment");
    assert.equal(update.isFinal, false);
    assert.equal(update.text, "Hi");
  });

  it("merges cumulative audio alignment without duplicating text", () => {
    let messages: TranscriptMessage[] = [];
    // SDK alignment chars are cumulative spoken text (not deltas).
    const steps = ["Hello", "Hello ", "Hello world", "Hello world!"];
    const seen: string[] = [];

    for (const text of steps) {
      const update = extractAudioAlignmentUpdate({ chars: text.split("") });
      assert.ok(update);
      assert.equal(update.mergeMode, "replace");
      messages = upsertTranscriptMessage(messages, update);
      assert.equal(countBubblesByType(messages, "ai"), 1);
      seen.push(messages.filter((m) => m.type === "ai")[0].text);
    }

    assertGrowsMonotonically(seen);
    assert.deepEqual(seen, steps);
    assert.equal(messages.filter((m) => m.type === "ai")[0].text, "Hello world!");
    // Blind append would garble: "Hello" + "Hello " + ...
    assert.ok(!seen.some((t) => t.includes("HelloHello")));
  });

  it("alignment replaces a divergent longer tentative without appending", () => {
    let messages = upsertTranscriptMessage([], {
      type: "ai",
      text: "Hello there, welcome to the interview.",
      isFinal: false,
      mergeMode: "auto",
      streamKind: "tentative",
    });

    const alignment = extractAudioAlignmentUpdate({
      chars: "Hello world".split(""),
    });
    assert.ok(alignment);
    messages = upsertTranscriptMessage(messages, alignment);

    assert.equal(countBubblesByType(messages, "ai"), 1);
    assert.equal(messages[0].text, "Hello world");
    assert.ok(!messages[0].text.includes("interview.Hello"));
  });

  it("idempotent when the same cumulative alignment chunk is repeated", () => {
    let messages: TranscriptMessage[] = [];
    const chunk = "Tell me about yourself";
    const update = extractAudioAlignmentUpdate({ chars: chunk.split("") });
    assert.ok(update);

    messages = upsertTranscriptMessage(messages, update);
    const afterFirst = messages.filter((m) => m.type === "ai")[0];
    assert.equal(afterFirst.text, chunk);

    // Same prefix/full text again must not append or garble.
    for (let i = 0; i < 3; i++) {
      messages = upsertTranscriptMessage(messages, update);
      assert.equal(countBubblesByType(messages, "ai"), 1);
      assert.equal(messages.filter((m) => m.type === "ai")[0].text, chunk);
    }

    // Shorter re-delivery of a prefix must keep the longer spoken text.
    const shorter = extractAudioAlignmentUpdate({ chars: "Tell me".split("") });
    assert.ok(shorter);
    messages = upsertTranscriptMessage(messages, shorter);
    assert.equal(messages.filter((m) => m.type === "ai")[0].text, chunk);
  });

  it("grows spoken alignment text across many cumulative chunks without garbling", () => {
    const full =
      "Thanks for joining. Tell me about a time you solved a hard problem.";
    let messages: TranscriptMessage[] = [];
    const seen: string[] = [];

    for (let end = 1; end <= full.length; end++) {
      const partial = full.slice(0, end);
      const update = extractAudioAlignmentUpdate({ chars: partial.split("") });
      assert.ok(update);
      messages = upsertTranscriptMessage(messages, update);
      seen.push(messages.filter((m) => m.type === "ai")[0].text);
    }

    assert.equal(countBubblesByType(messages, "ai"), 1);
    assert.equal(messages.filter((m) => m.type === "ai")[0].text, full);
    assertGrowsMonotonically(seen);
    assert.equal(seen[seen.length - 1], full);
    // No duplicated prefixes from append-style merging.
    assert.ok(!full.split("").some((_, i) => {
      if (i === 0) return false;
      const prefix = full.slice(0, i);
      return seen[seen.length - 1].startsWith(prefix + prefix);
    }));
  });

  it("simulates many student tentative updates without duplicate bubbles", () => {
    let messages: TranscriptMessage[] = [];
    const words = "Yes I went out of my way to learn on my own during my internship".split(" ");

    for (let i = 0; i < words.length; i++) {
      const partial = words.slice(0, i + 1).join(" ");
      messages = applyEvents(messages, [
        {
          type: "tentative_user_transcript",
          tentative_user_transcription_event: { user_transcript: partial },
        },
      ]);
      assert.equal(countBubblesByType(messages, "student"), 1);
    }

    assert.equal(
      messages.filter((m) => m.type === "student")[0].text,
      words.join(" "),
    );
  });
});
