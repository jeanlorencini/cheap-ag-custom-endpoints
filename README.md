# Cheap Agent Custom Endpoints

Fork of [muaaz9329/cheap-ag](https://github.com/muaaz9329/cheap-ag), retaining the upstream MIT license and attribution.

This fork adds native **custom OpenAI-compatible endpoints**. It configures the endpoint directly, without private launchers, hardcoded user paths, provider aliases or committed credentials. The original four built-in providers remain available.

## Install this fork

Requires Node.js 20.11+, Git and, on Windows, Git Bash. The package is installed from GitHub, not from a separately published npm package:

```sh
npx -y github:jeanlorencini/cheap-ag-custom-endpoints#main login
```

Choose **Custom OpenAI-compatible endpoint** (option 5), enter a base URL such as `https://api.example.com/v1`, and an explicit model ID such as `example-model`. OpenCode then collects the API key in its hidden prompt. The endpoint must implement OpenAI Chat Completions and support tool calls. Responses-only endpoints are not supported.

For a local server use an HTTP loopback URL, for example `http://127.0.0.1:8000/v1`. Remote endpoints require HTTPS. URLs with embedded credentials, query strings or fragments are rejected. Include the API's base path, usually `/v1`; do not append `/chat/completions`.

For Codex:

```sh
codex plugin marketplace add jeanlorencini/cheap-ag-custom-endpoints
codex plugin add cheapag@cheap-agent-custom-endpoints
```

Restart Codex, trust the plugin hooks, and run `$cheapag:allow --models custom/example-model` in each Git project. Claude Code users can accept login's plugin setup and then run `/cheapag:allow --models custom/example-model`.

Use one enabled Cheap Agent copy at a time. Disable or remove the upstream plugin before enabling this fork; both expose tools named cheapag. Existing user settings are preserved, but choosing a provider explicitly makes it the active provider.

## Credential and consent boundaries

Only the global user config `~/.config/cheapag/config.json` can choose a custom endpoint. Login writes non-secret settings of this shape:

```json
{
  "provider": "custom",
  "custom_endpoint": {
    "base_url": "https://api.example.com/v1",
    "model": "example-model"
  }
}
```

Never put an API key in this JSON or a repository's `cheapag.json`. Keys stay in OpenCode's credential store under an endpoint-specific hashed provider ID. A changed endpoint cannot reuse the old endpoint's key; run login again. Repository consent is also bound to the endpoint and must be renewed after a change. Repository settings cannot redirect that credential to another endpoint.

One selected model is used for every role by default, with no external fallback. Runtime errors and job output redact saved custom keys, including non-standard token formats. The endpoint's retention policy is **not known** to this tool; `--zdr-only` does not certify a custom endpoint.

## Explicit task intent

Callers can pass `kind: "feature"` for new behavior or `kind: "fix"` for a bug repair. Plans accept the same `kind:` field per step. Explicit intent takes precedence over keyword inference, and a plan step takes precedence over the call-wide value.

This prevents an error-handling feature from being stopped merely because its description contains words such as "error" or "exception". Bug fixes retain the reproduction-test deadline. All work still has normal turn, time, permission and verification limits; this does not guarantee that a worker always succeeds.

## Runtime diagnostics and research

`ping` identifies this fork as `runtime=cheap-ag-custom-endpoints` and lists its capabilities. Engine health is not model API health: it does not validate authentication, model availability or billing. Before starting a custom loopback job, Cheap Agent makes a bounded TCP connection check, without sending credentials or an HTTP request. An unavailable local relay fails before a worker or worktree is created. Remote endpoints are not preflighted; a successful local TCP check is not proof that the API will answer.

Research persists its terminal result before cleanup. If cleanup fails after its existing retries, the result retains the worker error separately from `cleanupError` and reports the retained `worktree`; cleanup failure does not erase a successful answer. Research commands must be simple and permitted by policy, never shell chains rewritten to bypass a denial. Ignored references may be absent from the isolated snapshot even when they exist in the original checkout; give the worker the current checkpoint and relevant bounded context.

Usage `turns` counts tool calls, not model responses; `modelMessages` counts unique assistant message IDs. Token usage is deduplicated by message ID. `costSource` distinguishes positive engine-reported costs from unknown costs: zero or missing engine prices display as `cost=unknown`, not free usage. Reported costs are not independently verified provider charges, and cost caps cannot enforce unreported charges. Research reproduction status is separate from its command and outcome; only an exact whitespace-normalized command actually executed by the worker is marked verified.

Release 1.3.3 was checked with typecheck, build and targeted regression tests, including a real OpenCode engine against a mock HTTP API. It is not a claim of a clean full-suite run: two short-deadline integration tests also fail on the previous commit on Windows, and the permissions integration requires GNU Make. No live-provider reliability or billing guarantee is implied.

## Update, remove and build locally

Re-run the Git install command to update the runtime, and refresh the marketplace with `codex plugin marketplace upgrade cheap-agent-custom-endpoints`. Updates use this fork's main branch; review changes before updating.

```sh
codex plugin remove cheapag@cheap-agent-custom-endpoints
codex plugin marketplace remove cheap-agent-custom-endpoints
```

To build a local checkout:

```sh
git clone https://github.com/jeanlorencini/cheap-ag-custom-endpoints.git
cd cheap-ag-custom-endpoints
npm ci
npm run typecheck
npm run build
node dist/index.js login
```

The benchmark and price claims in the upstream background below refer to upstream experiments, not measurements of this fork. A reported cost of zero may mean that the endpoint supplies no billing data. Savings and charges depend on your own endpoint and account.

---

## Upstream project background

<h1 align="center">Cheap Agent</h1>

<p align="center">
  <em>Your frontier model is a principal engineer. Stop paying it to type.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/cheap-agent?style=flat-square&color=111111&label=npm" alt="npm">
  <img src="https://img.shields.io/badge/for-Claude%20Code%20%7C%20Codex-111111?style=flat-square" alt="For Claude Code and Codex">
  <img src="https://img.shields.io/badge/cheap%20model-%C2%BD%C2%A2%20a%20task-111111?style=flat-square" alt="Cheap model: half a cent a task">
  <img src="https://img.shields.io/badge/tested%20on-SWE--bench%20Verified-111111?style=flat-square" alt="Tested on SWE-bench Verified">
  <img src="https://img.shields.io/badge/license-MIT-111111?style=flat-square" alt="MIT License">
</p>

<p align="center">
  <img src="assets/demo.gif" width="880" alt="Two real Claude Code sessions side by side, same prompt: Claude Code alone climbs to 233k Opus tokens, Claude Code with Cheap Agent stops at 132k, and the cheap model costs $0.007.">
</p>

<p align="center">
  <img src="assets/hero.svg" width="880" alt="Same feature, same prompt: Claude Code alone used 154k Opus tokens in 5 turns; with Cheap Agent 57k Opus tokens in 2 turns, 63% fewer, and the cheap model cost half a cent. Both versions pass all their tests.">
</p>

<p align="center">
  <strong>Same feature. Same prompt. 63% fewer Opus tokens.</strong><br>
  <strong>Your Claude or ChatGPT plan lasts longer. Your code still ships with tests.</strong>
</p>

<p align="center">
  ⭐ Star it, and click <strong>Watch → Custom → Releases</strong> to hear when new versions ship.
  <br>💬 Questions, ideas and setups: <a href="https://www.reddit.com/r/CheapAgent/">r/CheapAgent</a>
</p>

## Install

Works in Claude Code and Codex. One login covers both.

### Claude Code

**Easiest:** paste this into Claude Code. It asks what you want, then gives you one command to run.

```text
Set up Cheap Agent (npm: cheap-agent) for me.
1. Ask me: which provider (OpenRouter recommended, DeepSeek, OpenCode Go or Command Code), and which
   models (balanced is the default; cheapest, strongest, or my own provider/model).
2. Check that node is 20+ and the claude CLI is installed.
3. If I picked my own model, save {"models":{"implement":"<model>"}} in
   ~/.config/cheapag/config.json, keeping what else is there.
4. Give me the command to run in my terminal: npx -y github:jeanlorencini/cheap-ag-custom-endpoints#main login --preset <my choice,
   or custom>, and which number to pick for my provider (1 OpenCode Go, 2 OpenRouter,
   3 DeepSeek, 4 Command Code). I run it and type my API key there. Never ask for my key.
5. When I say done, check `claude mcp list` shows cheapag, then tell me to run
   /cheapag:allow in a new Claude Code session in my project.
```

**Or do it yourself:**

```bash
npx -y github:jeanlorencini/cheap-ag-custom-endpoints#main
```

Pick a provider (**OpenRouter** if unsure), press Enter for the recommended models, paste your API key. It checks the key works, then adds itself to Claude Code for every project.

Then, in each project, once:

```
/cheapag:allow
```

**That's it.** Ask Claude for changes like you always do.

### Codex

Log in (say no when it offers to add itself to Claude Code, if you don't use Claude):

```bash
npx -y github:jeanlorencini/cheap-ag-custom-endpoints#main
```

Add the plugin:

```bash
codex plugin marketplace add jeanlorencini/cheap-ag-custom-endpoints
```

```bash
codex plugin add cheapag@cheap-agent-custom-endpoints
```

Start `codex` in your project and trust the 3 cheapag hooks when it asks. Then, in each project, once:

```
$cheapag:allow
```

**That's it.** Ask Codex for changes like you always do.

**You need:**
- [Claude Code](https://claude.com/claude-code) or [Codex](https://developers.openai.com/codex)
- [Node.js](https://nodejs.org) 20+
- An API key with a few dollars on it from [OpenRouter](https://openrouter.ai/keys), [DeepSeek](https://platform.deepseek.com), [OpenCode Go](https://opencode.ai) or [Command Code](https://commandcode.ai) (Command Code needs a plan with API access; OpenCode Go needs Regions set to Global in its console for the DeepSeek models)

A few dollars lasts hundreds of tasks. It runs on macOS, Linux and Windows.

**Windows:** you also need [Git for Windows](https://git-scm.com/downloads/win) (Git Bash). Known so far:
- The very first job can take about 2 minutes while the cheap model's engine (OpenCode) sets itself up. Later jobs start in seconds.
- If that engine crashes mid-session, Cheap Agent starts a new one, but the crashed copy can stay running (`opencode.exe` in Task Manager) until you end it or restart.
- The cheap model can't read your dependency folders (like `node_modules`) inside its copy of the project. Your tests still run normally.

---

You know the principal engineer. Twenty years in. Sees the whole system at once. Costs a fortune per hour.

You would never pay them to type out a CSV exporter.

But that's exactly what happens every time your frontier model (Claude Opus, GPT-6 Astra or Sol) writes your code: the most expensive model you have, reading files, typing boilerplate, re-running tests, burning through your plan.

**Cheap Agent fixes the org chart.** Your frontier model plans and decides. A model that costs half a cent per task does the typing, in its own copy of your project, and has to prove its work with a test before anything reaches you.

## Why I built this

The idea: get **$200-plan usage out of the $100 Claude plan**, and **$50–70 worth out of the $20 plan**, with a few dollars of DeepSeek doing the typing.

I've met a lot of students, mostly in developing countries, who really want Opus for the hard problems and simply can't afford $100 a month. I wanted to find something that helps them.

This is a small effort from my side. It won't make Opus ten times cheaper. But stretching the plan you already pay for is something, and something is better than nothing.

📖 The full story (why I built it, how it works step by step, and the SWE-bench numbers): **[Cheap Agent: how I made my Claude plan last 2.2–2.7x longer](https://muaazkhan.me/blog/cheap-agent)**

## The numbers

Tested on [SWE-bench Verified](https://www.swebench.com): real bugs from real open-source projects, graded by the official harness. Same prompts in Claude Code with Opus 5.5, with and without Cheap Agent.

<p align="center">
  <img src="assets/chart.svg" width="880" alt="Opus tokens, Claude Code alone versus with Cheap Agent. Adding a feature: 154k vs 57k, 63% less, both pass all tests. 7 everyday bug fixes: 1.6M vs 655k, 59% less, 7 of 7 solved by both. 9 of the hardest bugs: 3.0M vs 1.3M, 55% less, 6 of 9 solved vs 7 of 9, with a Sonnet helper doing the leftovers.">
</p>

**What I won't hide:**
- On the very hardest bugs it solved 6 of 9 where plain Opus solved 7 (on a single run plain Opus averages about 6 too).
- On tiny jobs (a few lines, or a whole small app from nothing), Opus is already quick, so there's nothing to save.

Cheap Agent shines on the work in between: real features and real fixes in real code. That's most of your day.

## Before / after

**The ask:** *"Add monthly budgets to the expense tracker, plus a CSV export. Tests for everything."*

|  | Claude Code alone | Claude Code + Cheap Agent |
|---|---|---|
| Opus tokens | 154k | **57k** |
| Opus turns | 5 | **2** |
| Who wrote the code | Opus | a cheap model, for **$0.005** |
| Tests | 33 passing | **38 passing** |

Opus wrote one task. The cheap model did the rest, tests included.

## Built with itself

Native Windows support (36 files, +753/−278 lines) was built with Cheap Agent. Claude found the problems and wrote the plans. The cheap model wrote the code in 30 jobs for **$0.29 in total**, Sonnet helpers finished what it couldn't and read OpenCode's source to find the two Windows-only bugs, and the full test suite now passes on Linux and Windows.

## How it works

<p align="center">
  <img src="assets/flow.svg" width="880" alt="How it works: Opus writes a short task; a cheap model works in its own copy of your project, writes a test that fails, fixes the code and makes the test pass; Cheap Agent runs the tests itself and only passing work lands, uncommitted; Opus reads a ten-line result and tells you. If the cheap model can't finish, a Sonnet helper finishes the step instead of Opus.">
</p>

- **Every change is proven.** The cheap model must write a test that fails before its fix and passes after. Cheap Agent runs the tests itself; it doesn't take the model's word for it.
- **Your project stays clean.** Work happens in a private copy (a git worktree). Only passing work lands, uncommitted, so you review the diff like any other.
- **Your frontier model stays in charge,** but it's held to it: Cheap Agent's hooks stop it from quietly redoing work that already passed, or (in Claude Code) doing a failed step itself when Sonnet can.

## Commands

| Claude Code | Codex | What it does |
|---|---|---|
| `/cheapag:allow` | `$cheapag:allow` | Your OK to send this project's code to the cheap model. Once per project. |
| `/cheapag:status` | `$cheapag:status` | Recent jobs, and what the cheap model has cost you. |
| `/cheapag:hook on` | `$cheapag:hook on` | No more "I'll just do it myself": your frontier model *must* hand code changes to the cheap model. |
| `/cheapag:clean` | `$cheapag:clean` | Tidy up old job folders. |

While a job runs, Claude Code shows the worker's latest step under the tool call, and Codex shows it each time it checks in (about every 15 seconds). To follow every step in a second terminal, run `npx -y github:jeanlorencini/cheap-ag-custom-endpoints#main watch`.

## Settings

Optional. Put a `cheapag.json` in a project:

| Setting | Default | What it does |
|---|---|---|
| `takeover` | `"sonnet"` | Who finishes a step the cheap model couldn't: a Sonnet helper, or `"self"` (your frontier model, capped at 15 tool calls). Claude Code only; Codex finishes it itself. |
| `limits.max_turns` | `25` | The most turns the cheap model gets per step. |
| `models` | from setup | Which cheap models to use. Switch with `npx -y github:jeanlorencini/cheap-ag-custom-endpoints#main login --preset strongest`. |

## FAQ

**Is a half-cent model actually any good?**
On its own, no. With a written task from your frontier model, a test it has to pass, and a referee that runs that test, yes, most of the time. When it isn't, it says so and a stronger model takes over.

**Does my frontier model check the work?**
The tests check the work, and Cheap Agent runs them. Opus checking every passing change cost three times the tokens and caught nothing in my runs, so it trusts a pass. You still review the diff before you commit.

**Where does my code go?**
To the provider you picked, only after you run `/cheapag:allow` (`$cheapag:allow` in Codex) in that project, which also shows exactly which models will see it. Your API key stays on your machine, in a hidden prompt and a local credential store, never in chat.

**Will it commit or push anything?**
Never. Changes land uncommitted. Your git, your call.

**Why not just use Sonnet for everything?**
Sonnet still costs real usage on every line it types. The cheap model types for half a cent. Sonnet only gets called when the cheap model is stuck.

**Can I use it at work, or build on it?**
Yes. It's MIT licensed: use it, change it, share it, at any company, for free ([MIT License](./LICENSE)).

**Why "Cheap Agent"?**
Because your plan isn't.

## Contributing

PRs are welcome, and I'm more than happy to merge them. Setup, where things live, and how to add a provider are in [CONTRIBUTING.md](./CONTRIBUTING.md). For ideas and questions, come say hi on [r/CheapAgent](https://www.reddit.com/r/CheapAgent/).

## Update or remove

New versions are announced on the [Releases page](https://github.com/jeanlorencini/cheap-ag-custom-endpoints/releases). Cheap Agent also tells you when a session starts if a new minor or major version is out; set `CHEAPAG_NO_UPDATE_CHECK=1` to turn that off.

**Update:**

```bash
npx -y github:jeanlorencini/cheap-ag-custom-endpoints#main
```

In Codex, also:

```bash
codex plugin marketplace upgrade
```

**Remove** (two commands):

```bash
claude plugin uninstall cheapag@cheap-agent-custom-endpoints
```

```bash
claude mcp remove -s user cheapag
```

In Codex:

```bash
codex plugin remove cheapag@cheap-agent-custom-endpoints
```
