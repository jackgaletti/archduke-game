# Build Archduke: complete private multiplayer card game

You are implementing this project, not merely planning it. Read this entire file before changing code. Build, run, test, inspect, and repair the complete application until the definition of done below is met. The target is a polished browser game that 2–6 friends can play synchronously through private invite links, with four rounds per game. Finish all locally possible work even when account setup or deployment credentials remain unavailable.

## 1. Working agreement and inputs

- Work in the current `archduke-game` repository. Inspect existing files, git status, and applicable AGENTS.md instructions first. Preserve unrelated work and never overwrite original artwork.
- This file is the authoritative product specification. It incorporates the user's written house rules, the official PDF, and subsequent user clarifications. Do not silently substitute the official commercial game's rules for the rules below.
- Card artwork is in `assets/source-cards/`, copied from the user's `~/Downloads/archduke/` folder. Expected values are `-3`, `0`, `1` through `13`, and `back.png`; inspect actual extensions/capitalization. If the project copy is absent, read the original Downloads folder if accessible, then copy only the necessary assets. Use an explicit asset manifest. Preserve colors, proportions, and artwork. Do not generate replacement illustrations for available cards.
- The optional local rulebook is `reference/archdule-rules.pdf` (the spelling is intentional). It has six image-based pages; use rendered pages or OCR, not an empty text extraction. The rules have already been reconciled below. If the PDF is unavailable, continue from this specification; do not claim to have read it.
- If artwork is missing, implement functional temporary face/back components and an asset validation report, complete the rest, and clearly report the remaining asset requirement. Do not call the requested artwork integration complete until real assets have been verified.
- Use the installed environment and current official documentation to select a supported Node LTS version and compatible stable packages. Pin the selected runtime and dependencies with a lockfile. Do not guess a Node patch version or install unrelated infrastructure.
- Maintain a short EXECUTION_PLAN.md, RULES.md, and IMPLEMENTATION_STATUS.md. Record finished work, actual test commands/results, unresolved issues, decisions, and the next action so work survives context compaction or a resumed session. These are aids to implementation, not the deliverable in place of code.
- Make reasonable decisions for ordinary engineering details. Follow the explicit house-rule defaults below for unspecified gameplay details and document them. Ask only when an actual contradiction or missing access blocks meaningful progress. Continue independent work before asking.
- You are authorized to create/edit project files, install project dependencies, run development servers and browsers, execute tests, and make local git commits. Do not purchase hosting, register a domain, disclose credentials, or change unrelated projects. Prepare deployment completely; perform an actual external deployment only when the user has provided the account access and authorized it. Do not treat external logistics as permission to stop coding early.
- Do not use an infinite shell loop or repeatedly launch competing agent processes. Work through implement → run → test → inspect → fix cycles in this session. Stop when acceptance criteria pass or only clearly identified external blockers remain. Do not promise uninterrupted execution through usage limits, lost connectivity, or approval gates.

## 2. Architecture: deliberately small

Use one repository and one production Node process:

- React + TypeScript + Vite for the browser UI.
- Node.js + TypeScript + Express for HTTP and the authoritative game server.
- Socket.IO with WebSocket transport for persistent real-time connections. Serve the built frontend and realtime endpoint from the same production origin and port. Configure a dev proxy so local development also works without brittle CORS exceptions.
- A pure, testable game engine separate from sockets, persistence, and rendering. Inject clock and random sources for tests. Production randomness must use cryptographic uniform random integers.
- One serialized action queue per room, including timer events and connection lifecycle changes that affect gameplay. Never allow asynchronous handlers to interleave competing mutations. One room's game rules have one authority.
- Active room state in memory. Do not require Redis, an external database, microservices, Kubernetes, or a paid realtime vendor.
- Implement a small optional SQLite snapshot adapter behind `PERSISTENCE=sqlite`, storing its file under `DATA_DIR`. Default to `PERSISTENCE=memory` for the simplest deployment. Both modes must share the same game engine. SQLite mode saves each committed gameplay transition and relevant reconnect state before acknowledging success, and supports restoration after process restart. If persistence fails, do not acknowledge an uncommitted action as successful.
- Target a single paid Render web service, one instance, in a region near the players. The service must bind to `0.0.0.0` and Render's `PORT`. Provide a Render blueprint and exact dashboard instructions. Do not use a static-only host or ephemeral request-only function as the game authority.
- Use browser-local CSS transforms/Web Animations API or one lightweight animation library. Network semantic card events, not frames.
- No AI API, account system for each player, chat, voice, public matchmaking, spectators, analytics SDK, payment system, or game history between completed games is required.

## 3. Rules precedence and confirmed decisions

The following differences from the PDF are intentional:

1. Support 2–6 players. Reject a seventh new player; retain reconnects at capacity.
2. Four rounds per game. Round 1 starts with a randomly selected player. Each later round starts with the previous round's last-place player. Rotation is clockwise in stable lobby seating order.
3. A player reaching zero grid cards immediately ends the CURRENT ROUND, not the entire four-round game. This was explicitly clarified by the user. Do not give them an automatic first-place finish: negative hand sums can beat zero.
4. `0` and `13` match each other in either direction. They keep their own numerical scoring values.
5. A card drawn from the discard pile MUST replace a grid card. The user explicitly confirmed this correction to their original wording.
6. An Archduke caller whose hand sum is higher than another player's at round end receives one extra draw-pile card before placements are assigned. The user explicitly confirmed this penalty. Determine whether it applies from the sums BEFORE adding the penalty. Tying for the minimum sum incurs no incorrect-call penalty. Apply it exactly once, then score all hands including the added card. It can have any deck value, including a negative value, and does not trigger an action.
7. The caller may keep matching after calling Archduke and remains immune to ALL special-card effects, including attempts involving their cards. They are still subject to ordinary matching penalties and the incorrect-call penalty.
8. Before the next player can draw, enforce at least a one-second server-controlled opportunity to match and call Archduke after the preceding discard/effects become visually complete. The PDF's immediate pile-touch shortcut does not bypass this delay.
9. Each distinct incorrectly or too-late attempted card incurs one unknown draw-pile penalty card. Technical retries are deduplicated by action ID; duplicate slot references and stale/unauthorized/malformed commands incur no penalties.

Explicit implementation defaults for details the user has not separately settled:

- A matching window opens at a normal turn discard or initial discard. Successful matches retain the window. Each distinct wrong/late card incurs its own penalty, including new intentional attempts of previously failed cards.
- A player may call Archduke after either kind of completed legal turn: replacing a grid card OR immediately discarding a card drawn from the draw pile. They cannot call just because they matched outside their own turn.
- Special actions are optional: an actor can explicitly Skip. If there is no legal target, auto-skip with a public explanation. A swap targets occupied slots in TWO DIFFERENT players' grids, consistent with the user's wording.
- After the final scheduled turn and its effects/movement, run a server-authoritative three-second final matching countdown and finish automatically. New required effects suspend/restart the countdown; ordinary matches and invalid attempts do not extend it. No Finish button.
- Incorrect on-time matching visibly reveals the attempted card(s), then returns them to their original slots face down. A too-late attempt leaves the attempted card(s) face down and in place; it does not grant an extra peek.
- Use the PDF's round tie-breakers and shared final-game victory as specified below.
- Do not impose an ordinary per-turn countdown; the user supplied a between-turn delay, not a turn time limit.

Put these defaults in a concise section of RULES.md and the in-app rules. Do not add unrequested variants, token-knock penalties, extra rounds, bots as player replacements, or an Archduke-caller scoring bonus.

## 4. Deck, dealing, privacy, and positions

There are exactly 104 physical cards:

| Value | Copies |
| --- | --- |
| -3 | 2 |
| 0 | 4 |
| Each value 1–10 | 8 each |
| 11 | 6 |
| 12 | 8 |
| 13 | 4 |

- Give physical cards unique server-only identities. Shuffle the entire deck independently at the beginning of each round using Fisher–Yates with an unbiased cryptographic integer source, e.g. Node `crypto.randomInt`. Do not use random-comparator sorting.
- Deal four cards face down to each player in a 2×2 grid. Keep all remaining cards in the central draw pile.
- After dealing each round, automatically flip each player’s own bottom two cards, hold them fully face up for three seconds, then close them before the initial discard. Server deadlines and pause policy apply; reconnect never restarts the sequence. Other recipients never receive private faces. No initial-peek controls or countdown.
- The server keeps all hidden values, deck order, drawn cards, and permissions. A client's initial/reconnect snapshot must not include their whole hand's values, opponents' values, or future draws. Never send hidden values and merely hide them with CSS.
- Previously seen cards return to ordinary card backs. Do not create a persistent known-card overlay, hover reveal, public peek history, automatic memory notes, or a live hand-sum display before scoring. Forgetting is part of the game. Purge expired private face data from normal client state and logs as practical, while recognizing a recipient can manually record information they were legitimately shown.
- A legitimate private peek or drawn-card face goes only to the authorized player connection/session. Reconnect restores a still-active private interaction without granting new knowledge after its permitted visibility has ended.
- Use stable public slot references and occupancy revisions. Do not expose value-encoded IDs or preserve publicly trackable card identities across a hidden reshuffle. Reassign opaque references as needed at hidden-zone transitions.
- Matching removes the card and slides only cards to its right in that row leftward, preserving relative order and stable target identities. Add penalty/Give cards to the shorter row, top on ties, reevaluating each addition. Replacements occupy exactly the chosen occupied slot. Swaps exchange occupants of exactly two selected slots.
- Add penalty/given cards to visible, stable new positions to the right, adding columns to the two-row layout. Do not silently refill a matched hole or move other cards. Support zero to more than four cards, limited only by the physical deck, not an arbitrary UI cap.
- Show every player's face-down grid on the table throughout play. A player's grid orientation and slot ordering remain consistent even when their seat is displayed from another viewer's perspective. Animate to the correct slot using canonical slot coordinates.

## 5. Round start and ordinary turns

- Once all initial peeks are complete, the server flips the draw pile's top card face up to form the discard pile. It is not played from anyone's grid, so it triggers no special action.
- Allow matching against this initial discard, including its special actions from successful grid matches. Apply the same minimum pre-draw delay and effect queue. No one can call Archduke before completing their own first turn.
- The eligible next player's turn starts only when the server ACCEPTS their draw request from either pile. Merely becoming the highlighted next player does not close matching. An early or illegal draw request does not close the matching window and is not queued to auto-execute later.
- Drawing from the draw pile privately reveals the card to that player. They may immediately discard it face up or replace any occupied slot in their own grid with it face down. The displaced grid card is revealed onto the discard pile. They do not peek at the displaced card before deciding.
- Drawing from the discard pile requires replacing an occupied own-grid slot. They cannot put that drawn discard straight back. The displaced card becomes the new discard.
- A directly discarded drawn card, even if its value is 1, 11, or 12, triggers no action. A discarded grid card can trigger an action. The source zone, not just the numerical value, determines eligibility.
- Only one drawn card may be pending for a turn. Double-clicks/retries cannot draw twice. While holding a drawn card, the normal own-grid click means replace; the UI must not silently interpret that same request as a match.
- After an ordinary discard, the turn is completed for rotation accounting, but the room remains in the inter-turn resolution/matching period until effects resolve and a legal next draw is accepted.

## 6. Matching, penalties, and races

Matching is real-time competitive input. Correctness at the boundary between a match and a draw is central to this product.

- Match equivalence is numerical equality, plus the single equivalence class `{0, 13}`. No other symbol matching exists.
- Any player can match their own occupied grid cards onto the visible discard during the open matching window, including the player who just discarded and the Archduke caller. No one matches a card out of another player's grid.
- A successful match removes that card from its slot and places it face up on the discard pile. Do not replace it. Multiple people can match, and a player can match multiple cards. Each physical matched special card earns one effect if the round has not ended.
- Support immediate single-card clicks for speed and an explicit multi-card selection/submit option for accessibility. A multi-card command has one action ID and ordered distinct slot selections. Reject malformed or duplicate slot selections without creating gameplay penalties. Valid cards in a mixed batch may match; invalid ones remain. Charge one penalty per distinct wrong card.
- For rapid independent clicks, do not debounce away or batch-delay valid matches. Apply per-card penalties server-side.
- Validate all requested slots against their referenced occupant revision. If a slot changed because of an earlier swap/match, reject the stale command without punishing the player or revealing the replacement occupant. Do not use a single strict global-state-version equality check that rejects every competing match after the first update.
- For an on-time wrong value, retain the attempted card(s), visibly show the error, and add one unknown draw-pile penalty card per distinct incorrect card. Incorrect matching cannot activate a special action or replace the discard top.
- If a match against the just-closed window reaches the authoritative action order AFTER the next valid draw but BEFORE that turn's new discard opens another window, it is a late match: retain its card(s) and apply the same per-card penalty rule. A claimed client timestamp cannot reverse this result.
- Messages from older rounds/windows, duplicated action IDs, malformed commands, paused-room clicks, and attempts referring to changed slots are rejected/resynchronized, not treated as fresh matching penalties. Offline clients must not buffer speculative gameplay actions for replay when they reconnect. An action actually sent but with an unknown acknowledgement is resolved through its ID/status.
- Match and draw commands share one room queue. If a match commits first, it succeeds or fails by the current value; if the draw commits first, the match is late. Two actors can never both take the same physical card.
- Do not trigger private unknown penalty/give-card faces in animations, aria labels, HTML attributes, errors, or network payloads.
- Immediately after EACH successful removal, check the zero-card terminal condition. If any player reaches zero, stop accepting gameplay and end the round. Do not execute the rest of a batch, pending special effects, or queued future turn actions after that terminal transition. An action card matched as the player's last card therefore ends the round before its new effect executes. This implements 'immediately.' Return clear partial-batch results when relevant.

## 7. Special actions and queue

Special actions activate only when the card leaves a grid through replacement or successful matching:

| Card | Effect |
| --- | --- |
| 1 — Give | Draw the top unknown card and add it face down to any OTHER eligible player's grid. Neither giver nor receiver sees it. |
| 11 — Swap | Exchange two occupied slots from two different eligible players' grids, without revealing either face. The actor may be one of those players. |
| 12 — Peek | Privately view one occupied eligible slot in any player's grid, including the actor's own. |

- The actor is the player whose grid supplied the discarded/matched card, not whoever happens to own the next turn.
- FIFO effect order follows authoritative discard/match order, and submitted order within a multi-card batch. An original special discard's effect precedes effects from subsequent matches.
- Matching remains available during special-action resolution. Newly matched special cards append effects to the queue. Only the head effect's actor can submit its target/Skip. Validate actor, effect ID, target occupancy revisions, and immunity again at execution time.
- No normal next draw is accepted while an effect or mandatory movement/private-view phase remains unresolved. No Archduke call is accepted while any such effect is unresolved.
- Effects do not draw-and-discard into the central pile and do not recursively trigger card-value actions. A given card's number is irrelevant until later legally revealed/played.
- The Archduke caller is never a legal Give recipient, neither of their slots may participate in Swap, and none of their cards may be Peek targets. Enforce this on the server even if a stale UI offers the target.
- Peek has a brief private reveal with a configurable default of 3 seconds and an early second-click close action. Its server-controlled ending permits the queue to advance. Other viewers see which slot was inspected but not its face. Keep the card in its original position afterward.
- Target selection has an explicit Skip, but do not add an arbitrary ordinary-turn time limit. Disconnect handling below prevents an abandoned interaction from silently mutating the game.

## 8. Timing, animations, and turn eligibility

Model logical eligibility separately from animation rendering. Prefer explicit phases such as LOBBY, INITIAL_PEEK, AWAITING_DRAW, HOLDING_DRAWN_CARD, INTER_TURN, FINAL_MATCH_WINDOW, ROUND_RESULTS, GAME_RESULTS, plus PAUSED. An effect queue and presentation timestamps may coexist with an open match window. Document legal commands in each state.

- Every accepted gameplay event carries a monotonically increasing sequence, room/game/round IDs, server time, and necessary public movement endpoints. Private payloads are separately projected per recipient.
- Use an injected monotonic server clock for live deadlines. Estimate server time offset and RTT on clients; countdowns use authoritative timestamps, not independent `setInterval` countdown state. Refresh the estimate periodically and after reconnect/foregrounding.
- Default `MATCH_DELAY_MS=1000`. The next draw unlocks no earlier than one second after the normal discard's reveal/movement finishes, and no earlier than one second after the latest mandatory queued effect/animation finishes. Pending effects always block draws. A normal match does not create a new logical matching window , although its movement/effect completion can extend the unlock time.
- Once that minimum expires, matching remains open until the next accepted draw; it is not a fixed one-second-only matching window.
- Calling Archduke is allowed as soon as the previous turn owner's discard and all pending actions/required animations are complete, and before the next accepted draw. It need not wait until the next player's draw unlocks. Competing calls/draws are decided by the same server order.
- Preload artwork before readying a player. Use brief, readable draw, private flip, discard, replacement, match, penalty/give, swap, peek, shuffle/recycle, and round-reveal animations. Give/swap movements must make exact destination slots trackable by all viewers.
- The server publishes scheduled presentation times/durations. Browsers render the current animation progress against estimated server time; late clients catch up rather than replaying a long queue and falling behind. Use a small configurable presentation lead only if useful; do not hide network delay with false claims of simultaneity.
- No client animation-complete message determines turn authority. Reduced-motion users have the same logical timing, with simpler highlights/transitions. Server broadcasts happen promptly; do not wait for all ten browsers to acknowledge every animation.
- Browser background throttling cannot end a turn, restart a timer, or award a win. Returning clients receive the current authoritative snapshot and presentation phase.
- Show a compact connection/latency indicator and pending-action feedback. No optimistic irreversible card result or identity should appear before server acceptance.
- Measure server processing and fan-out time separately from end-to-end network delay. At ten local clients, aim for p95 server queue/processing/broadcast under 25 ms for ordinary actions on a reasonable development machine, excluding intentional presentation waits. Report measured results and hardware/environment limits, not a guaranteed internet latency.

## 9. Archduke, round ending, scores, and recycling

### Calling and final turns

- Only the player who just completed the normal turn can call, only after all queued effects resolve, only before the next accepted draw, and only if no one has already called this round.
- After a valid call, record that caller and an explicit ordered list of every other player, starting with the next clockwise player. Each gets exactly ONE additional normal turn. Matching and effects do not consume these turns or add extra turns.
- The caller's immunity begins atomically when the call is accepted. Their own out-of-turn matches remain legal. No caller bonus or immunity to matching penalties is implied.
- After the final scheduled turn, resolve its effects and permit the final matching window described above. The server automatically closes after three seconds, once required effects resolve; ordinary matches and invalid attempts never extend the final deadline. A successful match to zero still ends the round immediately.
- Any player reaching zero at any earlier point also ends the round immediately, whether or not Archduke has been called. The triggering player need not be the caller or turn owner.

### Scoring

1. Freeze gameplay and cancel obsolete queued actions/timers. Move into one idempotent round-ending transition.
2. Evaluate the incorrect-call penalty once, if someone called, using all current sums before that penalty. If their sum is greater than the minimum, add one card from the draw supply before ranking. Reveal it as part of scoring. Never trigger its special action.
3. Reveal all remaining grid cards and calculate actual numerical sums. An empty grid sums to zero; -3 cards can produce lower scores.
4. Rank by lowest sum. For equal sums, fewer cards wins. If still equal, compare the lowest single card in each tied hand. If still tied, draw tie-break cards as the PDF directs, lowest wins; repeat among any still-tied players. Tie-break cards are not added to hands, never affect sums, and activate no effects. Show how the tie was resolved. Manage these cards in a temporary scoring zone so the 104-card conservation invariant still holds.
5. Use available central cards for tie-break draws, recycling as appropriate. Return temporary tie-break cards between tie-break passes. If an extreme exhausted state cannot supply enough tie-break cards, use a server-randomized tie order and label this narrowly scoped digital fallback; do not manufacture gameplay cards.
6. Award unique ordinal placements 1 through player count and retain each player's placement for that round. Reveal scores can remain for the current results view; don't retain old hands as a gameplay memory aid in later rounds.
7. Show a readable labeled leaderboard with Next. Automatically show `[player name] got dead last!` once in a contrasting noninteractive banner for approximately 2–3 seconds. It never advances play or blocks Next.
8. After results, host starts the next round when players are ready. Reshuffle all 104 cards, reset all round-only state and penalties/immunity, deal, and repeat peeking. Previous last place starts. After round 4, sum each player's FOUR PLACEMENTS; lowest total wins. Do not total numerical hand sums across rounds. A tie in placement totals is a shared game victory, per the PDF.
9. Allow a fresh four-round game with the same lobby. Clear the previous game's results and deal state. Do not create public history or persistent profiles.

### Empty draw pile

- Whenever a normal draw, Give, or penalty needs a card and the draw pile is empty, leave the discard pile's top card in place and shuffle every other discard into a new face-down draw pile. Never shuffle live grids or a held drawn card into that supply. Animate the recycle without exposing the new order.
- Draw requests from an empty discard pile are unavailable; a currently held discard card is not also present in the pile.
- Extremely rarely, all usable cards can be in grids/a held draw and the discard has no recyclable cards. Do not clone cards, silently drop owed penalties, or loop forever. Disable optional unavailable draws/Gives. If a mandatory penalty cannot be supplied, pause with a clear `No cards available` reason and let the host explicitly abort/redeal the current round without awarding placements; preserve earlier completed rounds. This is a disclosed digital fallback, not the normal exhaustion rule. Resume normal play if an otherwise legal completed turn replenishes supply before such a mandatory blockage.

## 10. Rooms, identity, privacy, reconnection

- Home (updated by September 14 entry-flow instructions): enter a name, then Start game immediately creates a room with server-issued host privileges. Join game reveals an invite-link/code input. Invite links open the room with a branded name-only entry screen; existing authenticated seats reconnect directly. No shared credential is required.
- Generate a high-entropy invitation token/link and a reasonably readable random room code. Rate-limit code lookups/join attempts. No public list of rooms. Links/codes expire with the room; enforce max 6 players server-side. A link grants invited access, not host authority.
- The page itself can be internet-reachable while rooms are private. Implement actual server-side invitation/session checks; do not confuse an unlisted URL with enforced room access. All gameplay snapshots, sockets, and private assets that are gated must obey the intended access model.
- Give every seated player a separate unguessable reconnect credential, scoped to room/game session as appropriate. A display name or socket ID is not authentication. Credentials should persist through refresh in a secure same-origin mechanism; do not put them in share links or logs. Explain how to test independent seats with isolated browser contexts.
- Only one controlling connection per seat. A second tab authenticated to that seat either takes over cleanly or is read-only with a clear message; it must not create another player or duplicate a turn. Credential replay from an unauthorized room fails.
- Lobby has names, readiness, stable seats, one-click Invite, host start, and a 2–6 player count. Lock new admissions during an active game. Existing players may reconnect. No host removal of a player mid-round that silently changes turn order/rankings.
- On refresh or brief reconnect, recover the same seat and send a fresh recipient-filtered snapshot, current sequence, deadlines, pending interaction, and acknowledged-action status. Never blindly replay stale private peeks or old client actions.
- When a seated player is confirmed disconnected, pause the active round and freeze remaining logical durations. Default grace is 60 seconds; expiry does not automatically play their turn. Avoid inventing strategic automatic moves or showing persistent disconnection controls.
- Resume automatically once all required players are connected; publish new consistent timestamps and use a short server-enforced restart delay before accepting competitive inputs. A slow connected client alone should not continuously stall the game with acknowledgement barriers.
- If the host disconnects, transfer lobby/pause administrative control to the next connected player in stable seating order; this does not change the turn order or create a second gameplay authority. An absent Archduke caller still follows the pause/abort policy for closing the final window.
- Enforce idle-room cleanup; default abandoned-room TTL 2 hours and finished-room TTL 30 minutes. Document these. Delete active snapshots and reconnect credentials when the room expires. Logging should contain operational metadata, not hidden hands or credentials.
- Snapshot mode: persist engine state, pending effects, pause state, draw state, timing information sufficient for recovery, credential verifier/session mapping, game/round IDs, and processed action IDs needed to resolve acknowledgement-loss retries. On process restart restore active games PAUSED, mark connections disconnected, and resume automatically after every seat rejoins; never let downtime consume a matching window or automatically close a round. Replace old monotonic deadlines with newly derived ones on resume.
- Memory mode: explicitly show/document that a server restart or deploy resets active games. Reconnect to a lost room must show `This game is no longer available`, not an infinite loading screen. Do not pretend memory mode survives process replacement.

## 11. Protocol and invariants

Use runtime-validated discriminated commands. Suggested commands include create/join/ready, draw(source), resolveDraw(discard|replace), match(slots), resolveEffect(targets|skip), callArchduke, nextRound, pause/resume, and returnToLobby. Adapt names, not semantics.

- Every mutation has an action ID and scoped game/round/turn/window/effect references as appropriate. Actor identity comes from the authenticated connection. Never trust a submitted player ID, card value, claimed deadline, hand sum, or placement.
- Use recipient projections for both snapshots AND events. A sanitized snapshot is insufficient if a movement event, reconnect replay, debug route, error, DOM attribute, or accessibility string leaks secrets.
- Reliable delivery requires acknowledgements, deduplication, and current-state resynchronization. Socket.IO alone does not provide application-level exactly-once effects. Deduplication survives reconnect and, in snapshot mode, restart.
- Error responses distinguish illegal actions, stale state, not-yet-eligible draws, and actual rule penalties. Rate-limit abusive messages without dropping legitimate rapid matching.
- Invariants: exactly 104 unique physical cards across all current zones; no duplicate ownership; at most one held drawn card; stable seat/slot identities; only the correct next player draws; one FIFO effect head; no hidden-value leakage; one round result; one incorrect-call penalty; one failed-match penalty per distinct card attempt; exactly one final normal turn for each non-caller unless zero-card termination occurs first; immutable completed-round placements.
- Public state versions advance consistently. Clients missing versions recover a current snapshot. Do not replay obsolete animations at full speed when a newer state is already authoritative.
- Include payload-size limits, display-name length limits/escaping, server-side access checks, allowed origins, secure production cookies where used, TLS-compatible WebSockets, heartbeat/reconnect, and no production debug/test endpoints. Keep this proportionate to a private friends' game.

## 12. UI quality and usability

The current user-approved interface and interaction requirements are in [TABLE_INTERFACE.md](TABLE_INTERFACE.md). They supersede the earlier table styling and selection/reveal-button workflows. Preserve the title/graphic/Name entry flow with the main blue-gray background. Use an ordered opponent strip, a larger hand → pending → draw → discard lower area, larger equal-sized 5:7 central cards and a reserved modest expansion for overlapping own hands. Use the supplied crown gold for separate turn/caller indicators and one cosmetic call burst; no screen border. Retain direct card actions, six seats and server-authoritative eligibility.

## 13. Verification: prove the game works

Write meaningful tests for rule correctness and multiplayer boundaries. Use Vitest or equivalent for the engine/integration layer and Playwright for actual browser interaction. Use fake clocks and deterministic decks only through dependency injection/test-only fixtures unavailable in production. Do not weaken game rules or expose production cheat endpoints to make tests pass.

Required coverage:

1. Exact deck multiset, 104-card conservation, Fisher–Yates bounds, four-card dealing for 2 and 6 players, and independent round reset.
2. Initial two-card private peek, no third card, no repeated peek after ready/reconnect, initial discard matching with no effect from the initial card itself.
3. Draw-pile discard/replace, forced discard-pile replacement, hidden outgoing card revealed only on commitment, only one pending draw.
4. Correct/wrong/late matching, self-match, multiple players matching, multi-card mixed batches, rapid individual failures each receiving a penalty, duplicates not reapplying penalties, new intentional attempts incurring new penalties, 0↔13 both directions, stale slot revisions not penalized.
5. Both server arrival orders for match-vs-draw and call-vs-draw; delay boundaries immediately before/at/after unlock; early clicks do not auto-execute; competing valid matches are not rejected solely for global version drift.
6. 1/11/12 triggered only from grids; direct discard does not trigger; one effect per matched special; FIFO chains; matching during queued effects; target moves while selecting; optional skips; no legal targets; immunity for all three actions.
7. Calling only after one's own resolved turn; caller can match and receive matching penalties; all other players get one final normal turn; final match window and authorized close.
8. Immediate zero-card termination during a single match, batch, or special chain, with pending effects canceled; zero can lose to a negative sum; incorrect caller gets exactly one card even when someone else ends with zero; tied minimum is not penalized; negative penalty cards are scored correctly.
9. Round sum → fewest cards → lowest single card → random tie-break hierarchy; tie-break cards don't change sums; last-place popup; next starter; four rounds; placement-total scoring and shared final victory.
10. Empty draw-pile recycle preserving discard top; Give/penalty recycle; no recycling hands/held draws; explicit depleted-state fallback; large grids, balanced additions and stable identities through row compaction.
11. Server-to-client privacy assertions for every command/event/snapshot/reconnect path. Another player's hidden face must not appear in payloads, normal DOM, logs, aria attributes, or error strings. Ordinary snapshots must not expose the owner's entire hidden hand either.
12. Two rooms isolated; invalid invite; seat limit; forged actor/effect/slot; duplicate connection; reconnect restores seat; missed acknowledgement resolved once; outdated/offline commands cannot change a later round; confirmed disconnect freezes timing consistently.
13. Memory-mode restart shows room loss honestly. SQLite-mode process restart restores the same paused room, cards, queued effects, and action deduplication; authenticated clients reconnect and resume without duplicate draws or skipped turns.
14. A browser scenario using separate authenticated contexts completes all FOUR rounds through UI controls with actual websockets, shows round/final scoring, and can start another game. At least one browser scenario exercises each special-card interaction, matching, and reconnect.
15. Six concurrent socket clients plus 2–6-player browser screenshots; responsive mobile screenshots; animation endpoints/stable grid positions; no clipping or browser console errors. Exercise the production build, not only the dev server.
16. Simulated latency/jitter/disconnect tests establish convergence and deterministic arrival-order outcomes. Distinguish intentionally late match penalties from stale-state rejections. Record observed timings without claiming a local test proves worldwide fairness.

Inspect screenshots yourself with available browser/image tools, then fix actual visual issues. Do not claim manual two-device or hosted playtesting that was not performed. If an environment blocks a test, record the precise command and blocker, complete alternatives, and clearly distinguish implemented from verified.

## 14. Project deliverables and commands

Provide:

- Complete frontend, server, shared runtime schemas, pure engine, tests, and artwork manifest/import validation.
- `package.json` scripts: `npm run dev`, `npm run build`, `npm start`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`, and `npm run verify` (the documented automated gate). `npm run dev` should give a usable local URL with one command.
- `.env.example` with documented `PUBLIC_ORIGIN`, `PERSISTENCE=memory`, `DATA_DIR`, `MATCH_DELAY_MS=1000`, and any other genuinely needed variables. Production startup should reject invalid configuration with a useful error. Never require a credential to be committed. Match-delay overrides cannot accidentally become zero in production through bad parsing.
- Production `PORT` handling, `/healthz` without secret/game-state output, SPA deep-link handling for invites, correct asset paths on case-sensitive Linux, graceful shutdown, and appropriately bounded operational logs.
- README.md with install/local run, two-browser testing, host-secret setup, npm commands, and troubleshooting.
- RULES.md with the confirmed rules, exact timing/matching grouping, defaults, and explicit differences from the PDF.
- DEPLOYMENT.md with Render + private GitHub instructions, a checked Render blueprint (`render.yaml`), selected runtime, build `npm ci && npm run build`, start `npm start`, one instance, health path, environment variables, account steps, and rollback/restart behavior.
- Default deployment uses memory and no disk. Explain the OPTIONAL snapshot upgrade: `PERSISTENCE=sqlite`, persistent disk mounted at `/var/data`, `DATA_DIR=/var/data`. The SQLite adapter must actually work if selected. Render disks are runtime-only; do not require access to `/var/data` during build. Document the brief downtime on disk-backed redeploys and paused-game restoration.
- A small CI workflow running applicable checks. No fabricated CI badges or successful hosted runs.
- IMPLEMENTATION_STATUS.md with requirement-to-test mapping, real verification results, visual review evidence, supported player count, remaining blockers, local URL if still running, and exact deployment instructions personalized to this repository.
- `.gitignore` covering secrets, databases, local snapshots, dependency folders, generated build/test output, and local artifacts. Include required distributable card images in the private project. Keep the reference PDF out of public static assets.

Do not buy a domain. Render supplies an HTTPS `onrender.com` address suitable for invite links. A custom domain is optional. Do not configure localhost as the production invitation origin or deploy the Vite dev server as the app server.

## 15. Execution sequence and definition of done

Proceed through these phases without waiting for approval after every phase:

1. Inspect inputs and runtime; validate card files and rules; establish a small plan and repository layout.
2. Implement the engine, state transitions, private projections, test fixtures, and important rule/race tests.
3. Implement room transport, sessions, reconnect/pause, optional snapshot persistence, and real multi-client tests.
4. Implement the complete UI with supplied artwork, timed animations, targeting, scoring, and invite flow.
5. Run full games in isolated browser contexts; inspect desktop/mobile screenshots; fix state/privacy/visual issues; test ten connections and restart recovery.
6. Validate the production build/start path, write deployment configuration/docs, and make a reviewed local git checkpoint.

The app is locally complete only when a fresh install can start it, 2–6 invited players can share one authoritative room, all specified rules work, a four-round game can finish, animations preserve trackable card locations, reconnect behaves correctly, hidden state is protected, and the required checks pass or a specific external verification blocker is honestly recorded.

The app is hosted/playable over the internet only after an actual deployment and live invite/reconnect smoke test. Do not conflate deploy-ready with deployed. If hosting authorization or credentials are missing, finish every locally achievable item, provide exact remaining account actions, and stop at that real boundary. A Render/GitHub account or domain question must not leave the engine, UI, tests, or deployment files unfinished.

In the final handoff report: what runs; commands and results actually verified; artwork status; local/live URL as applicable; important disclosed defaults; restart behavior in the selected mode; and the minimal remaining actions required of the user. Do not label a scaffold, mock multiplayer UI, partial implementation, or untested deployment as complete.

Begin now by reading the repository and inputs, then implement the entire game.
