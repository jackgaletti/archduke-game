# Archduke implementation and acceptance evidence

## Handoff state — 2026-09-14

Locally complete against ARCHDUKE_BUILD_PROMPT.md. The final `npm run verify` passed: lint, strict typecheck, **60 engine/transport/process-restart tests**, production build, Render schema validation, and **five Playwright browser scenarios** (2.1 minutes). Final screenshots were inspected. The full implementation and this acceptance record form the reviewed local git checkpoint; see `git log -1`.

Local built app: **http://localhost:3000**, started with `npm start`, memory persistence. A private generated HOST_SECRET is stored only in the ignored, mode-0600 `.env`; read that file to create a local table. Session credentials are HttpOnly cookies, never invite links. Independent seats require independent browser profiles/contexts.

No external deployment, GitHub remote, hosted CI run, or two-physical-device playtest is claimed. External hosting requires the owner's private GitHub repository and authorized paid Render account. Exact repository-specific setup is in DEPLOYMENT.md. No local implementation blocker remains.

## Verified commands and environment

- Installed and pinned Node **24.18.1**, React **19.3.0**, Vite **8.3.0**, Express **5.2.1**, Socket.IO **4.8.3**, TypeScript **6.0.3**, Vitest **5.0.0**, Playwright **1.63.0**, with exact dependencies/lockfile.
- `npm ci`: clean reinstall succeeded; 255 packages audited, zero reported vulnerabilities.
- `npm run verify`: lint → strict typecheck → engine/real socket/process tests → artwork/production build → official Render schema validation → real-browser scenarios. PASS on the final code (60 tests + five browser scenarios).
- `node artifacts/smoke-dev.mjs`: PASS after both processes became healthy. Invoked `npm run dev`, loaded localhost:5173, created a room through Vite's HTTP proxy, authenticated a WebSocket through its WS proxy, then stopped its test process group.
- `node artifacts/smoke-production.mjs`: PASS. Real production-mode server health, SPA invite fallback, all 16 case-sensitive WebP URLs, Secure/HttpOnly/SameSite=Strict cookies, reference PDF not exposed; also verified the built app served by `npm start` on localhost:3000.
- `git diff --cached --check`: PASS. Secrets, database files, dependency/build output and local artifacts are ignored.

The local shell's default Node 20.15.1 is too old. Verification used:

```sh
export PATH="/Users/jackgaletti/.local/share/dating-app-backend/runtime/node-v24.18.1-darwin-arm64/bin:$PATH"
npm ci
npm run verify
```

## Requirement-to-evidence mapping

Numbers correspond to verification requirements in ARCHDUKE_BUILD_PROMPT.md §13. Test source, not just a green count, was reviewed against the required behavior.

| Requirement | Implementation and evidence |
| --- | --- |
| 1. Deck, dealing, reset | engine/model.ts multiset and Fisher–Yates; engine tests verify all copy counts, 104 identities/conservation, bounds, 2/10-seat deals and independent four-round reset. |
| 2. Initial private peek | One exact pair, explicit Hide & ready, permanent per-round peek consumption; engine tests + UI privacy/keyboard assertions. Initial discard has no action, initial grid matches do. |
| 3. Ordinary draws | Authenticated private held draw, forced discard-pile replacement, stable target, outgoing revelation on commit, one held card; engine and four-round UI tests. |
| 4. Matches and penalties | Own-only, 0↔13, mixed ordered batches, rapid failures, one allowance across on-time/late attempts, fresh windows, stale revisions, duplicates; engine and socket dedup tests. |
| 5. Arrival and delay boundaries | Match-first/draw-first and call-first/draw-first engine cases; before/at unlock, no queued early draw; full second after wrong face returns hidden. Slot revisions permit competing matches despite global version changes. |
| 6. Effects | 1/11/12 grid-only activation, FIFO, matching while effects wait, changed targets, optional/automatic skips, both Swap endpoints, private Peek expiry/Done, caller immunity. Engine tests plus UI Give/Swap/Peek scenario. |
| 7. Archduke | Resolved own turn required; caller matching/penalties; explicit ordered one-turn-per-other-player list; final window and caller-only close. Engine tests and all four browser rounds. |
| 8. Zero and incorrect call | Immediate terminal transition cancels effects/batches; zero loses to negative sums; one pre-score incorrect-call card including negative values; tied minimum unpenalized. Engine tests. |
| 9. Rankings and four rounds | Sum/count/lowest-card tiers, repeated temporary tie-breaks, depleted tie fallback, immutable placements, next starter, shared final victory, dismissible dead-last dialog and new game. Engine tests + complete UI game. |
| 10. Supply and positions | Normal/Give/penalty recycle keeps top and excludes live zones; exhausted mandatory supply pauses and explicit redeal retains earlier placements/normal starter. Engine tests; actual UI grows an 18-card hand, verifies unchanged slot coordinates and mobile access to last slot. |
| 11. Privacy | One recipient projection used for every state event, sync and reconnect; only current authorized faces sent. Tests inspect owner/opponent initial, held, Give, Swap, Peek, late/incorrect and scoring behavior; browser image/DOM labels assert private visibility/expiry. Operational logs omit hands/credentials. No production fixture/debug route. |
| 12. Rooms/session boundaries | Invalid invitation/origin/secret; two isolated rooms; replayed credential with forged room cookie name rejected; ten-seat cap; forged actor/scopes; takeover; refresh; acknowledgement status; paused durations; HTTP admission retries survive a lost response and refresh. Socket/browser tests. |
| 13. Restart modes | Actual child-process SIGKILL/restart tests preserve held draw, active queued private Peek, cards, credentials, action IDs and saved remaining time in SQLite. Reconnect and explicit Resume/Done work. Depleted pause preserves Redeal. Memory room loss verified in server tests and actual browser. |
| 14. Complete UI game | Five Playwright scenarios use real WebSockets and isolated authenticated contexts: four complete rounds/final totals/new game; 6/10 layouts; matching/all effects/large hand; memory process loss; lost creation response. No gameplay scripting or cheat endpoints in production. |
| 15. Ten clients and visuals | Ten concurrent socket clients; inspected 2/6/10 desktop/mobile screenshots; all ten seat grids within 1440×1000 viewport; focused horizontal grids retain holes and reach later slots; no unexpected browser/page errors. Production build used. |
| 16. Latency/jitter | Six clients with injected 0/9/16/22/35/48 ms send delays converge on a single final sequence, with arrival-order output in artifacts/jitter-metrics.json. Both race orders tested deterministically. Disconnect/reconnect tested separately. Queue/commit/fan-out metrics in artifacts/transport-metrics.json. |

Other explicit deliverables: RULES.md and in-app rules include confirmed differences/defaults; EXECUTION_PLAN.md tracks phases; .env.example documents runtime knobs; README covers setup and isolated seats; render.yaml and DEPLOYMENT.md configure one paid Node service, memory default, optional runtime-only SQLite disk; CI runs the gate and uploads evidence. No Redis, external database, AI API, bots, accounts, chat, analytics, or extra rounds were introduced.

## Artwork and visual review

All 16 supplied originals remain unchanged in assets/source-cards. scripts/assets.mjs validates them and records dimensions and SHA-256 in src/shared/artwork.json. Aspect-preserving WebP derivatives total about 444 KB. The reference PDF remains private to the repository; its image pages were not read because the reconciled prompt is authoritative.

Inspected screenshots in artifacts/: home-desktop; table-2-desktop/mobile; table-6-desktop/mobile; table-10-desktop/mobile; mobile-focus; swap-table; private-peek; final-results; large-hand-desktop/mobile; memory-restart-room-loss. Fixed centered-grid drift, added explicit horizontal navigation, and verified later slots remain targetable. Wide grids intentionally scroll inside their own panel; the page has no horizontal overflow. The last mobile card was focused and verified visible. The publicly revealed wrong card returns to a back before the next draw's protected delay expires.

## Timing and disclosed defaults

Matching remains open after its minimum delay until an accepted draw. One failed-match penalty per player/window, including a race with that draw. Calls can follow either legal turn completion. Effects are optional; Swap requires different players; caller closes the final window. No ordinary turn timeout. Redeals use the normal starter rule. Full text: RULES.md.

Final ten-client sample: **p95 1.17 ms**, max 1.55 ms across 53 queued/committed/fanned-out transitions. Latest local timing samples are machine-generated in artifacts/transport-metrics.json and artifacts/jitter-metrics.json. Measured on macOS arm64, Node 24.18.1; these are local queue/commit/fan-out and injected-delay observations, not a claim of worldwide fairness or internet latency.

## Persistence and external boundary

Selected local/default deployment mode is memory: a restart/deploy loses games. SQLite saves transitions before ack, freezes restored games, and requires explicit reconnect/resume. Confirmed disconnect grace is 60 seconds, not an automatic move; host control passes clockwise, including after process recovery. Abandoned TTL is two hours; completed-room idle TTL is 30 minutes. Snapshot/session mappings are deleted on expiry.

Render YAML passes the official schema downloaded 2026-09-14 and explicit single-service checks. Deployment uses Node 24.18.1, `npm ci && npm run build`, `npm start`, PORT/0.0.0.0, and /healthz. Optional disk: PERSISTENCE=sqlite, DATA_DIR=/var/data, mount /var/data; runtime only, with brief disk-backed redeploy downtime.

Remaining external actions: create/push the private GitHub repo, authorize the paid Render service, supply HOST_SECRET and the actual HTTPS PUBLIC_ORIGIN, deploy, then perform a live invite/reconnect smoke test. No domain purchase required. See DEPLOYMENT.md.

## Environment/recovery notes

Browser plugin discovery returned no browsers. Its documented fallback check was completed, then standalone Playwright Chromium was installed and used. Sandboxed local networking initially failed with EPERM; approved networking-enabled reruns passed. Early test-only failures (startup readiness, persisted-time comparison, keyboard input before the deal unlocked) were repaired without weakening game rules. Hard process-crash tests use test-only randomness injection, never production cheat endpoints.

Final checkpoint: all locally achievable requirements have evidence above; no remaining implementation/test failure. Local server was restarted onto the verified build and remains on port 3000. To resume work, inspect this file, `git status`, and `/healthz`; do not assume an old server handle is still live. Only optional external publication/account actions remain.
