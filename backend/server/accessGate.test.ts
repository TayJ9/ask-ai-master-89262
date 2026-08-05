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

/** 8:30 PM UTC on 2026-01-15. */
const UTC_MID_HOUR = Date.parse("2026-01-15T20:30:00.000Z");
/** 8:59:59 PM UTC on 2026-01-15. */
const UTC_END_OF_HOUR = Date.parse("2026-01-15T20:59:59.000Z");
/** 9:00:00 PM UTC on 2026-01-15. */
const UTC_START_OF_NEXT_HOUR = Date.parse("2026-01-15T21:00:00.000Z");

describe("accessGate hourly codes", () => {
  beforeEach(() => {
    process.env.ACCESS_GATE_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    delete process.env.ACCESS_GATE_SECRET;
  });

  it("returns a stable code within the same UTC hour", () => {
    const a = getHourlyCode(TEST_SECRET, UTC_MID_HOUR);
    const b = getHourlyCode(TEST_SECRET, UTC_MID_HOUR + 15 * 60 * 1000);
    assert.equal(a, b);
    assert.equal(a.length, 8);
  });

  it("changes the code at the UTC hour boundary", () => {
    const before = getHourlyCode(TEST_SECRET, UTC_END_OF_HOUR);
    const after = getHourlyCode(TEST_SECRET, UTC_START_OF_NEXT_HOUR);
    assert.notEqual(before, after);
  });

  it("accepts the current hour and previous hour codes", () => {
    const now = UTC_MID_HOUR;
    const current = getHourlyCode(TEST_SECRET, now);
    const previous = getHourlyCode(TEST_SECRET, now - 3600 * 1000);

    assert.equal(verifyAccessCode(current, now), true);
    assert.equal(verifyAccessCode(formatAccessCode(previous), now), true);
    assert.equal(verifyAccessCode("BADCODE1", now), false);
  });

  it("normalizes dashed, case-insensitive input", () => {
    const raw = getHourlyCode(TEST_SECRET, UTC_MID_HOUR);
    const dashed = `${raw.slice(0, 4)}-${raw.slice(4)}`.toLowerCase();
    assert.equal(verifyAccessCode(dashed, UTC_MID_HOUR), true);
  });

  it("returns formatted current code and UTC-hour expiry", () => {
    const { code, validUntilIso } = getCurrentAccessCode(UTC_MID_HOUR);
    assert.match(code, /^[A-Z0-9_-]{4}-[A-Z0-9_-]{4}$/);
    assert.equal(validUntilIso, new Date(UTC_START_OF_NEXT_HOUR).toISOString());
    assert.equal(ACCESS_GATE_TIMEZONE, "UTC");
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
    const now = UTC_MID_HOUR;
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
