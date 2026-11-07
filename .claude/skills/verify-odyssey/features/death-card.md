# Death card

When the giant catches Odysseus, the death card plays: two meander bands, 葬 身 洞 中 in GenRyuMin TC Heavy with a black outline, and the cause underneath, over the still-visible cave. It then fades to black and the next night begins.

## Sub-features

- `death-show` Being caught (touched, bumped or crushed) starts `DeathScreen.Showing`.
- `death-title-font` The title uses `OdysseyFonts.InscriptionHeavy` (GenRyuMin TC Heavy, subset in `Assets/Odyssey/Echo/Resources/Fonts/`).

## How to get to it (user POV)

- During the night, make noise (Space) and walk toward the giant until he catches you. Dawn also ends the night with the same card in grey.

## Driving it with verify-odyssey

Preconditions: in the night.

- **Get caught.** Hold W and `Steer` toward `BlindCyclops`, `Tap(Space)` every 2 s, until `DeathScreen.Showing` (gives up after 90 s).
- **Shots.** Read the card's own clock (`startedAt`, by reflection) and take three shots at card time 1.3, 1.9 and 2.5 s; the card time of each is in `notes`. A fixed wait misses the card because editor frames are uneven.
- **Font.** `OdysseyFonts.InscriptionHeavy` is not null.

## Gotchas

- The cause depends on how the giant reached you (touched, bumped, or a thrown rock); any of them shows the same card.
- Run it last: after the card the game moves to the next night, which other journeys don't expect.
- Any key after 1 s skips the card, so the journey sends no keys once the card shows.
