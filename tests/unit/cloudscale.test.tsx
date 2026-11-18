/**
 * The kind of test suite a coding agent runs to check its own UI work:
 * Vitest + JSDOM + Testing Library. Every test here passes even when
 * MaintenanceNotice's full-viewport layer swallows real clicks, because
 * JSDOM has no layout engine and never hit-tests. That's the gap Driftor closes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { generateKey, seedState, topUp, type CloudScaleState } from "@/lib/cloudscale";
import CloudScaleDashboard from "@/app/app/CloudScaleDashboard";

vi.mock("canvas-confetti", () => ({ default: () => undefined }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// In-memory stand-in for the /api/cloudscale routes, using the real domain logic.
let server: CloudScaleState;
function fakeApi(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input);
  const method = init?.method ?? "GET";
  let body: unknown;
  if (url === "/api/cloudscale" && method === "GET") body = server;
  else if (url === "/api/cloudscale/keys" && method === "POST") {
    const res = generateKey(server);
    server = res.state;
    body = res;
  } else if (url === "/api/cloudscale/topup" && method === "POST") body = server = topUp(server);
  else return Promise.resolve(new Response("not found", { status: 404 }));
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

beforeEach(() => {
  server = seedState();
  vi.stubGlobal("fetch", vi.fn(fakeApi));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CloudScale dashboard (JSDOM)", () => {
  it("renders the gateway with two seeded keys and $4,500.00 quota", async () => {
    render(<CloudScaleDashboard />);
    expect(screen.getByRole("heading", { name: "CloudScale AI Inference Gateway" })).toBeTruthy();
    expect((await screen.findByTestId("key-count")).textContent).toBe("2 Keys");
    expect(screen.getByTestId("quota-balance").textContent).toBe("$4,500.00");
    expect(screen.getByTestId("key-status").textContent).toContain("SYSTEM_READY");
  });

  it("“Generate Production API Key” adds a key", async () => {
    render(<CloudScaleDashboard />);
    await screen.findByText("2 Keys");
    fireEvent.click(screen.getByTestId("deploy-key-btn"));
    expect(await screen.findByText("3 Keys")).toBeTruthy();
    expect(screen.getByTestId("key-status").textContent).toContain("KEY_GENERATED_HEALTHY");
    expect(screen.getByTestId("new-key-secret").textContent).toMatch(/^cs_live_[0-9a-f]{32}$/);
    expect(screen.getByTestId("activity-log").textContent).toContain("KEY-003 “Agent fleet #3” created");
  });

  it("top-up adds $250 to the quota", async () => {
    render(<CloudScaleDashboard />);
    await screen.findByText("$4,500.00");
    fireEvent.click(screen.getByTestId("topup-btn"));
    expect(await screen.findByText("$4,750.00")).toBeTruthy();
    expect(screen.getByTestId("key-status").textContent).toContain("QUOTA_TOPUP_SUCCESS");
  });

  it("shows the maintenance notice", () => {
    render(<CloudScaleDashboard />);
    expect(screen.getByRole("status").textContent).toContain("Scheduled maintenance");
  });
});
