// User store — seeded with two demo accounts.
// Passwords hashed via SHA-256(salt + password). Sandbox-only; intentionally simple.

import { createHash } from "node:crypto";
import type { Role, User } from "./types";

const sha256Hex = (input: string): string =>
  createHash("sha256").update(input).digest("hex");

const hashSync = (salt: string, password: string) =>
  `${salt}:${sha256Hex(salt + password)}`;

export interface SeedAccount {
  email: string;
  password: string;
  role: Role;
  displayName: string;
  orgName: string;
}

export const DEFAULT_SEEDS: SeedAccount[] = [
  {
    email: "ofi@baxs.demo",
    password: "demo-ofi-2026",
    role: "ofi",
    displayName: "OFI Operator",
    orgName: "BAXS Origination",
  },
  {
    email: "provider@baxs.demo",
    password: "demo-provider-2026",
    role: "provider",
    displayName: "Provider Operator",
    orgName: "BAXS Payout",
  },
];

export class InMemoryUserStore {
  private readonly byId = new Map<string, User>();

  constructor(seeds: SeedAccount[] = DEFAULT_SEEDS) {
    for (const seed of seeds) {
      const salt = saltFor(seed.email);
      const id = `u_${salt}`;
      const user: User = {
        id,
        email: seed.email.toLowerCase(),
        role: seed.role,
        displayName: seed.displayName,
        orgName: seed.orgName,
        passwordHash: hashSync(salt, seed.password),
      };
      this.byId.set(id, user);
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    const norm = email.toLowerCase();
    for (const u of this.byId.values()) {
      if (u.email === norm) return u;
    }
    return null;
  }

  async findById(id: string): Promise<User | null> {
    return this.byId.get(id) ?? null;
  }

  async list(): Promise<User[]> {
    return [...this.byId.values()];
  }

  /** Hash a password with the same scheme used for seed accounts. Public so callers can verify. */
  static hash(salt: string, password: string): string {
    return hashSync(salt, password);
  }
}

function saltFor(email: string): string {
  return email.toLowerCase().replace(/[^a-z0-9]/g, "").padEnd(16, "0").slice(0, 16);
}
