# Play surface

Setup and play form one sequence. Every screen follows the show, don't tell rule in AGENTS.md.

## Navigation

Tabs run across the top of the window: Home, Library, Controls and Development. Your profile (your OS user name) sits at the right. The tabs hide during play.

## Home

Home opens on the main menu (`src/renderer/src/MainMenu.tsx`): the camera swings round so the console stands turned to the left, and Solo, Soul Link and Settings slide out from behind its right edge as panels in a column turned towards it, unfolding like hinges; the group sits centred in the window. A panel's face steps out to the right on hover while its clickable shape stays put, so its edge does not flicker. Solo or Soul Link opens that mode with the island; the island's back arrow or Escape returns to the menu. Settings opens the Settings page. On the menu the cartridge and the game's art are put away, and both screens show the Tandem mark, breathing softly with a sheen crossing it every four seconds. The title bar's tabs, wordmark and profile hide on the menu.

Music plays on the menus from the game in the slot, read from the ROM's own sound archive (`swan_sound_data.sdat`, `src/main/sdat.ts`) and played by a DS sequence player (`src/renderer/src/music/player.ts`): the sequence's tracks at 48 ticks per beat, its bank's sample, pulse and noise instruments, the wave archives' PCM and IMA-ADPCM samples, and each instrument's envelope. On the main menu the piece and the game are shown as a caption centred along the bottom, with previous, pause and next under it. Behind the console a ring of light swells with the music's spectrum, drawn like the link cable: a white-hot core, a prism halo turning slowly, and sparks thrown from the loudest points. The pieces play in a new random order each launch; each plays until it ends or for two and a half minutes, and the next is loaded before the two crossfade over four seconds (skipping crossfades in one). The music runs on across Home, Library, Settings and Development and only fades for play. Music may start before any click. Music fades out when play starts. The pieces are named from the archive's sequence names.

Controls give tactile sound (`installInterfaceSounds` in `src/renderer/src/sfx.ts`): the menu panels tick on hover and press on click, typing gives a quiet key tick, and other controls stay silent. Confirming actions (a mode, Select, Play, Start run, Continue) are brighter, with a short rising tone, and the splash screen's prism (coral, gold, mint, blue) runs once round the control. Menu panels light a prismatic edge on hover.

One Three.js scene (`src/renderer/src/DSPreview.tsx`). The frame's edges fade gently.

- Your DS Lite is centred in the window's lower half, with the cartridge floating close beside it, over the console's lower-left corner.
- The island (`src/renderer/src/Island.tsx`) floats above the console, following a point in the scene. It tilts a little down towards you, leans towards the pointer, and resizes from its centre as its content changes.
  - Left side: the game in the slot, with Play and Library.
  - Right side: the run mode, Solo or Soul Link, kept between sessions. Solo shows nothing more; Soul Link adds the room and the partner.
    - Idle: Host, Join and Test link.
    - Connecting: a pearl puck, ringed with the splash screen's prism and turning, beside Connecting. Every loading spinner uses the same puck.
    - Hosting: a pulsing Room open marker, a note that online rooms are not connected yet, Copy code and Cancel.
    - Joining: Join and Cancel, with the code typed from the keyboard. The code itself shows on the DS top screen.
    - Linked: the partner's name, a Test tag for the simulated partner, an icon for where they are, signal bars for the measured round trip (hollow while nothing is measured), and End test link.
- The DS top screen shows, over a dim blur of your game's box art:
  - idle and solo: the game's box art with its title
  - hosting: your box art and name beside a dashed slot for your partner, with the room code beneath in a glass pill
  - joining: the same, with the code filling in as you type, dots for the places left and a caret at the next
  - linked: both players' box art joined by a lit link, with both names
- The DS touch screen shows the top screen from your last save of the game in the slot, or the Tandem mark glowing softly before it has saved.
- Both DS screens crossfade from one state to the next.
- Online rooms need the room service, which is not built; Host and Join say so.
- When a partner links, an energy link runs from the port on the console's right side wall out of the frame on the right, drawn on its own layer.
  - Two strands of light spiral round its core and streaks flow along it, and it sways gently.
  - While connecting, a soft glow in the cable's own pearl light breathes at its root by the port; it dies down after the link catches. On link a smooth, bright front runs out from the port with a point of light riding it, and the freshly lit stretch glows warm before cooling to pearl.
  - Its shaders compile while it is hidden, so linking does not stall a frame.
  - The console hides the link wherever it is in front of it, including during insertion.

## Library

The Library tab keeps the Home scene and expands the island into the library, dimming the console behind it. Clicking outside it returns to Home.

- The top screen at your last save of the selected game is the banner across the top, in sharp pixels fading into the panel. Beneath it the game's box art, blurred, lights the whole panel and crossfades as the selection changes.
- The selected game fills the top:
  - its cover, standing slightly turned with a gloss
  - its title, year, developer and platform, and a short description
  - your files for it, when there is more than one
  - its play time, last played, save status and file size
  - Select, which puts it in the slot and returns to Home (Selected when it is already there), with Show in folder, Show save and Remove
- Every supported game sits on a centred shelf of covers, followed by an Add ROM tile. Yours are in colour; the rest are greyed out and offer Add ROM. The selected cover lifts and glows in the game's colour.
- The left and right arrow keys or a gamepad's d-pad move along the shelf with a soft tick; Enter or A selects, Escape or B closes. Double-clicking a cover selects it.
- Show in folder and Show save open the system file manager; Remove takes the entry out of the library.

The library (`src/main/library.ts`) is `library.json` in the app's data folder, keyed by each file's fingerprint.
- An added ROM is copied into the `roms` folder there, and the library uses that copy. The file you chose is left where it is.
- Paths stay in the main process, and a moved or deleted file shows as missing.
- The save picture is the top screen at the moment the emulator writes the cartridge save.
- The save picture, play time and last played are stored on this computer.

Partners can link only when their games belong to the same generation pair (`src/shared/pairing.ts`). The only pair defined is Black 2 / White 2.

Play sends the cartridge round the left of the console into Slot-1. The camera follows it to the slot, then swings back round the left to a three-quarter view of the front as the screens light, without moving closer, and the view fades to the cockpit. The emulator starts when Play is pressed. For Black 2/White 2 it runs uncapped through the opening, pressing A and Start at the game's skip points, until the touch screen shows the title art. This takes about 1.4 s, inside the 3.05 s insertion.

## Cockpit

One Three.js scene (`src/renderer/src/cockpit/Cockpit.ts`) of free-standing displays.

- Your top and touch screens stand in front, each on smoked glass with a hairline edge. The touch screen folds towards you about the hinge.
- In Soul Link your partner's pair stands behind and to the right, turned in.
  - Their screens look exactly like yours.
- A solo run has only your pair, centred, with no spectate button.
- Each pair carries its player's name; the front pair reads "spectating" while you watch your partner.
- Spectating swaps the pairs over 0.9 s along bowed paths. Game input is off while spectating.
- Each screen throws a soft glow tinted by its picture. The camera fits both pairs and sways slightly with the pointer.

The scene has no tone mapping, so the game's colours reach the screen shader unaltered. Sampling is sharp-bilinear. The steady look is a backlit handheld LCD:
- a faint pixel grid once a game pixel spans four or more display pixels
- slightly reduced contrast and saturation, and cool lifted blacks
- backlight falloff towards the edges and a faint bottom-edge bleed
- a glass sheen

Controls:
- Back sits alone at the top left.
- Volume sits beside the bottom-right corner of the front pair and opens on hover.
- The spectate button sits beside the rear pair.
- The keyboard strip under your screens is always shown. It powers on once the screens' pictures are in: its backlight flickers on, then the keys light in a sweep from left to right. Keys light while held.

The game holds on its first frame through the power-on, with no sound. When the last screen's picture is in (about 2.2 s solo, 2.8 s in Soul Link), the keyboard strip powers on and the game starts, so its music begins from the top. Escape returns to setup.

## Settings

Settings, from the main menu or the tab, is the 3D controls view: each DS button labelled beside the console with its key (click a key to rebind it), and on the console's touch screen the other settings, drawn on the screen and tapped there: a ten-step bar each for music and effects volume, the graphics quality switch (Balanced draws about 2.2 million pixels a frame, High about 4 million) and a reset for the keys. During play the HUD's gear opens the same volume bars and quality switch over the cockpit (`QuickSettings` in `src/renderer/src/SettingsPanel.tsx`). Settings are kept on this computer.

## Sound

Interface sounds (`src/renderer/src/sfx.ts`) play through one bus; game audio does not.
- Each sample is matched by its loudest 50 ms to a common level before mixing.
- A shared tone EQ: rumble cut below 38 Hz, +2.5 dB at 110 Hz, −2.5 dB at 3.2 kHz, −3 dB above 9 kHz.
- A room: a convolution reverb on a synthetic 2.4 s impulse whose highs decay faster than its lows, fed by a per-sound send.
- A body layer: the low end below 150 Hz, softly saturated, mixed in per sound for impacts.
- Each sound is panned to where its source is: the cartridge slot left of centre, the link to the right.
- Glue compression (3:1 from −20 dB) and a limiter at −2 dB.

## Power-on

`src/renderer/src/display/bootShader.ts`, per screen:

- 0.3 s: the backlight catches, drops out, catches again, dips, then holds and warms to full over half a second.
- 0.85 s: the picture fades in over 0.9 s from a dark, contrasty, cool grade. A brightness surge marks the lock-on, and a pass of light crosses the glass.
- The picture blooms warm and slightly overexposed. From 2.1 s it settles over 1.3 s into the steady screen look.

Start times after your top screen: your touch screen 0.4 s, the partner's top 0.65 s, the partner's touch 1.05 s; a solo run plays only the first two. The clock and sound wait for the first live frame (up to 6 s), and reduced motion skips the sequence. Sound: each screen locks on with a metal clunk and a latch click at slightly varied pitch, panned to where it stands; the partner's screens sound further back. The key strip powers on with a click over a lower clunk, timed to its backlight (see docs/ASSETS.md). Game audio and interface sounds share one audio context.

## Controls

The Controls tab keeps the Home scene. The camera eases from the Home view down over the console's buttons, while the island and cartridge step aside. The labels arrive about 0.3 s in and follow the console as the camera settles.

- Each mappable button gets a label beside the console on a leader line. The label pairs an icon of the DS button with the keyboard keycap that drives it, and adds the controller button when a controller is connected.
- Every button glows faintly. Hovering a button or its label lights it, and held keys and controller buttons light the buttons they drive.
- Click a button on the console or its label, then press a key or controller button to bind it. Its previous binding moves to whichever button the new one used to drive. Escape cancels.
- Reset to defaults sits at the bottom with the controller's name.

Bindings save locally (`src/renderer/src/input/bindings.ts`) and drive the emulator. The console's button points and highlight shader are in `src/renderer/src/input/buttons.ts`. The shell material (`src/renderer/src/dsMaterial.ts`) is the painted atlas, a normal map derived from the supplied bump map, and a coated-plastic finish.

## Runs and tracking

A run is a Nuzlocke on one game and its own cartridge save, `runs/<id>.sav` in the app's data folder (`src/main/runs.ts`). Each game has one active solo run, and each partner one Soul Link session. Play resumes it; starting a new run on the same game ends the active one and keeps its record and save.

- First launch runs onboarding (`src/renderer/src/Onboarding.tsx`): it asks your name, then welcomes you by it through your game and your first run. Your profile in the title bar reopens the name, and clicking the avatar there picks a photo (cropped square to 160 px and kept with your name).
- Solo is the default mode. In Solo, Play on a game with no run opens New run in the island (`src/renderer/src/NewRun.tsx`): Classic, Hardcore or Custom, as Souldew defines them (`shared/rules.mjs` at the commit the specification pins). Every run counts the first encounter in each area and treats a fainted Pokémon as gone.
  - Classic: a party wipe ends the run, the dupes clause by evolution line (dead ones count), the shiny clause; no level caps, no type rule, nicknames optional.
  - Hardcore: Classic with strict level caps, no bag items in battle, and the Set battle style.
  - Custom: each of those, plus deathless.
  - Restrictions, with any preset: the type rule (no repeated primary type in the team, Souldew's), a monotype run (every catch has the chosen type), and no legendary or mythical Pokémon (Generations I–V). Monotype and the legendary ban are additions to Souldew's rules.
  - Scouting: boss teams, their moves and the types to bring are shown before the battle. On in Classic; Hardcore turns it off, an addition to Souldew's Hardcore.
  - A Soul Link host's setup is the same rules object, so the lobby can show it to the partner as tiles once rooms connect.
  - Strict caps make going over a rule break; Warn only warns. Neither stops the game giving experience.
  - No bag items, Set style and nicknames are not visible to Tandem and are marked as on your honour.
  - Gifts and static encounters count as their area's encounter.
- Level caps are the highest level on each Gym Leader's team on Normal difficulty, then the Elite Four's: 13, 18, 24, 30, 33, 39, 48, 51, 58, Souldew's b2w2 list (`shared/routes.mjs`). Challenge Mode teams are higher.
- The island shows the run's team as party icons (name and level on hover), badges and the number fallen, with a button for a new run.
- In Soul Link, a session starts once a partner is linked; without one, Soul Link plays untracked on the ROM's own save.

The emulator process (`src/main/emulator/host.ts`) reads the game's in-memory copy of its save data once a second and sends the trainer, party and boxes when they change. The copy is found by its 24 box names and its party block, then the PKHeX offsets for Black 2 / White 2 apply (`src/shared/gen5.ts`). The renderer applies each reading to the run (`src/shared/run.ts`):
- a new Pokémon with your trainer ID is a catch in the area it was met; a second catch in a used area is flagged, except a shiny under the shiny clause
- a party Pokémon at 0 HP is dead for the rest of the run; reviving it is flagged
- a catch of a species or evolution line already caught breaks the dupes clause, except a shiny under the shiny clause
- a banned legendary, or a catch without a monotype run's type, breaks the restrictions
- new badge flags, and party Pokémon above the cap
- two team members with the same primary type, under the type rule
- the run ends on a party wipe or when nothing alive is left, as the blackout rule says, and at the first death when deathless

The same reading carries where the player is (`src/shared/zones.ts`). The ROM's zone table (a/0/1/2) has a 48-byte header per zone, with the parent zone at +0x18 and the place-name index (the met-location number) at +0x1A. The game keeps a copy of the current zone's header, then the zone id, behind the pointer at 0x02000024 plus 0x41B2C; a copy counts only when it equals the ROM's header of that zone, and when the pointer's copy does not, main RAM is searched for a single copy every three seconds at most. These facts come from Souldew (GPL-3.0, used as reference only) and NDS-Ironmon-Tracker. Checked in Black 2 (USA/Europe) from saved states: the player's room reads zone 428 and Aspertia City zone 427, both named Aspertia City; boot and the title screen read no zone. Routes and other towns have not been checked live.

During a run the cockpit shows the run beside your screens once the game's save data and trainer name have been read, so not on the title screen (`RunScene` in `src/renderer/src/RunView.tsx`): to the left, where you are, sliding in again at each new place, with the Pokémon caught there when there is one; under it, the party as it stands, each member as its party icon tinted by its primary type, with its level and a health bar, struck through and greyed when fallen; to the right, the main task: the next place on the story route to the next boss, or the boss with its type label once the route is done, beside the boss's portrait drawn full bleed, with the route's progress as pips and, with caps on, the level to stay under. The run records each place it has been to (`visited`), and the next step is the place after the furthest one reached (`nextStep`). All of it follows each reading of the game. The run shows only in your own view: spectating a partner hides it, and in Soul Link, where the partner's screens stand to the right, the task moves into the left column above the team. The bosses are the eight Gym Leaders in story order, then the Elite Four and the Champion (`src/shared/progression.ts`).

Clicking the boss unfolds the current goal (`src/renderer/src/BossSheet.tsx`); Escape or a click elsewhere folds it back:
- the boss's portrait full bleed, with the leaders beaten so far as small faces above its name
- the story route from the last gym to the next, from Bulbapedia's walkthrough without side areas, ending at the gym's city, with the places reached lit and the next one bright
- with scouting on: the three types that hit most of the boss's team super-effectively, with a pip per team member hit (Generation V chart, `src/shared/pokemonTypes.ts`), for the Elite Four the best two per member; the team in its Normal-mode battle as party icons with levels; and the profile of the Pokémon pointed at, as its summary screen would show it: icon, level, item and type labels, its stats at that level from its base stats and the trainer's IVs (neutral nature, no effort values), what it is weak to (×4, ×2), resists (×½) and cannot be hit by (×0), and each move with its type label, the game's category icon, power and accuracy. Each boss's highest level equals its cap.
The goal moves on with the badge count and each place reached. After the eighth badge the goal stays on the Elite Four; the Champion follows once the league's progress is read.

Each event shows as a moment at the top of the cockpit for four seconds, with the Pokémon's icon or, for a badge, the beaten leader's portrait; the run lives in the cockpit and its moments.

Game art and trainer data come from the player's ROM (`src/main/icons.ts`, `src/main/trainers.ts`) and are cached with the names:
- Party icons (a/0/0/7) bob between their two frames as on the party screen, slower below half and a quarter health, still when fallen. The archive has three shared palettes and no per-species index was found, so each species takes the palette closest to its battle sprite's colours (a/0/0/4) and its body colour (personal data); the choice was checked by eye on species 1–112 and 495–594 and may be wrong for others.
- Boss portraits: the trainer with the boss's name gives its class (a/0/9/1), and the class graphic (a/2/9/1) ends in a 32×32 head. The eight Gym Leaders have one; the Elite Four's and Iris's class graphics do not, and they keep the badge symbol.
- Type labels: the games' own (a/0/8/2, files 34–50) with one of three shared palettes in file 33, chosen by the colours in each label's own palette slots; all 17 checked by eye.
- Text: messages are decrypted from each line's terminator, and compressed lines (9-bit characters) are unpacked; trainer names, move names and item names come from the ROM this way.

The HUD's gear opens settings over the cockpit; Escape closes them.

The library page shows the save for the selected game: the active run's when there is one, otherwise the ROM's own. It reads the save file's trainer name, time played in the game, badges and money. Below it are that game's runs, most recent first, with their result, badges, catches, fallen and play time.

Species and place names are read from the ROM's message archive `a/0/0/2` (`src/main/romtext.ts`), found by content; each species' types from the personal data `a/0/1/6`, and evolution lines from `a/0/1/9`. They are cached per ROM in `names/`.

Not read: the current area while walking (the save's position block is not updated in memory), wild battles, and the game's end. Missed encounters are manual.

## Verification

`scripts/launch-smoke.mjs` checks:
- unselectable interface text
- cartridge keyboard rotation
- Escape during insertion
- the boot clock and the HUD
- the minimum window, and Escape exit

It uses a synthetic header; no game runs. The setup states, the cockpit (including spectate, with your frames copied into the partner screens), the Back button, and rebinding, reset and cancel on the input page were exercised with Black 2 and White 2 (USA/Europe) on Windows 11. Not checked: controller binding, macOS.
