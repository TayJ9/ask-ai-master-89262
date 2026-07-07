import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { isNonAnswer, parseTranscript } from "./transcriptParse.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIVE_FIXTURE = readFileSync(
  join(__dirname, "__fixtures__", "transcript_live_session.txt"),
  "utf-8",
);

const GHOST_TAIL_FIXTURE = `AI: Do you have any questions for me about the internship or the interview process?

User: Yes. Uh, my one question would be, kind of in my internship, I went out of my way to learn on my own. Is that to be expected across the board, or am I just supposed to show up, soak up as much as I can, and then go home and think about it without having to do any extra work on my end?

AI: That is a very important question. In the tech industry, self-starters are incredibly valuable. Goodbye and have a great day!

User: ...

AI: Hello? Are you still there?

User: ...

AI: I understand that balancing learning with work responsibilities can be tricky. Thank you again for your time, Taylor. Have a great day!`;

describe("isNonAnswer", () => {
  it("treats ellipsis-only user turns as non-answers", () => {
    assert.equal(isNonAnswer("..."), true);
    assert.equal(isNonAnswer(" … "), true);
  });

  it("treats very short user turns as non-answers", () => {
    assert.equal(isNonAnswer("ok"), true);
    assert.equal(isNonAnswer("yes"), true);
  });

  it("accepts substantive answers", () => {
    assert.equal(
      isNonAnswer(
        "An internship like this, I definitely want to expand my software development knowledge.",
      ),
      false,
    );
  });
});

describe("parseTranscript", () => {
  it("merges consecutive AI questions before pairing with the next user answer", () => {
    const pairs = parseTranscript(LIVE_FIXTURE);

    assert.equal(pairs.length, 4);

    const mergedPair = pairs[3];
    assert.match(mergedPair.question, /flow control/i);
    assert.match(mergedPair.question, /internship like this/i);
    assert.match(mergedPair.answer, /prompt engineer/i);
  });

  it("skips ellipsis user turns after goodbye instead of creating filtered pairs", () => {
    const pairs = parseTranscript(GHOST_TAIL_FIXTURE);

    assert.equal(pairs.length, 1);
    assert.match(pairs[0].question, /questions for me/i);
    assert.match(pairs[0].answer, /went out of my way to learn on my own/i);
    assert.doesNotMatch(pairs[0].answer, /\.\.\./);
  });

  it("still parses a simple alternating AI/User transcript", () => {
    const pairs = parseTranscript(
      `AI: Tell me about yourself.\n\nUser: I am a computer science student with internship experience.`,
    );

    assert.equal(pairs.length, 1);
    assert.match(pairs[0].question, /Tell me about yourself/i);
    assert.match(pairs[0].answer, /computer science student/i);
  });
});
