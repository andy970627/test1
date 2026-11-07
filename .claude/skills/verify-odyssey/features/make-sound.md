# Make sound

The core law, "sound is light": Space makes a deliberate sound that lights the cave around the player, and the giant can hear it. The first lighting sound unlocks the chronicle entry for the law.

## Sub-features

- `clap` Space emits a `Clap` sound event at the player.
- `law-unlock` the first lighting sound unlocks chronicle entry `law`.

## How to get to it (user POV)

- During the night, press Space.

## Driving it with verify-odyssey

Preconditions: in the night (the journey gets there itself).

- **Make sound.** Clear the heard list, `Tap(Space)`. Shot `make-sound` (echo rings should be visible). `SoundBus` reported `Clap`.
- **Law.** `Guide.IsUnlocked("law")` is true.

## Gotchas

- The same Space that dismisses the opening card does not count as a sound (EchoPlayer ignores the enable frame); the journey taps again after the night starts.
- The echo fades fast; the screenshot is taken 0.4 s after the tap.
