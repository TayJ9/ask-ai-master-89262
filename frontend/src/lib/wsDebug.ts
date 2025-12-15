// Utilities for ElevenLabs debugging. Safe, no-op unless DEBUG flag is enabled.
const LOG_ENDPOINT = 'http://localhost:7242/ingest/8463aa58-11b8-4b43-b3fe-ab8f1de892e8';
const SESSION_ID = 'debug-session';
const RUN_ID = 'pre-fix';
const SENTINEL = 'SENTINEL_PHRASE_9Q3K';

const isBrowser = typeof window !== 'undefined';

const getDebugFlag = (): boolean => {
  const envFlag =
    process.env.NEXT_PUBLIC_DEBUG_ELEVEN === 'true' ||
    process.env.DEBUG_ELEVEN === 'true';
  if (!isBrowser) return envFlag;
  try {
    const localFlag = localStorage.getItem('DEBUG_ELEVEN') === 'true';
    const globalFlag = (window as any).__DEBUG_ELEVEN__ === true;
    return envFlag || localFlag || globalFlag;
  } catch {
    return envFlag;
  }
};

export const shouldDebugEleven = (): boolean => getDebugFlag();

export const redact = (value: any, depth = 0): any => {
  if (depth > 4) return '<redacted depth>';
  if (typeof value === 'string') {
    return value.length > 200 ? `<redacted len=${value.length}>` : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, redact(v, depth + 1)])
    );
  }
  return value;
};

type DebugLogPayload = {
  hypothesisId: string;
  location: string;
  message: string;
  data?: Record<string, any>;
};

export const debugLog = ({ hypothesisId, location, message, data }: DebugLogPayload) => {
  if (!shouldDebugEleven() || typeof fetch === 'undefined') return;
  // #region agent log
  fetch(LOG_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: SESSION_ID,
      runId: RUN_ID,
      hypothesisId,
      location,
      message,
      data: redact(data),
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
};

type ParsedPayload = {
  type: string;
  keys: string[];
  size: number | null;
  hasDynamicVars: boolean;
  hasOverrides: boolean;
};

const summarizePayload = (data: any): ParsedPayload => {
  let text: string | null = null;
  if (typeof data === 'string') {
    text = data;
  } else if (data instanceof ArrayBuffer) {
    text = new TextDecoder().decode(data);
  } else if (typeof Blob !== 'undefined' && data instanceof Blob) {
    // Blob to string not supported sync; log size only
    return {
      type: 'blob',
      keys: [],
      size: data.size,
      hasDynamicVars: false,
      hasOverrides: false,
    };
  }

  const size = text ? new TextEncoder().encode(text).length : null;
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  const type = parsed?.type || 'unknown';
  const keys = parsed && typeof parsed === 'object' ? Object.keys(parsed) : [];
  const hasDynamicVars =
    !!parsed?.dynamic_variables ||
    !!parsed?.dynamicVariables ||
    !!parsed?.conversation_initiation_client_data?.dynamic_variables;
  const hasOverrides =
    !!parsed?.overrides || !!parsed?.conversation_initiation_client_data?.overrides;

  return { type, keys, size, hasDynamicVars, hasOverrides };
};

let wsPatched = false;

export const initElevenWsDebug = () => {
  if (!isBrowser || wsPatched || !shouldDebugEleven()) return;
  const OriginalWebSocket = window.WebSocket;

  class DebugWebSocket extends OriginalWebSocket {
    private isElevenLabs: boolean;
    private outboundCount = 0;
    private inboundCount = 0;
    private sawConversationInit = false;
    private sentFirstOutboundLog = false;
    private sentFirstInboundLog = false;

    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols as any);
      this.isElevenLabs =
        typeof url === 'string' &&
        url.includes('api.elevenlabs.io/v1/convai/conversation');

      if (this.isElevenLabs && shouldDebugEleven()) {
        console.log('[ELEVEN DEBUG] WebSocket opened', url);
        debugLog({
          hypothesisId: 'H2',
          location: 'wsDebug.ts:constructor',
          message: 'ws_open',
          data: { url: typeof url === 'string' ? url : url.toString() },
        });

        this.addEventListener('message', (event) => {
          if (!shouldDebugEleven()) return;
          const summary = summarizePayload(event.data);
          this.inboundCount += 1;
          if (this.inboundCount <= 5) {
            console.log('[ELEVEN DEBUG][WS inbound]', {
              idx: this.inboundCount,
              ...summary,
            });
          }

          if (!this.sentFirstInboundLog) {
            this.sentFirstInboundLog = true;
            debugLog({
              hypothesisId: 'H2',
              location: 'wsDebug.ts:message',
              message: 'ws_inbound_first',
              data: { idx: this.inboundCount, ...summary },
            });
          }
        });
      }
    }

    send(data: any): void {
      if (this.isElevenLabs && shouldDebugEleven()) {
        const summary = summarizePayload(data);
        this.outboundCount += 1;

        if (summary.type === 'conversation_initiation_client_data') {
          this.sawConversationInit = true;
        }

        if (this.outboundCount <= 5) {
          console.log('[ELEVEN DEBUG][WS outbound]', {
            idx: this.outboundCount,
            ...summary,
          });
        }

        if (!this.sentFirstOutboundLog) {
          this.sentFirstOutboundLog = true;
          debugLog({
            hypothesisId: 'H2',
            location: 'wsDebug.ts:send',
            message: 'ws_outbound_first',
            data: { idx: this.outboundCount, ...summary },
          });
        }

        if (this.outboundCount === 5 && !this.sawConversationInit) {
          console.warn('[ELEVEN DEBUG] No conversation_initiation_client_data being sent');
          debugLog({
            hypothesisId: 'H2',
            location: 'wsDebug.ts:send',
            message: 'no_conversation_initiation_after_5',
            data: { outboundCount: this.outboundCount },
          });
        }
      }

      super.send(data);
    }
  }

  window.WebSocket = DebugWebSocket as any;
  wsPatched = true;
};

export const elevenDebugConstants = {
  SENTINEL,
};

