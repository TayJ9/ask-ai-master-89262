import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  ACCESS_GATE_TIMEZONE,
  ACCESS_GATE_TIMEZONE_LABEL,
  formatAccessCode,
  getCurrentAccessCode,
  getHourlyCode,
  normalizeAccessCode,
  signAccessCookie,
  verifyAccessCode,
  verifyAccessCookie,
} from "./accessGate.js";

const TEST_SECRET = "test-secret-at-least-32-characters-long";

/** 3:30 PM US Eastern (EST) on 2026-01-15 → 20:30 UTC. */
const ET_MID_HOUR = Date.parse("2026-01-15T20:30:00.000Z");
/** 3:59:59 PM US Eastern on 2026-01-15 → 20:59:59 UTC. */
const ET_END_OF_HOUR = Date.parse("2026-01-15T20:59:59.000Z");
/** 4:00 PM US Eastern on 2026-01-15 → 21:00 UTC. */
const ET_START_OF_NEXT_HOUR = Date.parse("2026-01-15T21:00:00.000Z");

describe("accessGate hourly codes", () => {
  beforeEach(() => {
    process.env.ACCESS_GATE_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    delete process.env.ACCESS_GATE_SECRET;
  });

  it("returns a stable code within the same US Eastern hour", () => {
    const a = getHourlyCode(TEST_SECRET, ET_MID_HOUR);
    const b = getHourlyCode(TEST_SECRET, ET_MID_HOUR + 15 * 60 * 1000);
    assert.equal(a, b);
    assert.equal(a.length, 8);
  });

  it("changes the code at the US Eastern hour boundary", () => {
    const before = getHourlyCode(TEST_SECRET, ET_END_OF_HOUR);
    const after = getHourlyCode(TEST_SECRET, ET_START_OF_NEXT_HOUR);
    assert.notEqual(before, after);
  });

  it("accepts the current hour and previous hour codes", () => {
    const now = ET_MID_HOUR;
    const current = getHourlyCode(TEST_SECRET, now);
    const previous = getHourlyCode(TEST_SECRET, now - 3600 * 1000);

    assert.equal(verifyAccessCode(current, now), true);
    assert.equal(verifyAccessCode(formatAccessCode(previous), now), true);
    assert.equal(verifyAccessCode("BADCODE1", now), false);
  });

  it("normalizes dashed, case-insensitive input", () => {
    const raw = getHourlyCode(TEST_SECRET, ET_MID_HOUR);
    const dashed = `${raw.slice(0, 4)}-${raw.slice(4)}`.toLowerCase();
    assert.equal(verifyAccessCode(dashed, ET_MID_HOUR), true);
  });

  it("accepts input when base64url embeds a dash in the raw code", () => {
    const now = ET_MID_HOUR;
    for (let i = 0; i < 100_000; i++) {
      const secret = `test-secret-dash-${i}-at-least-32-characters`;
      const raw = getHourlyCode(secret, now);
      if (!raw.includes("-")) continue;

      process.env.ACCESS_GATE_SECRET = secret;
      assert.equal(raw.length, 8);
      assert.ok(normalizeAccessCode(raw).length < 8, "dash should shorten normalized form");

      const formatted = formatAccessCode(raw);
      assert.equal(verifyAccessCode(formatted, now), true);
      assert.equal(verifyAccessCode(normalizeAccessCode(raw), now), true);
      return;
    }
    assert.fail("could not find a dash-bearing code for test");
  });

  it("returns formatted current code and Eastern-hour expiry", () => {
    const { code, validUntilIso } = getCurrentAccessCode(ET_MID_HOUR);
    assert.match(code, /^[A-Z0-9_-]{4}-[A-Z0-9_-]{4}$/);
    assert.equal(validUntilIso, new Date(ET_START_OF_NEXT_HOUR).toISOString());
    assert.equal(ACCESS_GATE_TIMEZONE, "America/New_York");
    assert.equal(ACCESS_GATE_TIMEZONE_LABEL, "US Eastern Time (ET)");
  });
});

describe("accessGate cookie", () => {
  beforeEach(() => {
    process.env.ACCESS_GATE_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    delete process.env.ACCESS_GATE_SECRET;
    delete process.env.ACCESS_GATE_COOKIE_MAX_AGE_SECONDS;
  });

  it("signs and verifies a cookie for one hour after entry", () => {
    const now = ET_MID_HOUR;
    const token = signAccessCookie(now);
    assert.equal(verifyAccessCookie(token, now + 3599 * 1000), true);
    assert.equal(verifyAccessCookie(token, now + 3600 * 1000), false);
  });

  it("rejects tampered cookies", () => {
    const token = signAccessCookie();
    const tampered = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
    assert.equal(verifyAccessCookie(tampered), false);
  });
});
