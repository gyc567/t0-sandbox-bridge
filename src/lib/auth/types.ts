// Auth domain — Role / User / Session / error code types.

export type Role = "ofi" | "provider";

export interface User {
  id: string;
  email: string;
  role: Role;
  displayName: string;
  orgName: string;
  // Stored as hex-encoded salt + hash: "{saltHex}:{hashHex}".
  passwordHash: string;
}

export interface Session {
  token: string;
  userId: string;
  role: Role;
  expiresAt: number;
}

export type AuthErrorCode =
  | "UserNotFound"
  | "InvalidCredentials"
  | "NoSession"
  | "SessionExpired"
  | "WrongRole";

export class AuthError extends Error {
  constructor(public readonly code: AuthErrorCode, message?: string) {
    super(message ?? code);
    this.name = "AuthError";
  }
}
