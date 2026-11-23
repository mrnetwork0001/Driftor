import { NextResponse } from "next/server";
import { load, runIdFrom } from "@/lib/cloudscale-store";

export const dynamic = "force-dynamic";

/** `?run=<id>` reads that run's own state; without it, the shared state. */
export async function GET(request: Request) {
  const id = runIdFrom(request);
  if ("error" in id) return NextResponse.json({ error: id.error }, { status: 400 });
  return NextResponse.json(load(id.run));
}
