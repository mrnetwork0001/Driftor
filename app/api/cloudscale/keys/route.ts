import { NextResponse } from "next/server";
import { generateKey } from "@/lib/cloudscale";
import { load, save } from "@/lib/cloudscale-store";

export const dynamic = "force-dynamic";

/** Creates a key. The full secret is returned once and never stored. */
export async function POST() {
  const { state, secret } = generateKey(load());
  return NextResponse.json({ state: save(state), secret }, { status: 201 });
}
