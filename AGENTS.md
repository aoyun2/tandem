# Tandem development

Use direct, literal prose. Preserve the user's Windows/macOS target, Electron + React/TypeScript stack, and Fresco glass visual identity.

Read PRODUCT.md, docs/SPECIFICATION.md and README.md before substantial work. README.md describes implemented capabilities; the specification describes the target. Never represent planned integrations or synthetic fixture results as working gameplay.

Keep ROMs, saves, generated games, credentials and personal run data out of Git. Preserve base files. Do not commit or push unless the user requests it.

Keep Electron renderer sandboxing and context isolation enabled. Expose narrow preload APIs, validate IPC senders, and keep native file access in the main process or dedicated workers.

Run npm test and npm run build for relevant code changes. Game integration claims require actual game validation; synthetic headers only verify parser behavior. Windows verification does not establish macOS support.

Show, don't tell, on every screen. No interface anywhere carries label-value lists (Game: …, Ping: …, Location: …, Status: …, Team: …): a value appears as the thing it describes — box art for a game, signal bars for a connection, an icon for a place, a lit or broken link for pairing. The cockpit carries the run beside the screens as part of the scene: the team with each member's health and level, and the next objective with its cap, following the game live, as pictures, colours and numbers rather than label-value panels. Events (an area entry, an encounter, a catch, a death, a badge) show up at the moment they occur, then get out of the way. The full guide, every area and the rest of the run's detail live in a view the player opens on demand; it unfolds from the cockpit and closes back into it.

No useless text, and no walls of text. A word on screen must carry something the player cannot see from the interface itself; cut instructions, hints under self-explanatory controls, eyebrows, reassurance and restated obvious facts. Rules, settings and run details appear as icons, tiles, states and pictures, with a word or two at most and detail on hover; a screen is never a list of sentences. Keep a sentence only for a fact the player cannot infer, such as a limitation. Dashed and dotted outlines are not used as placeholders.

The splash screen's pearlescent prism (coral, gold, mint, blue) is the accent for anything important: confirming a choice, connecting, a catch, a badge, a loading state, the music's visualizer. Ordinary controls stay neutral.

Use realistic, externally sourced 3D models for physical objects. Do not substitute procedural or CSS approximations. Retain attribution and licenses. Cartridge interaction rotates only the cartridge, never its insertion device or the shared camera.
