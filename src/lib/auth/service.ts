// AuthService — login / logout / session lookup / requireRole guard.
// Pure: depends only on the store and a clock. No IO, no side effects beyond maps.

import { InMemoryUserStore } from "./store";
import { AuthError, type Role, type Session, type User } from "./types";

let counter = 0;
const nextToken = () => `sess_${Date.now().toString(36)}_${(++counter).toString(36)}`;

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

export class AuthService {
  private sessions = new Map<string, Session>();

  constructor(
    private readonly users: InMemoryUserStore,
    private readonly now: () => number = Date.now,
  ) {}

  async login(email: string, password: string): Promise<Session> {
    const user = await this.users.findByEmail(email);
    if (!user) throw new AuthError("UserNotFound");
    if (!this.verifyPassword(user, password)) {
      throw new AuthError("InvalidCredentials");
    }
    return this.issue(user);
  }

  async getSession(token: string | null): Promise<Session | null> {
    if (!token) return null;
    const s = this.sessions.get(token);
    if (!s) return null;
    if (s.expiresAt <= this.now()) {
      this.sessions.delete(token);
      return null;
    }
    return s;
  }

  async logout(token: string): Promise<void> {
    this.sessions.delete(token);
  }

  /** Synchronous guard for TanStack Router beforeLoad. */
  requireRole(token: string | null, role: Role): Session {
    if (!token) throw new AuthError("NoSession");
    const s = this.sessions.get(token);
    if (!s) throw new AuthError("NoSession");
    if (s.expiresAt <= this.now()) {
      this.sessions.delete(token);
      throw new AuthError("SessionExpired");
    }
    if (s.role !== role) throw new AuthError("WrongRole");
    return s;
  }

  private issue(user: User): Session {
    const session: Session = {
      token: nextToken(),
      userId: user.id,
      role: user.role,
      expiresAt: this.now() + SESSION_TTL_MS,
    };
    this.sessions.set(session.token, session);
    return session;
  }

  private verifyPassword(user: User, password: string): boolean {
    const [salt, expected] = user.passwordHash.split(":");
    if (!salt || !expected) return false;
    const actual = InMemoryUserStore.hash(salt, password);
    const [, actualHash] = actual.split(":");
    return actualHash === expected;
  }
}
