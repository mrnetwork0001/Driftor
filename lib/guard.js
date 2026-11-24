/**
 * The guard: the agent can't mark its own homework.
 * ---------------------------------------------------------------------------
 * Before the Stop hook spends a Kane credit, it looks at what the agent changed
 * and refuses "fixes" that move the goalposts instead of fixing the app:
 *
 *   protected      edits to the tests, the objectives, the verifier, the Kane
 *                  evidence or the hook wiring (`guard.protect`, globs). New test
 *                  files are allowed; changing or deleting existing ones is not.
 *                  package.json counts only when a test/driftor script changes;
 *                  .claude/settings*.json only when its hooks or env change.
 *   removed-label  a quoted UI label the checks use ("Generate Production API
 *                  Key") was in the app source before and is now nowhere in it.
 *   hidden-label   the element carrying such a label (same JSX element: its
 *                  opening tag, found from the label or its data-testid) gained
 *                  hiding: hidden / invisible / opacity-0 / sr-only classes,
 *                  display:none / visibility:hidden / opacity:0 styles, the
 *                  hidden / aria-hidden / inert attributes, or a newly forced
 *                  `disabled`. A CSS rule that hides it by its testid or id counts.
 *
 * "What the agent changed" is the working tree against a starting point: the
 * session baseline recorded by the SessionStart hook (the files that were already
 * dirty when the session began, with their contents), or, without one, git HEAD.
 * Files Driftor writes itself during the hook (Kane evidence, logs) are recorded
 * after each hook run and excused while unchanged.
 *
 * It is a heuristic over text, not a proof: see docs/guard.md for what it misses.
 * Kane still checks the real app afterwards.
 */

const { spawnSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { matchesAny } = require("./select");

const DEFAULT_PROTECT = [
  "tests/**",
  "**/*.test.*",
  "**/*.spec.*",
  "**/__tests__/**",
  "vitest.config.*",
  "driftor.config.json",
  "driftor.js",
  "driftor_test.js",
  "lib/heal.js",
  "lib/select.js",
  "lib/acceptance.js",
  "lib/guard.js",
  "lib/regressions.js",
  ".driftor/*.js",
  ".driftor/package.json",
  ".driftor/lib/**",
  "kane-traces/**",
  ".testmuai/**",
  ".claude/settings*.json",
  "policies/**",
  ".github/workflows/**",
  "package.json",
];

/** New files here are fine: adding a test doesn't weaken the existing ones. */
const TEST_FILE = ["tests/**", "**/*.test.*", "**/*.spec.*", "**/__tests__/**"];

const SOURCE_EXT = /\.(tsx?|jsx?|mjs|cjs|css|scss|sass|less|html|vue|svelte|astro|mdx)$/;
const MAX_BYTES = 1024 * 1024;

function guardConfig(config = {}) {
  const raw = config.guard && typeof config.guard === "object" ? config.guard : {};
  return {
    enabled: config.guard !== false && raw.enabled !== false && process.env.DRIFTOR_GUARD !== "0",
    protect: Array.isArray(raw.protect) ? raw.protect : DEFAULT_PROTECT,
    allowNewTests: raw.allowNewTests !== false,
    labels: Array.isArray(raw.labels) ? raw.labels : [],
  };
}

/* ── git and files ────────────────────────────────────────────────────────── */

const git = (root, args) => spawnSync("git", ["-c", "core.quotepath=off", ...args], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const norm = (f) => f.replace(/\\/g, "/").replace(/^\.\//, "");

/** Working tree + untracked vs HEAD, paths relative to root. null when root isn't in a git repo with a commit. */
function dirtyFiles(root) {
  const diff = git(root, ["diff", "--name-only", "--no-renames", "--relative", "-z", "HEAD"]);
  const untracked = git(root, ["ls-files", "--others", "--exclude-standard", "-z"]);
  if (diff.status !== 0 || untracked.status !== 0) return null;
  const list = `${diff.stdout}\0${untracked.stdout}`.split("\0").filter(Boolean).map(norm);
  return [...new Set(list)].sort();
}

function readText(root, file) {
  const full = path.join(root, file);
  try {
    const st = fs.statSync(full);
    if (!st.isFile()) return null;
    if (st.size > MAX_BYTES) return undefined; // too big to inspect
    return fs.readFileSync(full, "utf8");
  } catch {
    return null;
  }
}

function hashFile(root, file) {
  try {
    return crypto.createHash("sha1").update(fs.readFileSync(path.join(root, file))).digest("hex");
  } catch {
    return null; // missing
  }
}

/** The file's text at HEAD, or null if HEAD doesn't have it. */
function headText(root, file) {
  const r = git(root, ["show", `HEAD:./${file}`]);
  return r.status === 0 ? r.stdout : null;
}

/** {file: hash|null} for every file that differs from HEAD. */
function dirtyHashes(root) {
  const files = dirtyFiles(root);
  if (!files) return null;
  return Object.fromEntries(files.map((f) => [f, hashFile(root, f)]));
}

/**
 * The session's starting point: every file already dirty when the session began,
 * with its text (so later diffs are against it, not HEAD). Recorded by SessionStart.
 */
function recordBaseline(root) {
  const files = dirtyFiles(root);
  if (!files) return null;
  const head = git(root, ["rev-parse", "HEAD"]).stdout.trim();
  const out = {};
  for (const f of files) {
    const text = readText(root, f);
    out[f] = { hash: hashFile(root, f), text: text === undefined ? undefined : text };
  }
  return { createdAt: new Date().toISOString(), head, files: out };
}

/* ── labels ───────────────────────────────────────────────────────────────── */

const QUOTED = /"([^"\n]{2,120})"|“([^”\n]{2,120})”/g;
// In a designed test, a quoted label in a sentence like this is something the task wants gone.
const ABSENCE = /\b(absent|no longer|not (?:be )?(?:shown|visible|present|listed|displayed)|disappear|removed?\b|hidden|gone|missing)/i;

function quotedIn(text) {
  const out = [];
  for (const m of text.matchAll(QUOTED)) {
    const label = (m[1] || m[2]).trim();
    if (label.length >= 2 && !label.includes("{{")) out.push(label);
  }
  return out;
}

/** Quoted UI labels the checks rely on: objectives, guard.labels, and designed acceptance tests. */
function checkedLabels(config, { acceptanceTests = [], extra = [] } = {}) {
  const labels = new Map();
  const add = (label, source) => {
    const key = collapse(label);
    if (!labels.has(key)) labels.set(key, { label: key, sources: [] });
    if (!labels.get(key).sources.includes(source)) labels.get(key).sources.push(source);
  };
  for (const o of config.objectives || []) for (const l of quotedIn(o.objective || "")) add(l, `objective ${o.id}`);
  for (const l of [...guardConfig(config).labels, ...extra]) add(l, "guard.labels");
  for (const t of acceptanceTests) {
    const body = t.text.replace(/^---[\s\S]*?\n---\n/, "");
    for (const sentence of body.split(/(?<=[.;])\s+|\n/)) {
      if (ABSENCE.test(sentence)) continue;
      for (const l of quotedIn(sentence)) add(l, `designed test ${t.name}`);
    }
  }
  return [...labels.values()];
}

/** The tests Kane designed for this task (lib/acceptance.js stores them in .driftor/acceptance/<key>/). */
function acceptanceTestsFor(root, requests) {
  if (!requests || !requests.length) return [];
  const base = path.join(root, ".driftor", "acceptance");
  if (!fs.existsSync(base)) return [];
  const out = [];
  for (const key of fs.readdirSync(base)) {
    try {
      const m = JSON.parse(fs.readFileSync(path.join(base, key, "manifest.json"), "utf8"));
      if (JSON.stringify(m.requests) !== JSON.stringify(requests)) continue;
      for (const t of m.tests || []) {
        const file = path.join(base, key, t.file);
        if (fs.existsSync(file)) out.push({ name: path.basename(t.file), text: fs.readFileSync(file, "utf8") });
      }
    } catch {
      /* not a manifest */
    }
  }
  return out;
}

/* ── source scanning ──────────────────────────────────────────────────────── */

const collapse = (s) => s.replace(/\s+/g, " ").trim();

/**
 * Blanks // and /* *\/ comments (keeping length and newlines), so a label that
 * only survives in a comment doesn't count as present. String-aware enough for
 * TSX: an apostrophe after a letter (JSX text "Don't") doesn't open a string,
 * and `//` right after `:` (a URL) isn't a comment.
 */
function stripComments(text) {
  const out = text.split("");
  let i = 0;
  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (out[k] !== "\n") out[k] = " ";
  };
  while (i < text.length) {
    const c = text[i];
    const n = text[i + 1];
    if (c === "/" && n === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end === -1 ? text.length : end + 2;
      blank(i, stop);
      i = stop;
    } else if (c === "/" && n === "/" && text[i - 1] !== ":") {
      let stop = text.indexOf("\n", i);
      if (stop === -1) stop = text.length;
      blank(i, stop);
      i = stop;
    } else if (c === '"' || c === "`" || (c === "'" && !/[A-Za-z0-9]/.test(text[i - 1] || ""))) {
      let k = i + 1;
      while (k < text.length && text[k] !== c && (c === "`" || text[k] !== "\n")) k += text[k] === "\\" ? 2 : 1;
      i = k + 1;
    } else i++;
  }
  return out.join("");
}

const flatCache = new Map();
/** The text with whitespace runs collapsed, and a map from each flat index back into the text. */
function flatten(text) {
  if (flatCache.has(text)) return flatCache.get(text);
  const chars = [];
  const map = [];
  let space = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === " " || c === "\n" || c === "\t" || c === "\r") {
      if (!space && chars.length) {
        chars.push(" ");
        map.push(i);
      }
      space = true;
    } else {
      chars.push(c);
      map.push(i);
      space = false;
    }
  }
  const out = { flat: chars.join(""), map };
  if (flatCache.size > 200) flatCache.clear();
  flatCache.set(text, out);
  return out;
}

const stripCache = new Map();
function stripped(text) {
  if (!stripCache.has(text)) {
    if (stripCache.size > 200) stripCache.clear();
    stripCache.set(text, stripComments(text));
  }
  return stripCache.get(text);
}

/** Positions (in text) where the label occurs, matching across collapsed whitespace. */
function findLabel(text, label) {
  const { flat, map } = flatten(text);
  const hits = [];
  for (let at = flat.indexOf(label); at !== -1; at = flat.indexOf(label, at + 1)) {
    // Whole label only: "Keys" mustn't match inside "API Keys2".
    const before = flat[at - 1];
    const after = flat[at + label.length];
    if (/\w/.test(label[0]) && before && /\w/.test(before)) continue;
    if (/\w/.test(label[label.length - 1]) && after && /\w/.test(after)) continue;
    hits.push(map[at]);
  }
  return hits;
}

const JSX_PREV = /(^|[\s(,=?:&|{}[\]>;!]|return|yield|default)$/;

/** JSX tags: {start, end, name, kind: open|close|self}. Skips TypeScript generics (`useState<Foo>`) and comparisons. */
function scanTags(text) {
  const tags = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "<") continue;
    const next = text[i + 1];
    const closing = next === "/";
    const nameStart = closing ? i + 2 : i + 1;
    if (!/[A-Za-z>]/.test(text[nameStart] || "")) continue;
    if (!closing && !JSX_PREV.test(text.slice(Math.max(0, i - 8), i).replace(/\s+$/, " "))) continue;
    // Walk to the tag's closing `>`, skipping braces and quotes (`onClick={() => …}`).
    let k = nameStart;
    let depth = 0;
    let quote = null;
    for (; k < text.length; k++) {
      const c = text[k];
      if (quote) {
        if (c === "\\") k++;
        else if (c === quote) quote = null;
      } else if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth <= 0) break;
      else if (c === "<" && depth <= 0 && k > nameStart && text[k - 1] !== "=") {
        k = -1; // a `<` inside a tag: this wasn't a tag
        break;
      }
    }
    if (k < 0 || k >= text.length) continue;
    const name = (text.slice(nameStart, k).match(/^[\w.:-]*/) || [""])[0];
    const kind = closing ? "close" : text[k - 1] === "/" ? "self" : "open";
    tags.push({ start: i, end: k + 1, name, kind });
    i = k;
  }
  return tags;
}

/** The innermost element whose opening tag contains `pos`, or that is open around it. */
function elementAt(tags, pos) {
  const stack = [];
  for (const t of tags) {
    if (t.start > pos) break;
    if (t.end > pos) return t; // pos is inside this tag (an attribute, e.g. aria-label)
    if (t.kind === "open") stack.push(t);
    else if (t.kind === "close") {
      const idx = stack.map((s) => s.name).lastIndexOf(t.name);
      if (idx !== -1) stack.length = idx;
    }
  }
  return stack[stack.length - 1] || null;
}

const lineOf = (text, pos) => text.slice(0, pos).split("\n").length;

/** Replaces the inside of every string literal with spaces (same length), to find attribute names. */
function blankStrings(s) {
  return s.replace(/"[^"]*"|'[^']*'|`[^`]*`/g, (m) => m[0] + " ".repeat(m.length - 2) + m[m.length - 1]);
}

const HIDE_CLASS = new Set(["hidden", "invisible", "opacity-0", "sr-only", "collapse"]);
const RESPONSIVE = /^(sm|md|lg|xl|2xl|max-sm|max-md|max-lg|max-xl|max-2xl|min-\[[^\]]+\]|max-\[[^\]]+\]|print|portrait|landscape)$/;

/** Hiding found in one opening tag, as a multiset of tokens ("class:hidden", "style:display:none", "attr:aria-hidden", "attr:disabled=…"). */
function hidingTokens(tag) {
  const tokens = [];
  // Classes: every whitespace-separated word inside a string literal. State variants
  // (disabled:opacity-60, hover:…) aren't hiding; responsive ones (lg:hidden) are.
  for (const m of tag.matchAll(/"([^"]*)"|'([^']*)'|`([^`]*)`/g)) {
    for (const word of (m[1] ?? m[2] ?? m[3]).split(/[\s"'`{}$]+/)) {
      const parts = word.replace(/^!/, "").replace(/!$/, "").split(":");
      const base = parts.pop();
      if (HIDE_CLASS.has(base) && parts.every((v) => RESPONSIVE.test(v))) tokens.push(`class:${word}`);
    }
  }
  const style = tag.replace(/\s+/g, " ");
  if (/display\s*:\s*["']?none/i.test(style)) tokens.push("style:display:none");
  if (/visibility\s*:\s*["']?(hidden|collapse)/i.test(style)) tokens.push("style:visibility:hidden");
  if (/opacity\s*:\s*["']?(0|0?\.0+)["']?\s*(?=[,};!]|$)/i.test(style)) tokens.push("style:opacity:0");
  const blanked = blankStrings(tag);
  for (const m of blanked.matchAll(/(?<=\s)(aria-hidden|hidden|inert|disabled)(?=[\s=/>]|$)/g)) {
    const name = m[1];
    let value = "";
    const at = m.index + name.length;
    if (blanked[at] === "=") {
      const rest = tag.slice(at + 1);
      value = (rest.match(/^(\{(?:[^{}]|\{[^{}]*\})*\}|"[^"]*"|'[^']*')/) || [""])[0];
    }
    const v = value.replace(/^\{|\}$|^["']|["']$/g, "").trim();
    if (/^(false|undefined|null)$/.test(v)) continue;
    if (name === "disabled") tokens.push(`attr:disabled=${v || "true"}`);
    else tokens.push(`attr:${name}`);
  }
  return tokens;
}

/** Tokens in `after` that `before` doesn't have. A disabled whose condition changed only counts if it became always-on. */
function newTokens(before, after) {
  const left = [...before];
  const out = [];
  for (const t of after) {
    const i = left.indexOf(t);
    if (i !== -1) {
      left.splice(i, 1);
      continue;
    }
    if (t.startsWith("attr:disabled=")) {
      const v = t.slice("attr:disabled=".length);
      const had = left.findIndex((x) => x.startsWith("attr:disabled="));
      if (had !== -1 && !/^(true|"?disabled"?)$/.test(v)) {
        left.splice(had, 1);
        continue;
      }
    }
    out.push(t);
  }
  return out;
}

const attr = (tag, name) => (tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{\\s*["'\`]([^"'\`]*)["'\`]\\s*\\})`)) || []).slice(1).find(Boolean);

/**
 * The elements carrying a checked label in one file's (comment-stripped) source:
 * Map key (testid / id / label) → { tag text, line, label, tokens }.
 */
function checkedElements(text, labels, anchorIds) {
  const code = stripped(text);
  const tags = scanTags(code);
  const els = new Map();
  const put = (t, label) => {
    if (!t) return;
    const tagText = code.slice(t.start, t.end);
    const testid = attr(tagText, "data-testid");
    const id = attr(tagText, "id");
    const key = testid ? `testid:${testid}` : id ? `id:${id}` : `label:${label}`;
    if (els.has(key)) return;
    els.set(key, { key, testid, id, label, name: t.name, line: lineOf(code, t.start), tokens: hidingTokens(tagText) });
  };
  for (const { label } of labels) for (const pos of findLabel(code, label)) put(elementAt(tags, pos), label);
  for (const id of anchorIds) {
    for (const m of code.matchAll(new RegExp(`(?:data-testid|id)\\s*=\\s*\\{?\\s*["'\`]${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'\`]`, "g"))) {
      const t = tags.find((x) => x.start <= m.index && x.end > m.index);
      put(t, null);
    }
  }
  return els;
}

/* ── the check ────────────────────────────────────────────────────────────── */

function walkSource(root, dirs, skip) {
  const out = [];
  const walk = (rel) => {
    const full = path.join(root, rel);
    let entries;
    try {
      entries = fs.readdirSync(full, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const r = norm(path.join(rel, e.name));
      if (e.isDirectory()) walk(r);
      else if (SOURCE_EXT.test(e.name) && !skip(r)) out.push(r);
    }
  };
  for (const d of dirs) {
    if (fs.existsSync(path.join(root, d)) && fs.statSync(path.join(root, d)).isFile()) {
      if (!skip(norm(d))) out.push(norm(d));
    } else walk(d);
  }
  return out;
}

const parseJson = (t) => {
  try {
    return t == null ? null : JSON.parse(t);
  } catch {
    return undefined;
  }
};

const GUARDED_SCRIPT = /test|driftor|kane|vitest|jest|playwright|cypress|hook/i;

/** For files where only part matters: null if the change is harmless, else a description. */
function semanticChange(file, before, after) {
  const base = path.basename(file);
  if (base === "package.json") {
    const a = parseJson(before);
    const b = parseJson(after);
    if (a === undefined || b === undefined) return "package.json no longer parses";
    const sa = (a && a.scripts) || {};
    const sb = (b && b.scripts) || {};
    const keys = [...new Set([...Object.keys(sa), ...Object.keys(sb)])].filter((k) => sa[k] !== sb[k] && GUARDED_SCRIPT.test(`${k} ${sa[k] || ""} ${sb[k] || ""}`));
    return keys.length ? `changes the test/Driftor script${keys.length > 1 ? "s" : ""} ${keys.map((k) => `"${k}"`).join(", ")}` : null;
  }
  if (/^settings.*\.json$/.test(base) && file.includes(".claude/")) {
    const pick = (j) => JSON.stringify(j && typeof j === "object" ? { hooks: j.hooks, env: j.env, disableAllHooks: j.disableAllHooks } : j);
    const a = parseJson(before);
    const b = parseJson(after);
    if (a === undefined || b === undefined) return `${base} no longer parses`;
    return pick(a) !== pick(b) ? "changes the Claude Code hooks or env (how Driftor is wired in)" : null;
  }
  return undefined; // whole file counts
}

/**
 * @param {object} o
 * @param {string} o.root          project root (a git work tree)
 * @param {object} o.config        driftor.config.json
 * @param {object} [o.baseline]    recordBaseline() from session start; else HEAD is the starting point
 * @param {object} [o.own]         {file: hash} Driftor wrote itself; excused while unchanged
 * @param {object[]} [o.acceptanceTests]  [{name, text}] designed tests whose labels count too
 * @param {object[]} [o.injections]       bug-zoo swaps [{file, healthy, regressed}]; without a baseline, a live one counts as the starting point
 */
function runGuard({ root, config, baseline = null, own = {}, acceptanceTests = [], injections = [] }) {
  const cfg = guardConfig(config);
  const at = new Date().toISOString();
  const result = { at, verdict: "allow", baseline: baseline ? `session start (${baseline.createdAt})` : "git HEAD", inspected: [], violations: [], labels: [], notes: [] };
  if (!cfg.enabled) return { ...result, verdict: "off", notes: ["guard.enabled is false (or DRIFTOR_GUARD=0)"] };
  const dirty = dirtyHashes(root);
  if (!dirty) return { ...result, verdict: "skipped", notes: ["not a git work tree with a commit; nothing to compare against"] };
  result.dirty = dirty;

  // Candidates: dirty now, or dirty at session start (and maybe reverted since).
  const candidates = [...new Set([...Object.keys(dirty), ...Object.keys((baseline && baseline.files) || {})])].sort();
  const before = new Map(); // file → text before (null = didn't exist)
  const changed = [];
  for (const f of candidates) {
    const cur = f in dirty ? dirty[f] : hashFile(root, f);
    const b = baseline && baseline.files[f];
    if (b && b.hash === cur) continue; // as it was when the session started
    if (own[f] && own[f] === cur) continue; // Driftor wrote this itself
    let prev = b && b.text !== undefined ? b.text : headText(root, f);
    if (!baseline && prev != null) {
      const after = readText(root, f);
      for (const z of injections) {
        if (norm(z.file) === f && typeof after === "string" && after.includes(z.regressed) && prev.includes(z.healthy) && !prev.includes(z.regressed)) {
          prev = prev.replace(z.healthy, z.regressed); // injected by `driftor:inject` before the session
        }
      }
      if (prev === after) continue;
    }
    before.set(f, prev);
    changed.push(f);
  }
  result.inspected = changed;

  // 1. Protected files.
  const isProtected = (f) => matchesAny(f, cfg.protect);
  for (const f of changed.filter(isProtected)) {
    const prev = before.get(f);
    const after = readText(root, f);
    if (prev == null && after != null && cfg.allowNewTests && matchesAny(f, TEST_FILE)) {
      result.notes.push(`${f}: new test file, allowed`);
      continue;
    }
    const sem = semanticChange(f, prev, after);
    if (sem === null) continue;
    const change = after == null ? "deleted" : prev == null ? "added" : "modified";
    result.violations.push({ rule: "protected", file: f, change, detail: sem || `${change} a protected file (guard.protect)` });
  }

  // 2 + 3. Labels in the app source.
  const labels = checkedLabels(config, { acceptanceTests });
  const ignore = (config.select && config.select.ignore) || [];
  const inCorpus = (f) => SOURCE_EXT.test(f) && !isProtected(f) && !matchesAny(f, ignore);
  const corpus = new Set(walkSource(root, config.watch || ["app"], (f) => !inCorpus(f)));
  for (const f of changed) if (inCorpus(f) && before.get(f) != null) corpus.add(f); // deleted ones too
  const textAfter = new Map();
  const textBefore = new Map();
  for (const f of corpus) {
    const a = readText(root, f);
    textAfter.set(f, typeof a === "string" ? a : null);
    textBefore.set(f, before.has(f) ? (typeof before.get(f) === "string" ? before.get(f) : null) : textAfter.get(f));
  }
  const count = (texts, label) => {
    const per = {};
    for (const [f, t] of texts) if (t) {
      const n = findLabel(stripped(t), label).length;
      if (n) per[f] = n;
    }
    return per;
  };
  const present = [];
  for (const l of labels) {
    const was = count(textBefore, l.label);
    if (!Object.keys(was).length) continue; // not in the source to begin with (a value like "3 Keys")
    present.push(l);
    const now = count(textAfter, l.label);
    if (!Object.keys(now).length) {
      result.violations.push({
        rule: "removed-label",
        label: l.label,
        file: Object.keys(was).join(", "),
        detail: `"${l.label}" (${l.sources.join("; ")}) was in ${Object.keys(was).join(", ")} and is now nowhere in the app source`,
      });
    }
  }
  result.labels = present.map((l) => l.label);

  // Elements carrying those labels, before vs after, in the changed source files.
  // An element that moved to another file is compared with where it was.
  const isStyle = (f) => /\.(css|scss|sass|less)$/.test(f);
  const beforeAnywhere = [];
  for (const [f, t] of textBefore) if (t && !isStyle(f)) beforeAnywhere.push(...checkedElements(t, present, []).values());
  const allIds = new Set(beforeAnywhere.flatMap((e) => [e.testid, e.id]).filter(Boolean));
  for (const f of changed.filter((x) => corpus.has(x))) {
    const prev = textBefore.get(f);
    const after = textAfter.get(f);
    if (!after || prev === after) continue;
    if (isStyle(f)) continue; // handled below
    const anchorsBefore = prev ? checkedElements(prev, present, []) : new Map();
    const ids = [...anchorsBefore.values()].flatMap((e) => [e.testid, e.id]).filter(Boolean);
    const elsBefore = prev ? checkedElements(prev, present, ids) : new Map();
    const elsAfter = checkedElements(after, present, ids);
    for (const [key, el] of elsAfter) {
      // The same element before: by testid/id, else by its label (the agent may have added a testid).
      const was =
        elsBefore.get(key) ||
        [...elsBefore.values()].find((e) => el.label && e.label === el.label) ||
        beforeAnywhere.find((e) => (el.testid && e.testid === el.testid) || (el.id && e.id === el.id) || (el.label && e.label === el.label));
      const fresh = newTokens(was ? was.tokens : [], el.tokens);
      if (!fresh.length) continue;
      const what = el.label ? `"${el.label}"` : el.testid ? `data-testid="${el.testid}"` : `id="${el.id}"`;
      result.violations.push({
        rule: "hidden-label",
        file: f,
        line: el.line,
        label: el.label || el.testid || el.id,
        tokens: fresh,
        detail: `<${el.name}${el.testid ? ` data-testid="${el.testid}"` : ""}> carrying ${what} gained ${fresh.map((t) => t.replace(/^(class|style|attr):/, "")).join(", ")}`,
      });
    }
  }

  // CSS that hides a checked element by its testid or id.
  for (const f of changed.filter((x) => corpus.has(x))) {
    const after = textAfter.get(f);
    if (!after) continue;
    const css = isStyle(f);
    const prevLines = (textBefore.get(f) || "").split("\n");
    const counts = new Map();
    for (const l of prevLines) counts.set(l, (counts.get(l) || 0) + 1);
    const lines = after.split("\n");
    lines.forEach((l, i) => {
      if (counts.get(l)) return counts.set(l, counts.get(l) - 1);
      if (!/display\s*:\s*none|visibility\s*:\s*(hidden|collapse)|opacity\s*:\s*0(?![.\d])/i.test(l)) return;
      // The selector of the rule this line sits in (or the line itself, for one-line rules).
      const upto = lines.slice(0, i + 1).join("\n");
      const open = upto.lastIndexOf("{");
      const selector = upto.slice(Math.max(upto.lastIndexOf("}", open) + 1, 0), open + 1) + l;
      // A CSS selector for it: [data-testid="x"] or #x (in a .tsx file, only those forms: an attribute isn't a selector).
      const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const hit = [...allIds].find(
        (id) =>
          new RegExp(`\\[(?:data-testid|id)\\s*[~|^$*]?=\\s*["']?${esc(id)}["']?\\s*\\]|#${esc(id)}(?![\\w-])`).test(selector) ||
          (css && selector.includes(id))
      );
      if (hit) result.violations.push({ rule: "hidden-label", file: f, line: i + 1, label: hit, detail: `a style rule hides the checked element "${hit}": ${l.trim()}` });
    });
  }

  if (result.violations.length) result.verdict = "block";
  return result;
}

/* ── reporting ────────────────────────────────────────────────────────────── */

const RULE_TITLE = {
  protected: "changed a protected file",
  "removed-label": "removed a label the checks use",
  "hidden-label": "hid an element the checks use",
};

function describeViolation(v) {
  const where = v.line ? `${v.file}:${v.line}` : v.file;
  return `${RULE_TITLE[v.rule]}: ${v.rule === "removed-label" ? v.detail : `${where} — ${v.detail}`}`;
}

/** The Stop hook's block reason. */
function buildGuardPrompt(result, { attempt, maxAttempts } = {}) {
  const protectedFiles = result.violations.filter((v) => v.rule === "protected").map((v) => v.file);
  const lines = [
    `Driftor's guard refused this change before running Kane${attempt ? ` (attempt ${attempt} of ${maxAttempts})` : ""}: it changes what the checks look at instead of fixing the app.`,
    "",
    ...result.violations.map((v) => `  ✗ ${describeViolation(v)}`),
    "",
    "What to do:",
  ];
  if (protectedFiles.length) lines.push(`  - Revert your edits to ${protectedFiles.join(", ")} (\`git diff HEAD -- <file>\` shows them). The tests, the objectives in driftor.config.json and Driftor itself are not yours to change in this session.`);
  if (result.violations.some((v) => v.rule !== "protected")) lines.push("  - Put the labelled control back, visible and enabled, where a user can reach it. Removing or hiding what the check clicks is not a fix.");
  lines.push(
    "  - Fix the real cause in the app source. Driftor checks the app as a user would: Kane clicks the real labels in real Chrome.",
    "  - If the user really asked for one of these changes, say so and end your turn; a human can make it, or switch the guard off (guard.enabled in driftor.config.json)."
  );
  return lines.join("\n");
}

function printable(result) {
  const lines = [`Driftor guard: ${result.verdict.toUpperCase()} (starting point: ${result.baseline})`];
  if (result.inspected.length) lines.push(`  inspected: ${result.inspected.join(", ")}`);
  if (result.labels.length) lines.push(`  labels the checks use, found in the source: ${result.labels.map((l) => `"${l}"`).join(", ")}`);
  for (const v of result.violations) lines.push(`  ✗ ${describeViolation(v)}`);
  for (const n of result.notes) lines.push(`  · ${n}`);
  return lines.join("\n");
}

/** Appends to <traceDir>/guard.log and writes <traceDir>/guard/<timestamp>.json. Returns the json path. */
function archiveDecision(traceDir, result, meta = {}) {
  const dir = path.join(traceDir, "guard");
  fs.mkdirSync(dir, { recursive: true });
  const { dirty, ...record } = result;
  const file = path.join(dir, `${result.at.replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, `${JSON.stringify({ ...meta, ...record }, null, 2)}\n`);
  fs.appendFileSync(path.join(traceDir, "guard.log"), `\n# ${result.at}${meta.session ? ` session ${meta.session}` : ""}${meta.trigger ? ` (${meta.trigger})` : ""}\n${printable(result)}\n`);
  return file;
}

module.exports = {
  DEFAULT_PROTECT,
  guardConfig,
  dirtyFiles,
  dirtyHashes,
  recordBaseline,
  checkedLabels,
  acceptanceTestsFor,
  stripComments,
  findLabel,
  scanTags,
  hidingTokens,
  runGuard,
  buildGuardPrompt,
  printable,
  archiveDecision,
};
