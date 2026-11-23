# Driftor in CI

`.github/workflows/driftor.yml` runs the Driftor gate on every pull request:

1. `npm ci`, then the unit suite, `npm run test:tooling` and `kane-cli evidence lint-policy`. None of these need Kane credentials.
2. `npm run build` and `next start -p 3000`. The gate targets the app through `DRIFTOR_URL=http://localhost:3000`.
3. `kane-cli login --username … --access-key …`, which signs in with basic auth and needs no browser.
4. `node driftor.js gate --headless` runs every objective in `driftor.config.json` in headless Chrome. Chrome comes from `browser-actions/setup-chrome` and is passed in as `KANE_CLI_CHROME_PATH`.
5. `node scripts/ci.js verdict` judges the run's evidence against `policies/driftor-gate.yaml` (details below).
6. `node scripts/ci.js comment` renders the result. The workflow then creates or updates one PR comment, found by its `<!-- driftor-gate -->` marker, and writes the same text to the job summary.
7. The run folder is uploaded as the `driftor-run-<id>` artifact. It holds the traces, `run.json`, the evidence packs, the merged pack, its verdict and `app.log`.

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

## Try it locally (no browser, no credits)

```bash
npx kane-cli evidence lint-policy policies/driftor-gate.yaml
cp -R kane-traces/runs/2026-11-18T08-00-54-950Z /tmp/failrun   # an archived failing run
node scripts/ci.js verdict /tmp/failrun                          # needs that run's packs in ~/.testmuai
node scripts/ci.js comment /tmp/failrun
```

Work on a copy: `verdict` writes `evidence/` and `verdict.json` into the folder you give it.
