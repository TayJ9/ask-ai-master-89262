/** Minimum text length for a valid question or answer in a Q&A pair. */
export const MIN_PAIR_TEXT_LENGTH = 10;

/**
 * User turns that are silence placeholders or too short to score as real answers.
 */
export function isNonAnswer(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (trimmed.length < MIN_PAIR_TEXT_LENGTH) return true;
  if (/^[\s.…,!?-]+$/.test(trimmed)) return true;
  return false;
}

function isAiSpeaker(speaker: string): boolean {
  const s = speaker.toLowerCase();
  return s === "ai" || s === "interviewer" || s === "agent";
}

function filterValidPairs(
  pairs: Array<{ question: string; answer: string }>,
): Array<{ question: string; answer: string }> {
  return pairs.filter((pair) => {
    const qValid = pair.question.trim().length >= MIN_PAIR_TEXT_LENGTH;
    const aValid = pair.answer.trim().length >= MIN_PAIR_TEXT_LENGTH;
    return qValid && aValid;
  });
}

type SpeakerTurn = { speaker: "ai" | "user"; text: string };

/**
 * Parse labeled transcript lines into merged speaker turns.
 * Consecutive lines from the same speaker are combined into one turn.
 */
function parseSpeakerTurns(transcript: string): SpeakerTurn[] {
  const speakerPattern = /^(AI|User|Interviewer|Candidate|Agent):\s*(.*)$/im;
  const lines = transcript.split(/\n+/).filter((line) => line.trim());
  const turns: SpeakerTurn[] = [];

  for (const line of lines) {
    const match = line.match(speakerPattern);

    if (match) {
      const [, speaker, text] = match;
      const speakerType: SpeakerTurn["speaker"] = isAiSpeaker(speaker) ? "ai" : "user";
      const trimmed = text.trim();
      if (!trimmed) continue;

      const last = turns[turns.length - 1];
      if (last?.speaker === speakerType) {
        last.text += " " + trimmed;
      } else {
        turns.push({ speaker: speakerType, text: trimmed });
      }
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) continue;

    const last = turns[turns.length - 1];
    if (last) {
      last.text += " " + trimmed;
    } else {
      turns.push({ speaker: "ai", text: trimmed });
    }
  }

  return turns;
}

/**
 * Pair merged AI turns with the next real user answer.
 * Skips non-answers; merges consecutive AI turns into one question.
 */
function pairSpeakerTurns(turns: SpeakerTurn[]): Array<{ question: string; answer: string }> {
  const pairs: Array<{ question: string; answer: string }> = [];
  let pendingQuestion = "";

  for (const turn of turns) {
    if (turn.speaker === "ai") {
      if (pendingQuestion) {
        pendingQuestion += " " + turn.text.trim();
      } else {
        pendingQuestion = turn.text.trim();
      }
      continue;
    }

    if (isNonAnswer(turn.text)) {
      continue;
    }

    if (!pendingQuestion) {
      continue;
    }

    pairs.push({
      question: pendingQuestion.trim(),
      answer: turn.text.trim(),
    });
    pendingQuestion = "";
  }

  return pairs;
}

function parseSpeakerLabeledTranscript(
  transcript: string,
): Array<{ question: string; answer: string }> {
  const turns = parseSpeakerTurns(transcript);
  if (turns.length === 0) return [];
  return pairSpeakerTurns(turns);
}

/**
 * Parse transcript into question-answer pairs.
 * Handles various transcript formats:
 * - Speaker labels (AI:, User:, Interviewer:, Candidate:)
 * - Plain text with line breaks
 * - Multiple fallback strategies for edge cases
 */
export function parseTranscript(
  transcript: string,
): Array<{ question: string; answer: string }> {
  const pairs: Array<{ question: string; answer: string }> = [];

  if (!transcript || transcript.trim().length === 0) {
    console.log("[PARSE_TRANSCRIPT] Empty transcript provided");
    return pairs;
  }

  const transcriptLength = transcript.length;
  const hasNewlines = transcript.includes("\n");
  const hasSpeakerLabels = /^(AI|User|Interviewer|Candidate|Agent):/im.test(transcript);

  console.log("[PARSE_TRANSCRIPT] Format detection:", {
    length: transcriptLength,
    hasNewlines,
    hasSpeakerLabels,
    preview: transcript.substring(0, 200),
  });

  const labeledPairs = parseSpeakerLabeledTranscript(transcript);
  if (labeledPairs.length > 0) {
    const validPairs = filterValidPairs(labeledPairs);
    console.log("[PARSE_TRANSCRIPT] Strategy 1 (speaker labels) result:", {
      pairsFound: labeledPairs.length,
      validPairs: validPairs.length,
      filteredOut: labeledPairs.length - validPairs.length,
    });
    return validPairs;
  }

  console.log("[PARSE_TRANSCRIPT] Strategy 1 (speaker labels) result:", {
    pairsFound: 0,
    speakerLabelCount: 0,
    lastSpeaker: "",
  });

  // Strategy 2: If no pairs found with speaker labels, try alternating paragraphs
  if (hasNewlines) {
    const paragraphs = transcript.split(/\n\s*\n+/).filter((p) => p.trim().length > MIN_PAIR_TEXT_LENGTH);
    console.log("[PARSE_TRANSCRIPT] Strategy 2 (alternating paragraphs):", {
      paragraphCount: paragraphs.length,
    });

    for (let i = 0; i < paragraphs.length - 1; i += 2) {
      const question = paragraphs[i].trim();
      const answer = paragraphs[i + 1].trim();

      const looksLikeQuestion =
        question.includes("?") ||
        /\b(what|how|why|when|where|who|can|could|would|should|tell|describe|explain)\b/i.test(
          question,
        );

      if (
        question.length >= MIN_PAIR_TEXT_LENGTH &&
        answer.length >= MIN_PAIR_TEXT_LENGTH &&
        !isNonAnswer(answer)
      ) {
        if (looksLikeQuestion || i === 0) {
          pairs.push({ question, answer });
        }
      }
    }

    console.log("[PARSE_TRANSCRIPT] Strategy 2 result:", { pairsFound: pairs.length });
  }

  // Strategy 3: Fallback - split by sentence endings (keep trailing .?! on each segment)
  if (pairs.length === 0) {
    console.log("[PARSE_TRANSCRIPT] Strategy 3 (sentence splitting)");
    const bits = transcript.split(/([.!?]+)/);
    const sentences: string[] = [];
    for (let i = 0; i < bits.length; i += 2) {
      const body = (bits[i] ?? "").trim();
      const punct = (bits[i + 1] ?? "").trim();
      if (body.length === 0) continue;
      const s = (body + punct).trim();
      if (s.length > MIN_PAIR_TEXT_LENGTH) sentences.push(s);
    }

    const hasQuestionMarks = transcript.includes("?");
    const looksLikeQuestionSentence = (q: string) =>
      q.endsWith("?") ||
      /\b(what|how|why|when|where|who|can|could|would|should|tell|describe|explain)\b/i.test(q);

    if (hasQuestionMarks && sentences.length >= 2) {
      for (let i = 0; i < sentences.length - 1; i += 2) {
        const question = sentences[i].trim();
        const answer = sentences[i + 1].trim();
        if (
          question.length >= MIN_PAIR_TEXT_LENGTH &&
          answer.length >= MIN_PAIR_TEXT_LENGTH &&
          !isNonAnswer(answer) &&
          looksLikeQuestionSentence(question)
        ) {
          pairs.push({ question, answer });
        }
      }
    } else if (sentences.length >= 2) {
      for (let i = 0; i < sentences.length - 1 && i < 10; i += 2) {
        const question = sentences[i].trim();
        const answer = sentences[i + 1].trim();
        if (
          question.length > 15 &&
          answer.length > 15 &&
          !isNonAnswer(answer)
        ) {
          pairs.push({ question, answer });
        }
      }
    }

    console.log("[PARSE_TRANSCRIPT] Strategy 3 result:", { pairsFound: pairs.length });
  }

  const validPairs = filterValidPairs(pairs);

  console.log("[PARSE_TRANSCRIPT] Final result:", {
    totalPairs: pairs.length,
    validPairs: validPairs.length,
    filteredOut: pairs.length - validPairs.length,
  });

  return validPairs;
}
