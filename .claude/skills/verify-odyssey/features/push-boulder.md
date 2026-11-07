# Push the boulder

The way out: walk to the boulder that seals the cave mouth, face it, and hold E for a light push. The gap opens slowly with a grinding sound the giant can hear.

## Sub-features

- `reach` walking up and facing the boulder sets the at-boulder state.
- `light-push` holding E grows the opening and emits `Grind`.
- `hard-push` Shift+E (not driven yet).
- `wedge` right mouse wedges a stone (not driven yet).

## How to get to it (user POV)

- From the spawn at the back of the cave, walk to the sealed entrance and hold E.

## Driving it with verify-odyssey

Preconditions: in the night (the journey gets there itself).

- **Reach.** Hold W and `Steer` toward `Boulder.PushPoint` until `Player.AtBoulder` or 45 s per try. `detail` gives the remaining distance for each try.
- **Push.** Hold E and W together for 4 s, steering at the boulder; `notes` gets a 0.25 s timeline (at-boulder, push mode, opening, night). Shot `push-boulder`. `Slide.Opening` grew and `SoundBus` reported `Grind`.

## Gotchas

- The steering is a straight line; sheep pens, the cheese rack, or sheep can block it. A failed reach reports the distance; don't teleport the player to pass.
- The giant hunts by sound; walking and pushing can draw him, and a catch ends the night (seen in run 2: 「被摸到」 at 6.6 m). The journey waits for the next night and walks again, up to 3 tries; `detail` lists each try.
- A light push can stick for a moment by design (catch roll), so the opening grows unevenly.
- The boulder slides away as it opens. Holding E without W stops the push after about 0.1 m, when the player falls out of reach (1.5 m). Players have to keep walking in, so the journey holds W too.
- Reading `Keyboard.current` from the runner (an editor update) shows the editor's own input buffer, not the game's, so it can say E is up while the game is pushing. Trust `Player.PushMode` instead.
