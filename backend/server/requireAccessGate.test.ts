import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Request, Response } from "express";
import { requireAccessGate } from "./requireAccessGate.js";

const TEST_SECRET = "test-secret-at-least-32-characters-long";

function mockReq(path: string, query: Record<string, string> = {}): Request {
  return {
    method: "GET",
    path,
    query,
    headers: {},
  } as Request;
}

function mockRes() {
  const state = { statusCode: 200, location: "", body: null as unknown, headers: {} as Record<string, string> };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return this;
    },
    json(body: unknown) {
      state.body = body;
      return this;
    },
    redirect(code: number, location: string) {
      state.statusCode = code;
      state.location = location;
      return this;
    },
    setHeader(name: string, value: string) {
      state.headers[name] = value;
    },
  } as unknown as Response;
  return { res, state };
}

describe("requireAccessGate HTML routing", () => {
  it("redirects / to /gate when gate is enabled and cookie is missing", () => {
    process.env.ACCESS_GATE_SECRET = TEST_SECRET;
    const { res, state } = mockRes();
    let nextCalled = false;

    requireAccessGate(mockReq("/"), res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(state.statusCode, 302);
    assert.equal(state.location, "/gate");
  });

  it("allows /gate without a cookie", () => {
    process.env.ACCESS_GATE_SECRET = TEST_SECRET;
    const { res, state } = mockRes();
    let nextCalled = false;

    requireAccessGate(mockReq("/gate"), res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(state.statusCode, 200);
  });

  it("allows static assets without a cookie", () => {
    process.env.ACCESS_GATE_SECRET = TEST_SECRET;
    const { res } = mockRes();
    let nextCalled = false;

    requireAccessGate(mockReq("/assets/index-abc123.js"), res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
  });

  it("allows mock results without a cookie", () => {
    process.env.ACCESS_GATE_SECRET = TEST_SECRET;
    const { res } = mockRes();
    let nextCalled = false;

    requireAccessGate(mockReq("/results", { mock: "true" }), res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
  });
});
