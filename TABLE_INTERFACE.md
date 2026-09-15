# Current Archduke interface

The blue-gray strip design supersedes earlier perimeter seating, turn shadows and the persistent gold screen border. Rules remain in RULES.md.

## Entry and header

The existing title, GIF/reduced-motion still, Name field, Start game and Join game flow remain. Entry and game backgrounds use #CBD7E5. The game header contains only Round N / 4, ARCHDUKE!, and the text-only Invite control. Invite copies the private room capability with brief Copied feedback; clipboard failure offers a selectable link.

Dela Gothic One 400 is loaded locally for names and primary controls; secondary text uses system sans-serif. The opponent strip uses #B5C5D9 and primary text uses #1B1E43.

## Layout and cards

Rotate canonical order relative to the viewer, then display every opponent in that cyclic order in a centered desktop group with moderate gaps. The viewer appears only in the personal area as You. Narrow screens wrap the strip into ordered rows; very narrow screens put the shared piles below the hand/pending row.

The lower area reads hand → reserved pending card → draw pile → discard pile. The pending, draw and discard cards share one central size, reduced approximately 10% from the previous layout without changing hand-card dimensions. The composition is centered with tight zone spacing and a reserved pending position. Width and height budgets include header, opponent rows, labels, gaps, padding and contextual controls. A ResizeObserver responds to the actual game container, independently for each viewer.

All cards use 5:7. The asset pipeline removes only transparent padding from the original PNGs, preserving all visible pixels; see assets/source-cards/PADDING.md. The draw stack uses up to eight real card-back image layers, limited by the actual deck count. Decorative layers cannot intercept input; the top target remains anchored as layers disappear.

Opponent hands keep a centered two-card-width footprint. Own hands keep the compact four-slot grid, expanding once to 130% width (125% on narrow screens) when an occupied row first needs a third column. That allowance is reserved from the outset so shared piles stay still. The server assigns each added card to the shorter occupied row (top on ties). Matching closes only that row’s gap while preserving stable target identities and relative order. Historical column capacity stays fixed so closing a gap never shifts the other row. With C columns, step = (handWidth − cardWidth) / (C − 1). Appending a column smoothly increases overlap without shrinking cards or moving the other zones. Successive columns stack above earlier ones. Hover/keyboard focus lifts a card; an authorized revealed face temporarily sits above the stack.

Expanded hands, and small opponent hands on narrow screens, have a Cards inspector. Its numbered slot selector is nonstrategic: browsing slots neither reveals nor plays them. The preview contains only the current recipient-authorized face, otherwise a back. Clicking that preview performs the same currently legal direct card action as clicking its source slot. Empty, immune, stale and otherwise invalid actions remain unavailable or server-rejected. There is no UI hand limit.

## Turn, caller and motion

Only the gold triangle identifies the authoritative next/acting player, independently of the caller. Ordinary active names remain navy. Next-player indication never closes matching or enables a draw early. Preparation labels disappear after initial peeking.

The supplied crown is copied unchanged to public/graphics/crown.png. Its sampled solid gold, #FBB463, is the shared --gold token used by triangle, caller name, called button and call burst. See public/graphics/CROWN.md for sampling details. The crown appears immediately right of the caller's name (or You).

ARCHDUKE! has three states: muted outline/disabled, navy available/enabled, and gold called/disabled with a navy border. The main and strip blues warm subtly to #D0D5D9 and #BCC5CE for this round’s final phase, resetting in the next lobby. Availability uses the server's canCallArchduke predicate. Caller styling persists independently of advancing turns and resets for a fresh round.

An accepted call emits a public, value-free 1400 ms cosmetic event. It does not change visualUntil, unlockAt, turn or matching window. The client plays one fading gold wave from the button; reduced motion uses a gentle opacity fade. Event IDs suppress duplicates, expired events are skipped, and reconnect snapshots do not replay the burst. There is no screen border or active-name underline.

Draw, replacement, discard and swap use existing recipient-filtered movement events. Clicking the pending draw-pile card directly discards it without triggering a special; clicking an occupied own slot replaces it. Hover/focus and its accessible label identify the discard action. Draw-pile faces remain private; discard-pile draws must replace. Incoming replacement and outgoing discard motions overlap. Perspective scales with card size so large flips stay within the lower play area. Viewport resizing updates slot coordinates immediately instead of interpolating old positions against new dimensions. Movement IDs remain stable through acknowledgement; reconnect catches up to current endpoints. Reduced motion keeps identical server timing.

## Readiness, peeks and results

Lobby seats contain four dotted slots beneath each name, plus a face-down central draw pile and empty discard area. Ready sits beneath the viewer’s slots and disappears only after server acceptance, replaced by a small name checkmark. The host Start game action appears beneath the hand when everyone is ready. Every round automatically flips the own bottom two cards after dealing, holds them briefly face up, then closes them before the initial discard. Public server deadlines govern the sequence; only the owner receives faces. No initial controls or countdown appear. Reconnect catches up and pauses preserve remaining time. Special Peek remains direct open/close with the existing server hide deadline and immunity checks.

The final three-second matching countdown automatically scores the round, suspending for required effects and restarting a full three seconds afterward. Ordinary matches and invalid attempts do not extend it; pause/restart freezes it. Results show aligned Place, Player, Hand total and Total points columns (final results omit Hand total). Next continues directly. A navy/light/gold last-place announcement enters and exits automatically in 2.9 seconds, has no button, never intercepts clicks and is not replayed on reconnect. Each player independently continues to an empty Ready table; only the host starts the next deal after everyone has continued and readied. Four-round scores and shared victory rules remain unchanged.

Six-player admission, existing-seat reconnect at capacity, private invitations, host credentials, persistence, rate limits and incompatible legacy-room handling remain intact.
