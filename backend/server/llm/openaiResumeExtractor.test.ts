import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mergeResumeProfiles,
  normalizeResumeProfileRaw,
  structuredProfileFromStored,
} from "./openaiResumeExtractor.js";

describe("normalizeResumeProfileRaw", () => {
  it("accepts top-level arrays", () => {
    const profile = normalizeResumeProfileRaw({
      skills: ["Python", "React"],
      projects: ["AI Interview Coach"],
      experience: ["Intern at Acme Corp"],
      education: ["State University, B.S. CS"],
    });
    assert.ok(profile);
    assert.equal(profile!.skills.length, 2);
    assert.equal(profile!.projects[0], "AI Interview Coach");
  });

  it("unwraps nested profile object", () => {
    const profile = normalizeResumeProfileRaw({
      profile: {
        skills: ["JavaScript"],
        projects: [],
        experience: ["CallMiner — Annotation Engineer"],
        education: ["College of Charleston"],
      },
    });
    assert.ok(profile);
    assert.ok(profile!.experience.some((e) => /callminer/i.test(e)));
  });

  it("deduplicates and trims items", () => {
    const profile = normalizeResumeProfileRaw({
      skills: [" Python ", "python", "React"],
      projects: [],
      experience: [],
      education: [],
    });
    assert.ok(profile);
    assert.equal(profile!.skills.length, 2);
  });
});

describe("mergeResumeProfiles", () => {
  it("fills empty LLM sections from heuristic fallback", () => {
    const merged = mergeResumeProfiles(
      { skills: [], projects: [], experience: ["LLM job"], education: [] },
      {
        skills: ["Python"],
        projects: ["Heuristic project"],
        experience: [],
        education: ["Heuristic school"],
      },
    );
    assert.deepEqual(merged.skills, ["Python"]);
    assert.deepEqual(merged.projects, ["Heuristic project"]);
    assert.deepEqual(merged.experience, ["LLM job"]);
    assert.deepEqual(merged.education, ["Heuristic school"]);
  });
});

describe("structuredProfileFromStored", () => {
  it("returns null when stored profile lacks array sections", () => {
    assert.equal(structuredProfileFromStored({ first_name: "Taylor" }), null);
  });

  it("reads stored structured arrays", () => {
    const profile = structuredProfileFromStored({
      skills: ["Python"],
      projects: ["Capstone app"],
      experience: ["CallMiner"],
      education: ["College of Charleston"],
      parse_source: "llm",
      first_name: "Taylor",
    });
    assert.ok(profile);
    assert.equal(profile!.skills[0], "Python");
  });
});
