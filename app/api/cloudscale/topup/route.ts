import { NextResponse } from "next/server";
import { topUp } from "@/lib/cloudscale";
import { load, save } from "@/lib/cloudscale-store";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(save(topUp(load())));
}
