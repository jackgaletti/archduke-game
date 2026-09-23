# Archduke house rules

The current implementation and the rules below include the approved changes to ARCHDUKE_BUILD_PROMPT.md. The optional PDF does not override them.

## The game

2–6 players, stable clockwise seating, four rounds. Deal four hidden cards in a two-row grid. After dealing, the server automatically reveals each player’s own bottom two cards: a 360 ms flip, two full seconds face up, then a 360 ms closing flip. Other players receive no private faces. Refresh never restarts the sequence; room pauses freeze its remaining time. The initial discard follows automatically. First round starts randomly; later rounds start with the previous last-place player.

The 104-card deck: −3 ×2, 0 ×4, each 1–10 ×8, 11 ×6, 12 ×8, 13 ×4. Physical cards are never duplicated. Each round shuffles the whole deck independently.

## Turns and matching

The next player's turn starts when the server accepts a draw. A draw-pile card can replace an occupied own slot or go directly to discard. A discard-pile card MUST replace. The displaced card is revealed only after commitment. Direct discards never trigger effects.

Any player can match their own cards while the window is open, including the last turn owner and Archduke caller. Matching is equality plus 0↔13. Successful cards leave their row; cards to their right slide left in order, without moving the other row. Stable target references and occupancy revisions prevent a stale click from selecting a shifted neighbor. Each penalty/Give card appends to the shorter occupied row, top on ties, reevaluated after every addition. Multi-card submissions process ordered distinct slots, preserving valid matches in a mixed batch.

One matching window starts at each ordinary discard and the initial discard. Successful matches do not start a new one. Each distinct incorrectly or too-late attempted card incurs one unknown draw-pile penalty card. A mixed batch removes correct matches and retains each wrong card with its own penalty. A new intentional attempt with a previously failed card incurs another penalty. Both incorrect and late attempted cards reveal their actual value, shake, and return face down before their unknown penalty card flies into the hand. The server reserves the penalty immediately; this independent presentation never delays other gameplay. A match arriving after the next accepted draw but before a new normal discard is late. Older windows, changed occupant revisions, malformed selections, paused commands, and duplicates are rejected/deduplicated without fresh penalties. Client timestamps do not override server arrival order.

## Special cards

Only a card leaving a grid through replacement or successful matching triggers:

- **1 Give:** add a draw-pile card face down to another eligible player. Neither person sees its face.
- **11 Swap:** exchange occupied slots in two DIFFERENT eligible players' grids, without revelation. Actor may be one of them.
- **12 Peek:** actor privately inspects one eligible slot for three seconds, with an immediate second click to close early.

The server keeps per-player, per-round memory only for 11 and 12 cards that player has actually seen in their own hand: the automatic opening Peek, a card picked up from either pile, a private Peek of an own card, or an invalid-match reveal. Cards are removed from that memory when they leave or are swapped out, and all memory clears between rounds.

That memory disambiguates own-card clicks during Peek and Swap. Clicking a previously seen own card that matches the discard performs a match, keeps the current effect pending, and queues the newly matched effect. Clicking an unseen own card uses it as the Peek target or first Swap endpoint, even when its hidden value also matches. If a Swap starts with another player's card, the following own-card click completes the Swap regardless of memory. Opponent Peeks flip the selected card in place at its normal hand size.

Effects resolve FIFO, owned by the player whose grid supplied the card. Matching remains open and appends new effects. Only the head actor can target or Skip. No legal target/supply means automatic skip with explanation. Targets and occupancy revisions are checked when submitted.

## Timing and Archduke

An ordinary committed discard immediately opens the next draw and matching opportunity. There is no matching grace timer, animation gate, or match debounce before drawing. The room serializes commands in server receive/processing order: a match processed first resolves atomically; an accepted draw closes that exact window before taking its card. Later matches against that closed window incur one penalty per distinct card. Obsolete windows never match against a newer discard. Action IDs deduplicate retries, and monotonically increasing room sequence numbers order published state. Required specialty actions, reshuffles, and disconnect pauses still block draws. The legacy MATCH_DELAY_MS configuration is accepted for compatibility but no longer delays drawing.

After completing either kind of legal ordinary turn and resolving all movement/effects, the turn owner may call Archduke before the next draw. Caller immunity starts atomically: no Give recipient, no Swap endpoint, and no Peek target may involve the caller. Caller can still match and receive matching penalties.

Every OTHER player gets exactly one final normal turn in clockwise order. After the last turn’s movement and required effects, matching remains open for a server-issued three-second countdown, then the round ends automatically. Ordinary successful matches and invalid attempts do not extend this final deadline. A newly required effect suspends the countdown; resolving it starts a fresh three seconds. Pause/restart freezes the remaining time.

Any player reaching zero cards immediately ends the CURRENT ROUND, including in the middle of a batch/effect chain. Remaining batch cards, queued effects and future gameplay stop. Zero is not an automatic win: negative sums can beat it.

## Scores

Before placements, if the caller's sum exceeds anyone else's, add exactly one draw-pile card to the caller. Determine this from pre-penalty sums; tied minimum gets none. Even a negative penalty counts numerically. No special effect is triggered.

Rank by lower hand sum, then fewer cards, then lower single card, then lower temporary tie-break card. Repeat draws among still-tied players; tie-break cards return between passes and never change sums. Insufficient central supply uses a disclosed random ordering fallback. Placements are unique 1 through player count.

Each browser independently reviews the revealed round hands, then clicks Next to see the podium. In rounds one through three, Next on the podium returns that player to the existing empty Ready table; after all active players have continued and readied, one server-issued three-second countdown runs in the existing disabled Archduke button, then the next round deals exactly once. Disconnects freeze its remaining time; reconnects resume that deadline, and Exit clears it. Round one still begins with host Start Game without this countdown. After four rounds, add each player's FOUR PLACEMENTS; lowest total wins, with shared victory for equal totals. New Game on the final podium returns the entire room to its dedicated lobby, clearing match data and readiness. All connected participants must ready, then the host explicitly starts a new four-round match. Room identity, invite and reconnect credentials persist. Host Exit abandons the match for everyone and performs the same lobby reset; old match commands cannot affect the next game. Late arrivals remain waiting until that reset and are never added to an ongoing match.

## Supply and disconnect defaults

Removing the final normal draw card sets an authoritative pending-refill flag and leaves the draw pile empty for the player's entire decision. Resolving that draw commits either the drawn card or the displaced hand card to discard. Only then is a synchronized reshuffle scheduled, after that existing discard movement settles. The newly discarded top stays stationary and becomes the sole protected discard; every card beneath it enters the existing server-side Fisher–Yates shuffle. Hands, held cards and temporary tie-break cards never enter the pool. A separate card-back sequence takes about 2–3 seconds; conflicting commands wait until its server deadline. The accepted resolution advances the turn exactly once; reshuffling never advances it. Matching-window identity is preserved and protected eligibility deadlines pause during the barrier. Mandatory Give, penalty and tie-break draws reuse the helper; batches resume in order without repeating completed draws. Late penalties owed while a final draw is held wait for its resolution before refill. Action IDs remain deduplicated across reconnects; a saved reshuffle retains its identity, private card order and remaining duration. With no buried discards, the deck stays empty. Unavailable optional draws/Gives remain unavailable; a mandatory penalty with genuinely exhausted supply uses the existing No cards available pause and host redeal without new placements. The redeal uses the normal starter rule.

Confirmed disconnect pauses an active round and freezes remaining logical durations. The 60-second grace does not make an automatic move or abort. Once all seats reconnect, the server resumes automatically after a two-second countdown. If host disconnects, administrative control moves to the next connected seat. A second tab takes over a seat without making another player.

## Deliberate differences from the PDF

Up to six players; four rounds; zero cards ends only the current round; 0↔13 matching; forced discard-pile replacement; exactly one incorrect-call card; full caller immunity; an immediate server-ordered draw-versus-match race; one matching penalty per distinct wrong or late card attempt. Additional defaults: call after either legal turn completion, optional effects, two-player Swap endpoints, automatic three-second final matching countdown, the same public failed-attempt reveal for wrong and late matches, no turn timeout.

## Engine phase map

| Phase | Legal gameplay |
| --- | --- |
| LOBBY | Room lobby: own Ready, host Start with 2–6 eligible connected ready participants. Between rounds: active-roster ready table |
| NEXT_ROUND_COUNTDOWN | All ready; broadcast server deadline; no new hands before expiry; deal exactly once after three seconds |
| INITIAL_PEEK | Existing timed automatic private bottom-two reveal and completion |
| INTER_TURN | Matching/effects; previous turn owner's Call after resolution; eligible Draw immediately, independent of presentation timing |
| HOLDING_DRAWN_CARD | Owner resolves draw; just-closed-window late matches receive one penalty per distinct attempted card |
| FINAL_MATCH_WINDOW | Matching/effects; server closes after the three-second countdown, resolved effects |
| ROUND_RESULTS | Individual continuation to empty lobby; other players retain their result review |
| GAME_RESULTS | Final podium; New Game resets the whole room to its lobby |
| Paused (overlay) | Host Resume after reconnection, Abort; depleted-supply Redeal |
