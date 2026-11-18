#!/usr/bin/env node
/**
 * Strips machine- and account-specific data from a `claude -p --output-format
 * stream-json` transcript before it's committed as evidence: the init event
 * (tools, MCP servers, plugins, skills, paths), rate-limit events, and the
 * absolute repo path. The conversation, edits and hook feedback are kept.
 *
 *   node scripts/sanitize-session.js kane-traces/agent-sessions/<file>.jsonl
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const HOME = require("os").homedir();

for (const file of process.argv.slice(2)) {
  const kept = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (e.type === "system" && e.subtype === "init") continue;
    if (e.rate_limit_info || e.type === "rate_limit_event") continue;
    let text = JSON.stringify(e).split(ROOT + "/").join("./").split(ROOT).join(".").split(HOME).join("~");
    kept.push(text);
  }
  fs.writeFileSync(file, kept.join("\n") + "\n");
  console.log(`sanitized ${path.relative(ROOT, file)} (${kept.length} events)`);
}
