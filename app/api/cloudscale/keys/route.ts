import { NextResponse } from "next/server";
import { generateKey } from "@/lib/cloudscale";
import { load, runIdFrom, save } from "@/lib/cloudscale-store";

export const dynamic = "force-dynamic";

/** Creates a key. The full secret is returned once and never stored. */
export async function POST(request: Request) {
  const id = runIdFrom(request);
  if ("error" in id) return NextResponse.json({ error: id.error }, { status: 400 });
  const { state, secret } = generateKey(load(id.run));
  return NextResponse.json({ state: save(state, id.run), secret }, { status: 201 });
}
