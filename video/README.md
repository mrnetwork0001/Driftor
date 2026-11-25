# Driftor demo film

A 2:57 film made with [Remotion](https://www.remotion.dev) for the Kane CLI hackathon judges: why unit tests miss what users hit, the bug zoo (0 of 5 vs 5 of 5), why Kane CLI and TestMu AI, Driftor's Claude Code hooks, a live red-to-green session, the guard, the "what the user saw" card and a tour of the site.

## What is real

- **Cold open (scene 01):** the "what the user saw" card of Driftor run `2026-11-23T23-22-51-442Z` (injected bug: overlay): unit tests 27 passed, Kane CLI failed at step 5 on the covered "Generate Production API Key" button. The screenshot inside it is Kane CLI's own, from that run's evidence pack. The dashed red layer and the click mark drawn over it illustrate the cause the run recorded (`div.fixed.inset-0`, z-50, transparent).
- **Bug zoo (03):** the five regressions and their titles from `lib/regressions.js`; verdicts from the archived runs of 2026-11-23 (overlay 23:22, pointer-events 23:24, opacity 23:27, breakpoint 23:10, stale-cache 23:13 UTC): unit suite `Tests 27 passed (27)` every time, Kane failed every bug.
- **Kane CLI and TestMu AI (05):** TestMu AI's logo (`assets.testmuai.com/resources/images/logos/logo.svg`, with "Formerly LambdaTest"), the Kane CLI mascot (`kane-cli/kanecliMascot.png`) and the Claude mark as TestMu AI hosts it (`kane-cli/Claude.svg`), all downloaded 2026-11-25 and shown unaltered (the transparent mascot sits on its own palette green, #48704B). "3M+ users" and "50,000+ real devices" are from testmu.ai, read 2026-11-25.
- **The live session (07, 08):** a real `claude -p` session with `DRIFTOR_HOOK=1` on 2026-11-24 (session `3409d762…`). The prompt and the UserPromptSubmit message are quoted from its transcript; the two test titles, times and verdict are from its receipt `data/redgreen.json` (designed 18:50:12, red 18:54:47, green 19:07:52 UTC, verdict proven, 2 of 2). Kane's failure ("Checkpoint assertion failed: KEY-001 has a Revoke button", triage application_issue / functional_defect, severity major) and the screenshot are from evidence pack `d17dd341…`, step 7. The Revoke footage is the code Claude wrote in that session, recorded on its worktree build (:3004).
- **The guard (09):** the four cheats and the real fix, their titles, rules and files from `kane-traces/guard/demo/*.json` (`npm run driftor:guard-demo`).
- **The card (10):** `kane-traces/runs/2026-11-23T23-22-51-442Z/card-desktop-occlusion-gate.png`, made by `lib/card.js`.
- **Footage (06, 08, 11):** recorded 2026-11-25 in headless Chrome (1600×900 at device scale 2, `scripts/capture.mjs`). The CloudScale app (accept cookies, generate a key, top up) and the Driftor site (landing, stacking figure, two verdicts, bug zoo, session replay, traces) are the live deployment, https://trydriftor.vercel.app. The Revoke clip is the code Claude wrote in the live session, which exists only on its branch, recorded on that worktree's local build (:3004). Writes were demo-workspace state only, reset to the seed afterwards.
- **Narration, music and sound:** ElevenLabs. The narrator is Chinedu Dike (Voice Library, Nigerian English male); Kane's verdict line is read by River with a terminal EQ; the score is ElevenLabs Music; the effects are ElevenLabs sound generation.

## Build it

The ElevenLabs key is read at runtime from `~/.config/elevenlabs/.env` and never stored here.

```
npm install
npm run vo && npm run music && npm run sfx && npm run timing   # audio and timing
TEMPO=1.05 node scripts/tempo.mjs && npm run timing             # narration at 1.05x to fit 3:00
node scripts/capture.mjs && npm run encode                     # footage (needs :3002 and :3004 running)
npm run studio                                                 # preview
npm run draft                                                  # half-scale check render
npm run render4k && npm run finish                             # 4K master, -14 LUFS
npm run poster                                                 # thumbnail
```
