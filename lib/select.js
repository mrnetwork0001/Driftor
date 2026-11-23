/**
 * Change-based objective selection: run only the Kane objectives a change can
 * affect. Each objective lists the source it covers (`covers`, globs) in
 * driftor.config.json; `select.shared` lists files that affect every objective
 * (layout, global CSS, the overlay layer, domain logic, build config) and
 * `select.ignore` lists files that cannot change what a browser sees on the
 * guarded page (the Driftor site, docs, tooling).
 *
 * The rule is deliberately conservative. For each changed file:
 *   ignore match  → affects nothing
 *   shared match  → affects every objective
 *   covers match  → affects the objectives that cover it
 *   no match      → affects every objective (unknown file: run it)
 * If the changed set can't be computed (no git, no baseline), every objective runs.
 * Shared wins over ignore, so a file listed in both still runs everything.
 */

const { spawnSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

/* ── globs ────────────────────────────────────────────────────────────────── */

const globCache = new Map();

/** Minimal glob → RegExp: `**` spans directories, `*` and `?` stay within one segment. */
function globToRegExp(glob) {
  if (globCache.has(glob)) return globCache.get(glob);
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      if (glob[i + 2] === "/") {
        re += "(?:.*/)?";
        i += 2;
      } else {
        re += ".*";
        i += 1;
      }
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  const compiled = new RegExp(`^${re}$`);
  globCache.set(glob, compiled);
  return compiled;
}

const normalize = (file) => file.replace(/\\/g, "/").replace(/^\.\//, "");
const matchesAny = (file, globs = []) => globs.some((g) => globToRegExp(g).test(normalize(file)));

/* ── selection ────────────────────────────────────────────────────────────── */

/**
 * @param {string[] | null} changed  repo-relative paths, or null when unknown
 * @param {{ objectives: {id: string, covers?: string[]}[], select?: {shared?: string[], ignore?: string[]} }} config
 * @returns {{ selected: string[], skipped: {id: string, reason: string}[], files: {file: string, effect: string, objectives: string[]}[], reasons: Record<string, string[]> }}
 */
function selectObjectives(changed, config) {
  const objectives = config.objectives || [];
  const all = objectives.map((o) => o.id);
  const { shared = [], ignore = [] } = config.select || {};

  if (changed == null) {
    return {
      selected: all,
      skipped: [],
      files: [],
      reasons: Object.fromEntries(all.map((id) => [id, ["changed files unknown — running everything"]])),
    };
  }

  const reasons = Object.fromEntries(all.map((id) => [id, []]));
  const files = [];
  for (const raw of changed) {
    const file = normalize(raw);
    let effect;
    let hit;
    if (matchesAny(file, shared)) {
      effect = "shared";
      hit = all;
    } else if (matchesAny(file, ignore)) {
      effect = "ignored";
      hit = [];
    } else {
      hit = objectives.filter((o) => matchesAny(file, o.covers)).map((o) => o.id);
      // An objective without `covers` can't say what it doesn't need, so it runs on any app change.
      const uncovered = objectives.filter((o) => !Array.isArray(o.covers)).map((o) => o.id);
      if (hit.length) {
        effect = "covers";
        hit = [...new Set([...hit, ...uncovered])];
      } else {
        effect = "unknown";
        hit = all;
      }
    }
    files.push({ file, effect, objectives: hit });
    for (const id of hit) reasons[id].push(`${file} (${effect})`);
  }

  const selected = all.filter((id) => reasons[id].length);
  const ignoredFiles = files.filter((f) => f.effect === "ignored").map((f) => f.file);
  const skipped = all
    .filter((id) => !reasons[id].length)
    .map((id) => ({
      id,
      reason: changed.length
        ? `no changed file is shared or covered by it (changed: ${files.map((f) => f.file).join(", ")}${
            ignoredFiles.length ? `; ignored: ${ignoredFiles.join(", ")}` : ""
          })`
        : "no files changed",
    }));
  for (const id of Object.keys(reasons)) if (!reasons[id].length) delete reasons[id];
  return { selected, skipped, files, reasons };
}

/* ── changed files ────────────────────────────────────────────────────────── */

/** Tracked changes against HEAD (staged + unstaged, renames as delete + add) plus untracked files. null if git fails. */
function gitChangedFiles(root) {
  const git = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
  const diff = git(["diff", "--name-only", "--no-renames", "HEAD"]);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]);
  if (diff.status !== 0 || untracked.status !== 0) return null;
  const list = `${diff.stdout}\n${untracked.stdout}`.split("\n").map((s) => s.trim()).filter(Boolean);
  return [...new Set(list.map(normalize))].sort();
}

/**
 * Content hash of every file the gate cares about: the watched directories plus
 * root-level files that match a shared glob (package.json, tailwind config …).
 * driftor.js stores this on a green gate, so the next hook run can diff against it.
 */
function snapshot(root, config) {
  const files = {};
  const add = (full) => {
    files[normalize(path.relative(root, full))] = crypto.createHash("sha1").update(fs.readFileSync(full)).digest("hex");
  };
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) add(full);
    }
  };
  for (const dir of config.watch || ["app"]) walk(path.join(root, dir));
  const shared = (config.select && config.select.shared) || [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile() && matchesAny(entry.name, shared)) add(path.join(root, entry.name));
  }
  return files;
}

/** Files added, removed or modified between two snapshots. */
function diffSnapshots(before, after) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...keys].filter((k) => (before || {})[k] !== (after || {})[k]).sort();
}

module.exports = { globToRegExp, matchesAny, selectObjectives, gitChangedFiles, snapshot, diffSnapshots };
