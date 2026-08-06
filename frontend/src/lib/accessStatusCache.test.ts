import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canProceedWithAccessStatus } from "./accessStatusCache.js";

describe("canProceedWithAccessStatus", () => {
  it("allows access when the gate is disabled", () => {
    assert.equal(
      canProceedWithAccessStatus({ required: false, granted: false }),
      true,
    );
  });

  it("allows access when the gate is required and granted", () => {
    assert.equal(
      canProceedWithAccessStatus({ required: true, granted: true }),
      true,
    );
  });

  it("denies access when the gate is required but not granted", () => {
    assert.equal(
      canProceedWithAccessStatus({ required: true, granted: false }),
      false,
    );
  });

  it("denies access for malformed or missing status", () => {
    assert.equal(canProceedWithAccessStatus(null), false);
    assert.equal(canProceedWithAccessStatus(undefined), false);
    assert.equal(canProceedWithAccessStatus({} as never), false);
    assert.equal(
      canProceedWithAccessStatus({ required: true } as never),
      false,
    );
    assert.equal(
      canProceedWithAccessStatus({ granted: true } as never),
      false,
    );
  });
});
