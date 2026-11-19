# Tandem


A Windows/macOS desktop client for shared Pokémon Nuzlocke runs. Nintendo DS first: Black 2 and White 2.


## Current state

Pokémon Black 2 runs inside Tandem. The emulator is melonDS DS 1.4.0 (a libretro build of melonDS) loaded through koffi in a separate Electron utility process (`src/main/emulator`). It draws software-rendered frames into the play view at about 60 fps, with keyboard, gamepad and touch input, and audio played as scheduled Web Audio buffers. Cartridge save memory is written to `<userData>/saves/<game code>-<hash>.sav`, with the previous copy kept as `.sav.1`. Tested on Windows 11 with Black 2 (USA/Europe): boot, title screen, keyboard input into the opening dialogue, frame rate; and White 2 (USA/Europe) to the title screen. Not yet tested: an in-game save and reload, gamepads, macOS.

Setup is one 3D scene with your DS Lite, an interactive cartridge, a floating island showing the game, the run mode (Solo or Soul Link) and the partner, and a room interface on the DS top screen (Host and Join are interface only; the room service is not built). Play starts the emulator, which fast-forwards Black 2/White 2 to the title screen while the cartridge inserts. Play is a 3D cockpit of free-standing displays: your screens in front and, in Soul Link, your partner's behind, powering on over the live title (docs/PLAY-UI.md). Both modes run the same game; Nuzlocke rules and tracking are not built for either. A prismatic link between the consoles appears only while a partner is connected; with no network session it is never shown. ROM inspection reads the header, checks structure and computes a SHA-256 fingerprint. The ROM path stays in the main process; the renderer holds an opaque token.

Solo Nuzlocke runs (docs/PLAY-UI.md, Runs and tracking): one run at a time on its own cartridge save, with Classic, Hardcore or custom rules. While the game runs, Tandem reads the game's in-memory save data once a second: the trainer, party, boxes and badge flags, and the zone the player is in, shown as the place's name in the cockpit (checked in Aspertia City only). It records catches by the area they were met in, deaths when a party Pokémon faints, badges, level-cap warnings and the end of the run. Species and place names, party icons, type labels, Gym Leader portraits and the bosses' teams come from the player's own ROM; clicking the next boss in the cockpit shows the route to it, its team and the types to bring. Tested on Windows 11 with Black 2 (USA/Europe): finding the save data and reading the trainer name, ID and money after a new game; the title screen gives no false reading. Not yet tested against a live party: Pokémon decoding, catches and deaths are covered by unit tests on encoded data only.

Not built: multiplayer and partner video, randomizer, Soul Link tracking, live location, 3D map. The partner console and screens show no signal.

The emulator core is not in the repository. Download `melondsds_libretro-win32-x86_64-Release.zip` from [melonDS DS v1.4.0](https://github.com/JesseTG/melonds-ds/releases/tag/v1.4.0) and extract it to `vendor/melondsds/extracted/`. melonDS DS is GPL-3.0-or-later.

## Develop


Requires Node.js 22.12+ (Node 24 recommended).


```sh

npm ci

npm run dev

```


```sh

npm test

npm run build

npm start

```


`npm run build` creates an application bundle under `out/`, not a signed installer. macOS runtime testing and installer packaging remain outstanding.


## Project structure


- `src/main`: Electron lifecycle and native file access.

- `src/preload`: narrowly scoped renderer API.

- `src/shared`: API contracts and ROM-header inspection.

- `src/renderer`: React UI.

- `tests`: ROM-validation fixtures; no game data.

- `docs/SPECIFICATION.md`: researched feature baseline and implementation requirements.

- `docs/randomizer-catalog.json`: field-level reference inventory; not implemented settings.


## Next technical milestone


Base ROM → in-app randomization → embedded gameplay → live team/location tracking. Prove this on both B2/W2 before adding cross-machine sessions and video. The detailed specification covers pacing, maps and the optional companion ghost.


## Local game files


Keep ROMs, saves, generated games and personal run data outside this repository. `.gitignore` excludes common game and archive formats as a precaution. The inspector only opens files read-only and does not upload or copy them. It returns the filename and fingerprint to the UI, not the full path. Selection is currently session-only.


## References


Visual styling derives from the user's Fresco app. Souldew was inspected as a feature reference; its application code has not been copied into this scaffold. The randomizer catalog records upstream interoperability identifiers and constraints with source attribution. Dependencies retain their own licenses. A project distribution license has not been selected.

Input settings show the DS Lite model with a label for each button; mappings save locally, drive the emulator and can be reset to defaults.

No cartridge is shown before ROM import; Play requires an inspected ROM. Progress, achievements, and updates are empty placeholders, not connected features. ROM library is tracked in TODO.md.
