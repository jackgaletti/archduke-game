# Current Archduke interface

The blue-gray strip design supersedes earlier perimeter seating, turn shadows and the persistent gold screen border. Rules remain in RULES.md.

## Entry and header

The existing title, GIF/reduced-motion still, Name field, Start and Join flow remain. Entry and game backgrounds use #CBD7E5. The game header contains only Round N / 4, ARCHDUKE!, and the text-only Invite control. Hosts also see a separate Exit control immediately beside Invite. Invite copies the private room capability with brief Copied feedback; clipboard failure offers a selectable link.

Dela Gothic One 400 is loaded locally for names, initial start/join/name controls, and primary controls; secondary text uses system sans-serif. The opponent strip uses #B5C5D9 and primary text uses #1B1E43.

## Layout and cards

Rotate canonical order relative to the viewer, then display every opponent in that cyclic order in a centered desktop group with moderate gaps. The viewer appears only in the personal area as You. Narrow screens wrap the strip into ordered rows; very narrow screens put the shared piles below the hand/pending row.

The lower area reads hand → reserved pending card → draw pile → discard pile. The pending, draw and discard cards share one central size, reduced approximately 10% from the previous layout without changing hand-card dimensions. The composition is centered with tight zone spacing and a reserved pending position. Width and height budgets include header, opponent rows, labels, gaps, padding and contextual controls. A ResizeObserver responds to the actual game container, independently for each viewer.

All cards use 5:7. The asset pipeline removes only transparent padding from the original PNGs, preserving all visible pixels; see assets/source-cards/PADDING.md. The draw stack uses up to ten real card-back image layers, limited by the actual deck count. Decorative layers cannot intercept input; the top target remains anchored as layers disappear.

Opponent hands keep a centered two-card-width footprint. Own hands keep the compact four-slot grid, expanding once to 130% width (125% on narrow screens) when an occupied row first needs a third column. That allowance is reserved from the outset so shared piles stay still. The server assigns each added card to the shorter occupied row (top on ties). Matching closes only that row’s gap while preserving stable target identities and relative order. Historical column capacity stays fixed so closing a gap never shifts the other row. With C columns, step = (handWidth − cardWidth) / (C − 1). Appending a column smoothly increases overlap without shrinking cards or moving the other zones. Successive columns stack above earlier ones. Hover/keyboard focus lifts a card; an authorized revealed face temporarily sits above the stack.

Expanded hands, and small opponent hands on narrow screens, have a Cards inspector. Its numbered slot selector is nonstrategic: browsing slots neither reveals nor plays them. The preview contains only the current recipient-authorized face, otherwise a back. Clicking that preview performs the same currently legal direct card action as clicking its source slot. Empty, immune, stale and otherwise invalid actions remain unavailable or server-rejected. There is no UI hand limit.

## Turn, caller and motion

Only the gold triangle identifies the authoritative next/acting player, independently of the caller. Ordinary active names remain navy. Next-player indication follows server state. An ordinary committed discard immediately enables the eligible piles, without waiting for animation or a matching grace period. Match and draw commands race in the serialized room stream; a draw closes the current window atomically, and later attempts receive existing per-card late penalties. Required specialty actions and reshuffles still block drawing. Preparation labels disappear after initial peeking.

The supplied crown is copied unchanged to public/graphics/crown.png. Its sampled solid gold, #FBB463, is the shared --gold token used by triangle, caller name, called button and call burst. See public/graphics/CROWN.md for sampling details. The crown appears immediately right of the caller's name (or You).

ARCHDUKE! has three states: muted outline/disabled, navy available/enabled, and gold called/disabled with a navy border. The main and strip blues warm subtly to #D0D5D9 and #BCC5CE for this round’s final phase, resetting in the next lobby. Availability uses the server's canCallArchduke predicate. Caller styling persists independently of advancing turns and resets for a fresh round.

An accepted call emits a public, value-free 1400 ms cosmetic event. It does not change visualUntil, unlockAt, turn or matching window. The client plays one fading gold wave from the button; reduced motion uses a gentle opacity fade. Event IDs suppress duplicates, expired events are skipped, and reconnect snapshots do not replay the burst. There is no screen border or active-name underline.

Draw, replacement, discard and swap use existing recipient-filtered movement events. Clicking the pending draw-pile card directly discards it without triggering a special; clicking an occupied own slot replaces it. Hover/focus and its accessible label identify the discard action. Draw-pile faces remain private; discard-pile draws must replace. Incoming replacement and outgoing discard motions overlap. Perspective scales with card size so large flips stay within the lower play area. Viewport resizing updates slot coordinates immediately instead of interpolating old positions against new dimensions. Movement IDs remain stable through acknowledgement; reconnect catches up to current endpoints. Reduced motion keeps identical server timing.

## Readiness, peeks and results

Room entry mounts a dedicated pale-blue lobby, not the game table. Its header has a header-sized (20–28px; 18px on narrow screens), top-centered plain navy ARCHDUKE wordmark and the existing Invite control, without a round counter. The existing loading state shows only Loading... in navy Dela Gothic One. A centered, subtly outlined player list uses muted slate-blue names for unready participants and navy for ready ones. The host has a compact gold HOST badge with a thin navy outline, positioned beside the name without shifting its centerline. The current player's Ready button disables after server acceptance; the host-only Start Game stays visible and disabled until all eligible connected participants are ready. The server atomically freezes the roster, and gameplay then mounts with the unchanged initial deal/reveal/discard sequence. Active-player reconnects catch up without replaying it. New arrivals during a match see only the lobby list and Game in progress, with no card state or gameplay controls.

Every round retains the automatic own bottom-two reveal and existing special Peek interactions. Between rounds, revealed cards and the per-player Next → podium → Next → empty Ready table flow are unchanged. The round-results header Next button shares the Archduke button’s sizing and typography while retaining its own colors and title case. After all active players ready for rounds 2–4, the server enters NEXT_ROUND_COUNTDOWN and creates no hands until its full three-second deadline expires; the existing disabled/faded Archduke button shows 3, 2, 1 from the server deadline, without a new container or animation. Its normal ARCHDUKE! label returns when the existing deal finishes. Reconnect uses the remaining deadline; round one retains host Start Game. The final matching countdown also stays in that existing button. New Game on the final podium returns all participants to the dedicated room lobby; host Exit does the same from gameplay. Both reset readiness, scores, cards and caller state, preserve room/invite credentials, and invalidate the old match generation. The next match requires an explicit host Start after readiness.

Six-player admission, existing-seat reconnect at capacity, private invitations, host credentials, persistence, rate limits and incompatible legacy-room handling remain intact.


## Deck exhaustion

The visible stack contains `min(drawCount, 10)` real card backs, including its top card. Zero cards leaves a reserved, empty draw location. Reshuffling uses a separate, noninteractive overlay of card-back ghosts; it never hides or changes canonical card components or existing movement animations. A final normal draw leaves the deck visibly empty throughout the decision, with no reshuffle ghosts. Only the committed post-draw discard schedules the refill, after its unchanged movement has settled. Ghosts are initialized at the current measured discard bounds before becoming visible; the overlay masks that protected top so they emerge from underneath it toward the measured deck bounds. The canonical discard is never moved, hidden or remounted. Ghosts hand off to the refilled stack on the authoritative completion snapshot. Reduced motion uses a gentle appearance at the deck position. Reconnecting clients reconstruct the remaining sequence from its event ID and server timestamps; disconnect pauses follow the existing room policy.

## Invalid-match presentation

Incorrect and late attempts share an isolated, server-timed sequence: 360 ms
face-up flip, 360 ms horizontal shake, 360 ms face-down flip, then the configured
card flight (500 ms by default). The shake animates the nested face's translate
property; the hand slot's placement transform and React key stay unchanged.

The server draws and appends each penalty immediately, conserving card instances.
A public invalid-attempt event identifies the room/game/round, turn/window, event
sequence, player, attempted instance/value, opaque penalty instance (never its
value), insertion slot and phase timestamps. Opaque IDs do not expose the numeric
canonical deck IDs, which would reveal values. A hidden draw clears any previous
presentation alias so a recycled public card cannot be recognized after shuffling;
its physical server-side instance ID remains unchanged. Invalid-match events never extend
visualUntil or a matching deadline. Successful matches and all other movement
implementations are unchanged.

Clients cache accepted events independently of subsequent snapshots and turns.
Pending penalty instances are excluded from the visual hand and its column
capacity until arrival. A noninteractive card-back proxy starts at measured deck
bounds and targets the existing post-arrival geometry. The landing render adds
the real card before a layout effect removes the proxy. Existing hand reflow runs
only at that landing. Different players animate concurrently; one player's
invalid attempts queue in accepted order, with one penalty per attempted card.

Reduced motion keeps the same semantic steps and timing, substituting a static
face change/gentle failure cue and destination fade for spatial motion. Refresh
snapshots settle all authoritative cards immediately rather than replaying old
events. Duplicate event IDs never repeat an arrival. Game Exit/view teardown
cleans up the isolated layer; ordinary turns and snapshots do not cancel it.

## Opponent Peek presentation

An authorized opponent Peek uses an isolated, private portal outside the table’s scroll container. Source-selection focus cannot leave the table horizontally panned. The selected canonical face is hidden while its slot and key remain reserved; all other cards keep their existing positions. The overlay measures the source card and opponent grid, expands to 1.6× that opponent card width (capped at 85% of the hand width and the available grid/viewport height), and centers over that grid. It preserves 5:7 proportions and stays below the header. Opening/return movement and flip run together with the existing easing, at up to 500 ms; reduced motion uses 80 ms. The existing server Peek deadline already includes movement plus 3 seconds of viewing, and is unchanged. Only the actor receives the opaque card identity/timing metadata and private face. Early close uses the existing done action once; clicking during opening queues that request until opening finishes. Return restores the canonical face only at landing. Resizing retargets the overlay, reconnect uses the existing remaining deadline, and own-card peeks and other animation implementations are unchanged.
