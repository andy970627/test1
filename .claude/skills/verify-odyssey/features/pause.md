# Pause menu

Tab during the night opens the pause menu, freezes time, and pauses audio. Esc (or Tab) goes back to the game.

## Sub-features

- `pause-open` Tab opens the pause menu and sets time scale to 0.
- `pause-close` Esc closes it and time scale returns to 1.

## How to get to it (user POV)

- During the night, press Tab. Close with Esc or Tab, or choose 繼續.

## Driving it with verify-odyssey

Preconditions: in the night, not on the shore, no death card.

- **Open.** `Tap(Tab)`. Shot `pause`. `GameMenus.Open` true, `Time.timeScale` 0.
- **Close.** `Tap(Escape)`. Menu closed, `Time.timeScale` 1.

## Gotchas

- Pause is refused during the opening card, death card, or shore choice (`CanPause`).
- Esc also unlocks the cursor; the runner re-locks it and notes that.
