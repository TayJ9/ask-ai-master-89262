import type { IncomingHttpHeaders } from "http";

const UNRESOLVED_TEMPLATE_RE = /^\{\{.*\}\}$/;

/** Read x-api-secret with common ElevenLabs header aliases. */
export function readElevenLabsApiSecret(headers: IncomingHttpHeaders): string | undefined {
  const raw =
    headers["x-api-secret"] ??
    headers["x-apisecret"] ??
    headers["xapisecret"];
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === "string" && raw[0].trim()) return raw[0].trim();
  return undefined;
}

/**
 * ElevenLabs webhook tools POST an envelope:
 * { tool_call_id, tool_name, parameters: { ...schema fields }, conversation_id }
 * Flat bodies from manual tests / older configs are also supported.
 */
export function normalizeElevenLabsToolBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }
  const record = body as Record<string, unknown>;
  const parameters = record.parameters;
  if (parameters && typeof parameters === "object" && !Array.isArray(parameters)) {
    return { ...record, ...(parameters as Record<string, unknown>) };
  }
  return record;
}

function readStringField(body: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const raw = body[key];
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed || UNRESOLVED_TEMPLATE_RE.test(trimmed)) continue;
    return trimmed;
  }
  return undefined;
}

export function readElevenLabsToolInterviewId(body: Record<string, unknown> | undefined): string | undefined {
  if (!body) return undefined;
  return readStringField(body, "interviewid", "interview_id");
}

export function readElevenLabsToolCandidateId(body: Record<string, unknown> | undefined): string | undefined {
  if (!body) return undefined;
  return readStringField(body, "candidateid", "candidate_id");
}

export function readElevenLabsToolConversationId(body: Record<string, unknown> | undefined): string | undefined {
  if (!body) return undefined;
  return readStringField(body, "conversationid", "conversation_id");
}

export function summarizeElevenLabsToolBody(body: unknown): Record<string, unknown> {
  const normalized = normalizeElevenLabsToolBody(body);
  return {
    tool_name: typeof normalized.tool_name === "string" ? normalized.tool_name : undefined,
    tool_call_id: typeof normalized.tool_call_id === "string" ? normalized.tool_call_id : undefined,
    has_parameters: Boolean(body && typeof body === "object" && "parameters" in (body as object)),
    interviewId: readElevenLabsToolInterviewId(normalized),
    conversationId: readElevenLabsToolConversationId(normalized),
  };
}
