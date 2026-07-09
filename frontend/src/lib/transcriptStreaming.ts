export interface TranscriptMessage {
  type: 'ai' | 'student';
  text: string;
  isFinal: boolean;
  timestamp: number;
  streamKind?: TranscriptStreamKind;
}

export type TranscriptMergeMode = 'append' | 'replace' | 'auto';

export type TranscriptStreamKind =
  | 'tentative'
  | 'alignment'
  | 'chat_part'
  | 'final'
  | 'correction';

export type TranscriptUpdate = {
  type: 'ai' | 'student';
  text: string;
  isFinal: boolean;
  mergeMode: TranscriptMergeMode;
  finalizeOnly?: boolean;
  streamKind?: TranscriptStreamKind;
};

/**
 * Same-turn finalize/correction may merge into an already-final bubble.
 * Unrelated finals (new turn) must open a new bubble so history is preserved.
 */
export function canFinalizeMergeInto(
  existing: TranscriptMessage,
  update: TranscriptUpdate,
): boolean {
  if (!update.isFinal) return false;
  if (update.finalizeOnly) return true;
  if (update.streamKind === 'correction') return true;

  const existingText = existing.text.trim();
  const incomingText = update.text.trim();
  if (!incomingText) return true;
  if (!existingText) return true;
  if (existingText === incomingText) return true;
  // Partial stream then full dump, or minor truncation/correction of the same turn.
  if (incomingText.startsWith(existingText) || existingText.startsWith(incomingText)) {
    return true;
  }
  return false;
}

/**
 * While the agent is speaking:
 * - Always accept chat_part and alignment when they arrive; the merge layer
 *   protects chat_part text from shorter/suffix alignment fragments.
 * - Prefer spoken alignment over sparse tentatives once alignment is active.
 */
export function shouldApplyAiStreamUpdate(params: {
  update: TranscriptUpdate;
  isAiSpeaking: boolean;
  alignmentActive: boolean;
  chatPartActive?: boolean;
}): boolean {
  const { update, isAiSpeaking, alignmentActive } = params;
  if (update.type !== 'ai' || update.isFinal) return true;
  if (update.streamKind === 'chat_part') return true;
  if (update.streamKind === 'alignment') return true;
  if (isAiSpeaking && alignmentActive && update.streamKind === 'tentative') {
    return false;
  }
  return true;
}

/**
 * Some SDK final events are empty bookkeeping pings while the spoken/text stream
 * is still active. Ignore those so they cannot prematurely finalize the bubble
 * or clear same-turn stream gates. Explicit finalizeOnly stops remain valid.
 */
export function shouldIgnoreEmptyAiFinal(params: {
  update: TranscriptUpdate;
  isAiSpeaking: boolean;
  alignmentActive: boolean;
  chatPartActive?: boolean;
}): boolean {
  const { update, isAiSpeaking, alignmentActive, chatPartActive = false } = params;
  if (update.type !== 'ai') return false;
  if (!update.isFinal || update.streamKind !== 'final') return false;
  if (update.finalizeOnly || update.text.trim()) return false;
  return isAiSpeaking || alignmentActive || chatPartActive;
}

/** Full live transcript history, excluding empty final noise bubbles. */
export function getLiveTranscriptHistory(messages: TranscriptMessage[]): TranscriptMessage[] {
  return messages.filter((message) => message.text.trim() || !message.isFinal);
}

export function mergeStreamText(
  existing: string,
  incoming: string,
  mergeMode: TranscriptMergeMode,
): string {
  if (!incoming) return existing;
  if (!existing) return incoming;

  if (mergeMode === 'append') {
    if (existing.endsWith(incoming)) return existing;
    return existing + incoming;
  }

  if (mergeMode === 'replace') {
    return incoming;
  }

  // auto: prefer cumulative growth; keep longer on prefix re-delivery;
  // on true divergence prefer incoming (spoken alignment / latest stream).
  if (incoming.startsWith(existing)) return incoming;
  if (existing.startsWith(incoming)) return existing;
  if (existing.endsWith(incoming)) return existing;
  return incoming;
}

function mergeAppendFragment(existing: string, incoming: string): string {
  if (!incoming) return existing;
  if (!existing) return incoming;
  if (existing.endsWith(incoming)) return existing;
  if (incoming.startsWith(existing)) return incoming;
  if (existing.startsWith(incoming)) return existing;

  const incomingTrim = incoming.trim();
  if (incomingTrim && existing.includes(incomingTrim)) {
    return existing;
  }

  const maxOverlap = Math.min(existing.length, incoming.length);
  for (let size = maxOverlap; size > 0; size--) {
    if (existing.endsWith(incoming.slice(0, size))) {
      return existing + incoming.slice(size);
    }
  }

  return existing + incoming;
}

function mergeAlignmentText(existing: TranscriptMessage, incoming: string): string {
  const existingText = existing.text;
  if (!existingText) return incoming;
  if (incoming.startsWith(existingText)) return incoming;
  if (existingText.startsWith(incoming)) return existingText;
  if (
    existingText.trimEnd().endsWith(incoming.trim()) ||
    existingText.endsWith(incoming.trimEnd())
  ) {
    return existingText;
  }

  if (existing.streamKind === 'chat_part') {
    // chat_part is text-grounded and often ahead of alignment suffix slices.
    // Keep it until alignment proves it is cumulative growth or a final/correction arrives.
    return existingText;
  }

  // Alignment is more faithful than tentative for spoken text, so it may replace
  // a divergent tentative. Alignment-to-alignment divergence is treated as latest SDK state.
  return incoming;
}

/** Index of the in-progress (or same-turn finalizable) bubble for this speaker. */
export function findTranscriptMergeIndex(
  messages: TranscriptMessage[],
  update: TranscriptUpdate,
): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].type !== update.type) continue;
    const existing = messages[i];
    if (!existing.isFinal) return i;
    if (canFinalizeMergeInto(existing, update)) return i;
    return -1;
  }
  return -1;
}

/**
 * Idempotent upsert for live transcript bubbles.
 * Final SDK onMessage dumps merge into an in-progress (or same-turn) bubble
 * without creating duplicates or shrinking unrelated prior turns.
 */
export function upsertTranscriptMessage(
  messages: TranscriptMessage[],
  update: TranscriptUpdate,
): TranscriptMessage[] {
  const mergeIndex = findTranscriptMergeIndex(messages, update);

  if (update.finalizeOnly) {
    if (mergeIndex >= 0 && !messages[mergeIndex].isFinal) {
      return [
        ...messages.slice(0, mergeIndex),
        { ...messages[mergeIndex], isFinal: true },
        ...messages.slice(mergeIndex + 1),
      ];
    }
    return messages;
  }

  if (!update.text.trim() && !update.isFinal) {
    return messages;
  }

  if (mergeIndex >= 0) {
    const existing = messages[mergeIndex];
    const incoming = update.text;
    let mergedText: string;

    // Idempotent finalize for SDK onMessage dumps after tentative/alignment streaming.
    // Keep streamed text stable: do not flash empty, shrink, or re-animate from scratch.
    if (update.isFinal && update.streamKind === 'final') {
      const existingTrim = existing.text.trim();
      const incomingTrim = incoming.trim();
      if (!incomingTrim) {
        mergedText = existing.text;
      } else if (!existingTrim || existingTrim === incomingTrim) {
        mergedText = existingTrim ? existing.text : incoming;
      } else if (incomingTrim.startsWith(existingTrim)) {
        mergedText = incoming; // final extends a partial stream
      } else if (existingTrim.startsWith(incomingTrim)) {
        mergedText = existing.text; // never shrink already-streamed text
      } else {
        mergedText = incoming; // divergent final — SDK text is authoritative
      }
    } else if (update.streamKind === 'alignment') {
      // Cumulative spoken text when available; may also arrive as suffix slices.
      // Never let it shrink/wipe a chat_part bubble, but allow it to replace tentative.
      mergedText = mergeAlignmentText(existing, incoming);
    } else if (update.streamKind === 'chat_part' && update.mergeMode === 'append') {
      mergedText = mergeAppendFragment(existing.text, incoming);
    } else {
      mergedText = mergeStreamText(existing.text, incoming, update.mergeMode);
    }

    const nextIsFinal = update.isFinal || existing.isFinal;
    // Skip React state churn when finalize is a pure no-op (same text + already final).
    if (existing.text === mergedText && existing.isFinal === nextIsFinal) {
      return messages;
    }

    return [
      ...messages.slice(0, mergeIndex),
      {
        ...existing,
        text: mergedText,
        isFinal: nextIsFinal,
        streamKind: update.streamKind ?? existing.streamKind,
      },
      ...messages.slice(mergeIndex + 1),
    ];
  }

  if (!update.text.trim()) {
    return messages;
  }

  return [
    ...messages,
    {
      type: update.type,
      text: update.text,
      isFinal: update.isFinal,
      timestamp: Date.now(),
      streamKind: update.streamKind,
    },
  ];
}

function parseNestedTranscriptCandidate(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function findNestedTranscriptEvent(message: any, depth = 0): any | null {
  if (!message || typeof message !== 'object' || depth > 3) return null;

  const candidates = [
    message.event,
    message.payload,
    message.data,
    message.message,
    message.rawEvent,
    message.raw_event,
    message.clientEvent,
    message.client_event,
  ];

  for (const candidate of candidates) {
    const parsed = parseNestedTranscriptCandidate(candidate);
    if (!parsed || typeof parsed !== 'object' || parsed === message) continue;
    if (typeof (parsed as any).type === 'string') return parsed;
    const nested = findNestedTranscriptEvent(parsed, depth + 1);
    if (nested) return nested;
  }

  return null;
}

export function extractTranscriptUpdate(message: any): TranscriptUpdate | null {
  const nestedEvent = findNestedTranscriptEvent(message);
  if (nestedEvent) {
    const nestedUpdate = extractTranscriptUpdate(nestedEvent);
    if (nestedUpdate) return nestedUpdate;
  }

  if (message.type === 'user_transcript' && message.user_transcription_event) {
    return {
      type: 'student',
      text: message.user_transcription_event.user_transcript || '',
      isFinal: true,
      mergeMode: 'replace',
      streamKind: 'final',
    };
  }

  if (message.type === 'tentative_user_transcript' && message.tentative_user_transcription_event) {
    return {
      type: 'student',
      text: message.tentative_user_transcription_event.user_transcript || '',
      isFinal: false,
      mergeMode: 'replace',
      streamKind: 'tentative',
    };
  }

  if (message.type === 'internal_tentative_agent_response') {
    const tentative =
      message.tentative_agent_response_internal_event?.tentative_agent_response ||
      message.tentative_agent_response ||
      '';
    if (!tentative) return null;
    return {
      type: 'ai',
      text: tentative,
      isFinal: false,
      // Cumulative full strings from the agent — auto grows / keeps-longer; never append.
      mergeMode: 'auto',
      streamKind: 'tentative',
    };
  }

  if (message.type === 'agent_chat_response_part' && message.text_response_part) {
    const part = message.text_response_part;
    if (part.type === 'start') {
      return {
        type: 'ai',
        text: part.text || '',
        isFinal: false,
        mergeMode: 'replace',
        streamKind: 'chat_part',
      };
    }
    if (part.type === 'stop') {
      return {
        type: 'ai',
        text: part.text || '',
        isFinal: true,
        mergeMode: 'replace',
        finalizeOnly: !part.text,
        streamKind: 'final',
      };
    }
    return {
      type: 'ai',
      text: part.text || '',
      isFinal: false,
      mergeMode: 'append',
      streamKind: 'chat_part',
    };
  }

  if (message.type === 'agent_response' && message.agent_response_event) {
    return {
      type: 'ai',
      text: message.agent_response_event.agent_response || '',
      isFinal: true,
      mergeMode: 'replace',
      streamKind: 'final',
    };
  }

  if (message.type === 'agent_response_correction' && message.agent_response_correction_event) {
    return {
      type: 'ai',
      text: message.agent_response_correction_event.corrected_agent_response || '',
      isFinal: true,
      mergeMode: 'replace',
      streamKind: 'correction',
    };
  }

  const isNormalizedSdkMessage =
    message.source === 'user' ||
    message.source === 'ai' ||
    message.role === 'user' ||
    message.role === 'agent';

  const isAI =
    message.source === 'ai' ||
    message.role === 'agent' ||
    message.role === 'assistant';

  if (message.type && !isNormalizedSdkMessage) {
    return null;
  }

  const fallbackText = message.message || message.text || '';
  if (!fallbackText) return null;

  // SDK onMessage only delivers finalized user/agent turns (not streaming chunks).
  if (isNormalizedSdkMessage) {
    return {
      type: isAI ? 'ai' : 'student',
      text: fallbackText,
      isFinal: message?.isFinal ?? message?.final ?? true,
      mergeMode: 'replace',
      streamKind: 'final',
    };
  }

  return {
    type: isAI ? 'ai' : 'student',
    text: fallbackText,
    isFinal: message?.isFinal ?? message?.final ?? !isAI,
    mergeMode: isAI ? 'auto' : 'replace',
    streamKind: isAI ? 'tentative' : 'final',
  };
}

export function extractAgentChatResponsePartUpdate(part: {
  text?: string;
  type: 'start' | 'delta' | 'stop';
}): TranscriptUpdate | null {
  if (part.type === 'start') {
    return {
      type: 'ai',
      text: part.text || '',
      isFinal: false,
      mergeMode: 'replace',
      streamKind: 'chat_part',
    };
  }
  if (part.type === 'delta') {
    if (!part.text) return null;
    return {
      type: 'ai',
      text: part.text,
      isFinal: false,
      mergeMode: 'append',
      streamKind: 'chat_part',
    };
  }
  return {
    type: 'ai',
    text: part.text || '',
    isFinal: true,
    mergeMode: 'replace',
    finalizeOnly: !part.text,
    streamKind: 'final',
  };
}

export function extractAudioAlignmentUpdate(alignment: {
  chars?: string[];
}): TranscriptUpdate | null {
  const chars = alignment?.chars;
  if (!Array.isArray(chars) || chars.length === 0) return null;
  return {
    type: 'ai',
    text: chars.join(''),
    isFinal: false,
    // Alignment chars are usually cumulative spoken text, but some sessions emit
    // suffix slices. upsertTranscriptMessage applies prefix/suffix-safe merge.
    mergeMode: 'replace',
    streamKind: 'alignment',
  };
}

/**
 * SDK (@elevenlabs/client) routes `internal_tentative_agent_response` only through
 * `handleTentativeAgentResponse` → `onDebug({ type: "tentative_agent_response", response })`.
 * Those payloads are infrequent cumulative full strings (not token deltas). Client cannot
 * increase event frequency; use whichever live stream the SDK actually emits.
 */
export function extractTentativeAgentDebugUpdate(debug: {
  type?: string;
  response?: string;
}): TranscriptUpdate | null {
  if (debug?.type !== 'tentative_agent_response') return null;
  const text = typeof debug.response === 'string' ? debug.response : '';
  if (!text) return null;
  return {
    type: 'ai',
    text,
    isFinal: false,
    // Cumulative full strings — auto (prefix grow / keep-longer), never append.
    mergeMode: 'auto',
    streamKind: 'tentative',
  };
}
