/**
 * Turns Kane CLI NDJSON traces into the bug report a coding agent receives.
 * Shared by driftor.js (CommonJS) and the website's /api/traces route, so the
 * site shows exactly the prompt the agent gets.
 */

const FAILED = new Set(["failed", "fail", "failure", "error"]);

function isFailure(evt) {
  if (!evt || typeof evt !== "object") return false;
  if (evt.type === "error") return true;
  if (typeof evt.status === "string" && FAILED.has(evt.status.toLowerCase())) return true;
  if (evt.passed === false || evt.success === false) return true;
  return false;
}

function parseNdjson(text) {
  const events = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      /* non-JSON log line */
    }
  }
  return events;
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && typeof obj[k] === "string" && obj[k].trim()) return obj[k].trim();
  }
  return undefined;
}

/** One finding per failing event, with readable fields plus the raw event. */
function extractFindings(traceName, events) {
  return events.filter(isFailure).map((evt) => {
    const v = evt.verdict && typeof evt.verdict === "object" ? evt.verdict : {};
    const raw = JSON.stringify(evt);
    return {
      trace: traceName,
      step: evt.step ?? evt.step_index ?? null,
      summary: pick(evt, ["remark", "summary", "message", "error", "reason"]) || pick(v, ["summary", "bug_title"]),
      rootCause: pick(v, ["root_cause", "reason"]),
      suggestion: pick(v, ["suggestion", "fix"]),
      code: pick(evt, ["reason_code", "code"]),
      raw: raw.length > 1200 ? raw.slice(0, 1200) + "…" : raw,
    };
  });
}

const DEFAULT_APP = "the CloudScale demo app (Next.js, source in app/app/)";

function buildHealPrompt(findings, { app = DEFAULT_APP } = {}) {
  const lines = [
    `Kane CLI drove a real Chrome browser against ${app}`,
    "and a user flow failed. Unit tests in JSDOM can still pass when this happens: the",
    "bug is usually in layout, stacking or styling that only a real browser sees.",
    "",
    "Failing evidence from kane-traces/:",
  ];
  for (const f of findings) {
    lines.push(`- [${f.trace}]${f.step != null ? ` step ${f.step}` : ""}`);
    const seen = new Set();
    const add = (label, text) => {
      if (!text || seen.has(text)) return;
      seen.add(text);
      lines.push(`    ${label}: ${text.split("\n").join("\n      ")}`);
    };
    add("what happened", f.summary);
    add("kane's analysis", f.rootCause);
    add("kane's suggestion", f.suggestion);
    if (f.code) lines.push(`    code: ${f.code}`);
    lines.push(`    raw event: ${f.raw}`);
  }
  lines.push(
    "",
    "Kane's end-of-run analysis is based on a screenshot and can misjudge transparent",
    "elements. Trust the step-level evidence: the click did not reach its target.",
    "",
    "Find the cause in the app source and fix it so real clicks reach their targets on",
    "wide and narrow screens. Keep the change minimal. Do not edit tests, Kane objectives,",
    "driftor.js, driftor_test.js or anything under kane-traces/."
  );
  return lines.join("\n");
}

module.exports = { parseNdjson, extractFindings, buildHealPrompt, isFailure };
