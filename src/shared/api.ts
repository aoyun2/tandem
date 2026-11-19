export type RomInfo = {
  name: string
  game: 'Black 2' | 'White 2'
  gameCode: string
  revision: number
  language: string
  size: number
  sha256: string
  /** Opaque handle for the inspected file; the path stays in the main process. */
  token: string
}

/** A ROM from the library; `missing` when its file has moved or been deleted (its token is then empty). */
export type LibraryRom = RomInfo & { missing: boolean }

/** What Tandem holds for a ROM besides the file: its cartridge save, if one has been written. */
export type RomDetails = { save: { size: number; modified: number; trainer?: { name: string; id: number; played: { hours: number; minutes: number }; badges: number; money: number } } | null }

export type InspectResult =
  | { status: 'ok'; rom: RomInfo }
  | { status: 'cancelled' }
  | { status: 'error'; message: string }

/** Your name in Tandem and system region; `set` is false until you have chosen a name. */
export type Profile = { name: string; region: string; set: boolean }

/** Read from the ROM: species and place names, each species' two types, its evolution line (lowest species in it), its party icon, the games' type labels, and the bosses' portraits and teams by trainer name; images are PNG data URLs. */
export type GameNames = { species: string[]; places: string[]; types: [number, number][]; lines: number[]; icons?: string[]; typeLabels?: string[]; faces?: Record<string, string>; teams?: Record<string, TrainerMon[]> }

/** One Pokémon on a trainer's team, as the ROM sets it. */
export type TrainerMon = { species: number; level: number; item?: string; moves: { name: string; type: number }[] }

export type NewRun = { token: string; mode: 'solo' | 'soul-link'; partner?: string; rules: Partial<import('./run').Rules> }

export type StartResult = { status: 'ok' } | { status: 'error'; message: string }

export interface TandemAPI {
  windowControl(action: 'minimize' | 'resize' | 'close'): Promise<void>
  inspectRom(): Promise<InspectResult>
  library(): Promise<LibraryRom[]>
  forgetRom(sha256: string): Promise<void>
  romDetails(token: string): Promise<RomDetails | null>
  /** Shows the ROM file or its save in the system file manager. */
  revealRom(token: string, what: 'file' | 'save'): Promise<void>
  /** Starts the emulator; its MessagePort arrives as a window message with data { tandem: 'emulator-port' }. */
  startEmulator(token: string, runId?: string): Promise<StartResult>
  stopEmulator(): Promise<void>
  /** Your OS user name and system region, for showing you to your partner. */
  profile(): Promise<Profile | null>
  setProfile(name: string): Promise<void>
  runs(): Promise<import('./run').Run[]>
  createRun(request: NewRun): Promise<import('./run').Run | null>
  saveRun(run: import('./run').Run): Promise<void>
  names(token: string): Promise<GameNames | null>
  /** One background music sequence from the ROM's sound archive, with its bank and wave archives. */
  track(token: string, name: string): Promise<{ seq: Uint8Array; bank: Uint8Array; waves: (Uint8Array | null)[]; volume: number } | null>
  /** Tells the main process the first scene is rendered so the window can be shown. */
  appReady(): Promise<void>
  platform: string
}
