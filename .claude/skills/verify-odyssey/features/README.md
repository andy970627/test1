# Odyssey blind-cave verification map

The maintained list of user-facing features `verify-odyssey` can prove. Read this index, then the feature file, before driving.

## Baseline preconditions

- `scripts/doctor.ps1` prints `READY`: Unity 6000.3.14f1 installed, project not open in another Unity, scripts compile.
- Each run starts in a fresh scratch scene holding only `BlindGameLoop`, opening on the main menu at difficulty Normal.
- Only drive a Unity started by `scripts/run.ps1`.

## Driving conventions

- One journey = one coroutine in `Assets/Odyssey/Editor/OdysseyVerify.cs`, selected with `run.ps1 -Journeys <name>`.
- Keys go in as Input System `Key` values (`Tap`, `Hold`, `Release`); mouse turning goes in as `Steer`, which sends mouse delta.
- Journeys run in order in one Play session; every journey except `menu-start` gets into the night itself if needed.

## Proof and skip reporting

- Each check records the action, the expected state, and `detail` with the actual value.
- Every journey takes at least one screenshot after the action; open it and confirm the screen matches the check.
- A journey cut short by death or dawn is a failure with the reason in `detail`, never a pass.

## Feature entry contract

H1 title and one paragraph, then exactly `Sub-features`, `How to get to it (user POV)`, `Driving it with verify-odyssey`, `Gotchas`.

## Features

- [Main menu to first night](./menu-start.md): `menu-start`, main menu, opening card, night begins.
- [Make sound](./make-sound.md): `make-sound`, Space emits the lighting sound and unlocks the law entry.
- [Pause menu](./pause.md): `pause`, Tab pauses and stops time, Esc resumes.
- [Push the boulder](./push-boulder.md): `push-boulder`, walk to the boulder, hold E, the opening grows.
- [Death card](./death-card.md): `death-card`, make noise and walk into the giant, the death card shows 葬 身 洞 中 in the inscription font.
