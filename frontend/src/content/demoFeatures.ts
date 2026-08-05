/**
 * Feature highlights for the /demo hub "How it works" grid.
 * Icons are lucide-react component names resolved at render time.
 */

export type DemoFeatureIcon = "Mic" | "FileText" | "BarChart3" | "Bot";

export interface DemoFeature {
  icon: DemoFeatureIcon;
  title: string;
  blurb: string;
  /** Optional path for a "See it" link (passed through buildDemoHref). */
  demoPath?: string;
}

export const DEMO_FEATURES: DemoFeature[] = [
  {
    icon: "Mic",
    title: "Practice out loud",
    blurb: "Talk through your answers like a real interview — no typing required.",
    demoPath: "/interview-preview",
  },
  {
    icon: "FileText",
    title: "Questions from your resume",
    blurb: "The AI uses your skills and experience to ask follow-ups that fit you.",
    demoPath: "/demo/resume-questions",
  },
  {
    icon: "BarChart3",
    title: "Feedback after each session",
    blurb: "Get STAR-style scores and coaching tips so you know what to improve.",
    demoPath: "/results?mock=true&interviewId=demo&demo=tech",
  },
  {
    icon: "Bot",
    title: "How the AI interviewer works",
    blurb: "Step through how Mockly sets up the voice interview behind the scenes.",
    demoPath: "/demo/agent",
  },
];
