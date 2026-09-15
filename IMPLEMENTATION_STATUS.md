# Archduke implementation and verification

## Current update

- Penalty and Give cards append to the shorter occupied row, top on ties, reevaluated for each card. Matches smoothly close only the affected row. Stable slot references and revisions remain separate from visual columns, preventing shifted neighbors from inheriting stale actions.
- Every round automatically deals, flips the viewer’s bottom two cards, holds them briefly face up, then closes them before the initial discard. Server deadlines survive pause/reconnect; other recipients receive no private faces. Special Peek remains a direct, authorized interaction.
- Central pending/draw/discard cards are approximately 10% smaller, still equal-sized and 5:7. Own cards retain their dimensions. Opponents form a tighter centered group, and the lower composition preserves its reserved pending space and expanded-hand allowance.
- The draw pile uses up to eight actual back-image layers, bounded by its real count, with an anchored top target and no intercepting decorative layers.
- Results distinguish round place, hand total and cumulative placement points. The navy/light/gold dead-last banner automatically exits after 2.9 seconds, has no button, and does not advance play or block Next. Invite is text-only.
- Six-seat admission, private invitations, server-issued host/reconnect credentials, per-card matching penalties, special actions, final matching deadlines, caller indicators and four-round scoring remain intact.

## Verification

Final npm run verify passed: lint, typecheck, all 118 engine/transport/persistence/layout tests, production build, deployment-schema validation and all 15 isolated-browser scenarios (4.6 minutes). The production smoke check also passed. Browser review found and fixed an opponent pending-area collision. Results-refresh coverage follows the authoritative host after the existing host-transfer policy applies.

Browser evidence covers 1280×800, 1440×900, 1920×1080, portrait 820×1180 and landscape 1180×820, plus a 390×844 overflow check. Screenshots and actual animation frames are inspected in Playwright Chromium with isolated multiplayer contexts, including private peeks, draw/replacement/swap movement, expanded hands and reduced motion. No physical-device performance claim is made.

Evidence is saved under artifacts/: automatic-peek.png, row-close-mid.png, waiting-*, strip-*, overlap-6-cards.png, overlap-8-cards.png, expanded-hand-portrait.png, final-results.png, last-place-banner.png, central-card-measurements.json and large-motion-bounds.json, plus draw-stack-one.png and draw-stack-empty.png.

## Operations

Use Node 24.18.1. npm run verify runs lint, typecheck, engine/transport/persistence tests, production build, deployment-schema validation and isolated browser tests. The in-app browser had no connected browser; the established standalone Playwright fallback supplies browser evidence. No external deployment or physical-device performance claim is made.

The updated build is running at localhost:3000. Production smoke checks passed health, invitation SPA routing, all 16 card assets, both local fonts, GIF/still and crown, secure cookie flags and non-public reference PDF. The local app uses memory persistence; restarting clears memory rooms. Optional SQLite restores active rooms paused with credentials and private interactions preserved. Six seats, server-issued host privileges, secure invitations, HttpOnly reconnect credentials, origin checks and proportionate rate limits remain.

## Measured central cards

| Viewport | Own card | Pending / draw / discard |
| --- | --- | --- |
| 1280×800 | 120×168 | 221×309.39 |
| 1440×900 | 145×203 | 266×372.39 |
| 1920×1080 | 200×280 | 365×511 |
| 820×1180 | 100×140 | 139×194.59 |
| 1180×820 | 125×175 | 228×319.19 |

All dimensions are browser CSS pixels from six-player layouts. The three central cards match one another and preserve 5:7.
