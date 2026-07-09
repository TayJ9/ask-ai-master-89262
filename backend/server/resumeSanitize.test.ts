import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sanitizeResumeTextForStorage, stripResumeContactInfo } from "./resumeSanitize.js";

describe("sanitizeResumeTextForStorage", () => {
  it("removes NUL bytes that Postgres rejects", () => {
    const dirty = `Skills: Python\u0000, React\u0000\nEducation: State U`;
    const clean = sanitizeResumeTextForStorage(dirty);
    assert.equal(clean.includes("\u0000"), false);
    assert.match(clean, /Python/);
    assert.match(clean, /React/);
  });

  it("preserves newlines and tabs", () => {
    const text = "Line1\n\tIndented\r\nLine2";
    assert.equal(sanitizeResumeTextForStorage(text), text);
  });
});

describe("stripResumeContactInfo", () => {
  it("strips NULs before contact redaction", () => {
    const dirty = "Alex\u0000 Rivera\nalex@example.com\n555-123-4567\nSkills: Go";
    const clean = stripResumeContactInfo(dirty);
    assert.equal(clean.includes("\u0000"), false);
    assert.equal(clean.includes("alex@example.com"), false);
    assert.equal(clean.includes("555-123-4567"), false);
    assert.match(clean, /Skills: Go/);
  });
});
