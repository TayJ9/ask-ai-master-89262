import "express";

declare global {
  namespace Express {
    interface Request {
      /** Set by request-id middleware in server/index.ts */
      requestId?: string;
    }
  }
}

export {};
