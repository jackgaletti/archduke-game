# Deck, randomness, and countdown audit

Audited the current working tree on 2026-09-22. No deck construction, shuffle,
dealing, starter selection, or existing animation implementation was changed.

## Canonical deck and identities

`src/engine/model.ts: deck()` constructs one finite deck:

| Value | Quantity |
| ---: | ---: |
| -3 | 2 |
| 0 | 4 |
| 1–10 | 8 each (80 total) |
| 11 | 6 |
| 12 | 8 |
| 13 | 4 |
| **Total** | **104** |

Each object gets `id: cards.length` as it is appended: exactly IDs 0–103,
each occurring once. IDs are stable throughout that round, including across
swap, Give, penalty, held-card and reshuffle zones. A fresh round deliberately
creates a fresh deck; game generation and round scope those numeric IDs.
Slot revisions protect commands against cards that have moved or been replaced.

## Shuffle algorithm and random source

`shuffle()` in `src/engine/model.ts` is in-place descending Fisher–Yates.
For each index `i` from `length - 1` through 1, it chooses `j = randomInt(i + 1)`
and exchanges those two existing objects. With uniform integer choices in
`[0, i]`, the choices have a one-to-one mapping to the `n!` permutations.
There is no random-comparator sort, duplicate rejection, hand balancing,
independent random card-value generation, or fixed production seed.

The default dependency in `src/server/rooms.ts` is Node's built-in
`node:crypto.randomInt`, which uses cryptographic randomness and avoids modulo
bias. It also drives first-seat selection. Tests explicitly inject deterministic
integer functions; production startup (`src/server/main.ts` → `createApp` →
`Rooms`) supplies no override. No third-party randomness dependency is needed.
The client never imports the engine or selects a shuffle order.

## Deal, draws, conservation, and temporary zones

`startRound()` in `src/engine/engine.ts` shuffles one canonical deck once, then
uses `pop()` for four cards per player in canonical player order. It retains the
same array's undealt prefix as the draw deck; future draws remove its last item.
Dealing to N players consumes exactly 4N cards, followed by one initial discard.
The bottom-row reveal exposes only the authorized viewer's two values.

Normal draws, Give, penalties, incorrect-call penalties, initial discard and
ranking tie-break draws all remove existing objects through `supply()`/`pop()`.
A held card leaves the deck before entering its temporary zone. Replacement,
matching and swapping move existing objects between zones. An existing ranking
tie-break rule temporarily removes cards, then returns and shuffles those same
instances into the remaining deck; it does not duplicate them.

Every serialized room transaction clones the candidate state, applies its
operation, calls `assertCards`, and only then persists and publishes. During a
round that invariant requires 104 total instances and 104 unique IDs across
hands, draw deck, discard, held card, reshuffle pool and ranking-draw zone.
Focused deterministic tests additionally compare the exact ID/value set against
the canonical deck at deal/draw/discard/reshuffle boundaries. Effect selections
and animation payloads reference cards; they are not additional physical cards.

## Discard reshuffling

After the depleted normal draw is resolved and its discard is committed,
`tick()` collects `discard.splice(0, discard.length - 1)`. The protected top stays
in discard. Only that removed pool passes through the same `shuffle(pool,
d.randomInt)` function. It waits in the authoritative reshuffle zone before
becoming the new draw array. Hands, held cards, ranking cards and the protected
top cannot enter that splice. Clients receive timing/count metadata, not the
private order. Existing empty-supply, batch continuation and timing behavior is
unchanged.

## Round starter

Round 1 uses `players[d.randomInt(players.length)]` on the server once at round
initialization. The exclusive integer bound covers every valid seat without
rounding bias. Rounds 2–4 use the last row of the prior authoritative ranking
(the loser). Reconnect and projection do not call this selection again. The
existing explicit supply-exhaustion redeal policy remains unchanged.

## Natural equal-value initial pairs

The two bottom cards are a uniform pair without replacement. The probability
of equal values is:

`sum(combinations(quantity, 2)) / combinations(104, 2)`

`= (1 + 6 + 10×28 + 15 + 28 + 6) / 5356`

`= 336 / 5356 = 84 / 1339 ≈ 6.2733%` (about one pair in 15.94).

This counts equal values, not the separate 0/13 matching equivalence. Duplicate
values are valid. The tests deliberately preserve a deterministic deal with two
13s in the initial revealed row. No anti-duplicate manipulation was added, and
no statistical simulation or flaky probabilistic assertion was used.

## Missing-countdown diagnosis and correction

The localhost process was running `npm start` from before the previous server
change. Rebuilding updated the client files on disk but did not reload the
server's already-imported modules. A two-client socket probe against that actual
process reproduced round 2 dealing within 2 ms of the final Ready response:
`INITIAL_PEEK`, eight deal events, and no `roundStartsAt` deadline.

The source deadline implementation already waited, which is why tests running a
fresh server passed. Restarting the built local server is necessary to activate
it. The lifecycle now additionally makes the state explicit:

`LOBBY (between rounds) → NEXT_ROUND_COUNTDOWN → INITIAL_PEEK`

The final Ready atomically stores the phase and three-second deadline. No round
initialization or RNG calls happen during this phase. Room maintenance rechecks
current phase/readiness/deadline inside its serialized transaction, then calls
the unchanged round initializer once. Repeated Ready cannot reset the deadline.
Exit clears it with the match generation; queued old maintenance cannot start a
future match. Saved pre-phase countdowns migrate without resetting the deadline.

The existing mounted disabled header button derives 3, 2, 1 from that deadline,
holds 1 through the unchanged deal, then restores ARCHDUKE! at deal completion.
The existing disconnect pause/rebase policy preserves remaining time. Round 1
still uses the host Start Game action immediately. No animation code or timing
was changed.

After rebuilding and restarting localhost, the same two-client probe returned
`NEXT_ROUND_COUNTDOWN`, the original round number, and zero deal events immediately
after Ready. It was still waiting after 1.052 seconds and started round 2 after
3.039 seconds (the server maintenance tick is 100 ms).
