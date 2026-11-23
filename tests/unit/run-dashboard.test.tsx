/** The dashboard passes `/app?run=<id>` through to every API call, and only then. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { seedState, topUp } from "@/lib/cloudscale";
import CloudScaleDashboard from "@/app/app/CloudScaleDashboard";

vi.mock("canvas-confetti", () => ({ default: () => undefined }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

function stubApi() {
  const urls: string[] = [];
  let server = seedState();
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      urls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.startsWith("/api/cloudscale/topup")) server = topUp(server);
      return Promise.resolve(new Response(JSON.stringify(server), { status: 200 }));
    })
  );
  return urls;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("run-scoped dashboard", () => {
  it("scopes every call to ?run=<id>", async () => {
    window.history.replaceState(null, "", "/app?run=gate-narrow-1");
    const urls = stubApi();
    render(<CloudScaleDashboard />);
    await screen.findByText("$4,500.00");
    fireEvent.click(screen.getByTestId("topup-btn"));
    expect(await screen.findByText("$4,750.00")).toBeTruthy();
    // Load, the write, then the re-read the dashboard does after every write.
    await waitFor(() =>
      expect(urls).toEqual([
        "GET /api/cloudscale?run=gate-narrow-1",
        "POST /api/cloudscale/topup?run=gate-narrow-1",
        "GET /api/cloudscale?run=gate-narrow-1",
      ]),
    );
    expect(screen.getByText(".data/cloudscale-runs/gate-narrow-1.json")).toBeTruthy();
  });

  it("uses the shared state without a run id (and ignores unsafe ones)", async () => {
    window.history.replaceState(null, "", "/app?run=../x");
    const urls = stubApi();
    render(<CloudScaleDashboard />);
    await screen.findByText("$4,500.00");
    expect(urls).toEqual(["GET /api/cloudscale"]);
    expect(screen.getByText(".data/cloudscale.json")).toBeTruthy();
  });
});
