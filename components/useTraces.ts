"use client";

import { useEffect, useState } from "react";
import type { TracesResponse } from "@/app/api/traces/route";

export type TraceState = TracesResponse;

export function useTraces(intervalMs = 2000) {
  const [data, setData] = useState<TraceState | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/traces", { cache: "no-store" });
        const json = (await res.json()) as TraceState;
        if (alive) {
          setData(json);
          setError(false);
        }
      } catch {
        if (alive) setError(true);
      }
    };
    load();
    const id = setInterval(load, intervalMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [intervalMs]);

  return { data, error };
}
