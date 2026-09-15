# Archduke house rules

The authoritative source is ARCHDUKE_BUILD_PROMPT.md. The optional PDF is not used to override it.

## The game

2–10 players, stable clockwise seating, four rounds. Deal four hidden cards in a two-row grid. Each player chooses exactly two distinct own slots, privately views them once, explicitly hides them, and readies. Reconnect does not reset this permission. All players finish before the initial discard is flipped. First round starts randomly; later rounds start with the previous last-place player.

The 104-card deck: −3 ×2, 0 ×4, each 1–10 ×8, 11 ×6, 12 ×8, 13 ×4. Physical cards are never duplicated. Each round shuffles the whole deck independently.

## Turns and matching

The next player's turn starts when the server accepts a draw. A draw-pile card can replace an occupied own slot or go directly to discard. A discard-pile card MUST replace. The displaced card is revealed only after commitment. Direct discards never trigger effects.

Any player can match their own cards while the window is open, including the last turn owner and Archduke caller. Matching is equality plus 0↔13. Successful cards leave stable holes. Penalty/Give cards extend the grid to the right; they never fill holes. Multi-card submissions process ordered distinct slots, preserving valid matches in a mixed batch.

One matching window starts at each ordinary discard and the initial discard. Successful matches do not start a new one. At most one unknown penalty card is added per player/window for incorrect or late matching. Wrong on-time cards briefly reveal and return face down. Late attempts remain face down. A match arriving after the next accepted draw but before a new normal discard is late. Older windows, changed occupant revisions, malformed selections, paused commands, and duplicates are rejected/deduplicated without fresh penalties. Client timestamps do not override server arrival order.

## Special cards

Only a card leaving a grid through replacement or successful matching triggers:

- **1 Give:** add a draw-pile card face down to another eligible player. Neither person sees its face.
- **11 Swap:** exchange occupied slots in two DIFFERENT eligible players' grids, without revelation. Actor may be one of them.
- **12 Peek:** actor privately inspects one eligible slot for three seconds, with early Done available.

Effects resolve FIFO, owned by the player whose grid supplied the card. Matching remains open and appends new effects. Only the head actor can target or Skip. No legal target/supply means automatic skip with explanation. Targets and occupancy revisions are checked when submitted.

## Timing and Archduke

Server monotonic time governs movement, peeks, and eligibility. Draws wait at least MATCH_DELAY_MS (default 1000) after the latest mandatory movement/effect finishes. Matching stays open afterward until a draw is accepted. Early draws are rejected immediately, never scheduled. No ordinary turn countdown exists.

After completing either kind of legal ordinary turn and resolving all movement/effects, the turn owner may call Archduke before the next draw. Calling need not wait for the full next-draw delay. Caller immunity starts atomically: no Give recipient, no Swap endpoint, and no Peek target may involve the caller. Caller can still match and receive matching penalties.

Every OTHER player gets exactly one final normal turn in clockwise order. After the last turn and its effects, matching remains open until the caller presses **Finish round**, after the protected delay. Finish never draws.

Any player reaching zero cards immediately ends the CURRENT ROUND, including in the middle of a batch/effect chain. Remaining batch cards, queued effects and future gameplay stop. Zero is not an automatic win: negative sums can beat it.

## Scores

Before placements, if the caller's sum exceeds anyone else's, add exactly one draw-pile card to the caller. Determine this from pre-penalty sums; tied minimum gets none. Even a negative penalty counts numerically. No special effect is triggered.

Rank by lower hand sum, then fewer cards, then lower single card, then lower temporary tie-break card. Repeat draws among still-tied players; tie-break cards return between passes and never change sums. Insufficient central supply uses a disclosed random ordering fallback. Placements are unique 1 through player count.

Each browser independently dismisses “[player name] got dead last!” Results show full placements. All players ready, then host advances. After four rounds, add each player's FOUR PLACEMENTS; lowest total wins, with shared victory for equal totals. A fresh game clears prior results.

## Supply and disconnect defaults

Empty draw supply recycles all discards except the visible top, never grids or a held draw. Optional unavailable draws/Gives are unavailable. A mandatory penalty with no available supply pauses with **No cards available**; host can explicitly redeal this round without placements, retaining prior rounds. The redeal uses the normal starter rule: random in round one, previous round’s last place in later rounds.

Confirmed disconnect pauses an active round and freezes remaining logical durations. The 60-second grace is an indication, not an automatic move or abort. Host can wait or abort to lobby. All seats must reconnect, then host resumes with a two-second countdown. If host disconnects, administrative control moves to the next connected seat. A second tab takes over a seat without making another player.

## Deliberate differences from the PDF

Up to ten players; four rounds; zero cards ends only the current round; 0↔13 matching; forced discard-pile replacement; exactly one incorrect-call card; full caller immunity; a protected one-second opportunity; one matching penalty per player/window. Additional defaults: call after either legal turn completion, optional effects, two-player Swap endpoints, dedicated final Finish button, on-time wrong reveals versus hidden late attempts, no turn timeout.

## Engine phase map

| Phase | Legal gameplay |
| --- | --- |
| LOBBY | Ready; host Start with 2–10 connected ready seats |
| INITIAL_PEEK | One two-slot peek, then Hide & ready |
| INTER_TURN | Matching/effects; previous turn owner's Call after resolution; eligible Draw after delay |
| HOLDING_DRAWN_CARD | Owner resolves draw; just-closed-window late matches may receive the shared penalty |
| FINAL_MATCH_WINDOW | Matching/effects; caller Finish after resolution and delay |
| ROUND_RESULTS | Ready; host Next |
| GAME_RESULTS | Ready; host Start new game |
| Paused (overlay) | Host Resume after reconnection, Abort; depleted-supply Redeal |
