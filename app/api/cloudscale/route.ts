import { NextResponse } from "next/server";
import { load } from "@/lib/cloudscale-store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(load());
}
