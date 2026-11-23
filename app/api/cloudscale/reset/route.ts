import { NextResponse } from "next/server";
import { seedState } from "@/lib/cloudscale";
import { runIdFrom, save } from "@/lib/cloudscale-store";

export const dynamic = "force-dynamic";

/**
 * Restores the seed state. driftor_test.js calls this before each objective.
 * `?run=<id>` resets only that run's state; without it, the shared state.
 */
export async function POST(request: Request) {
  const id = runIdFrom(request);
  if ("error" in id) return NextResponse.json({ error: id.error }, { status: 400 });
  return NextResponse.json(save(seedState(), id.run));
}
