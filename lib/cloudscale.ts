/**
 * CloudScale domain logic: pure state transitions, no I/O.
 * Used by the API routes (persisted to disk) and by the unit tests (in memory).
 */

export type ActionStatus = "SYSTEM_READY" | "KEY_GENERATED_HEALTHY" | "QUOTA_TOPUP_SUCCESS";

export interface ApiKey {
  id: string;
  name: string;
  /** Only the prefix is kept after creation; the full secret is shown once. */
  prefix: string;
  createdAt: string;
  rateLimitPerMin: number;
}

export interface CloudScaleState {
  keys: ApiKey[];
  quotaCents: number;
  status: ActionStatus;
  updatedAt: string;
}

export const TOPUP_CENTS = 25_000;

export function seedState(now = new Date()): CloudScaleState {
  return {
    keys: [
      {
        id: "KEY-001",
        name: "Production LLM routing",
        prefix: "cs_live_9a7f",
        createdAt: "2026-11-15T09:12:00.000Z",
        rateLimitPerMin: 10_000,
      },
      {
        id: "KEY-002",
        name: "Staging verifier",
        prefix: "cs_test_3b2e",
        createdAt: "2026-11-17T08:40:00.000Z",
        rateLimitPerMin: 2_500,
      },
    ],
    quotaCents: 450_000,
    status: "SYSTEM_READY",
    updatedAt: now.toISOString(),
  };
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Returns the new state and the full secret, which is never stored. */
export function generateKey(state: CloudScaleState, now = new Date()): { state: CloudScaleState; secret: string } {
  const n = state.keys.length + 1;
  const secret = `cs_live_${randomHex(16)}`;
  const key: ApiKey = {
    id: `KEY-${String(n).padStart(3, "0")}`,
    name: `Agent fleet #${n}`,
    prefix: secret.slice(0, 12),
    createdAt: now.toISOString(),
    rateLimitPerMin: 15_000,
  };
  return {
    state: { ...state, keys: [key, ...state.keys], status: "KEY_GENERATED_HEALTHY", updatedAt: now.toISOString() },
    secret,
  };
}

export function topUp(state: CloudScaleState, now = new Date()): CloudScaleState {
  return { ...state, quotaCents: state.quotaCents + TOPUP_CENTS, status: "QUOTA_TOPUP_SUCCESS", updatedAt: now.toISOString() };
}

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
