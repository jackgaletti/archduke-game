# Archduke house rules

The authoritative source is ARCHDUKE_BUILD_PROMPT.md. The optional PDF is not used to override it.

## The game

2–6 players, stable clockwise seating, four rounds. Deal four hidden cards in a two-row grid. After dealing, the server automatically reveals each player’s own bottom two cards: a 360 ms flip, three full seconds face up, then a 360 ms closing flip. Other players receive no private faces. Refresh never restarts the sequence; room pauses freeze its remaining time. The initial discard follows automatically. First round starts randomly; later rounds start with the previous last-place player.

The 104-card deck: −3 ×2, 0 ×4, each 1–10 ×8, 11 ×6, 12 ×8, 13 ×4. Physical cards are never duplicated. Each round shuffles the whole deck independently.

## Turns and matching

The next player's turn starts when the server accepts a draw. A draw-pile card can replace an occupied own slot or go directly to discard. A discard-pile card MUST replace. The displaced card is revealed only after commitment. Direct discards never trigger effects.

Any player can match their own cards while the window is open, including the last turn owner and Archduke caller. Matching is equality plus 0↔13. Successful cards leave their row; cards to their right slide left in order, without moving the other row. Stable target references and occupancy revisions prevent a stale click from selecting a shifted neighbor. Each penalty/Give card appends to the shorter occupied row, top on ties, reevaluated after every addition. Multi-card submissions process ordered distinct slots, preserving valid matches in a mixed batch.

One matching window starts at each ordinary discard and the initial discard. Successful matches do not start a new one. Each distinct incorrectly or too-late attempted card incurs one unknown draw-pile penalty card. A mixed batch removes correct matches and retains each wrong card with its own penalty. A new intentional attempt with a previously failed card incurs another penalty. Wrong on-time cards briefly reveal and return face down. Late attempts remain face down. A match arriving after the next accepted draw but before a new normal discard is late. Older windows, changed occupant revisions, malformed selections, paused commands, and duplicates are rejected/deduplicated without fresh penalties. Client timestamps do not override server arrival order.

## Special cards

Only a card leaving a grid through replacement or successful matching triggers:

- **1 Give:** add a draw-pile card face down to another eligible player. Neither person sees its face.
- **11 Swap:** exchange occupied slots in two DIFFERENT eligible players' grids, without revelation. Actor may be one of them.
- **12 Peek:** actor privately inspects one eligible slot for three seconds, with an immediate second click to close early.

Effects resolve FIFO, owned by the player whose grid supplied the card. Matching remains open and appends new effects. Only the head actor can target or Skip. No legal target/supply means automatic skip with explanation. Targets and occupancy revisions are checked when submitted.

## Timing and Archduke

Server monotonic time governs movement, peeks, and eligibility. Draws wait at least MATCH_DELAY_MS (default 1000) after the latest mandatory movement/effect finishes. Matching stays open afterward until a draw is accepted. Early draws are rejected immediately, never scheduled. No ordinary turn countdown exists.

After completing either kind of legal ordinary turn and resolving all movement/effects, the turn owner may call Archduke before the next draw. Calling need not wait for the full next-draw delay. Caller immunity starts atomically: no Give recipient, no Swap endpoint, and no Peek target may involve the caller. Caller can still match and receive matching penalties.

Every OTHER player gets exactly one final normal turn in clockwise order. After the last turn’s movement and required effects, matching remains open for a server-issued three-second countdown, then the round ends automatically. Ordinary successful matches and invalid attempts do not extend this final deadline; the protected one-second delay still applies to normal draws. A newly required effect suspends the countdown; resolving it starts a fresh three seconds. Pause/restart freezes the remaining time.

Any player reaching zero cards immediately ends the CURRENT ROUND, including in the middle of a batch/effect chain. Remaining batch cards, queued effects and future gameplay stop. Zero is not an automatic win: negative sums can beat it.

## Scores

Before placements, if the caller's sum exceeds anyone else's, add exactly one draw-pile card to the caller. Determine this from pre-penalty sums; tied minimum gets none. Even a negative penalty counts numerically. No special effect is triggered.

Rank by lower hand sum, then fewer cards, then lower single card, then lower temporary tie-break card. Repeat draws among still-tied players; tie-break cards return between passes and never change sums. Insufficient central supply uses a disclosed random ordering fallback. Placements are unique 1 through player count.

Each browser independently reviews the leaderboard and clicks Next to continue to an empty Ready table. A contrasting “[player name] got dead last!” announcement appears once with the result and exits automatically after 2.9 seconds; it has no button and does not advance play. Round columns are Place, Player, Hand total and Total points; final columns omit Hand total. Continuing never deals cards or grants host privileges. Once all players have continued and readied, only the host can start the next deal. After four rounds, add each player's FOUR PLACEMENTS; lowest total wins, with shared victory for equal totals. A fresh game clears prior results.

## Supply and disconnect defaults

Empty draw supply recycles all discards except the visible top, never grids or a held draw. Optional unavailable draws/Gives are unavailable. A mandatory penalty with no available supply pauses with **No cards available**; host can explicitly redeal this round without placements, retaining prior rounds. The redeal uses the normal starter rule: random in round one, previous round’s last place in later rounds.

Confirmed disconnect pauses an active round and freezes remaining logical durations. The 60-second grace does not make an automatic move or abort. Once all seats reconnect, the server resumes automatically after a two-second countdown. If host disconnects, administrative control moves to the next connected seat. A second tab takes over a seat without making another player.

## Deliberate differences from the PDF

Up to six players; four rounds; zero cards ends only the current round; 0↔13 matching; forced discard-pile replacement; exactly one incorrect-call card; full caller immunity; a protected one-second opportunity; one matching penalty per distinct wrong or late card attempt. Additional defaults: call after either legal turn completion, optional effects, two-player Swap endpoints, automatic three-second final matching countdown, on-time wrong reveals versus hidden late attempts, no turn timeout.

## Engine phase map

| Phase | Legal gameplay |
| --- | --- |
| LOBBY | Ready; host Start with 2–6 connected ready seats |
| INITIAL_PEEK | Direct click to open/close exactly two distinct own cards; automatic completion |
| INTER_TURN | Matching/effects; previous turn owner's Call after resolution; eligible Draw after delay |
| HOLDING_DRAWN_CARD | Owner resolves draw; just-closed-window late matches may receive the shared penalty |
| FINAL_MATCH_WINDOW | Matching/effects; server closes after the three-second countdown, resolved effects |
| ROUND_RESULTS | Individual continuation to empty lobby; other players retain their result review |
| GAME_RESULTS | Ready; host Start new game |
| Paused (overlay) | Host Resume after reconnection, Abort; depleted-supply Redeal |
