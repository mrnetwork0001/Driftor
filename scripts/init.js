/**
 * `driftor init`: set Driftor up in another Next.js or Vite repo.
 *
 *   npx github:mrnetwork0001/Driftor init          # in the repo to set up
 *   node driftor.js init [--dir <repo>] [--port <n>] [--force]
 *
 * It writes, in the target repo:
 *   .driftor/driftor.js, .driftor/driftor_test.js, .driftor/lib/{heal,select,acceptance}.js   the runtime the hook runs
 *   driftor.config.json        placeholder objectives to edit (kept if it exists, unless --force)
 *   .claude/settings.json      the Stop hook, merged into existing hooks; it only acts with DRIFTOR_HOOK=1
 *   package.json scripts       driftor:gate, driftor:check, driftor:heal, driftor:watch, driftor:agent
 *   .gitignore                 Driftor's local state
 * The bug zoo, the reset endpoint and the unit command are optional and left off.
 */

const fs = require("fs");
const path = require("path");

const PKG_ROOT = path.join(__dirname, "..");
// Everything driftor.js and driftor_test.js require at runtime (lib/regressions.js is optional).
const RUNTIME = ["driftor.js", "driftor_test.js", "lib/heal.js", "lib/select.js", "lib/acceptance.js"];
const HOOK_COMMAND = 'node "$CLAUDE_PROJECT_DIR/.driftor/driftor.js" --hook';
const IGNORE = ["kane-traces/latest.ndjson", "kane-traces/hook.log", ".data/driftor-hook.json", ".testmuai/evidence/"];

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, obj) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(obj, null, 2)}\n`);
};

const firstFile = (dir, names) => names.map((f) => path.join(dir, f)).find((f) => fs.existsSync(f));

/** The path part of Vite's `base` or Next's `basePath`, e.g. "/todo-react/" (default "/"). */
function basePathFrom(file, key) {
  const m = file && fs.readFileSync(file, "utf8").match(new RegExp(`\\b${key}\\s*:\\s*["'\`]([^"'\`]+)["'\`]`));
  if (!m) return "/";
  let p = m[1];
  try {
    p = new URL(p).pathname; // Vite allows a full URL
  } catch {
    /* already a path */
  }
  return `/${p.replace(/^\.?\/+|\/+$/g, "")}/`.replace(/^\/\/$/, "/");
}

/** { framework, port, basePath, watch } from package.json, the dev script and the framework config. */
function detect(dir) {
  const pkg = readJson(path.join(dir, "package.json"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const dev = (pkg.scripts && pkg.scripts.dev) || "";
  const portFlag = dev.match(/(?:--port|-p)[ =](\d{2,5})/);
  let framework = null;
  let port = null;
  let basePath = "/";
  if (deps.next) {
    framework = "Next.js";
    port = 3000;
    basePath = basePathFrom(firstFile(dir, ["next.config.js", "next.config.mjs", "next.config.ts"]), "basePath");
  } else if (deps.vite) {
    framework = "Vite";
    port = 5173;
    const viteConfig = firstFile(dir, ["vite.config.ts", "vite.config.js", "vite.config.mts", "vite.config.mjs"]);
    basePath = basePathFrom(viteConfig, "base");
    const m = viteConfig && fs.readFileSync(viteConfig, "utf8").match(/server\s*:\s*{[^}]*?port\s*:\s*(\d{2,5})/s);
    if (m) port = Number(m[1]);
  }
  if (portFlag) port = Number(portFlag[1]);
  const watch = ["src", "app", "pages", "components", "lib", "styles"].filter((d) => fs.existsSync(path.join(dir, d)));
  return { name: pkg.name || path.basename(dir), framework, port, basePath, watch: watch.length ? watch : ["."], hasKane: !!deps["@testmuai/kane-cli"] };
}

function starterConfig({ name, framework, port, basePath = "/", watch }) {
  return {
    app: `${name} (${framework})`,
    url: null,
    discover: { ports: [port, port] },
    reset: null,
    unit: null,
    watch,
    maxHealAttempts: 3,
    objectives: [
      {
        id: "home-loads",
        placeholder: true,
        viewport: "1920x1080",
        title: "EDIT ME: the main page loads and its primary action works",
        objective:
          `EDIT ME. Open {{url}}${basePath}. Verify the page shows <the heading or text a user sees first>. Click <the button a user clicks first> with a mouse click, as a user would. Do not use the keyboard, and do not wait for or work around anything that covers it; if the click does not reach it, the check fails. Verify <what changes on screen afterwards>.`,
      },
      {
        id: "narrow-screen",
        placeholder: true,
        viewport: "800x1000",
        title: "EDIT ME: the same flow on a narrow screen",
        objective:
          `EDIT ME. Open {{url}}${basePath}. Verify <the same first text>. Click <the same control> with a mouse click, as a user would. Do not use the keyboard, and do not wait for or work around anything that covers it; if the click does not reach it, the check fails. Verify <the same result>.`,
      },
    ],
  };
}

/** Adds Driftor's Stop hook to .claude/settings.json without touching anything else. */
function mergeHook(file) {
  const settings = fs.existsSync(file) ? readJson(file) : {};
  settings.hooks = settings.hooks || {};
  const stop = (settings.hooks.Stop = settings.hooks.Stop || []);
  const present = stop.some((group) => (group.hooks || []).some((h) => typeof h.command === "string" && h.command.includes("driftor.js") && h.command.includes("--hook")));
  if (!present) stop.push({ hooks: [{ type: "command", command: HOOK_COMMAND, timeout: 900 }] });
  writeJson(file, settings);
  return present ? "already there" : "added";
}

function addScripts(file) {
  const pkg = readJson(file);
  pkg.scripts = pkg.scripts || {};
  const wanted = {
    "driftor:gate": "node .driftor/driftor.js gate",
    "driftor:check": "node .driftor/driftor.js gate --dry-run",
    "driftor:heal": "node .driftor/driftor.js --heal",
    "driftor:watch": "node .driftor/driftor.js --watch",
    "driftor:agent": "DRIFTOR_HOOK=1 claude",
  };
  const added = [];
  for (const [k, v] of Object.entries(wanted)) {
    if (pkg.scripts[k] === undefined) {
      pkg.scripts[k] = v;
      added.push(k);
    }
  }
  writeJson(file, pkg);
  return added;
}

function addIgnores(file) {
  const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const have = new Set(text.split("\n").map((l) => l.trim()));
  const missing = IGNORE.filter((l) => !have.has(l));
  if (missing.length) fs.writeFileSync(file, `${text}${text && !text.endsWith("\n") ? "\n" : ""}\n# Driftor local state\n${missing.join("\n")}\n`);
  return missing;
}

function main(argv = []) {
  const flag = (name) => {
    const i = argv.indexOf(name);
    return i !== -1 ? argv[i + 1] : null;
  };
  const dir = path.resolve(flag("--dir") || process.cwd());
  const force = argv.includes("--force");
  const log = (s) => console.log(` ${s}`);

  console.log("Driftor init\n");
  if (!fs.existsSync(path.join(dir, "package.json"))) {
    console.error(` ✗ No package.json in ${dir}. Run this in the root of a Next.js or Vite app.`);
    return 1;
  }
  if (path.resolve(dir) === path.resolve(PKG_ROOT)) {
    console.error(" ✗ This is the Driftor repo itself; it is already set up.");
    return 1;
  }
  const found = detect(dir);
  if (flag("--port")) found.port = Number(flag("--port"));
  if (!found.framework) {
    console.error(" ✗ Couldn't find next or vite in package.json. Driftor init supports Next.js and Vite apps.");
    return 1;
  }
  log(`✓ ${found.framework} app "${found.name}", dev server on port ${found.port}${found.basePath !== "/" ? `, base path ${found.basePath}` : ""}`);

  for (const rel of RUNTIME) {
    const dest = path.join(dir, ".driftor", rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(PKG_ROOT, rel), dest);
  }
  // The runtime is CommonJS; this keeps it so in a repo whose package.json says "type": "module" (Vite's default).
  writeJson(path.join(dir, ".driftor", "package.json"), { private: true, type: "commonjs" });
  log(`✓ Runtime copied to .driftor/ (${RUNTIME.join(", ")})`);

  const configFile = path.join(dir, "driftor.config.json");
  if (fs.existsSync(configFile) && !force) {
    log("• driftor.config.json exists; kept it (--force to overwrite)");
  } else {
    writeJson(configFile, starterConfig(found));
    log(`✓ driftor.config.json written with 2 placeholder objectives (watching ${found.watch.join(", ")})`);
  }

  log(`✓ Stop hook ${mergeHook(path.join(dir, ".claude", "settings.json"))} in .claude/settings.json (acts only with DRIFTOR_HOOK=1)`);
  const scripts = addScripts(path.join(dir, "package.json"));
  log(scripts.length ? `✓ npm scripts added: ${scripts.join(", ")}` : "• npm scripts already present");
  const ignores = addIgnores(path.join(dir, ".gitignore"));
  if (ignores.length) log(`✓ .gitignore: ${ignores.join(", ")}`);

  console.log("\nNext:");
  const steps = [];
  if (!found.hasKane) steps.push("npm install -D @testmuai/kane-cli");
  steps.push(
    "npx kane-cli login            # once per machine",
    'Edit the objectives in driftor.config.json and delete "placeholder": true',
    `npm run dev                   # start the app (Driftor looks on port ${found.port})`,
    "npm run driftor:check         # config + app discovery, no browser",
    "npm run driftor:gate          # Kane runs the objectives in real Chrome",
    "npm run driftor:agent         # Claude Code with the Stop hook on"
  );
  steps.forEach((s, i) => console.log(` ${i + 1}. ${s}`));
  return 0;
}

module.exports = { main, detect, starterConfig, mergeHook };
