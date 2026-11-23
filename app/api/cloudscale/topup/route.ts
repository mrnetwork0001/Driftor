import { NextResponse } from "next/server";
import { topUp } from "@/lib/cloudscale";
import { load, runIdFrom, save } from "@/lib/cloudscale-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const id = runIdFrom(request);
  if ("error" in id) return NextResponse.json({ error: id.error }, { status: 400 });
  return NextResponse.json(save(topUp(load(id.run)), id.run));
}
