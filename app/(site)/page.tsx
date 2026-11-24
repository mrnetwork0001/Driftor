import Link from "next/link";
import StackDiagram from "@/components/StackDiagram";
import LiveRunStat from "@/components/LiveRunStat";
import { ChromeVerdict, EvidencePanels } from "@/components/LiveEvidence";
import { BugZoo, RunLog } from "@/components/BugZoo";
import { AgentSession } from "@/components/AgentSession";

/* ───────────────────────── content ───────────────────────── */

// Every number here is true of this repo; the live cell reads kane-traces/.
const STATS = [
  ["0", "selectors to maintain", "objectives are plain English"],
  ["5", "bugs JSDOM passes", "3 dead clicks · 1 hidden control · 1 stale read"],
  ["2", "viewports per run", "1920×1080 · 800×1000 (mobile layout)"],
  ["1", "hook closes the loop", "Claude Code Stop → Kane → fix"],
];

const LOOP = [
  {
    cmd: "npm run agent",
    title: "The agent changes the UI",
    body: "Claude Code runs with Driftor’s Stop hook armed. Ask for a feature; it edits the app and says it’s done. Its unit tests pass.",
  },
  {
    cmd: "Stop hook",
    title: "Kane drives real Chrome",
    body: "Before the turn can end, Driftor runs the objectives the changed files can affect through Kane CLI, on a wide screen and a narrow one. Kane also designs new tests from the agent’s task, so the new feature gets checked too.",
  },
  {
    cmd: "decision: block",
    title: "The failure goes back to the agent",
    body: "If any check fails, the hook refuses the stop and hands Claude Kane’s failing steps and raw NDJSON. Same session, no human in between.",
  },
  {
    cmd: "≤ 3 attempts",
    title: "Green only counts in Chrome",
    body: "Claude fixes it and stops again; Kane re-runs. The turn ends when the real browser passes, or after three tries, when a human gets the evidence.",
  },
];

const PIPELINE = [
  ["driftor.config.json", "plain-English objectives + viewports"],
  ["Claude Code Stop hook", "fires when the agent tries to finish"],
  ["kane-cli run --agent", "drives Chrome, streams NDJSON"],
  ["kane-traces/", "one trace per objective, every run archived"],
  ["driftor.js --hook", "blocks the stop, writes the bug report"],
  ["claude, same session", "patches the source, stops again"],
];

const FILES = [
  ["driftor.config.json", "Your objectives, viewports, app URL, state-reset endpoint and unit command. Point Driftor at another app by editing this file."],
  [".claude/settings.json", "Registers `driftor.js --hook` as Claude Code’s Stop hook. Opt-in: it only acts when the session runs with `DRIFTOR_HOOK=1` (`npm run agent`)."],
  ["driftor.js", "The CLI: gate (default), `--hook`, `--heal`, `--watch`, `--accept \"<task>\"`, `init`, and the bug zoo (`--inject <bug>`, `--list`, `--reset`)."],
  ["driftor_test.js", "Runs each selected objective through `kane-cli run --agent` at its viewport, with its own app state (`/app?run=<id>`), runs the unit suite once, and archives everything to kane-traces/runs/. `--changed` or `--files a,b` runs only what those files can affect."],
  ["lib/select.js", "Change-based selection: each objective lists the files it `covers`. Shared or unknown files run everything; files that can’t touch the page run nothing, and the run says why."],
  ["lib/acceptance.js", "Hands the agent’s task and the app’s starting data to Kane’s assurance commands, which design acceptance tests from it, then runs them next to the gate. A test with an empty variable is skipped as no verdict."],
  ["lib/heal.js", "Turns failing NDJSON events into the agent’s bug report. The Traces page uses it too, so it shows the exact prompt."],
  ["lib/regressions.js", "The bug zoo: five one-line UI regressions (dead clicks, a control hidden on narrow screens, a stale cached read), each an exact, reversible swap in the demo app’s source."],
  ["tests/unit", "Vitest + JSDOM suite for CloudScale. It stays green with every bug in the zoo, which is the point."],
  ["specs/PRD.md", "The CloudScale requirements. Every gate check maps to a use case here."],
  ["app/app", "CloudScale, the demo app under test, with a real backend in app/api/cloudscale."],
  ["app/api/traces", "Reads kane-traces/ for the Traces page and the live panels on this page."],
  ["scripts/init.js", "`driftor init`: sets Driftor up in another Next.js or Vite repo, with the runtime, a starter config and the Stop hook."],
  [".github/workflows/driftor.yml", "The CI gate: runs Kane headless on each pull request, judges the evidence pack against policies/driftor-gate.yaml and keeps one sticky PR comment (scripts/ci.js, docs/ci.md)."],
];

const CHECKS = [
  ["UC-01", "Gateway loads with the primary CTA visible", "1920×1080"],
  ["UC-02", "“Generate Production API Key” receives the click and adds a key", "1920×1080"],
  ["UC-03", "Quota top-up stays reachable in the mobile layout and updates the balance", "800×1000"],
];

const FAQ = [
  {
    q: "Why not write a Playwright test?",
    a: "You can, and it would catch this bug. Driftor’s objectives are plain English tied to the PRD, so there are no selectors to keep in sync while an agent rewrites the markup, and Kane returns a structured verdict the agent can read directly.",
  },
  {
    q: "Does it replace unit tests?",
    a: "No. Unit tests still cover logic. Driftor covers the part JSDOM can’t: whether a real user can click the thing.",
  },
  {
    q: "What do I need to run it?",
    a: "Node, Chrome and Kane CLI with a TestMu AI login (`npm run kane:login`). Every result on this site comes from real Kane runs; there is no offline or mock mode.",
  },
  {
    q: "Which coding agents can heal?",
    a: "The Stop hook is Claude Code’s. For other agents, `driftor:heal` runs a one-shot fix with `claude -p`, falling back to `gemini`. Either way the agent gets only the Kane evidence, not the answer, and only a Kane re-run in Chrome counts as fixed.",
  },
  {
    q: "Does it only work with this demo app?",
    a: "No. Run `driftor init` in a Next.js or Vite repo (or copy `driftor.config.json`), write your critical flows as plain-English objectives, and set `url` (or pass `--url`). The runner, hook, trace handling and heal prompt don’t know anything about CloudScale.",
  },
  {
    q: "What stops the agent looping forever?",
    a: "The hook counts attempts per session. After three failed Kane runs it lets the turn end and tells you, with the evidence in kane-traces/. It also skips Kane entirely when the source hasn’t changed since the last green run.",
  },
];

/* ───────────────────────── layout helpers ───────────────────────── */

function Section({
  id,
  n,
  label,
  children,
  dark = false,
}: {
  id: string;
  n: number;
  label: string;
  children: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-14 border-t border-ink grid lg:grid-cols-[12rem_1fr] ${dark ? "bg-ink text-sheet" : ""}`}
    >
      <div className={`px-5 sm:px-8 lg:px-6 pt-10 lg:py-14 lg:border-r ${dark ? "border-[#3a382f]" : "border-rule"}`}>
        <div className={`font-mono text-xs ${dark ? "text-[#9A958A]" : "text-graphite"}`}>{String(n).padStart(2, "0")}</div>
        <div className="font-mono text-xs mt-1 uppercase tracking-wider">{label}</div>
      </div>
      <div className="px-5 sm:px-8 lg:px-12 py-10 lg:py-14 min-w-0">{children}</div>
    </section>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="font-serif text-3xl sm:text-4xl leading-tight">{children}</h2>;
}

function Lede({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 max-w-2xl text-graphite leading-relaxed">{children}</p>;
}

/** Renders `code` spans inside plain strings. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/).map((part, i) =>
        part.startsWith("`") ? (
          <code key={i} className="font-mono text-[0.9em] text-ink">
            {part.slice(1, -1)}
          </code>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

/* ───────────────────────── page ───────────────────────── */

export default function Home() {
  return (
    <>
      {/* Hero */}
      <div className="border-b border-ink">
        <div className="px-5 sm:px-8 lg:px-12 pt-12 lg:pt-20 pb-12 lg:pb-16 grid xl:grid-cols-[minmax(0,1fr)_26rem] gap-x-16 gap-y-8 items-end">
          <h1 className="font-serif text-[46px] leading-[0.98] sm:text-[84px] xl:text-[104px] tracking-[-0.015em]">
            Your tests clicked
            <br />
            the button.
            <br />
            <span className="italic text-signal">Your users can’t.</span>
          </h1>
          <div>
            <p className="text-[17px] leading-relaxed text-graphite">
              Driftor is a pre-merge gate for UI changes written by AI agents. It runs your critical flows in a real
              Chrome through Kane CLI, catches the clicks that never land, and hands the evidence back to the agent to
              fix.
            </p>
            <div className="mt-7 flex flex-wrap gap-3 text-sm">
              <Link href="/app" className="bg-ink text-sheet px-4 py-2.5 hover:bg-black">
                Open the demo app
              </Link>
              <Link href="/hud" className="border border-ink px-4 py-2.5 hover:bg-sheet">
                Read the latest traces
              </Link>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 border-t border-ink bg-sheet">
          {STATS.map(([n, label, note], i) => (
            <div
              key={label}
              className={`px-5 sm:px-8 py-7 border-b lg:border-b-0 border-r border-rule ${i === 0 ? "lg:pl-12" : ""}`}
            >
              <div className="font-serif text-6xl sm:text-7xl leading-none tabular-nums">{n}</div>
              <div className="mt-3 text-sm">{label}</div>
              <div className="mt-1 font-mono text-xs text-graphite">{note}</div>
            </div>
          ))}
          <div className="col-span-2 lg:col-span-1 px-5 sm:px-8 py-7">
            <LiveRunStat />
          </div>
        </div>
        <div className="px-5 sm:px-8 lg:px-12 py-3 border-t border-rule font-mono text-[11px] text-graphite flex flex-wrap gap-x-6 gap-y-1">
          <span>engine · Kane CLI 0.10</span>
          <span>browser · real Chrome</span>
          <span>agents · Claude Code, Gemini CLI</span>
          <span>evidence · kane-traces/*.ndjson</span>
        </div>
      </div>

      {/* 01 */}
      <Section id="problem" n={1} label="The blind spot">
        <div className="grid 2xl:grid-cols-[22rem_1fr] gap-10 items-start">
          <div className="max-w-md">
            <H2>JSDOM can’t see what’s on top.</H2>
            <p className="mt-4 text-graphite leading-relaxed">
              Coding agents check their work by running the test suite, and most UI suites run in JSDOM. JSDOM builds
              the DOM but never lays it out: no boxes, no z-index, no hit-testing. So{" "}
              <code className="font-mono text-sm text-ink">button.click()</code> always reaches the button, even when a
              transparent full-screen wrapper sits above it in the browser.
            </p>
            <p className="mt-4 text-graphite leading-relaxed">
              The agent sees green, opens the pull request, and the bug ships. Toggle the figure to see the same click
              before and after the fix.
            </p>
          </div>
          <div className="lg:-mr-12">
            <StackDiagram />
          </div>
        </div>
      </Section>

      {/* 02 */}
      <Section id="verdicts" n={2} label="Two verdicts">
        <H2>Same commit. Two answers.</H2>
        <Lede>
          The regression from figure 1, run through both. The left is the real output of{" "}
          <code className="font-mono text-sm text-ink">npm run test:unit</code> with the bug in place. The right is the
          latest failing Kane run from <code className="font-mono text-sm text-ink">kane-traces/</code>.
        </Lede>
        <div className="mt-8 grid md:grid-cols-[2fr_3fr] border border-ink bg-sheet">
          <div className="p-5 md:border-r border-b md:border-b-0 border-ink min-w-0">
            <div className="font-mono text-xs text-graphite mb-4">vitest · jsdom · regression injected</div>
            <pre className="font-mono text-[13px] leading-6 whitespace-pre-wrap">
              <span className="text-pass">✓</span> renders the gateway with two seeded keys and $4,500.00 quota{"\n"}
              <span className="text-pass">✓</span> “Generate Production API Key” adds a key{"\n"}
              <span className="text-pass">✓</span> top-up adds $250 to the quota{"\n"}
              <span className="text-pass">✓</span> shows the maintenance notice{"\n"}
              <span className="text-pass">✓</span> <span className="text-graphite">23 more: run isolation, change selection</span>{"\n\n"}
              <span className="text-graphite">Tests  27 passed (27)</span>
            </pre>
          </div>
          <ChromeVerdict />
        </div>
      </Section>

      {/* 03 */}
      <Section id="catalogue" n={3} label="Bug zoo">
        <H2>Five one-line bugs. The unit tests pass every one.</H2>
        <Lede>
          Each is a change an agent could plausibly make, and each ships into the demo app with{" "}
          <code className="font-mono text-sm text-ink">npm run driftor:inject -- &lt;bug&gt;</code>. Driftor doesn’t look
          for them by name: Kane uses the app the way a person does, so a click that never lands, a control missing from
          the narrow layout, or a page that keeps showing the old balance after a successful write all end in a failed
          step. Every verdict below is read from an archived run in{" "}
          <code className="font-mono text-sm text-ink">kane-traces/runs/</code>.
        </Lede>
        <BugZoo />
      </Section>

      {/* 04 */}
      <Section id="loop" n={4} label="The loop">
        <H2>Break it, catch it, fix it, prove it.</H2>
        <Lede>One Claude Code hook closes the loop. No selectors, no second terminal, no human between the failure and the fix.</Lede>
        <ol className="mt-8 grid sm:grid-cols-2 2xl:grid-cols-4 border-l border-t border-ink">
          {LOOP.map((s, i) => (
            <li key={s.cmd} className="border-r border-b border-ink bg-sheet p-5 flex flex-col">
              <div className="flex items-baseline justify-between font-mono text-xs">
                <span className="text-graphite">{String(i + 1).padStart(2, "0")}</span>
                <code className={i === 2 ? "text-signal" : ""}>{s.cmd}</code>
              </div>
              <h3 className="mt-10 font-medium">{s.title}</h3>
              <p className="mt-2 text-sm text-graphite leading-relaxed">{s.body}</p>
            </li>
          ))}
        </ol>
        <h3 className="mt-12 font-mono text-xs text-graphite">a real session, replayed from its transcript</h3>
        <AgentSession />
      </Section>

      {/* 05 */}
      <Section id="evidence" n={5} label="The evidence">
        <H2>The agent gets a bug report, not a red X.</H2>
        <Lede>
          Each objective writes an NDJSON trace. When a step fails, <code className="font-mono text-sm text-ink">driftor:heal</code>{" "}
          pulls out what went wrong, where, and a suggested fix, and builds the agent’s prompt from it. The run log
          also shows the tests Kane designed from the agent’s task, in the “from task” column.
        </Lede>
        <EvidencePanels />
        <h3 className="mt-12 font-mono text-xs text-graphite">every gate run, newest first</h3>
        <RunLog />
        <p className="mt-4 font-mono text-xs text-graphite">
          Every run’s traces are on the{" "}
          <Link href="/hud" className="underline underline-offset-2 hover:text-ink">
            Traces page
          </Link>
          .
        </p>
      </Section>

      {/* 06 */}
      <Section id="architecture" n={6} label="Under the hood">
        <H2>Six parts, one direction.</H2>
        <Lede>Objectives go in at one end; a change Kane has passed in real Chrome comes out the other.</Lede>

        <ol className="mt-8 grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-6 border-l border-t border-ink font-mono text-xs">
          {PIPELINE.map(([name, role], i) => (
            <li key={name} className="border-r border-b border-ink bg-sheet px-4 py-4 min-w-0">
              <div className="flex justify-between text-graphite">
                <span>{String(i + 1).padStart(2, "0")}</span>
                <span className={i === PIPELINE.length - 1 ? "text-signal" : ""}>
                  {i === PIPELINE.length - 1 ? "↺ 03" : "→"}
                </span>
              </div>
              <div className="mt-6 text-ink break-words">{name}</div>
              <div className="mt-1 text-graphite leading-snug">{role}</div>
            </li>
          ))}
        </ol>
        <p className="mt-3 font-mono text-xs text-graphite">
          <span className="text-signal">↺ 03</span> when Claude stops again, the hook re-runs the same Kane objectives.
        </p>

        <table className="mt-10 w-full max-w-4xl text-sm">
          <thead>
            <tr className="border-b border-ink text-left font-mono text-xs text-graphite">
              <th className="py-2 pr-6 font-normal">file</th>
              <th className="py-2 font-normal">what it does</th>
            </tr>
          </thead>
          <tbody>
            {FILES.map(([f, d]) => (
              <tr key={f} className="border-b border-rule align-top">
                <td className="py-3 pr-6 font-mono whitespace-nowrap">{f}</td>
                <td className="py-3 text-graphite leading-relaxed">
                  <Rich text={d} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* 07 */}
      <Section id="checks" n={7} label="What it checks">
        <H2>Every check traces back to a requirement.</H2>
        <Lede>
          The gate’s objectives come from the use cases in{" "}
          <code className="font-mono text-sm text-ink">specs/PRD.md</code>, so a failure names the requirement it
          breaks. The core invariant: primary actions stay reachable and clickable in both the desktop and the mobile layout.
        </Lede>
        <table className="mt-8 w-full max-w-4xl text-sm">
          <thead>
            <tr className="border-b border-ink text-left font-mono text-xs text-graphite">
              <th className="py-2 pr-4 font-normal">id</th>
              <th className="py-2 pr-4 font-normal">invariant</th>
              <th className="py-2 font-normal text-right">viewport</th>
            </tr>
          </thead>
          <tbody>
            {CHECKS.map(([id, text, vp]) => (
              <tr key={id} className="border-b border-rule align-top">
                <td className="py-3 pr-4 font-mono">{id}</td>
                <td className="py-3 pr-4">{text}</td>
                <td className="py-3 font-mono text-right text-graphite whitespace-nowrap">{vp}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* 08 */}
      <Section id="run" n={8} label="Run it" dark>
        <div className="grid xl:grid-cols-2 gap-10">
          <div className="min-w-0">
            <h3 className="font-mono text-xs text-[#9A958A] mb-4">locally</h3>
            <pre className="font-mono text-[13px] sm:text-sm leading-7 overflow-x-auto">
              <span className="text-[#9A958A]"># terminal 1</span>
              {"\n"}npm install && npm run dev{"\n\n"}
              <span className="text-[#9A958A]"># terminal 2</span>
              {"\n"}npm run kane:login                   <span className="text-[#9A958A]"># once</span>
              {"\n"}npm run driftor:preflight            <span className="text-[#9A958A]"># checks kane, app, agent</span>
              {"\n"}npm run driftor:inject -- overlay    <span className="text-[#9A958A]"># ship a bug from the zoo</span>
              {"\n"}npm run driftor:gate                 <span className="text-[#E8836F]"># Kane catches it</span>
              {"\n"}npm run agent                        <span className="text-[#9A958A]"># Claude Code, hook armed</span>
              {"\n"}npm run driftor:reset                <span className="text-[#9A958A]"># undo any inject</span>
            </pre>
          </div>
          <div className="min-w-0">
            <h3 className="font-mono text-xs text-[#9A958A] mb-4">as a CI gate</h3>
            <pre className="font-mono text-[13px] sm:text-sm leading-7 overflow-x-auto">
              <span className="text-[#9A958A]"># .github/workflows/driftor.yml, on every PR</span>
              {"\n"}- run: npm ci && npx vitest run
              {"\n"}- run: npm run build && npx next start -p 3000 &
              {"\n"}- run: npx kane-cli login --username … --access-key …
              {"\n"}- run: node driftor.js gate --headless
              {"\n"}- run: node scripts/ci.js verdict &lt;run&gt; --policy policies/driftor-gate.yaml
              {"\n"}
              <span className="text-[#9A958A]">  # one sticky PR comment; secrets KANE_USERNAME, KANE_ACCESS_KEY</span>
            </pre>
          </div>
        </div>
      </Section>

      {/* 09 */}
      <Section id="faq" n={9} label="Questions">
        <H2>Fair questions.</H2>
        <dl className="mt-8 max-w-4xl border-t border-ink">
          {FAQ.map((f) => (
            <div key={f.q} className="grid md:grid-cols-[18rem_1fr] gap-x-10 gap-y-2 py-5 border-b border-rule">
              <dt className="font-medium">{f.q}</dt>
              <dd className="text-graphite leading-relaxed">
                <Rich text={f.a} />
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      {/* Close */}
      <section className="border-t border-ink">
        <div className="px-5 sm:px-8 lg:px-12 py-16 lg:py-24 grid xl:grid-cols-[minmax(0,1fr)_26rem] gap-x-16 gap-y-8 items-end">
          <p className="font-serif text-4xl sm:text-6xl leading-[1.02]">
            See the click fail,
            <br />
            <span className="italic text-signal">then watch it heal.</span>
          </p>
          <div>
            <p className="text-graphite leading-relaxed">
              The demo app is a small API-key dashboard with a real backend. Run{" "}
              <code className="font-mono text-sm text-ink">npm run driftor:inject</code>, then try clicking its main
              button yourself.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-sm">
              <Link href="/app" className="bg-ink text-sheet px-4 py-2.5 hover:bg-black">
                Open the demo app
              </Link>
              <a
                href="https://github.com/mrnetwork0001/Driftor"
                target="_blank"
                rel="noreferrer"
                className="border border-ink px-4 py-2.5 hover:bg-sheet"
              >
                View on GitHub ↗
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
