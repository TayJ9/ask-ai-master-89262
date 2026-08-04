import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  ACCESS_GATE_TIMEZONE,
  formatAccessCode,
  getCurrentAccessCode,
  getHourlyCode,
  signAccessCookie,
  verifyAccessCode,
  verifyAccessCookie,
} from "./accessGate.js";

const TEST_SECRET = "test-secret-at-least-32-characters-long";

/** 3:30 PM US Eastern on 2026-01-15 (EST, UTC-5). */
const EASTERN_MID_HOUR = Date.parse("2026-01-15T20:30:00.000Z");
/** 3:59:59 PM US Eastern on 2026-01-15. */
const EASTERN_END_OF_HOUR = Date.parse("2026-01-15T20:59:59.000Z");
/** 4:00:00 PM US Eastern on 2026-01-15. */
const EASTERN_START_OF_NEXT_HOUR = Date.parse("2026-01-15T21:00:00.000Z");

describe("accessGate hourly codes", () => {
  beforeEach(() => {
    process.env.ACCESS_GATE_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    delete process.env.ACCESS_GATE_SECRET;
  });

  it("returns a stable code within the same US Eastern hour", () => {
    const a = getHourlyCode(TEST_SECRET, EASTERN_MID_HOUR);
    const b = getHourlyCode(TEST_SECRET, EASTERN_MID_HOUR + 15 * 60 * 1000);
    assert.equal(a, b);
    assert.equal(a.length, 8);
  });

  it("changes the code at the US Eastern hour boundary", () => {
    const before = getHourlyCode(TEST_SECRET, EASTERN_END_OF_HOUR);
    const after = getHourlyCode(TEST_SECRET, EASTERN_START_OF_NEXT_HOUR);
    assert.notEqual(before, after);
  });

  it("accepts the current hour and previous hour codes", () => {
    const now = EASTERN_MID_HOUR;
    const current = getHourlyCode(TEST_SECRET, now);
    const previous = getHourlyCode(TEST_SECRET, now - 3600 * 1000);

    assert.equal(verifyAccessCode(current, now), true);
    assert.equal(verifyAccessCode(formatAccessCode(previous), now), true);
    assert.equal(verifyAccessCode("BADCODE1", now), false);
  });

  it("normalizes dashed, case-insensitive input", () => {
    const raw = getHourlyCode(TEST_SECRET, EASTERN_MID_HOUR);
    const dashed = `${raw.slice(0, 4)}-${raw.slice(4)}`.toLowerCase();
    assert.equal(verifyAccessCode(dashed, EASTERN_MID_HOUR), true);
  });

  it("returns formatted current code and Eastern-hour expiry", () => {
    const { code, validUntilIso } = getCurrentAccessCode(EASTERN_MID_HOUR);
    assert.match(code, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    assert.equal(validUntilIso, new Date(EASTERN_START_OF_NEXT_HOUR).toISOString());
    assert.equal(ACCESS_GATE_TIMEZONE, "America/New_York");
  });
});

describe("accessGate cookie", () => {
  beforeEach(() => {
    process.env.ACCESS_GATE_SECRET = TEST_SECRET;
    process.env.ACCESS_GATE_COOKIE_MAX_AGE_SECONDS = "3600";
  });

  afterEach(() => {
    delete process.env.ACCESS_GATE_SECRET;
    delete process.env.ACCESS_GATE_COOKIE_MAX_AGE_SECONDS;
  });

  it("signs and verifies a cookie round trip", () => {
    const now = EASTERN_MID_HOUR;
    const token = signAccessCookie(now);
    assert.equal(verifyAccessCookie(token, now + 1000), true);
    assert.equal(verifyAccessCookie(token, now + 3601 * 1000), false);
  });

  it("rejects tampered cookies", () => {
    const token = signAccessCookie();
    const tampered = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
    assert.equal(verifyAccessCookie(tampered), false);
  });
});
