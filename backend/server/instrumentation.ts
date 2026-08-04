/**
 * Arize OpenInference tracing for the Mockly scoring pipeline.
 *
 * Auto-instruments OpenAI chat.completions calls (gpt-4o-mini) and exports
 * spans to Arize AX via OTLP. Enable by setting ARIZE_SPACE_ID and ARIZE_API_KEY.
 */

import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { trace, type Tracer } from "@opentelemetry/api";
import { BatchSpanProcessor, type SpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { SEMRESATTRS_PROJECT_NAME } from "@arizeai/openinference-semantic-conventions";
import { OpenAIInstrumentation } from "@arizeai/openinference-instrumentation-openai";
import dotenv from "dotenv";
import OpenAI from "openai";

const DEFAULT_ARIZE_OTLP_URL = "https://otlp.arize.com/v1/traces";
const SCORING_TRACER_NAME = "mockly.scoring";

let initialized = false;
let provider: NodeTracerProvider | null = null;

function isTracingConfigured(): boolean {
  return Boolean(process.env.ARIZE_SPACE_ID?.trim() && process.env.ARIZE_API_KEY?.trim());
}

/**
 * Initialize Arize tracing. Safe to call multiple times; only runs once.
 * Returns true when tracing is active.
 */
export function initArizeTracing(): boolean {
  if (initialized) {
    return isTracingConfigured();
  }
  initialized = true;

  // Ensure .env is loaded when init runs before dotenv in some entry points (e.g. scripts).
  dotenv.config();

  if (!isTracingConfigured()) {
    console.log("[ARIZE] Tracing disabled — set ARIZE_SPACE_ID and ARIZE_API_KEY to export scoring traces");
    return false;
  }

  const projectName = process.env.ARIZE_PROJECT_NAME?.trim() || "mockly-scoring";
  const otlpUrl = process.env.ARIZE_OTLP_URL?.trim() || DEFAULT_ARIZE_OTLP_URL;

  const exporter = new OTLPTraceExporter({
    url: otlpUrl,
    headers: {
      "arize-space-id": process.env.ARIZE_SPACE_ID!.trim(),
      "arize-api-key": process.env.ARIZE_API_KEY!.trim(),
    },
  });

  const spanProcessors: SpanProcessor[] = [new BatchSpanProcessor(exporter)];

  provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [SEMRESATTRS_PROJECT_NAME]: projectName,
      "service.name": "mockly-backend",
      "service.namespace": "scoring",
    }),
    spanProcessors,
  });

  const openAiInstrumentation = new OpenAIInstrumentation();
  openAiInstrumentation.manuallyInstrument(OpenAI);

  registerInstrumentations({
    instrumentations: [openAiInstrumentation],
    tracerProvider: provider,
  });

  provider.register();

  const shutdown = async () => {
    try {
      await provider?.shutdown();
      console.log("[ARIZE] Tracing provider shut down");
    } catch (error) {
      console.error("[ARIZE] Error shutting down tracing provider:", error);
    }
  };

  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  process.once("beforeExit", shutdown);

  console.log(`[ARIZE] Scoring tracing enabled — project="${projectName}" endpoint="${otlpUrl}"`);
  return true;
}

/** Tracer for manual scoring-pipeline spans (evaluation queue, post-processing). */
export function getScoringTracer(): Tracer {
  return trace.getTracer(SCORING_TRACER_NAME);
}

export function isScoringTracingEnabled(): boolean {
  return isTracingConfigured();
}
