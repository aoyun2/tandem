# Soul Link: feature baseline and implementation specification

Status: research and requirements captured. This is not a playable build.

## Reference audit

Souldew source snapshot: `f8c6c200486ec755b115ab40c9b0cd87e44acf5b`, package version 2.8.1, inspected November 16, 2026.

Sources:

- [Souldew product site](https://souldew.app/)
- [Rules and defaults](https://github.com/souldewapp/souldew/blob/f8c6c200486ec755b115ab40c9b0cd87e44acf5b/shared/rules.mjs)
- [Rule editor](https://github.com/souldewapp/souldew/blob/f8c6c200486ec755b115ab40c9b0cd87e44acf5b/web/views/nuzrules.mjs)
- [Randomizer option definitions](https://github.com/souldewapp/souldew/blob/f8c6c200486ec755b115ab40c9b0cd87e44acf5b/shared/randomizer-options.mjs)
- [Streaming implementation](https://github.com/souldewapp/souldew/blob/f8c6c200486ec755b115ab40c9b0cd87e44acf5b/web/lib/sync.mjs)
- [Runtime validation matrix](https://github.com/souldewapp/souldew/blob/f8c6c200486ec755b115ab40c9b0cd87e44acf5b/docs/TESTED_GAMES.md)
- [Fresco styling](https://github.com/aoyun2/fresco/blob/89b4275d6438c065154453a5f02b68244c085861/windows/src/renderer/src/styles.css)

The website and current README disagree about 3DS randomization. The website says unavailable; the current source/README describes support. Record capabilities against a pinned engine version and actual tests, not a marketing claim. Souldew's broad game-support claim is also not equivalent to every randomizer configuration having been played through.

## Required Nuzlocke and Soul Link settings

| Setting | Required choices / behavior |
|---|---|
| Mode | Solo Nuzlocke; Soul Link with 2–4 participants. Two-player layout is the initial priority. |
| Presets | Classic, Hardcore, Custom; save and share custom presets. |
| First encounter | One eligible encounter per configured area; track open, caught, missed and invalid encounters separately. |
| Fainting | Automatic death detection on/off. A linked death affects the entire pair/group when enabled. |
| Blackout | End on party wipe; continue using living boxed Pokémon; or disabled. Unknown box state must not be treated as an empty box. |
| Deathless | First valid death ends the run. |
| Dupes | Off, species, evolution family; player-only or shared scope for Soul Link. |
| Missed dupes | Whether an identified fled/defeated encounter also consumes its species/family. |
| Shinies | Optional exception to the encounter restriction, with an explicit pairing policy. |
| Gifts and eggs | Consume area encounter, free extra, or banned. Handle starters explicitly. |
| Static encounters | Consume area encounter, free extra, or banned. |
| Type restrictions | Off, within a party, across linked partners, or across the shared active team; use actual randomized types. Match Souldew's existing choices and document any expanded choices. |
| Nicknames | Required or optional. |
| Level caps | Off, warning, strict; derive next boss cap from the actual game/difficulty and relevant randomized trainer data. |
| Battle items | Allowed or forbidden; held items and Poké Balls are separate exceptions. |
| Battle style | Require Set or leave unrestricted. |
| Healing | Unlimited or limited Pokémon Center visits per badge. |
| Lives | Disabled or a finite pool; shared across the group or per player. One linked-death incident must not accidentally double-charge a shared pool. |
| Failed encounters | Whether a failed capture also invalidates the linked encounter. |
| Cheats / candies | Explicit run-level permission; log use and permission changes. |
| Battle assistance | Host-controlled visibility of matchup advice and weaknesses. |
| Automation | Automatic route assignment and death marking independently configurable. |
| Feedback | Sounds, visual alerts, reduced motion and accessible status indicators. |

Souldew treats some restrictions as reminders rather than enforced game mechanics. Our UI must label every rule as **observed**, **enforced**, or **manual**, based on the current game's capabilities. A strict setting must not falsely imply that the emulator blocks an action.

Proposed additions: starter/egg pairing policies, optional gender restrictions, area grouping overrides, two-player confirmation of rule changes, a visible history of corrections, and explicit handling of save-state rollback. These are additions, not claims about Souldew.

## Randomizer parity

The accompanying JSON inventory enumerates every exposed option key, value range, dependency and generation restriction from the pinned Souldew schema. It also includes all engine tweak identifiers. This makes field-by-field parity testable.

Groups: starters; wild encounters; trainers; static encounters; totems; evolutions; Pokémon traits; moves; TMs/HMs and tutors; items and trades. Generation-inapplicable options remain part of the product scope but are unavailable for Black 2/White 2. Generation filtering alone does not prove that a particular ROM revision or hack supports an option: query the bundled engine's capabilities as well.

Required setup flow:

1. Player selects a base ROM. Detect game, revision and language; calculate a cryptographic hash.
2. Host selects the rules and randomizer configuration. Show a concise change summary to every player.
3. Choose identical builds or independent player seeds. Store an exact seed string, engine version, configuration hash, base-ROM hash and patches per player.
4. Run the bundled randomizer locally in an isolated worker. Bundle its runtime too; no separate Java installation, command line, preset file or log-import step for players.
5. Write to a new temporary output. Validate the result and atomically commit the generated ROM, checksums and extracted guide data. Cancellation or failure leaves the base ROM intact.
6. Extract encounter tables, encounter conditions, species/types/moves, relevant trainer data and available item metadata from the final generated ROM. Keep the engine's spoiler output as supplementary evidence.
7. Launch directly in the embedded emulator. Keep save files bound to that generated ROM and run attempt.

“Same seed” does not mean identical games across different versions or base ROMs. Identical-build mode requires a compatible base and matching output hashes. Black 2 + White 2 mode validates separate artifacts and a shared session configuration; their ROM hashes should differ.

Do not send ROMs or saves between players. Share session metadata, chosen spoiler visibility, game observations and video.

## Other baseline features

| Area | Required baseline | Improvement target |
|---|---|---|
| Play | Embedded emulator, touch input, controller remapping, keyboard, pause, turbo, fullscreen, screenshots, save states and resume | Equal-size views; selectable top/bottom/both screens for each player; active input indicators and keyboard diagram |
| Teams | Party and box state where observable; HP, status, level, nickname, species, held item, met area and linked status | Pair-aligned rows; composition and type-conflict checks using randomized data |
| Tracking | Catches, deaths, area changes, badges/caps, missed-encounter confirmation, graveyard, attempt history | Evidence and confidence for inferred events; reversible corrections propagated to everyone |
| Guides | Areas, route status, encounter eligibility and battle advice | Visited map; season/method/time-dependent encounter pools; per-player randomized lists; next objectives and item checklist |
| Network | Invitations, participant confirmation, live state, disconnect/reconnect, encrypted transport | Reliable event replay and actual video relay; visible stream resolution/frame rate and connection quality |
| Randomization | Built-in settings, presets, seed, local generation, validation; ROM-patch formats | Reproducible per-player manifests and final-ROM-derived guide data |
| Run tools | Rules, log/chat, statistics, retries, manual corrections, diagnostics | Timeline connecting each catch/death/rule change to its source and revision |
| Streaming | OBS widgets, streamer mode, data API and compatibility bridges | Both game feeds and synchronized team/route overlays; spoilers hidden consistently |
| Access | Keyboard navigation, remapping, reduced motion, color-safe states, localization | Controls taught inside the play view; statuses never communicated by color alone |
| Distribution | App-local runtime dependencies, save protection, updates and diagnostics | Tested Windows/macOS installers and repeatable cross-platform artifact builds |

Advanced streaming/social integrations and platforms beyond DS are retained in the product backlog; their inclusion in the baseline is not a promise that the first playable milestone ships them.

## Video and synchronization

Souldew's inspected implementation requests 15 fps video, limits the sender to 400,000 bits/second and scales widths above 384 pixels down. Its image fallback runs every 1.5 seconds. These are source observations, not performance measurements on our machines.

Target native source resolution and the emulator's normal frame rate (approximately 60 Hz), with integer scaling at the receiver. For DS, each screen is 256×192; a stacked pair is 256×384 before any configured internal render scaling. Do not capture the whole desktop: capture the game framebuffer.

Use WebRTC for low-latency video, with TURN support for connections that cannot connect directly. High-quality encoding is not mathematically lossless. Any lossless mode needs its own bandwidth/performance validation. Even uncompressed two-screen RGBA at 60 fps is about 189 Mb/s before overhead; compression and measured network conditions matter.

Run-state traffic is independent from media. Persist an append-only event journal with stable IDs and per-origin sequence numbers. Validate event ownership, deduplicate retransmissions, acknowledge applied events, and reconcile snapshots after reconnect. Mark remote data stale when disconnected. Resolve competing manual edits explicitly; never resurrect a dead pair from an older snapshot.

Distinguish physical Pokémon identity from species/nickname/party slot. Evolution, renaming, deposit/withdrawal and party reordering must preserve links. Loading an older save state creates a reconciliation event and cannot silently erase a death recorded by the session.

## Architecture

- **Electron main process:** local files, game library, artifact manifests, save backups, application lifecycle and narrow IPC.
- **React/TypeScript UI:** setup, play, linked teams, map/guide, rules and session settings. Renderer has no unrestricted Node or filesystem access.
- **Emulator adapter:** load/pause/input/touch/audio/framebuffer/read-memory/save interface. Benchmark a native melonDS-based host first; select the exact core after testing B2/W2 saves and infrared behavior. Do not equate a core name with verified game compatibility.
- **Game adapter:** version-specific parsing of party, boxes, bag, badges, maps and battles. Explicit capability flags; safe unsupported state when memory cannot be validated.
- **Randomizer worker:** bundled engine/runtime, immutable input, validated output, manifest generation and progress/cancellation.
- **Guide extractor:** final-ROM encounter and trainer data; conditions and map identifiers; curated narrative guidance separate from extracted facts.
- **Session engine:** rules evaluator, pairing, event log, snapshots and revisions.
- **Network:** invitation/signaling, authenticated participants, reliable state transport, media transport and TURN credentials.

Reusing upstream engines is compatible with an entirely in-app setup experience. A fork of Souldew itself is a separate architectural choice; this research has not silently chosen one. Preserve upstream notices and evaluate distribution obligations before shipping reused code.

## Fresco-derived design

Confirmed source tokens: board `#26282a`, deep slate `#141618`, raised slate `#2e3134`, foreground `#f2f0e9`, secondary `#b9b6ae`, accent `#a8c8e4`, success `#b3d2af`, warning `#e6d48f`, danger `#e2aca4`.

Fresco uses Source Sans and Source Serif, smoked translucent panes, a 14px backdrop blur with saturation, and a masked conic-gradient reflective edge. Keep the game images crisp; apply glass to surrounding controls and panels, never to the game feed.

Play-screen composition: compact session bar; two equal game columns; paired team strip directly below; collapsible guide/map pane; persistent compact controls legend. Detailed rule editing belongs in setup/settings. Network health must be visible without inventing a latency or connection status.

## Acceptance gates

1. **ROM setup:** clean Windows/macOS install, only base ROM supplied; generate and launch; reproduce output hash with the same manifest; cancellation preserves input and saves.
2. **Black 2 and White 2:** starter, battle, catch, faint, PC deposit/withdrawal, held-item change, bag changes, route transition, badge and save/reload verified against visible game state. Repeat using randomized builds.
3. **Rules:** fixtures for every clause plus conflicting-clause precedence; linked deaths and lives charged once; stale observations and NPC demonstration battles do not kill a run.
4. **Two machines:** direct and TURN paths; sustained target video quality measured separately from state latency; disconnect/rejoin without losing or duplicating events.
5. **Guides:** sampled encounter pools and seasonal/method conditions match the generated ROM; unsupported tables show unavailable; paired versions use the correct per-player data.
6. **Input:** Windows and macOS keyboard, at least Xbox and PlayStation controllers, hotplug, remapping, focus changes, and touch coordinates after resizing.
7. **Recovery:** interrupted randomization, application crash, disk-full handling, incompatible manifests, malformed peer messages and save-state rollback.

Implementation order: prove ROM→randomizer→emulator→memory-reader on B2/W2; then build the two-player session and video path; then complete the guide/map and all settings parity; then broader game support and advanced integrations. The first step must use an actual supplied ROM before claiming playable compatibility.

## Shared progression, cutscenes and paired versions

User extension: prevent one player advancing too far, coordinate story/cutscenes, and provide an interactive illuminated 3D world map. The following is a proposed implementation, not yet tested game behavior.

Maintain three independent synchronization layers: game observations and Soul Link events; shared progression checkpoints; and video/audio. Independent games must not share raw memory, inputs or a frame counter.

Each game adapter translates game-specific map IDs, story flags and validated trigger states into canonical milestones such as `aspertia.first-gym.ready` and `aspertia.first-gym.complete`. A milestone graph supports prerequisites, optional branches, version-specific alternatives and spoiler visibility. It is not merely a linear badge count.

Proposed pace modes:

- Free: display differences and reminders without stopping progress.
- Together (recommended): rendezvous before selected gyms, major story scenes and new encounter areas; exploration within the unlocked segment remains independent.
- Strict: verified trigger barriers require every participant to be ready; optionally synchronize encounter starts. Unmapped triggers must be labeled unsupported rather than advertised as enforced.

A gate has a stable ID and revision. Each player reports arrived/ready. An agreed coordinator commits its release after all required readiness acknowledgments; timeout or disconnect never silently opens it. Rejoin uses persisted gate state. Host reassignment requires explicit session agreement rather than competing hosts. Every override is logged and shown to both players.

Implementation distinction: detecting a completed story flag only tells us that the player has already advanced. Enforcing a boundary before a scene requires a validated pre-trigger hook, a narrowly scoped ROM patch, or pausing before the relevant map transition. Broad input blocking or arbitrary save flag writes are not a safe substitute. Preserve saves and test hooks per supported ROM revision.

For supported scenes, wait before the trigger, then release each local game after a shared countdown. During the scene, a fast reader may wait at a supported dialogue boundary; avoid injecting identical button presses into different scripts. Text lengths, choices, animations, battles and version-exclusive scenes prevent guaranteed frame-perfect synchronization. Where no safe hook exists, offer explicit manual ready-up and optional pause; show that limitation.

Black 2 + White 2 is a supported product target, including separately randomized ROMs. Each retains its own ROM, seed, manifest and saves. Map equivalent story milestones and encounter regions rather than equating ROM bytes or map IDs. Black + White can later use its own campaign adapter. Original Black/White and sequel Black 2/White 2 are not one interchangeable campaign.

Ordinary Pokémon/trainer/item randomization can preserve the story graph; random warp, script or map changes require a separate supported campaign adapter. Randomized level scaling and difficulty settings feed the progression rules and cap calculation. A shared master seed can derive deterministic per-player seeds, but shared seeds cannot guarantee identical or equally difficult results across versions. Optional balanced presets need explicit constraints and validation.

The 3D map is an authored, stylized Unova region model with a canonical route graph. Render through Three.js/React Three Fiber, using Fresco glass for controls. Show each player's marker and visited-path illumination; distinguish shared completion, one-player completion, an open encounter, a spent encounter, a loss and a locked milestone with shape/labels as well as color. Hover/select an area to show both players' encounters, guide notes, items and next objective. Future story details stay hidden until the agreed reveal policy permits them.

Start with area-level markers. Continuous in-map positions require a verified coordinate reader and mapping to the model; do not simulate exact location from a route ID. Version-specific areas can branch or use paired landmarks. Support rotation, zoom, follow-player, a shared next-checkpoint view, keyboard-accessible area list, reduced-motion lighting and a low-power 2D fallback. The 3D world must not impair emulator/video performance.

Additional acceptance tests: fast-forward through a supported trigger cannot bypass a strict gate; a disconnect during ready-up preserves the lock; version-specific scenes reach the same semantic milestone; replayed releases do not re-trigger scenes; different randomized encounters do not break route pairing; optional side areas do not falsely advance the shared main story.

## In-game quality-of-life patches and shared presence

User extension: modify the game itself, including the possibility of seeing and interacting with the other player in the overworld. These are proposed research tracks, not verified implemented capabilities.

Keep patch definitions versioned and bound to exact supported input revisions. Decide patch/randomizer order per patch after conflict analysis: there is no universal safe order. Validate expected bytes/structures, rebuild checksums as needed, and reject incompatible combinations. The client constructs a new playable artifact from the user's base ROM without asking the user to operate an external patcher.

Candidate QoL patches: text and HP-bar speed, trade-evolution alternatives, running behavior where supported, rule-approved grinding reduction, and story rendezvous hooks. Query engine support before exposing each change. Experience caps and automatic Set mode require separate verified patches if enforcement, rather than reminders, is desired.

Shared-presence stages:

1. **Companion avatar:** network map/position/facing/animation observations. Inject a non-colliding remote actor into supported scenes, with interpolation and explicit stale/disconnected behavior. A framebuffer overlay can test networking but is not completion of the requested in-game feature.
2. **Actor interactions:** face the remote actor and press the interaction button to open a custom menu: ready up, inspect linked team, signal/emote, or request a supported session action. These actions go through the session protocol; no assumption that native trade/battle support is automatically available.
3. **Shared-world state:** synchronize selected NPC interactions, item ownership, puzzles, trainers and story flags through authoritative, idempotent transactions. Specify per-player versus shared items/trainers before implementation. This is a substantial game modification and a separate milestone.
4. **Shared battles:** entering the same battle, commanding separate Pokémon and sharing battle RNG would require additional battle-engine work. It is not a consequence of drawing two player sprites.

Cross-version companion avatars require explicit map correspondence. Equivalent story locations can have different geometry, so coordinates cannot be copied blindly. Use mapped safe locations, hide the avatar with a clear status in unsupported/version-exclusive areas, or require the same version for strict shared-world mode. Cross-version Soul Link tracking remains a separate supported target.

Native co-op should be proven on one supported Black 2 or White 2 revision: two emulator instances, one small map, remote actor walking/turning, a simple ready-up interaction, correct occlusion, no collisions with scripted actors, disconnect/reconnect, and save/load safety. Only then extend across the campaign, pair versions or arbitrary randomized builds. Do not make the entire client depend on this experimental feature.

Research lead: [pokebw2](https://github.com/fuddlesworth/pokebw2) describes an in-progress B2/W2 decompilation. Its existence is not evidence that a stable co-op API, complete source-level world model or production-ready PC port exists. Assess relevant actor/script code and build reproducibility before selecting it as a dependency.
