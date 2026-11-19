# Handoff

State of Tandem on 2026-11-18, for the next agent. Read AGENTS.md, PRODUCT.md, docs/SPECIFICATION.md, README.md and docs/PLAY-UI.md first; this file lists what is built, what is verified, and what is next.

## Run and check

- `npm install`, `npm run dev` to run; `npm test` (43 unit tests) and `npm run build` (typecheck + bundle) before any change is called done.
- The DS core is melonDS DS (libretro), expected under `vendor/` (not in Git). ROMs, saves and run data live in the app's data folder and never in Git.
- Capture scripts in `work/tmp/*.mjs` (Playwright `_electron`) and the headless driver `work/drive.ts` are local only (`work/` is ignored). `work/zone-check.ts` reads the zone from saved states: `node --experimental-strip-types work/zone-check.ts <core.dll> <rom> <state...>`.
- `TANDEM_USER_DATA=<folder>` runs the app on a separate profile; use one for tests instead of the user's own data.

## Built

- Main menu: the DS turned left, Solo / Soul Link / Settings panels beside it, the Tandem mark on both screens, music from the ROM's sound archive with a now-playing pill under the console and a prism ring visualizer.
- Solo runs: one per game on its own save; New run with Classic / Hardcore / Custom rules and restrictions; Play resumes.
- Tracking from RAM once a second (`src/main/emulator/host.ts`): trainer, party, boxes, badges, and the zone the player is in (`src/shared/zones.ts`). `src/shared/run.ts` turns readings into catches, deaths, badges, cap breaches and run end.
- ROM data (`src/main/romtext.ts`, `icons.ts`, `trainers.ts`), cached per ROM under `names/<sha>-5.json`: species and place names, types, evolution lines, party icons, type labels, Gym Leader portraits, and every boss's Normal-mode team with moves and items.
- Cockpit (`src/renderer/src/RunView.tsx`, `BossSheet.tsx`): left, the place sign and the team; right, the next boss. Clicking the boss unfolds the current goal: badges so far, the story route to the next gym, the boss's team (moves on pointing), and the best attacking types. Moments show events as they happen.

## Verified, and how

- Save data, trainer name, ID and money: Black 2 (USA/Europe), new game, live.
- Zone reading: Black 2 saved states in the player's room (zone 428) and Aspertia City (427); boot and title read nothing. No route or other town checked.
- Boss teams: each boss's highest level from the ROM equals its cap (13–58) in Black 2 and White 2.
- Type label palettes: all 17 by eye. Pokémon icon palettes: a heuristic, checked by eye on species 1–112 and 495–594.
- Party icons in the cockpit, catches, deaths and moments have not been seen with a live party; they are covered by unit tests on encoded data only.

## Next

1. Validate the zone reader on routes and in other towns in a real game, and match the player's place against the boss route (`path` in `src/shared/progression.ts`) to show progress along it.
2. Per-area encounter state on the place sign (open, caught, used up). Needs to know which zones have wild encounters; the zone header field at +0x14 was inspected and is not a clean flag.
3. Fallen Pokémon as a greyed row under the team; Hall of Fame and Elite Four progress so the goal reaches Iris.
4. Soul Link: linked pairs per area, the partner's badges, a shared goal. Needs the room service and partner data over the network, which are not built.
5. Portraits for the Elite Four and Iris (their class graphics in a/2/9/1 have no head).

## Standing rules from the user

- Show, don't tell; no label-value lists, no walls of text, no dashed placeholders; the prism colours only for important moments.
- Nothing is tracked by hand: if the game cannot be read for something, leave it out.
- Small buttons are silent; hover sounds only on the large menu panels.
- Do not redesign what the user did not name; tweak what was asked.
- Commit or push only when asked; no AI attribution in commits.
