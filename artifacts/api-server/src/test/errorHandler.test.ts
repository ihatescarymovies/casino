import { describe, it, expect, vi } from "vitest";
import { ZodError, z } from "zod";
import { errorHandler } from "../middleware/errorHandler";
import {
  GameEngineError,
  InsufficientFunds,
  WalletNotFound,
  HashChainError,
  GameRoundError,
} from "../lib/errors";
import { validate } from "../lib/validation";
import type { Request, Response, NextFunction } from "express";

/* ── Helper: build a minimal mock Res ──────────────────────────────── */

function mockRes(): Response {
  const res = {} as Response;
  let statusCode = 200;
  let jsonBody: unknown;

  res.status = vi.fn((code: number) => {
    statusCode = code;
    return res;
  }) as unknown as Response["status"];

  res.json = vi.fn((body: unknown) => {
    jsonBody = body;
    return res;
  }) as unknown as Response["json"];

  // Capture helpers for assertions
  (res as any)._statusCode = () => statusCode;
  (res as any)._jsonBody = () => jsonBody;

  return res;
}

/* ── errorHandler tests ────────────────────────────────────────────── */

describe("errorHandler", () => {
  it("returns 400 with field details for ZodError", () => {
    const schema = z.object({ email: z.string().email() });
    const result = schema.safeParse({ email: "bad" });
    const zodError = result.error!;

    const req = {} as Request;
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    errorHandler(zodError, req, res, next);

    const status = (res as any)._statusCode();
    const body = (res as any)._jsonBody() as any;

    expect(status).toBe(400);
    expect(body.error).toBe("Validation failed");
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.fields).toBeDefined();
    expect(body.fields.email).toBeDefined();
  });

  it("returns GameEngineError statusCode and message", () => {
    const err = new GameEngineError("Game not found", 404);

    const req = {} as Request;
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    errorHandler(err, req, res, next);

    const status = (res as any)._statusCode();
    const body = (res as any)._jsonBody() as any;

    expect(status).toBe(404);
    expect(body.error).toBe("Game not found");
  });

  it("returns 402 for InsufficientFunds", () => {
    const err = new InsufficientFunds();

    const req = {} as Request;
    const res = mockRes();
    errorHandler(err, req, res, vi.fn());

    expect((res as any)._statusCode()).toBe(402);
    expect((res as any)._jsonBody()).toEqual({ error: "Insufficient funds" });
  });

  it("returns 404 for WalletNotFound", () => {
    const err = new WalletNotFound();

    const req = {} as Request;
    const res = mockRes();
    errorHandler(err, req, res, vi.fn());

    expect((res as any)._statusCode()).toBe(404);
    expect((res as any)._jsonBody()).toEqual({ error: "Wallet not found" });
  });

  it("returns 400 for HashChainError", () => {
    const err = new HashChainError("Hash mismatch");

    const req = {} as Request;
    const res = mockRes();
    errorHandler(err, req, res, vi.fn());

    expect((res as any)._statusCode()).toBe(400);
    expect((res as any)._jsonBody()).toEqual({ error: "Hash mismatch" });
  });

  it("returns 400 for GameRoundError", () => {
    const err = new GameRoundError("Round already ended", 409);

    const req = {} as Request;
    const res = mockRes();
    errorHandler(err, req, res, vi.fn());

    expect((res as any)._statusCode()).toBe(409);
    expect((res as any)._jsonBody()).toEqual({ error: "Round already ended" });
  });

  it("returns 500 for unknown Error and logs it", async () => {
    const err = new Error("Something unexpected");

    const req = {} as Request;
    const res = mockRes();
    errorHandler(err, req, res, vi.fn());

    expect((res as any)._statusCode()).toBe(500);
    expect((res as any)._jsonBody()).toEqual({
      error: "Internal server error",
    });
  });

  it("returns 500 for non-Error thrown value", () => {
    const req = {} as Request;
    const res = mockRes();
    errorHandler("string error", req, res, vi.fn());

    expect((res as any)._statusCode()).toBe(500);
    expect((res as any)._jsonBody()).toEqual({
      error: "Internal server error",
    });
  });
});

/* ── validate middleware tests ──────────────────────────────────────── */

describe("validate middleware", () => {
  const schema = z.object({
    name: z.string().min(1),
    age: z.number().int().positive(),
  });

  function mockReqRes(body: unknown) {
    const req = { body } as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;
    const next = vi.fn() as NextFunction;
    return { req, res, next };
  }

  it("calls next() with parsed body on valid input", () => {
    const { req, res, next } = mockReqRes({ name: "Alice", age: 30 });
    const middleware = validate(schema);
    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.body).toEqual({ name: "Alice", age: 30 });
  });

  it("returns 400 with field errors on invalid input", () => {
    const { req, res, next } = mockReqRes({ name: "", age: -1 });
    const middleware = validate(schema);
    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    const jsonArg = (res.json as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as any;
    expect(jsonArg.error).toBe("Validation failed");
    expect(jsonArg.code).toBe("VALIDATION_ERROR");
    expect(jsonArg.fields).toBeDefined();
  });

  it("coerces and transforms valid data", () => {
    const { req, res, next } = mockReqRes({ name: "Bob", age: 25 });
    const middleware = validate(schema);
    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.body).toEqual({ name: "Bob", age: 25 });
  });
});
