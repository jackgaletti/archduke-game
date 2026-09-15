# Archduke

A private, synchronous 2–10-player card game: React/TypeScript/Vite, Express/Socket.IO, one authoritative Node process, four rounds. Uses the supplied card artwork and the confirmed [house rules](RULES.md).

## Run locally

```sh
nvm install
nvm use
npm ci
cp .env.example .env
# Edit .env: choose a HOST_SECRET of at least 8 characters.
npm run dev
```

Open **http://localhost:5173**. Create a table with a display name and the configured host passphrase. Share its invitation. Joiners need only their name and invitation/code. Set PUBLIC_ORIGIN to exactly the origin browsers use (no trailing slash).

Pinned runtime: Node **24.18.1**, an installed Node 24 LTS version. Node 20.15.1 is too old for this Vite build. Node LTS status: [official release schedule](https://nodejs.org/en/about/previous-releases). Build requirements: [Vite guide](https://vite.dev/guide/).

On this workstation, if nvm is unavailable:

```sh
export PATH="/Users/jackgaletti/.local/share/dating-app-backend/runtime/node-v24.18.1-darwin-arm64/bin:$PATH"
```

## Independent players and reconnect

Use separate browser profiles or isolated Playwright contexts for distinct players. Two normal tabs with the same room cookie control the SAME seat: the newest takes over, and the old tab displays a takeover message. Session cookies are HttpOnly and room-scoped. Never put session credentials or HOST_SECRET into an invitation.

Refresh reconnects to your seat. A confirmed disconnect freezes the round; once everyone returns, the host presses Resume. Grace is 60 seconds, with no automatic strategic moves. Administrative host passes clockwise if needed. Active games lock admissions.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Node server + Vite proxy at localhost:5173 |
| `npm run assets` | Validate all originals; regenerate aspect-preserving web derivatives/manifest |
| `npm run typecheck` | Strict TypeScript check |
| `npm run lint` | ESLint |
| `npm test` | Pure engine and actual socket/integration tests |
| `npm run build` | Validate art, typecheck, build client and Node server |
| `npm start` | Serve built application and WebSockets on PORT |
| `npm run validate:deployment` | Validate Render YAML against its checked-in official schema |
| `npm run test:e2e` | Playwright production-build interaction scenarios; build first |
| `npm run verify` | Lint, types, tests, production build, deployment schema, browser gate |

Install test browser once with `npx playwright install chromium` (Linux CI: `npx playwright install --with-deps chromium`). Tests create their own local servers on ports 3100/3101; sockets need local network permission. Fixtures inject randomness in test-only code; production has no test endpoints.

To inspect the built app locally, set `.env` PUBLIC_ORIGIN to `http://localhost:3000`, run `npm run build && npm start`, and open that URL. Production deployment additionally sets NODE_ENV=production and requires a public HTTPS origin, which enables Secure cookies.

## Persistence and operations

Default `PERSISTENCE=memory`: a process restart/deploy loses active rooms; old links show **This game is no longer available**. UI displays this mode. Abandoned rooms expire after two hours; finished rooms expire after 30 minutes without connected players. Expiration deletes the snapshot and all credential verifiers.

Optional `PERSISTENCE=sqlite`, `DATA_DIR=./data`: stores full authoritative state and hashed session mapping using Node's SQLite adapter. Every gameplay/reconnect commit is saved before acknowledgement/broadcast. Failure preserves previous committed state. Restart restores active games paused, all connections disconnected, private interactions and acknowledgement records intact. Rejoin and host Resume explicitly restore timers. Database contains hidden game information: keep it private; it is not a static asset.

## Architecture

- `src/engine`: pure injected-clock/randomness engine, invariant checker and recipient projection.
- `src/shared`: strict runtime command schemas, public protocol and explicit artwork manifest.
- `src/server`: one serialized queue per room, HTTP invitation/session checks, socket controller ownership, memory/SQLite store.
- `src/client`: artwork-backed table, canonical slot coordinates, timed movement, private interactions, responsive focused grids, keyboard controls and reduced motion.
- `tests`: rule/race, transport/restart, and browser acceptance scenarios.

Card files in `assets/source-cards` remain unchanged. `public/cards` contains web derivatives. The optional reference PDF stays out of static assets. No account system, public room directory, bots, chat, or analytics.

## Troubleshooting

- Missing HOST_SECRET: edit `.env` locally or Render's environment settings; never commit a secret.
- Cannot connect: use the exact PUBLIC_ORIGIN, enable WebSockets, and check the server is running. Production serves frontend and sockets from one origin.
- Stale/late action: stale slot/window commands resynchronize without penalty; an actual match ordered after the next draw can receive that window's one penalty.
- Reconnecting forever: room loss is terminal and should show a readable error; return home and create/join a new room.
- No cards available: host may redeal only this round; prior placements survive.
- Do not run multiple production instances: memory state and SQLite snapshots are designed for one authority.

See [deployment instructions](DEPLOYMENT.md) and [actual verification status](IMPLEMENTATION_STATUS.md). Deploy-ready and externally hosted are separate states.
