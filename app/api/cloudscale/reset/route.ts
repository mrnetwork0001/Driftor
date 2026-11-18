import { NextResponse } from "next/server";
import { seedState } from "@/lib/cloudscale";
import { save } from "@/lib/cloudscale-store";

export const dynamic = "force-dynamic";

/** Restores the seed state. driftor_test.js calls this before each objective. */
export async function POST() {
  return NextResponse.json(save(seedState()));
}
