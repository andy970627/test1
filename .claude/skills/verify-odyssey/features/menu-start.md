# Main menu to first night

The game opens on the main menu. Choosing Start shows the combined opening card. After 2 s, Space dismisses it and the first night begins.

## Sub-features

- `menu-open` shows the main menu on launch, before the night.
- `menu-start` Enter on the first item (開始) closes the menu and opens the opening card.
- `briefing-start` Space after the 2 s lock closes the card and starts the night.

## How to get to it (user POV)

- Launch the game; press Enter or Space on 開始, or click it.

## Driving it with verify-odyssey

Preconditions: fresh run (this journey must be first; the menu only shows at launch or after the end screen).

- **Menu.** Wait 2 s. Shot `main-menu`. `GameMenus.Open` is true and `InNight` is false.
- **Start.** `Tap(Enter)`. Shot `briefing`. Menu closed, `MissionHud.BriefingOpen` true.
- **Begin night.** Wait past the 2 s lock, `Tap(Space)`. Shot `night`. Card closed, `InNight` true.

## Gotchas

- Space inside the 2 s lock is ignored by design; tapping early looks like a broken start.
- Mouse clicks on menu items are not driven yet; only the keyboard path is proven.
