# Cora Smart Pots

Cora Smart Pots is a GreatUniHack 2026 concept prototype for the NatWest AI-Powered Financial Inclusion & Resilience challenge.

> “Tell Cora what matters to you, and she’ll make every payday work towards it.”

The prototype turns plain-language financial details into editable Pots, forecasts real payment dates, calculates savings contributions from actual income events, and previews the impact of changes before they are saved. It does not connect to a bank or move real money.

## Run locally

Requirements: Node.js 20+ and npm.

```bash
npm install
copy .env.example .env
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Vite proxies `/api` to the Express server on port 8787.

The app works without an Anthropic key: demo data, manual controls, Pots, goals and the calendar remain fully functional. To enable natural-language Cora interactions, set these backend-only values in `.env`:

```dotenv
ANTHROPIC_API_KEY=your_key_here
ANTHROPIC_MODEL=claude-sonnet-5-5
PORT=8787
```

Never use a `VITE_` prefix for the API key; that would expose it to the browser.

## Useful commands

```bash
npm run dev       # frontend and API with live reload
npm run build     # TypeScript checks and production frontend build
npm test          # financial engine and recurrence tests
npm start         # serve the production build and API on port 8787
```

Run `npm run build` before `npm start`.

## Demonstration flow

1. Choose **Try a demo**.
2. Inspect the personalised Pots and monthly plan.
3. Open **Calendar** to see income, bills, goal contributions and estimated balances.
4. Open **Cora** and choose **Run the judge demo: £1,200 salary this month**. This path uses the real calculation engine even if the AI service is not configured.
5. Review the before/after figures and confirm the proposal.
6. Return to Overview or Calendar to see the shared state update immediately.

With an Anthropic key configured, suggested prompts and free text call the real `/api/assistant` endpoint. Model output is schema-validated and converted to an application-side proposal; it cannot directly mutate financial state.

## Architecture

- `src/lib/engine.ts` — deterministic money, allocation, goal and forecast calculations.
- `src/lib/dates.ts` — explicit schedule recurrence, including shorter-month handling.
- `src/lib/actions.ts` — validation-aware previews and application of assistant proposals.
- `src/views/` — the four state-driven product areas.
- `server/` — Express API, Anthropic SDK integration and Zod output validation.
- Browser `localStorage` — prototype persistence only; no database or authentication.

All money is stored as integer pennies. Pot allocations are earmarked funds and have zero calendar balance impact; only actual income and payment events change the forecast balance.

## Responsible-AI boundary

Claude interprets language and proposes one structured action. The application owns calculations, event generation, shortfall detection and mutations. Every financial change is previewed and requires confirmation. API errors never fabricate a successful response.
