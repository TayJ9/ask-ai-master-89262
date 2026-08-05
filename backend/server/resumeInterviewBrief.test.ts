import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildResumeProfile, buildToolResumeProfile } from "./resumeProfileHeuristic.js";
import { buildInterviewResumeBrief } from "./resumeInterviewBrief.js";

const SAMPLE_RESUME = [
  "Alex Rivera",
  "Education: State University, Computer Science, GPA 3.8",
  "Experience: Software Engineering Intern at QuantumLeap Robotics",
  "Projects: Built a sentiment-analysis chatbot in Rust serving 10k daily users",
  "Skills: JavaScript, Python, React, Kubernetes, teamwork",
].join("\n");

const BLOCK_RESUME = `
Alex Rivera

EDUCATION
College of Charleston, B.S. Computer Science

EXPERIENCE
Software Engineering Intern at QuantumLeap Robotics
Built internal tooling for deployment pipelines

PROJECTS
Sentiment-analysis chatbot in Rust
Campus course planner web app

SKILLS
JavaScript, Python, React, Kubernetes
`.trim();

const PROFESSIONAL_EXPERIENCE_RESUME = `
Taylor Johnson

EDUCATION
College of Charleston, Honors College — Charleston, SC
Bachelor of Science, Computer Information Systems (CIS), GPA: 3.7, Expected Graduation: May 2028

PROFESSIONAL EXPERIENCE
Annotation Engineer, CallMiner — Remote May 2026 – Present
Annotated ~75 hours of English call center transcripts. Analyzed trends and patterns due to different dialects and accents.
Worked as part of a team to achieve >95% annotation accuracy through rigorous calibration

TECHNICAL SKILLS
Python, SQL, JavaScript, React, Git
`.trim();

describe("buildResumeProfile", () => {
  it("extracts labeled inline sections", () => {
    const profile = buildResumeProfile(SAMPLE_RESUME);
    assert.ok(profile.skills.some((s) => /kubernetes/i.test(s)));
    assert.ok(profile.projects.some((p) => /sentiment-analysis chatbot/i.test(p)));
    assert.ok(profile.education.some((e) => /state university/i.test(e)));
    assert.ok(profile.experience.some((e) => /quantumleap robotics/i.test(e)));
  });

  it("extracts block sections under headers", () => {
    const profile = buildResumeProfile(BLOCK_RESUME);
    assert.ok(profile.skills.some((s) => /kubernetes/i.test(s)));
    assert.ok(profile.projects.some((p) => /sentiment-analysis chatbot/i.test(p)));
    assert.ok(profile.education.some((e) => /college of charleston/i.test(e)));
    assert.ok(profile.experience.some((e) => /quantumleap robotics/i.test(e)));
  });

  it("stops education at PROFESSIONAL EXPERIENCE and parses skills block", () => {
    const profile = buildResumeProfile(PROFESSIONAL_EXPERIENCE_RESUME);
    assert.ok(profile.education.some((e) => /college of charleston/i.test(e)));
    assert.ok(!profile.education.some((e) => /professional experience/i.test(e)));
    assert.ok(!profile.education.some((e) => /callminer/i.test(e)));
    assert.ok(profile.experience.some((e) => /callminer/i.test(e)));
    assert.ok(profile.skills.some((s) => /python/i.test(s)));
  });

  it("recognizes Technical Projects as a projects section (block and inline)", () => {
    const blockResume = `
EDUCATION
State University

TECHNICAL PROJECTS
AI Interview Coach — full-stack web app with React and Node.js
Campus course planner with PostgreSQL backend

TECHNICAL SKILLS
Python, TypeScript, React
`.trim();
    const blockProfile = buildResumeProfile(blockResume);
    assert.ok(blockProfile.projects.some((p) => /interview coach/i.test(p)));
    assert.ok(blockProfile.projects.some((p) => /course planner/i.test(p)));
    assert.ok(!blockProfile.education.some((e) => /interview coach/i.test(e)));

    const inlineResume =
      "Technical Projects: Built a sentiment-analysis chatbot; deployed a portfolio site with Next.js";
    const inlineProfile = buildResumeProfile(inlineResume);
    assert.ok(inlineProfile.projects.some((p) => /sentiment-analysis chatbot/i.test(p)));
    assert.ok(inlineProfile.projects.some((p) => /portfolio site/i.test(p)));
  });
});

describe("buildInterviewResumeBrief", () => {
  it("prefers structured brief with interviewable markers", () => {
    const profile = buildResumeProfile(SAMPLE_RESUME);
    const brief = buildInterviewResumeBrief(profile, SAMPLE_RESUME);

    assert.equal(brief.source, "structured");
    assert.match(brief.resume_summary, /Skills:/i);
    assert.match(brief.resume_summary, /Projects:/i);
    assert.match(brief.resume_summary, /Education:/i);
    assert.match(brief.resume_summary, /Kubernetes/i);
    assert.match(brief.resume_summary, /sentiment-analysis chatbot/i);
    assert.match(brief.resume_summary, /State University/i);
    assert.match(brief.resume_highlights, /Kubernetes|sentiment-analysis|State University/i);
  });

  it("uses prose fallback only when structured signal is weak", () => {
    const brief = buildInterviewResumeBrief(
      { skills: [], projects: [], experience: [], education: [] },
      "Short resume without sections",
      {
        proseSummary:
          "Candidate worked on distributed systems and led a campus robotics club for two years.",
      },
    );
    assert.equal(brief.source, "prose_fallback");
    assert.match(brief.resume_summary, /distributed systems/i);
  });

  it("falls back to slice when no structure and no prose", () => {
    const text = "Plain paragraph resume with no labeled sections at all about tutoring.";
    const brief = buildInterviewResumeBrief(
      { skills: [], projects: [], experience: [], education: [] },
      text,
    );
    assert.equal(brief.source, "slice_fallback");
    assert.ok(brief.resume_summary.includes("tutoring"));
  });
});

describe("buildToolResumeProfile", () => {
  it("rebuilds skills/projects from fulltext when stored profile lost arrays", () => {
    const toolProfile = buildToolResumeProfile(
      {
        role: "Computer Information Systems",
        year: "Junior",
        major: "Computer Information Systems",
        first_name: "Taylor",
      },
      BLOCK_RESUME,
    );
    assert.ok(Array.isArray(toolProfile.skills) && toolProfile.skills.length > 0);
    assert.ok(Array.isArray(toolProfile.projects) && toolProfile.projects.length > 0);
    assert.ok(Array.isArray(toolProfile.experience) && toolProfile.experience.length > 0);
    assert.equal(toolProfile.first_name, "Taylor");
    assert.equal(toolProfile.major, "Computer Information Systems");
  });

  it("uses stored structured arrays without re-parsing fulltext", () => {
    const toolProfile = buildToolResumeProfile(
      {
        skills: ["Stored Skill"],
        projects: ["Stored Project"],
        experience: ["Stored Job"],
        education: ["Stored School"],
        parse_source: "llm",
        first_name: "Taylor",
        major: "Computer Science",
      },
      BLOCK_RESUME,
    );
    assert.ok(toolProfile.skills.includes("Stored Skill"));
    assert.ok(toolProfile.projects.includes("Stored Project"));
    assert.ok(!toolProfile.skills.some((s) => /kubernetes/i.test(String(s))));
  });
});
