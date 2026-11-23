#!/usr/bin/env node
/**
 * Checks everything the Driftor gate needs before you spend Kane credits:
 * Node version, the kane-cli binary, a logged-in Kane account, a running app,
 * and a coding agent for --heal.
 *
 *   npm run driftor:preflight
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
let ok = true;
const pass = (msg) => console.log(` ✓ ${msg}`);
const fail = (msg, fix) => {
  ok = false;
  console.log(` ✗ ${msg}${fix ? `\n     → ${fix}` : ""}`);
};
const warn = (msg) => console.log(` ! ${msg}`);

function has(cmd) {
  const r = spawnSync("which", [cmd], { encoding: "utf8" });
  return r.status === 0 && r.stdout.trim();
}

async function main() {
  console.log("Driftor preflight\n");

  const major = Number(process.versions.node.split(".")[0]);
  if (major >= 18) pass(`Node ${process.versions.node}`);
  else fail(`Node ${process.versions.node} is too old`, "install Node 18 or newer");

  const local = path.join(ROOT, "node_modules", ".bin", "kane-cli");
  const kane = fs.existsSync(local) ? local : has("kane-cli");
  if (!kane) {
    fail("kane-cli not found", "npm install");
  } else {
    const v = spawnSync(kane, ["--version"], { encoding: "utf8" });
    pass(`kane-cli ${v.stdout.trim()}`);
    const bal = spawnSync(kane, ["balance"], { encoding: "utf8" });
    if (bal.status === 0) pass(`Kane account: ${bal.stdout.trim().split("\n").filter(Boolean).pop()}`);
    else fail("Kane is not logged in", "npm run kane:login");
  }

  let appUrl = process.env.DRIFTOR_URL || null;
  if (!appUrl) {
    for (let port = 3000; port <= 3010 && !appUrl; port++) {
      try {
        const res = await fetch(`http://localhost:${port}`, { signal: AbortSignal.timeout(2000) });
        if ((await res.text()).includes('data-driftor="active"')) appUrl = `http://localhost:${port}`;
      } catch {
        /* keep scanning */
      }
    }
  }
  if (appUrl) pass(`App running at ${appUrl}`);
  else fail("No Driftor app on localhost:3000–3010", "npm run dev (in another terminal), or set DRIFTOR_URL");

  const agents = ["claude", "gemini"].filter(has);
  if (agents.length) pass(`Heal agent: ${agents.join(", ")}`);
  else warn("No coding agent found (claude or gemini). The gate works; --heal needs one.");

  const live = require(path.join(ROOT, "lib", "regressions.js")).active();
  if (!live.length) pass("Demo app source is healthy");
  else warn(`Demo app has an injected regression (${live.join(", ")}). \`npm run driftor:reset\` restores it.`);

  console.log(ok ? "\nReady: npm run driftor:gate" : "\nFix the items above first.");
  process.exit(ok ? 0 : 1);
}

main();
