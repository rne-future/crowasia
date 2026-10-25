export type Role = "reader" | "editor" | "publisher" | "admin";

export const ROLES: readonly Role[] = [
  "reader",
  "editor",
  "publisher",
  "admin",
] as const;

export interface Actor {
  userId: string;
  verifiedEmail: string;
  roles: Role[];
  authTime: Date;
}

export class UnauthorizedError extends Error {
  readonly status = 401;
  readonly statusCode = 401;
  readonly code = 401;

  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

export class ForbiddenError extends Error {
  readonly status = 403;
  readonly statusCode = 403;
  readonly code = 403;

  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}
