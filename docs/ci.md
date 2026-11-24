# Driftor in CI

`.github/workflows/driftor.yml` runs the Driftor gate on every pull request:

1. `npm ci`, then the unit suite, `npm run test:tooling` and `kane-cli evidence lint-policy`. None of these need Kane credentials.
2. `npm run build` and `next start -p 3000`. The gate targets the app through `DRIFTOR_URL=http://localhost:3000`.
3. `kane-cli login --username … --access-key …`, which signs in with basic auth and needs no browser.
4. `node driftor.js gate --headless` runs every objective in `driftor.config.json` in headless Chrome. Chrome comes from `browser-actions/setup-chrome` and is passed in as `KANE_CLI_CHROME_PATH`.
   When an objective fails, the runner also renders its "what the user saw" card into the run folder (see below).
5. `node scripts/ci.js verdict` judges the run's evidence against `policies/driftor-gate.yaml` (details below).
6. The run folder is uploaded as the `driftor-run-<id>` artifact. It holds the traces, `run.json`, the evidence cards, the evidence packs, the merged pack, its verdict and `app.log`.
7. `node scripts/ci.js comment` renders the result, linking the artifact from step 6. The workflow then creates or updates one PR comment, found by its `<!-- driftor-gate -->` marker, and writes the same text to the job summary.

The check fails if Kane fails an objective or if the policy fails.

## Secrets

Set these in **Settings → Secrets and variables → Actions**:

| Name | Kind | What |
|---|---|---|
| `KANE_USERNAME` | secret | Your TestMu AI / LambdaTest username (dashboard → Settings → Keys) |
| `KANE_ACCESS_KEY` | secret | The access key on the same page |
| `KANE_PROJECT_ID` | variable (optional) | The Test Manager project for runs. Without it, `login` picks the KaneAI project automatically. |

Kane has no environment variables for credentials, so the workflow passes them as flags to `kane-cli login`. They never appear in the repo. GitHub masks them in logs, and the runner is thrown away after the job. Every Kane run spends credits from that account.

PRs from forks don't get repository secrets. In that case the workflow posts a notice, skips the Kane steps and still runs the unit and tooling tests.

## Evidence pack and verdict

`kane-cli run` has no `--policy` flag. It still seals an evidence pack for every run, in `~/.testmuai/kaneai/sessions/<session_id>/evidence/<execution_id>.evidence`. It copies the pack to `./.testmuai/evidence/` only when the run is named with `--name`. The gate doesn't pass `--name`, because naming persists the session.

The runner was left unchanged. Each trace's `recording_state` event carries the `session_id`, so `scripts/ci.js verdict <runDir>`:

1. copies each objective's pack to `<runDir>/evidence/<objective>.evidence`;
2. runs `kane-cli evidence merge <packs…> --run-id driftor-<stamp> -o <runDir>/evidence/driftor-gate.evidence --policy policies/driftor-gate.yaml --json`, which merges the packs into one sealed pack and judges it;
3. writes `<runDir>/verdict.json` with the result and each gate's expected and actual values;
4. exits with Kane's code: 0 pass, 1 fail, 3 errored, 2 if no pack was found.

The policy only uses metrics listed by `kane-cli policy metrics-list --agent`:

- `totals.tests` is at least 1.
- `totals.failed`, `totals.broken` and `steps.failed` are all 0.
- `metrics.tests_without_checks` is 0, so every objective must assert something.
- A warning is raised if `metrics.heal.healed_tests` is above 0.

## "What the user saw" cards

For each failing objective, `lib/card.js` writes `card-<objective>.png` (about 150 to 210 KB) into the run folder. The card shows:

- Kane's own screenshot of the failing step, taken from the sealed evidence pack (`tests/<test>/steps/<n>/screenshot.jpg`);
- a red box around the element Kane clicked and a dot on the click point, plus a zoomed inset. The box comes from the action log's `visual_data` or the step's `element_rect`. Both are in CSS px, so they are scaled to the screenshot's device pixels. When Kane didn't act on the page (for example it judged the button covered), nothing is outlined, and the card says so;
- the objective, the viewport, the step number as the NDJSON trace numbers it, Kane's remark and reason, and "unit tests: passed" next to "Kane in real Chrome: failed".

`driftor_test.js` makes the cards after every failed run, using the Chrome it finds (`CHROME_PATH`, `KANE_CLI_CHROME_PATH` or the usual install paths). This is best effort. With no Chrome or no pack you get no card, and the verdict and exit code stay the same. `DRIFTOR_CARDS=0` turns the cards off. To make them again for any archived run:

```bash
npm run driftor:card -- kane-traces/runs/<stamp> [--objective <id>]
```

The Stop hook's block reason ends each failing trace with `Screenshot of what the user saw: <absolute path>. Read it.`, so Claude Code opens the image and sees the page. Cards are committed with the traces; `.gitignore` keeps `kane-traces/runs/*/card-*.png`.

### In the PR comment

A GitHub comment can only show an image that has a URL, and a CI job has no public place to put one. So `scripts/ci.js comment` does the following:

- **Card committed at the checked-out commit** (for example an archived run pushed with the branch): it embeds the card as an image from `https://raw.githubusercontent.com/<repo>/<sha>/<path>`. That URL only works for **public** repositories. A private repo's raw URLs need a token, and GitHub's image proxy doesn't have one.
- **Card made by this CI job** (the usual case; the job doesn't commit): it names the file and links the `driftor-run-<id>` artifact. The link comes from `actions/upload-artifact`'s `artifact-url` output, which is why the upload now runs before the comment. Reviewers download the zip to see the card. GitHub can't show a PNG from inside an artifact.
- `DRIFTOR_CARD_BASE_URL` overrides both. If you mirror the repo's files on a public static host, set it to that base URL and the comment embeds `<base>/<repo-relative path>`, e.g. `<base>/kane-traces/runs/<stamp>/card-<id>.png`. The Driftor site also serves committed cards at `/api/cards?run=<stamp>&objective=<id>`. Its `/api/cards` lists them.

## Try it locally (no browser, no credits)

```bash
npx kane-cli evidence lint-policy policies/driftor-gate.yaml
cp -R kane-traces/runs/2026-11-18T08-00-54-950Z /tmp/failrun   # an archived failing run
node scripts/ci.js verdict /tmp/failrun                          # needs that run's packs in ~/.testmuai
node scripts/ci.js comment /tmp/failrun
```

Work on a copy: `verdict` writes `evidence/` and `verdict.json` into the folder you give it.
