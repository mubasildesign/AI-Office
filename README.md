# AI Office Studio

Design a team of AI agents, run it on your machine, and export it to Codex, Claude Code, or a Docker runner.

## What it does

- **Company templates:** start from a full startup or a blank company.
- **Agents:** define each role's instructions, guardrails, skills, tool access, and model policy.
- **Teams:** group agents under a supervisor who delegates to specialists.
- **Missions:** write an objective, assign it to an agent or team, and run it through the local runner.
- **2D office:** a visual floor of the company. Drag people between departments and form teams.
- **Export:** produce a portable `.agentpack`, a Codex project, a Claude Code plugin, or a Docker runner. Each export includes a compatibility report that lists what carries over, what degrades, and what is unsupported.

Credentials are never packaged. Exports contain declarations only.

## Local-first

All company data is stored in your browser (IndexedDB). Missions run through a small local runner (`runner/index.ts`) that holds your provider keys. The app never sends keys to the browser.

## Run it

```bash
npm install
npm run dev
```

`npm run dev` starts the web app on `http://localhost:3000` and the runner on port `4317`.

To run missions, set provider keys in the runner's environment:

```bash
OPENAI_API_KEY=... ANTHROPIC_API_KEY=... npm run runner
```

The runner prints a six-digit pairing code. Click **Pair runner** in the app's top bar and enter it. A mission fails with a clear error if the key for its agent's model provider is missing.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Web app and runner, with reload |
| `npm run runner` | Runner only |
| `npm run validate` | TypeScript typecheck |
| `npm test` | Unit tests for the studio logic |
| `npm run lint` | ESLint |
| `npm run build` | Typecheck, tests, then a production build |

## Project layout

- `src/app/`: Next.js app shell and global styles
- `src/components/`: studio UI (shell, office, agents, inspector, onboarding)
- `src/components/office/`: PixiJS pixel office engine
- `src/lib/`: domain types, store, persistence (Dexie), export, validation, seed data
- `runner/`: local Node runner that executes missions with provider keys
- `tests/`: studio logic tests

## Legacy marketplace files

The `catalog/`, `schemas/`, `scripts/`, and `generated/` folders come from the earlier static marketplace of Codex and Claude Code role packages. The studio does not depend on them.
