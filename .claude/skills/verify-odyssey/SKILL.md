---
name: verify-odyssey
description: Play the Odyssey blind-cave Unity game (test1, BlindGameLoop) for real, with injected keyboard and mouse, and capture screenshots plus a pass/fail result.json. Use after changing game code under Assets/Odyssey, before saying a feature works in Unity, or when the user asks to playtest, verify, or screenshot the game.
---

# Verify the Odyssey blind-cave game

This replaces "I can't press Play". A PowerShell script opens Unity 6000.3.14f1 on this project with a window, and the editor runner `Assets/Odyssey/Editor/OdysseyVerify.cs` builds a scratch scene with one `BlindGameLoop` (never saved). It enters Play mode, drives journeys from `features/` with a virtual keyboard and mouse, writes evidence, and quits Unity by itself.

The surface is the first-person game in the Unity Game view. All UI is `OnGUI`, so screenshots come from `ScreenCapture` in a windowed editor. Batch mode cannot show it.

## Doctor (run first, and again after anything surprising)

```
powershell -ExecutionPolicy Bypass -File .claude/skills/verify-odyssey/scripts/doctor.ps1
```

Read-only. Prints `OK`/`FAIL` lines and `READY`. It checks four things:
- the Unity version from `ProjectSettings/ProjectVersion.txt` is installed
- the runner file exists
- the project is not open in another Unity, so `Temp/UnityLockfile` is free
- `tools/compile-check.ps1` passes

`-SkipCompile` skips the 30 s compile when you just ran it.

If the project is open in the user's Unity, stop and ask them to close it. Never kill their Unity. Two Unity instances cannot share one project.

## Launch and drive

```
powershell -ExecutionPolicy Bypass -File .claude/skills/verify-odyssey/scripts/run.ps1 -Journeys all
```

- `-Journeys` is `all` or a comma list: `menu-start`, `make-sound`, `pause`, `push-boulder`, `death-card` (run it last: it ends the night). Journeys run in order in one Play session, and each one starts from wherever the last one left off. Every journey except `menu-start` first gets into the night if needed.
- Runs doctor first. `-SkipDoctor` skips that. `-TimeoutSec` defaults to 600.
- Run it in the background. A cold start plus all journeys takes a few minutes.
- A Unity window appears on the user's screen and closes by itself. Tell the user before you launch.
- Exit codes: 0 all checks passed, 1 some check failed, 2 runner error or the 300 s in-game timeout, 3 doctor failed, 4 Unity hit the launch timeout and the script stopped that Unity by PID, 5 no `result.json` (read `editor.log`).

Ready means `result.json` exists. Unity printing to its log is not enough.

## Evidence

Each run writes `Logs/verify/<yyyyMMdd-HHmmss>/` (git-ignored, kept after cleanup):
- `result.json`: per-journey checks (`what`, `pass`, `detail`), screenshot list, `notes`, `error`
- `NN-<step>.png`: Game view screenshots, including the OnGUI menus and HUD
- `editor.log`: full Unity log; the runner's lines start with `OdysseyVerify:`

Proof standards:
- Drive the real player path: keys go through the Input System into the game's own `Update` code.
- Read state from public game objects (`BlindGameLoop`, `GameMenus.Open`, `MissionHud.BriefingOpen`, `BoulderSlide.Opening`), and record emitted sounds through `SoundBus.Emitted`. Never call `StartGame` or `Pause` directly to make a check pass.
- Open the screenshots with Read and look at them. A passing check with a black or wrong screenshot is not proof.
- Say "verified in Unity by verify-odyssey" only for what a journey covered.

## Add a journey

1. Add a coroutine in `OdysseyVerify.cs`: input via `Tap`, `Hold` and `Release` (Input System `Key`), plus `Steer` for mouse turning. Add `Shot` and `Check` calls, and register the coroutine in `AllJourneys` and the `switch`.
2. Add `features/<name>.md` and an index line in `features/README.md`.
3. Run `tools/compile-check.ps1`, then `run.ps1 -Journeys <name>`.

Key map (from the handoff): WASD move, Shift run, Space make sound, hold left mouse to draw the bow, E interact or push, Shift+E hard push, right mouse wedge, F crew, G stake, Tab pause, F1 debug, Esc back, R restart on the end screen.

## Cleanup

Unity quits itself through `EditorApplication.Exit`. On timeout, `run.ps1` stops only the PID it started. Never stop Unity by process name. Nothing else to clean: the scene is never saved, and the Input System settings change is an in-memory copy. Evidence folders stay. Delete old ones under `Logs/verify/` only when the user asks.

## Gotchas

- The editor may not have focus, so the cursor may not lock. The runner then sets `Cursor.lockState` itself and writes a `notes` entry. A real player does this by clicking the Game view.
- The giant is active at night. A long journey can end in death or dawn, so journeys check `InNight` and report it in `detail`. `push-boulder` waits for the next night and walks again, up to 3 tries, and lists each try in `detail`.
- Without focus, the editor can stop running game frames entirely. Run 5 hung for 300 s after the first Enter. The runner calls `EditorApplication.QueuePlayerLoopUpdate()` every tick to keep the game going. A tap also releases after 1.5 s if frames stall, and adds a `notes` entry.
- Reading `Keyboard.current` from the runner shows the editor's input buffer, not the game's. Check game state (`PushMode`, `Open`, `InNight`) instead.
- Screenshots lag when the editor has no focus: the Game view repaints late, so a capture can show a later step. `Shot` blocks the script until the PNG exists, forcing repaints meanwhile, and adds a `notes` entry after 10 s. This bug showed up in the first proof run: `01-main-menu` showed the opening card. Keep the wait.
- Rule 7 in the handoff: never `git add` `Assets/Scenes/*.unity` or other files the user has not committed. Evidence stays under `Logs/`.
- The maintenance loop is `/maintain-verification-skill`.
