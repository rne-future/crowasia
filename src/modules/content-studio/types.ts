import type { CompileResult } from "@/content/compiler/types";
import type { Actor } from "@/modules/identity/types";

export interface PublishResult {
  variantId: string;
  revisionId: string;
  generation: number;
  publishedAt: Date;
}

export interface RollbackResult {
  variantId: string;
  revisionId: string;
  generation: number;
  rolledBackAt: Date;
  reason: string;
}

export type CompileDraftResult = CompileResult & { revisionId: string };

export interface CompileDraftOptions {
  actor?: Actor;
}

export class ConflictError extends Error {
  readonly status = 409;
  readonly statusCode = 409;
  readonly code: string;

  constructor(messageOrCode = "Generation conflict", codeOrMessage = "GENERATION_CONFLICT") {
    let resolvedMessage: string;
    let resolvedCode: string;

    if (/^[A-Z0-9_]+$/.test(messageOrCode) && codeOrMessage !== "GENERATION_CONFLICT") {
      resolvedCode = messageOrCode;
      resolvedMessage = codeOrMessage;
    } else if (/^[A-Z0-9_]+$/.test(codeOrMessage)) {
      resolvedMessage = messageOrCode;
      resolvedCode = codeOrMessage;
    } else {
      resolvedMessage = messageOrCode;
      resolvedCode = "GENERATION_CONFLICT";
    }

    super(resolvedMessage);
    this.name = "ConflictError";
    this.code = resolvedCode;
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

export class NotFoundError extends Error {
  readonly status = 404;
  readonly statusCode = 404;
  readonly code: string;

  constructor(messageOrCode = "Not found", codeOrMessage = "NOT_FOUND") {
    let resolvedMessage: string;
    let resolvedCode: string;

    if (/^[A-Z0-9_]+$/.test(messageOrCode) && codeOrMessage !== "NOT_FOUND") {
      resolvedCode = messageOrCode;
      resolvedMessage = codeOrMessage;
    } else if (/^[A-Z0-9_]+$/.test(codeOrMessage)) {
      resolvedMessage = messageOrCode;
      resolvedCode = codeOrMessage;
    } else {
      resolvedMessage = messageOrCode;
      resolvedCode = "NOT_FOUND";
    }

    super(resolvedMessage);
    this.name = "NotFoundError";
    this.code = resolvedCode;
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class ValidationError extends Error {
  readonly status = 422;
  readonly statusCode = 422;
  readonly code: string;

  constructor(messageOrCode = "Validation error", codeOrMessage = "VALIDATION_ERROR") {
    let resolvedMessage: string;
    let resolvedCode: string;

    if (/^[A-Z0-9_]+$/.test(messageOrCode) && codeOrMessage !== "VALIDATION_ERROR") {
      resolvedCode = messageOrCode;
      resolvedMessage = codeOrMessage;
    } else if (/^[A-Z0-9_]+$/.test(codeOrMessage)) {
      resolvedMessage = messageOrCode;
      resolvedCode = codeOrMessage;
    } else {
      resolvedMessage = messageOrCode;
      resolvedCode = "VALIDATION_ERROR";
    }

    super(resolvedMessage);
    this.name = "ValidationError";
    this.code = resolvedCode;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}
