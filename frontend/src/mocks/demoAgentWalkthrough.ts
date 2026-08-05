/**
 * Mock data for the /demo/agent walkthrough — no live ElevenLabs API.
 * Uses the tech resume profile from demoResumes.ts.
 */

import { demoResumes } from "@/mocks/demoResumes";

const techProfile = demoResumes.find((r) => r.id === "tech")!;

export const DEMO_AGENT_DYNAMIC_VARS = {
  first_name: techProfile.name.split(" ")[0],
  major: techProfile.major,
  year: techProfile.year,
  resume_summary: techProfile.resumeSummary,
  resume_highlights: techProfile.highlights.join(" · "),
  technical_difficulty: "advanced",
  technical_depth: "deep",
  behavioral_ratio: "40",
  interviewid: "demo-interview-7f3a2b1c",
} as const;

export const DEMO_AGENT_GET_RESUME_PROFILE = {
  tool: "GetResumeProfile",
  method: "POST",
  endpoint: "/api/get-resume-profile",
  requestBody: { interviewid: DEMO_AGENT_DYNAMIC_VARS.interviewid },
  response: {
    found: true,
    profile: {
      name: techProfile.name,
      major: techProfile.major,
      year: techProfile.year,
      skills: ["React", "TypeScript", "Node.js", "PostgreSQL", "AWS", "Docker"],
      projects: [
        "E-commerce platform with JWT auth, Stripe payments, and AWS deployment",
        "Academic database with role-based access control",
        "Campus navigation app — hackathon Best UX winner",
      ],
      experience: [
        "Software Development Intern at TechCorp — 35% API response time improvement",
        "Teaching Assistant for Intro to Programming (120+ students)",
      ],
      education: "B.S. Computer Science, State University — GPA 3.8, graduating May 2025",
    },
  },
} as const;

export const DEMO_AGENT_FIRST_MESSAGE =
  `Hi ${DEMO_AGENT_DYNAMIC_VARS.first_name}! I see you're studying ${DEMO_AGENT_DYNAMIC_VARS.major}. ` +
  "I've looked at your resume — let's start with a question about your TechCorp internship.";

export const DEMO_AGENT_LISTENING_CAPTION =
  "Your turn — just speak naturally. The AI waits until you finish, then responds.";

/** Plain-language caption for step 3 (user-facing). */
export const DEMO_AGENT_LISTENING_SIMPLE =
  "When you're done answering, the AI picks up and asks the next question — no buttons to press.";

/** Technical note shown in collapsed section on step 3. */
export const DEMO_AGENT_LISTENING_TECHNICAL =
  "Server-side voice activity detection (VAD) on ElevenLabs detects silence and end-of-turn, then triggers the agent's reply.";

export const DEMO_WALKTHROUGH_STEPS = [
  {
    id: "info-in",
    label: "Your info goes in",
    summary:
      "When you start an interview, Mockly sends your name, major, and resume highlights to the AI interviewer.",
  },
  {
    id: "questions",
    label: "The AI asks you questions",
    summary:
      "The AI reads your resume, then asks personalized questions out loud — like a real mock interview.",
  },
  {
    id: "listening",
    label: "You answer out loud",
    summary: DEMO_AGENT_LISTENING_SIMPLE,
  },
] as const;

export type DemoWalkthroughStepId = (typeof DEMO_WALKTHROUGH_STEPS)[number]["id"];
