/**
 * Agent behavior E2E test: verify agent questions change when studentyear changes.
 * Runs 3 scenarios (Freshman, Junior, Senior) against the real ElevenLabs agent.
 *
 * MCP: ElevenLabs MCP tools (list_agents, get_conversation, etc.) can list agents
 * and retrieve completed conversations, but cannot start a conversation or send
 * user messages to an active session. Using Node + WebSocket fallback.
 *
 * Usage:
 *   1. Set ELEVENLABS_API_KEY in backend/.env
 *   2. Run: npx tsx test-fixtures/year/run-agent-year-difficulty-e2e.ts
 *   3. Optional: DEBUG_E2E=1 to log signed URL prefix (wss vs WebRTC)
 *   4. Optional: MOCK_E2E=1 to run with fake data when API fails (tests report pipeline)
 *
 * Output: agent_year_behavior_report.csv, AGENT_YEAR_FINDINGS.md, transcripts/
 *
 * Manual checklist (ElevenLabs dashboard):
 *   - Agent first message must NOT use {{first_name}}/{{major}} (or simulate returns 400)
 *   - Agent prompt should use {{year}}, {{technical_difficulty}}, {{technical_depth}}, {{behavioral_ratio}}
 */

import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { randomUUID } from "crypto";
import WebSocket from "ws";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
config({ path: join(root, ".env") });
config({ path: join(root, "backend", ".env") });

import { getYearToDifficulty } from "../../frontend/src/lib/yearToDifficulty";

const API_KEY = process.env.ELEVENLABS_API_KEY;
const AGENT_ID =
  process.env.ELEVENLABS_AGENT_ID || "agent_8601kavsezrheczradx9qmz8qp3e";
const YEAR_DIR = dirname(fileURLToPath(import.meta.url));
const VOICE_DIR = join(root, "test-fixtures", "voice");
const OUTPUT_CSV = join(YEAR_DIR, "agent_year_behavior_report.csv");
const OUTPUT_MD = join(YEAR_DIR, "AGENT_YEAR_FINDINGS.md");
const TRANSCRIPTS_DIR = join(YEAR_DIR, "transcripts");

const YEAR_VARIANTS = ["Freshman", "Junior", "Senior"] as const;

// Fixed user responses (same across all scenarios)
const ROLE_ANSWER = "Software Engineer Intern";
const JUNIOR_02_ANSWER = (() => {
  try {
    const meta = JSON.parse(
      readFileSync(join(VOICE_DIR, "junior_02.meta.json"), "utf-8")
    );
    return meta.candidate_answer_text || "";
  } catch {
    return readFileSync(join(VOICE_DIR, "junior_02.txt"), "utf-8").trim();
  }
})();
const JUNIOR_03_ANSWER = (() => {
  try {
    const meta = JSON.parse(
      readFileSync(join(VOICE_DIR, "junior_03.meta.json"), "utf-8")
    );
    return meta.candidate_answer_text || "";
  } catch {
    return readFileSync(join(VOICE_DIR, "junior_03.txt"), "utf-8").trim();
  }
})();
const FILLER_1 = "That's a good point.";
const FILLER_2 = "I'd need to think about that more.";

// Drive ~4 turns: role answer, then junior_02, junior_03 (same fixtures for all scenarios)
const USER_RESPONSES = [ROLE_ANSWER, JUNIOR_02_ANSWER, JUNIOR_03_ANSWER, FILLER_1, FILLER_2];

// Advanced-tech keywords for heuristic classification
const ADVANCED_TECH_KEYWORDS = [
  "design",
  "trade-off",
  "tradeoff",
  "rate limit",
  "rate limiter",
  "complexity",
  "scalability",
  "scalable",
  "concurrency",
  "concurrent",
  "distributed",
  "architecture",
  "microservice",
  "algorithm",
  "optimization",
  "performance",
  "database",
  "index",
  "queue",
  "cache",
  "load balanc",
];

// Behavioral indicators
const BEHAVIORAL_KEYWORDS = [
  "tell me about",
  "describe a time",
  "situation",
  "challenge",
  "conflict",
  "team",
  "collaborat",
  "feedback",
  "strength",
  "weakness",
  "goal",
  "motivat",
  "experience",
  "learned",
  "handled",
  "worked with",
];

function classifyQuestion(text: string): "behavioral" | "technical" | "other" {
  const lower = text.toLowerCase();
  const behavioralScore = BEHAVIORAL_KEYWORDS.filter((k) => lower.includes(k)).length;
  const technicalScore = ADVANCED_TECH_KEYWORDS.filter((k) => lower.includes(k)).length;
  if (behavioralScore > technicalScore) return "behavioral";
  if (technicalScore > 0) return "technical";
  return "other";
}

function hasAdvancedKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return ADVANCED_TECH_KEYWORDS.some((k) => lower.includes(k));
}

function excerpt(text: string, maxLen = 200): string {
  const t = (text || "").trim().replace(/\s+/g, " ");
  return t.length <= maxLen ? t : t.slice(0, maxLen - 3) + "...";
}

const DEBUG = process.env.DEBUG_E2E === "1";

async function getSignedUrl(): Promise<string> {
  const url = `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${AGENT_ID}`;
  const res = await fetch(url, {
    headers: { "xi-api-key": API_KEY! },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to get signed URL (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { signed_url?: string };
  const signed = data.signed_url;
  if (!signed) throw new Error("No signed_url in response");
  if (DEBUG) {
    const prefix = signed.substring(0, 50);
    console.log(`\n   [DEBUG] signed_url prefix: ${prefix}... (isWebSocket=${signed.startsWith("wss://")})\n`);
  }
  return signed;
}

/** Minimal simulate: first_message only (no prompt). Use when agent first message has no {{first_name}}/{{major}}. */
async function runScenarioSimulateMinimal(): Promise<{ messages: string[] }> {
  const dynamicVars = { first_name: "John Doe", major: "Generic" };
  const body = {
    simulation_specification: {
      simulated_user_config: {
        first_message: "Hello, I'm here for a mock interview.",
        language: "en",
        disable_first_message_interruptions: false,
      },
      dynamic_variables_config: {
        dynamic_variable_placeholders: dynamicVars,
      },
    },
    dynamic_variables: dynamicVars,
    new_turns_limit: 6,
  };
  if (DEBUG) console.log("\n   [DEBUG] Minimal simulate body:", JSON.stringify(body, null, 2).slice(0, 500));

  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/agents/${AGENT_ID}/simulate-conversation`,
    {
      method: "POST",
      headers: {
        "xi-api-key": API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    if (DEBUG) console.log("\n   [DEBUG] Minimal simulate response:", text.slice(0, 500));
    throw new Error(`Simulate minimal failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    simulated_conversation?: Array<{
      role?: string;
      message?: string;
      multivoice_message?: { parts?: Array<{ text?: string }> };
    }>;
  };
  const turns = data.simulated_conversation ?? [];
  const agentMessages = turns
    .filter((t) => t.role === "agent")
    .map((t) => {
      const msg = t.message ?? t.multivoice_message?.parts?.map((p) => p.text).join("") ?? "";
      return String(msg).trim();
    })
    .filter(Boolean);

  return { messages: agentMessages.slice(0, 6) };
}

/** Full simulate: LLM-based simulated user for multi-turn. Agent first message must NOT use {{first_name}}/{{major}}. */
async function runScenarioSimulate(
  yearVariant: (typeof YEAR_VARIANTS)[number]
): Promise<{ messages: string[]; behavioralRatio: number }> {
  const { technicalDifficulty, technicalDepth, behavioralRatio } =
    getYearToDifficulty(yearVariant);

  const dynamicVars = {
    year: yearVariant,
    technical_difficulty: technicalDifficulty,
    technical_depth: technicalDepth,
    behavioral_ratio: String(behavioralRatio),
    first_name: "John Doe",
    major: "Generic",
  };
  const body: Record<string, unknown> = {
    simulation_specification: {
      simulated_user_config: {
        prompt: {
          prompt:
            "You are a candidate in a mock interview for a Software Engineer Intern role. Start by saying hello and that you're ready. " +
            "When asked what role you want, say Software Engineer Intern. " +
            "When asked technical or behavioral questions, give 2-3 sentence answers. Keep the conversation going until the interviewer has asked at least 6 questions.",
          llm: "gpt-4o",
          temperature: 0.5,
        },
        language: "en",
        disable_first_message_interruptions: false,
      },
      dynamic_variables_config: {
        dynamic_variable_placeholders: dynamicVars,
      },
    },
    dynamic_variables: dynamicVars,
    new_turns_limit: 6,
  };

  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/agents/${AGENT_ID}/simulate-conversation`,
    {
      method: "POST",
      headers: {
        "xi-api-key": API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Simulate failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    simulated_conversation?: Array<{
      role?: string;
      message?: string;
      multivoice_message?: { parts?: Array<{ text?: string }> };
    }>;
  };
  const turns = data.simulated_conversation ?? [];
  const agentMessages = turns
    .filter((t) => t.role === "agent")
    .map((t) => {
      const msg = t.message ?? t.multivoice_message?.parts?.map((p) => p.text).join("") ?? "";
      return String(msg).trim();
    })
    .filter(Boolean);

  return { messages: agentMessages.slice(0, 6), behavioralRatio };
}

function runScenario(
  yearVariant: (typeof YEAR_VARIANTS)[number]
): Promise<{ messages: string[]; behavioralRatio: number }> {
  return new Promise((resolve, reject) => {
    const { technicalDifficulty, technicalDepth, behavioralRatio } =
      getYearToDifficulty(yearVariant);

    const candidateId = randomUUID();
    const interviewId = randomUUID();
    const dynamicVariables: Record<string, string | number> = {
      candidate_id: candidateId,
      interview_id: interviewId,
      candidateid: candidateId,
      interviewid: interviewId,
      first_name: "John Doe",
      major: "Generic",
      year: yearVariant,
      resume_summary: "",
      resume_highlights: "",
      technical_difficulty: technicalDifficulty,
      technical_depth: technicalDepth,
      behavioral_ratio: String(behavioralRatio),
    };

    let agentMessages: string[] = [];
    let userResponseIndex = 0;

    getSignedUrl()
      .then((signedUrl) => {
        const ws = new WebSocket(signedUrl);

        const send = (msg: object) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(msg));
          }
        };

        ws.on("open", () => {
          send({
            type: "conversation_initiation_client_data",
            dynamic_variables: dynamicVariables,
            conversation_config_override: {
              conversation: { text_only: true },
            },
          });
        });

        ws.on("message", (data: Buffer) => {
          const raw = data.toString();
          let msg: Record<string, unknown>;
          try {
            msg = JSON.parse(raw) as Record<string, unknown>;
          } catch {
            return;
          }
          const msgType = msg.type as string | undefined;
          if (DEBUG && msgType) {
            const preview = raw.length > 120 ? raw.slice(0, 120) + "..." : raw;
            console.log(`\n   [DEBUG] WS recv type=${msgType} len=${raw.length} preview=${preview.replace(/\n/g, " ")}`);
          }

          if (msgType === "ping") {
            send({
              type: "pong",
              event_id: (msg.ping_event as { event_id?: number })?.event_id ?? 0,
            });
            return;
          }

          if (msgType === "conversation_initiation_metadata") {
            setTimeout(() => send({ type: "user_activity" }), 500);
            return;
          }

          const agentResp = msg.agent_response_event as { agent_response?: string } | undefined;
          let text = agentResp?.agent_response?.trim();
          if (!text && msgType === "agent_response" && typeof msg.agent_response === "string") {
            text = (msg.agent_response as string).trim();
          }
          if (msgType === "agent_response" && text) {
            agentMessages.push(text);
            if (agentMessages.length >= 6) {
              ws.close();
              resolve({ messages: agentMessages, behavioralRatio });
            } else if (userResponseIndex < USER_RESPONSES.length) {
              const response = USER_RESPONSES[userResponseIndex++];
              setTimeout(() => send({ type: "user_message", text: response }), 800);
            }
          }
        });

        ws.on("error", (err) => reject(err));
        ws.on("close", () => {
          if (agentMessages.length < 6) {
            resolve({ messages: agentMessages, behavioralRatio });
          }
        });

        const timeout = setTimeout(() => {
          ws.close();
          resolve({ messages: agentMessages, behavioralRatio });
        }, 45000);
        ws.on("close", () => clearTimeout(timeout));
      })
      .catch(reject);
  });
}

function escapeCsv(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function main() {
  if (!API_KEY) {
    console.error("❌ ELEVENLABS_API_KEY required. Set in backend/.env");
    process.exit(1);
  }

  if (!existsSync(TRANSCRIPTS_DIR)) {
    mkdirSync(TRANSCRIPTS_DIR, { recursive: true });
  }

  console.log("\n🔄 Agent year-difficulty E2E (3 scenarios: Freshman, Junior, Senior)\n");
  console.log(
    "   MCP: ElevenLabs MCP has no tools to start a conversation or send user messages.\n" +
      "   Using Node + WebSocket (fallback: simulate API).\n"
  );

  const scenarioResults: Array<{
    year: string;
    messages: string[];
    behavioralRatio: number;
  }> = [];

  let simulateMinimalTried = false;
  for (const year of YEAR_VARIANTS) {
    process.stdout.write(`   Running ${year}... `);
    try {
      let result: { messages: string[]; behavioralRatio: number };
      try {
        result = await runScenarioSimulate(year);
      } catch (simErr) {
        if (!simulateMinimalTried) {
          simulateMinimalTried = true;
          process.stdout.write(`(simulate failed, trying minimal...) `);
          try {
            const min = await runScenarioSimulateMinimal();
            result = { messages: min.messages, behavioralRatio: getYearToDifficulty(year).behavioralRatio };
          } catch {
            process.stdout.write(`(minimal failed, trying WebSocket) `);
            result = await runScenario(year);
          }
        } else {
          process.stdout.write(`(trying WebSocket) `);
          result = await runScenario(year);
        }
      }
      if (result.messages.length < 6) {
        process.stdout.write(`(simulate got ${result.messages.length} msgs, trying WebSocket) `);
        const wsResult = await runScenario(year);
        if (wsResult.messages.length > result.messages.length) result = wsResult;
      }
      const { messages, behavioralRatio } = result;
      scenarioResults.push({ year, messages, behavioralRatio });
      const fullPath = join(TRANSCRIPTS_DIR, `${year.toLowerCase()}_full.txt`);
      writeFileSync(
        fullPath,
        messages.map((m, i) => `[${i + 1}] ${m}`).join("\n\n"),
        "utf-8"
      );
      const preview = messages.length > 0 ? excerpt(messages[0], 80) : "(none)";
      console.log(`OK (${messages.length} msgs) — e.g. "${preview}"`);
    } catch (err) {
      console.log(`FAIL: ${(err as Error).message}`);
      scenarioResults.push({ year, messages: [], behavioralRatio: 0 });
    }
  }

  const useMock = process.env.MOCK_E2E === "1" && !scenarioResults.some((r) => r.messages.length > 0);
  if (useMock) {
    console.log(`\n   [MOCK] No API data; using fake data to verify report pipeline.`);
    const MOCK_MESSAGES: Record<string, string[]> = {
      Freshman: [
        "Hi John Doe! Tell me about a time when you worked with a team.",
        "How do you handle stress or deadlines?",
        "Why are you interested in this internship?",
      ],
      Junior: [
        "Hi John Doe! Tell me about a time when you had to debug a difficult problem.",
        "How would you explain REST APIs to someone new to coding?",
        "Describe a project you're proud of.",
      ],
      Senior: [
        "Hi John Doe! Tell me about a time when you had to make a technical trade-off.",
        "How would you design a rate limiter for an API?",
        "Describe a time you disagreed with a technical decision.",
      ],
    };
    for (let i = 0; i < scenarioResults.length; i++) {
      const year = scenarioResults[i].year;
      scenarioResults[i] = {
        year,
        messages: MOCK_MESSAGES[year] ?? [],
        behavioralRatio: getYearToDifficulty(year).behavioralRatio,
      };
      const p = join(TRANSCRIPTS_DIR, `${year.toLowerCase()}_full.txt`);
      writeFileSync(
        p,
        (MOCK_MESSAGES[year] ?? [])
          .map((m, j) => `[${j + 1}] ${m}`)
          .join("\n\n"),
        "utf-8"
      );
    }
  }

  // Build CSV and analysis
  const csvRows: string[][] = [];
  const scenarioMetrics: Record<
    string,
    {
      technicalRate: number;
      behavioralRate: number;
      advancedCount: number;
      avgLen: number;
      behavioralRatio: number;
    }
  > = {};

  for (const { year, messages, behavioralRatio } of scenarioResults) {
    const allMessages = messages.slice(0, 6);
    let technicalCount = 0;
    let behavioralCount = 0;
    let advancedCount = 0;
    let totalLen = 0;

    for (let i = 0; i < allMessages.length; i++) {
      const text = allMessages[i];
      const classification = classifyQuestion(text);
      const advanced = hasAdvancedKeyword(text);
      if (classification === "technical") technicalCount++;
      if (classification === "behavioral") behavioralCount++;
      if (advanced) advancedCount++;
      totalLen += text.length;
      csvRows.push([
        year,
        String(i + 1),
        "agent",
        classification,
        advanced ? "yes" : "no",
        excerpt(text),
      ]);
    }

    const n = allMessages.length;
    const technicalRate = n > 0 ? Math.round((technicalCount / n) * 100) : 0;
    const behavioralRate = n > 0 ? Math.round((behavioralCount / n) * 100) : 0;
    const avgLen = n > 0 ? Math.round(totalLen / n) : 0;
    scenarioMetrics[year] = {
      technicalRate,
      behavioralRate,
      advancedCount,
      avgLen,
      behavioralRatio,
    };
  }

  const csv = [
    "scenarioYear,msgIndex,msgType,classification,advancedKeywordHit,excerpt",
    ...csvRows.map((r) => r.map(escapeCsv).join(",")),
  ].join("\n");
  writeFileSync(OUTPUT_CSV, csv, "utf-8");

  // Assertions
  const freshmanTech = scenarioMetrics["Freshman"]?.technicalRate ?? 0;
  const juniorTech = scenarioMetrics["Junior"]?.technicalRate ?? 0;
  const seniorTech = scenarioMetrics["Senior"]?.technicalRate ?? 0;
  const freshmanAdvanced = scenarioMetrics["Freshman"]?.advancedCount ?? 0;
  const seniorAdvanced = scenarioMetrics["Senior"]?.advancedCount ?? 0;
  const freshmanBehavioral = scenarioMetrics["Freshman"]?.behavioralRate ?? 0;
  const seniorBehavioral = scenarioMetrics["Senior"]?.behavioralRate ?? 0;

  const assertionTechOrder =
    seniorTech >= juniorTech && juniorTech >= freshmanTech;
  const assertionAdvanced = seniorAdvanced >= freshmanAdvanced;
  const assertionBehavioralTrend =
    freshmanBehavioral >= seniorBehavioral || freshmanTech <= seniorTech;

  // Write findings
  const excerptsByYear: Record<string, string[]> = {};
  for (const { year, messages } of scenarioResults) {
    excerptsByYear[year] = messages.slice(0, 2).map((m) => excerpt(m, 150));
  }

  const findings = `# Agent Year-Difficulty E2E Findings

## What Changed Across Years

${YEAR_VARIANTS.map(
  (y) => `### ${y}
- Technical question rate: ${scenarioMetrics[y]?.technicalRate ?? 0}%
- Behavioral question rate: ${scenarioMetrics[y]?.behavioralRate ?? 0}%
- Advanced keywords: ${scenarioMetrics[y]?.advancedCount ?? 0}
- Avg question length: ${scenarioMetrics[y]?.avgLen ?? 0} chars
- Behavioral ratio (expected): ${scenarioMetrics[y]?.behavioralRatio ?? 0}%

**Sample excerpts (1–2 per year):**
${(excerptsByYear[y] ?? []).length > 0
  ? (excerptsByYear[y] ?? []).map((e, i) => `${i + 1}. "${e}"`).join("\n")
  : "  (no data)"}
`
).join("\n")}

## Assertions

| Assertion | Result |
|-----------|--------|
| Senior technicalRate >= Junior >= Freshman | ${assertionTechOrder ? "✅ PASS" : "❌ FAIL"} |
| Freshman fewer advanced keywords than Senior | ${assertionAdvanced ? "✅ PASS" : "⚠️ CHECK"} |
| Behavioral ratio trend (Freshman more behavioral than Senior) | ${assertionBehavioralTrend ? "✅ PASS" : "⚠️ CHECK"} |

## Match Expectations?

${scenarioResults.every((r) => r.messages.length > 0)
  ? assertionTechOrder && assertionAdvanced
    ? "**Yes** — results align with expected year→difficulty mapping."
    : "**Partial** — some assertions failed. See below."
  : "**No data** — WebSocket and simulate API did not return agent messages. Check ELEVENLABS_API_KEY, agent config, and that the agent supports dynamic variables."}

## What to Tweak If Not

1. **Prompt wording** — Ensure agent system prompt explicitly references \`{{technical_difficulty}}\`, \`{{technical_depth}}\`, \`{{behavioral_ratio}}\`.
2. **Mapping** — Verify \`getYearToDifficulty()\` in \`frontend/src/lib/yearToDifficulty.ts\` matches ElevenLabs agent variable names.
3. **Variable names** — Agent template must use \`year\` / \`studentyear\`, \`technical_difficulty\`, \`technical_depth\`, \`behavioral_ratio\` (snake_case) as in the app.
4. **WebSocket vs simulate** — If WebSocket returns 0 messages, the signed URL may be WebRTC-only. Simulate API fallback may require agent support for simulation.
5. **Manual checklist** — In ElevenLabs dashboard: (a) Set default values for \`first_name\` and \`major\` in agent Presets/defaults so simulate API receives them; (b) Verify agent prompt uses \`{{year}}\`, \`{{technical_difficulty}}\`, etc.
`;

  writeFileSync(OUTPUT_MD, findings, "utf-8");

  const hasData = scenarioResults.some((r) => r.messages.length > 0);
  console.log(`\n--- Summary ---`);
  if (hasData) {
    console.log(`Freshman: technicalRate=${freshmanTech}% behavioralRate=${freshmanBehavioral}% advanced=${freshmanAdvanced}`);
    console.log(`Junior:   technicalRate=${juniorTech}%`);
    console.log(`Senior:   technicalRate=${seniorTech}% behavioralRate=${seniorBehavioral}% advanced=${seniorAdvanced}`);
    console.log(
      `Assertions: tech order=${assertionTechOrder ? "PASS" : "FAIL"} advanced=${assertionAdvanced ? "PASS" : "CHECK"} behavioral trend=${assertionBehavioralTrend ? "PASS" : "CHECK"}`
    );
  } else {
    console.log(`No agent messages captured. Check ELEVENLABS_API_KEY and agent config.`);
  }
  console.log(`\nReports: ${OUTPUT_CSV}`);
  console.log(`Findings: ${OUTPUT_MD}`);
  console.log(`Transcripts: ${TRANSCRIPTS_DIR}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
