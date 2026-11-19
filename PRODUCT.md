# Soul Link client

<!-- impeccable:product-schema 1 -->

## Platform

web

Desktop application for Windows and macOS; web technologies inside Electron. Nintendo DS first, specifically Pokémon Black 2 and White 2. 3DS support follows through a separate emulator adapter.

## Stack

User accepted Electron, React and TypeScript, with melonDS integration. Native versus WebAssembly core selection remains subject to Black 2/White 2 compatibility and performance testing.

## Users and purpose

Friends playing a Soul Link together. Both games, their linked teams, encounters, routes, inventory and progress should be visible in one application without maintaining a separate tracker.

## Confirmed requirements

- Windows and macOS.
- Cockpit play view: your screens large, your partner's view beside them, with a spectate swap; real-time network video and live run-state synchronization.
- Controllers and keyboard; visible, understandable keyboard mappings.
- Each player supplies only a base ROM. Recognition, configuration, randomization, generated-ROM creation and launching happen inside the application.
- Route guides and wild encounter lists reflect each actual generated ROM.
- Maps, visited areas, Pokémon state, items and team composition.
- Souldew is the feature and settings baseline; improve the experience substantially.
- Fresco is the visual authority: reuse its liquid-glass style. Build directly from its styles, without an image-mockup approval stage.

## Principles

- Distinguish a verified game observation from an inference and from a manual correction.
- Rules, randomization and display preferences are separate settings.
- Never substitute vanilla encounter data when the generated game's data is unknown.
- Preserve base ROMs and saves. Track generated artifacts separately.
- Synchronize run events independently from video quality or connection interruptions.

## Open decisions

Intel Mac support; whether a release reuses Souldew source or only the underlying emulator/randomizer engines; hosting and TURN operating model; exact scope of the first playable release. The user named the project Tandem and created aoyun2/tandem.

## Evidence

See docs/SPECIFICATION.md and docs/randomizer-catalog.json for researched requirements. The first runnable development slice provides ROM inspection and an input tester; README.md records its limitations. No actual game ROM, save, emulator runtime, or playable client has been provided or produced yet.
