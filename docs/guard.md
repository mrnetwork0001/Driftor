# The guard: the agent can't mark its own homework

Driftor's Stop hook blocks Claude's turn until Kane passes the objectives in real
Chrome. That gives the agent a cheaper way out than fixing the app: change the
check, or make the thing the check clicks go away. The guard closes the obvious
versions of that door. It runs first in the Stop hook, before any Kane credit is
spent, and needs no browser.

```
npm run driftor:guard                 # check the working tree by hand (exit 1 on a violation)
npm run driftor:guard -- --archive    # …and archive the decision like the hook does
npm run driftor:guard-demo            # the recorded demonstration (no Claude, no Kane)
```

## What it refuses

| Rule | Blocks | Allows |
|---|---|---|
| **protected** | Modifying or deleting a file matching `guard.protect`: `tests/**`, `*.test.*` / `*.spec.*`, `vitest.config.*`, `driftor.config.json` (the objectives), `driftor.js`, `driftor_test.js`, `lib/{heal,select,acceptance,guard,regressions}.js`, `kane-traces/**`, `.testmuai/**`, `policies/**`, `.github/workflows/**`, `scripts/ci.js`. | Adding a **new** test file (`guard.allowNewTests`). |
| | `package.json`: only when a script whose name or command mentions test / driftor / kane / vitest / jest / hook changes. | Dependency bumps, `dev`/`build` changes. |
| | `.claude/settings*.json`: only when `hooks`, `env` or `disableAllHooks` change. | Permission approvals and other settings. |
| **removed-label** | A quoted label from the objectives (or from the tests Kane designed for this task) that was in the app source before is now nowhere in it, e.g. deleting the `Generate Production API Key` button. A copy left in a comment doesn't count. | Labels that never were literal source text (`"3 Keys"`, `"$4,750.00"`). Moving the button to another file. |
| **hidden-label** | The element carrying such a label (the JSX element whose text or attribute holds it, or which has its `data-testid`) gains `hidden` / `invisible` / `opacity-0` / `sr-only` / `collapse` (also `lg:hidden` style responsive variants and `!` important variants), `display:none` / `visibility:hidden` / `opacity:0` in `style`, the `hidden` / `aria-hidden` / `inert` attributes, or a `disabled` that is now always on. A CSS rule that hides it by `[data-testid=…]` or `#id`. | Hiding anything else: the closed mobile menu's `invisible opacity-0`, a new tooltip, a Revoke button that is `hidden sm:inline-flex`. Changing the condition of an existing `disabled={…}`. State variants such as `disabled:opacity-60`. |

The hook's block reason lists each violation (file, label, line) and says what to
do: revert the protected edits, put the control back, fix the real cause, and if
the user really asked for one of these changes, say so and stop. A guard block
counts toward the same `maxHealAttempts` as a Kane failure; after the last one the
hook lets the turn end and tells the human.

Every block, and every allow that had something to judge, is archived:
`kane-traces/guard.log` (gitignored, like `hook.log`) and
`kane-traces/guard/<timestamp>.json` (verdict, violations, the files inspected,
the labels found, the starting point). `scripts/guard-demo.js --save` wrote the
recorded examples in `kane-traces/guard/demo/`.

## What counts as "the agent's change"

The working tree (tracked changes and untracked files, `git diff HEAD` +
`git ls-files --others --exclude-standard`) against a starting point:

- **Session baseline (preferred).** `driftor.js --hook` is also registered as a
  `SessionStart` hook (`.claude/settings.json`; `driftor init` adds it). When a
  session starts it records every file that was already uncommitted, with its
  contents, in `.data/driftor-guard.json`, once per session id (resume and
  compaction keep the first). Changes made before the session (the overlay bug a
  demo injects, a human's config edit) are then the starting point, not the
  agent's work.
- **git HEAD (fallback).** Without a baseline, HEAD is the starting point. A live
  bug-zoo injection still counts as starting state (the guard knows the zoo's
  exact swaps), but any other uncommitted edit to a protected file made before
  the session is blamed on the agent.
- **Driftor's own writes.** The gate itself rewrites `kane-traces/` during the
  hook. After each hook run, every file that changed while the hook ran is
  recorded as Driftor's and excused while it stays byte-identical.

## Limits, honestly

It is a text heuristic over the diff, not a proof. Kane still runs the real app
afterwards, and that is the check that matters; the guard only removes the cheap
ways to make that check meaningless.

**It misses (false negatives):**

- Labels that aren't one literal string in the source: text built by
  concatenation, split by markup (`Generate <b>Production</b> API Key`), or kept
  in a translation file outside the watched source. Such a label isn't tracked
  at all. Renaming it into a variable (`const L = "Generate …"`) keeps the text
  in the source, so deleting the button that uses `L` goes unnoticed too.
- Hiding one level up: wrapping the button in a `hidden` div, conditional
  rendering (`{false && <button…>}`), hiding by a shared class name in CSS, a
  covering element, `pointer-events-none` on the button, moving it off-screen.
  (The last ones make Kane fail anyway; the guard only looks at the element itself.)
- Anything outside the files git shows as changed: a gitignored file,
  environment variables, the network. With the session baseline the diff is
  against the commit the session started on, so a commit the agent makes is
  still seen; in the git-HEAD fallback it is not (the commit moves HEAD).
- Weakening a check without touching protected files, e.g. making the app detect
  Kane and behave differently.
- Labels Kane's designed tests use without quotes.

**It can wrongly block (false positives):**

- A task that legitimately changes a protected file or removes a checked label
  ("drop the Generate button", "fix the flaky test"). The objectives and the
  tests are the human's; the agent is told to say so and stop. Set
  `"guard": { "enabled": false }` or run the session with `DRIFTOR_GUARD=0` for
  such a task.
- Without the SessionStart baseline: a protected file the human edited before
  the session and hasn't committed.
- Unusual source the small JSX scanner misreads, e.g. a `<` comparison it takes
  for a tag, so the "element carrying the label" is the wrong one.
- A label that also names something else: if the objectives quote a word that is
  common in the source, hiding any element whose text contains that word counts.
  Quoted labels in the objectives should be the visible text of one control.

## Configuration

```jsonc
"guard": {
  "enabled": true,         // or DRIFTOR_GUARD=0 for one session
  "allowNewTests": true,   // new files under tests/** or *.test.* are fine
  "protect": [ /* globs; replaces the default list in lib/guard.js */ ],
  "labels": [ /* extra labels to track besides the quoted ones in the objectives */ ]
}
```

The source scanned for labels is the `watch` directories, minus `select.ignore`
(the Driftor site and tooling, which don't render on the guarded page) and minus
the protected files.
