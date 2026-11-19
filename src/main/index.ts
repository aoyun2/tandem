import { app, BrowserWindow, dialog, ipcMain, MessageChannelMain, session, shell, utilityProcess, type UtilityProcess } from 'electron'
import { userInfo } from 'node:os'
import { basename, join } from 'node:path'
import { copyFile, mkdir, open, readFile, stat, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { inspectHeader } from '../shared/rom'
import { saveSummary } from '../shared/gen5'
import { forget, readLibrary, remember, stillThere } from './library'
import { addRun, isPhoto, readProfile, readRuns, runSave, saveProfile, saveRun } from './runs'
import { evolutionLines, gameNames, locate, narcFiles, speciesTypes } from './romtext'
import { findSdat, readTrack } from './sdat'
import { playerPortrait, speciesIcons, trainerFaces } from './icons'
import { BOSSES, trainersOf } from '../shared/progression'
import { categoryIcons, trainerTeams, typeLabels } from './trainers'
import { wildEncounters } from './encounters'
import { checkRules, newRun, type Run } from '../shared/run'
import type { GameNames, InspectResult, LibraryRom, NewRun, RomDetails, StartResult } from '../shared/api'
import type { EmulatorConfig } from '../shared/emulator'

let window: BrowserWindow | null = null
let inspecting = false
/** Inspected ROM paths stay in the main process; the renderer only holds an opaque token. */
const roms = new Map<string, { path: string; sha256: string; gameCode: string }>()
let emulator: UtilityProcess | null = null

/** Cartridge save memory for a ROM, kept per fingerprint under the app's data folder. */
const savePath = (rom: { gameCode: string; sha256: string }) => join(app.getPath('userData'), 'saves', `${rom.gameCode}-${rom.sha256.slice(0, 12)}.sav`)

const corePath = () => join(app.getAppPath(), 'vendor', 'melondsds', 'extracted', 'melondsds_libretro-win32-x86_64-Release', 'cores', 'melondsds_libretro.dll')

function stopEmulator() {
  const child = emulator
  if (!child) return
  emulator = null
  child.postMessage({ type: 'stop' })
  const kill = setTimeout(() => child.kill(), 4000)
  child.once('exit', () => clearTimeout(kill))
}
app.setName('Tandem')
// Menu music starts with the app, before any click.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
if (process.env.TANDEM_USER_DATA) app.setPath('userData', process.env.TANDEM_USER_DATA)

function createWindow() {
  const splash = process.env.TANDEM_NO_SPLASH ? null : new BrowserWindow({
    width: 480, height: 260, frame: false, resizable: false, show: false,
    center: true, title: 'Tandem', backgroundColor: '#00000000',
    ...(process.platform === 'win32' ? { backgroundMaterial: 'acrylic' as const } : { transparent: true, vibrancy: 'under-window' as const }),
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  const win = new BrowserWindow({
    width: 1320, height: 900, minWidth: 760, minHeight: 620,
    title: 'Tandem', backgroundColor: '#0a0b0c', autoHideMenuBar: true, show: false, frame: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true, contextIsolation: true, nodeIntegration: false
    }
  })
  window = win
  let revealed = false
  let mainReady = false
  let splashReady = false
  const reveal = () => {
    if (revealed || win.isDestroyed()) return
    revealed = true
    clearTimeout(watchdog)
    if (!process.env.TANDEM_WINDOWED) win.setFullScreen(true)
    win.show()
    if (splash && !splash.isDestroyed()) splash.close()
  }
  const play = () => {
    if (mainReady && splashReady && splash && !splash.isDestroyed())
      void splash.webContents.executeJavaScript('window.play()').catch(reveal)
  }
  const watchdog = setTimeout(reveal, 9000)
  // The window is shown once the renderer reports its first scene is ready, not when the page has merely loaded.
  const rendererReady = () => { if (mainReady) return; mainReady = true; if (!splash) reveal(); else play() }
  ipcMain.removeHandler('app:ready')
  ipcMain.handle('app:ready', event => { if (event.sender === win.webContents) rendererReady() })
  ipcMain.removeHandler('app:profile')
  ipcMain.handle('app:profile', async event => {
    if (event.sender !== win.webContents) return null
    const data = app.getPath('userData'), stored = await readProfile(data)
    return { name: stored?.name ?? userInfo().username, region: app.getLocaleCountryCode(), set: !!stored, photo: stored?.photo }
  })
  ipcMain.removeHandler('app:setProfile')
  ipcMain.handle('app:setProfile', async (event, name: unknown) => {
    if (event.sender !== win.webContents || typeof name !== 'string' || !name.trim() || name.length > 32) return
    const data = app.getPath('userData'), stored = await readProfile(data)
    await saveProfile(data, { name, photo: stored?.photo })
  })
  ipcMain.removeHandler('app:setPhoto')
  ipcMain.handle('app:setPhoto', async (event, photo: unknown) => {
    if (event.sender !== win.webContents || (photo !== null && !isPhoto(photo))) return
    const data = app.getPath('userData'), stored = await readProfile(data)
    await saveProfile(data, { name: stored?.name ?? userInfo().username, ...(photo ? { photo } : {}) })
  })
  if (splash) {
    splash.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    splash.webContents.on('will-navigate', event => event.preventDefault())
    splash.once('ready-to-show', () => { splashReady = true; splash.show(); play() })
    splash.on('page-title-updated', (_event, title) => { if (title === 'done') reveal() })
    splash.on('closed', () => { if (mainReady) reveal() })
    splash.webContents.on('did-fail-load', reveal)
    if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) void splash.loadURL(`${process.env.ELECTRON_RENDERER_URL}/splash.html`)
    else void splash.loadFile(join(__dirname, '../renderer/splash.html'))
  }
  win.on('closed', () => { clearTimeout(watchdog); if (splash && !splash.isDestroyed()) splash.close() })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', event => event.preventDefault())
  win.on('closed', () => { stopEmulator(); if (window === win) window = null })
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  ipcMain.handle('window:control', (event, action: unknown) => {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return
    if (action === 'close') window.close()
    if (action === 'minimize') window.minimize()
    if (action === 'resize') {
      if (window.isFullScreen()) window.setFullScreen(false)
      else window.setFullScreen(true)
    }
  })
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  // ROMs opened before. Each available entry gets a fresh token; a moved or deleted file is reported as missing.
  ipcMain.handle('rom:library', async (event): Promise<LibraryRom[]> => {
    if (!window || event.sender !== window.webContents) return []
    const entries = await readLibrary(app.getPath('userData'))
    return Promise.all(entries.map(async ({ path, addedAt: _added, ...info }) => {
      if (!(await stillThere({ path, addedAt: 0, ...info }))) return { ...info, token: '', missing: true }
      const token = randomUUID()
      roms.set(token, { path, sha256: info.sha256, gameCode: info.gameCode })
      return { ...info, token, missing: false }
    }))
  })
  // One archive from a ROM's file system, read from disk without loading the whole ROM.
  const romArchive = async (path: string, name: string) => {
    const file = await open(path, 'r')
    try {
      const read = async (start: number, length: number) => { const b = Buffer.alloc(length); await file.read(b, 0, length, start); return b }
      const header = await read(0, 0x60)
      const fnt = await read(header.readUInt32LE(0x40), header.readUInt32LE(0x44)), fat = await read(header.readUInt32LE(0x48), header.readUInt32LE(0x4c))
      const r = locate(fnt, fat, name)
      return r ? read(r[0], r[1] - r[0]) : null
    } finally { await file.close() }
  }
  // The save for a ROM, and showing its file or save in the system file manager. Paths never leave the main process.
  ipcMain.handle('rom:details', async (event, token: unknown): Promise<RomDetails | null> => {
    const rom = window && event.sender === window.webContents && typeof token === 'string' ? roms.get(token) : undefined
    if (!rom) return null
    // The save shown is the active run's when there is one on this ROM, otherwise the ROM's own.
    const data = app.getPath('userData'), run = (await readRuns(data)).find(r => !r.endedAt && r.mode === 'solo' && r.romSha === rom.sha256)
    const file = run ? runSave(data, run.id) : savePath(rom)
    try {
      const s = await stat(file), summary = saveSummary(new Uint8Array(await readFile(file)))
      let portrait: string | undefined
      if (summary) try { const faces = await romArchive(rom.path, 'a/2/9/1'); portrait = faces ? playerPortrait(faces, summary.female) ?? undefined : undefined } catch { portrait = undefined }
      return { save: { size: s.size, modified: s.mtimeMs, trainer: summary ? { ...summary, portrait } : undefined } }
    } catch { return { save: null } }
  })
  ipcMain.handle('rom:reveal', (event, token: unknown, what: unknown) => {
    const rom = window && event.sender === window.webContents && typeof token === 'string' ? roms.get(token) : undefined
    if (!rom) return
    if (what === 'file') shell.showItemInFolder(rom.path)
    else if (what === 'save' && existsSync(savePath(rom))) shell.showItemInFolder(savePath(rom))
  })
  // Runs: one solo run at a time and one Soul Link session per partner, each on its own cartridge save.
  ipcMain.handle('runs:list', async (event): Promise<Run[]> => window && event.sender === window.webContents ? readRuns(app.getPath('userData')) : [])
  ipcMain.handle('runs:create', async (event, request: unknown): Promise<Run | null> => {
    if (!window || event.sender !== window.webContents || !request || typeof request !== 'object') return null
    const { token, mode, partner, rules } = request as NewRun
    const rom = typeof token === 'string' ? roms.get(token) : undefined
    if (!rom || (mode !== 'solo' && mode !== 'soul-link') || (mode === 'soul-link' && (typeof partner !== 'string' || !partner))) return null
    const checked = checkRules(rules)
    const run = newRun({ id: randomUUID(), mode, partner: mode === 'soul-link' ? partner!.slice(0, 32) : undefined, romSha: rom.sha256, game: /^IRD/.test(rom.gameCode) ? 'White 2' : 'Black 2', rules: checked, createdAt: Date.now() })
    return addRun(app.getPath('userData'), run)
  })
  ipcMain.handle('runs:save', async (event, run: unknown) => {
    if (!window || event.sender !== window.webContents || !run || typeof run !== 'object' || typeof (run as Run).id !== 'string') return
    await saveRun(app.getPath('userData'), run as Run)
  })
  const iconsOf = async (archive: (path: string) => Promise<Buffer | null>) => {
    const icons = await archive('a/0/0/7')
    try { return icons ? speciesIcons(icons, await archive('a/0/0/4'), await archive('a/0/1/6')) : undefined } catch { return undefined }
  }
  const facesOf = async (archive: (path: string) => Promise<Buffer | null>) => {
    const [text, trainers, faces] = [await archive('a/0/0/2'), await archive('a/0/9/1'), await archive('a/2/9/1')]
    try { return text && trainers && faces ? trainerFaces(text, trainers, faces, BOSSES.map(b => b.name)) : undefined } catch { return undefined }
  }
  const teamsOf = async (archive: (path: string) => Promise<Buffer | null>) => {
    const [text, trainers, teams, moves] = [await archive('a/0/0/2'), await archive('a/0/9/1'), await archive('a/0/9/2'), await archive('a/0/2/1')]
    try { return text && trainers && teams && moves ? trainerTeams(text, trainers, teams, moves, BOSSES.flatMap(trainersOf)) : undefined } catch { return undefined }
  }
  const labelsOf = async (archive: (path: string) => Promise<Buffer | null>) => {
    const ui = await archive('a/0/8/2')
    try { return ui ? typeLabels(ui) : undefined } catch { return undefined }
  }
  const categoriesOf = async (archive: (path: string) => Promise<Buffer | null>) => {
    const ui = await archive('a/0/8/2')
    try { return ui ? categoryIcons(ui) : undefined } catch { return undefined }
  }
  const wildOf = async (archive: (path: string) => Promise<Buffer | null>) => {
    const [zones, tables] = [await archive('a/0/1/2'), await archive('a/1/2/7')]
    try { return zones && tables ? wildEncounters(narcFiles(zones)[0], tables) : undefined } catch { return undefined }
  }
  const baseOf = async (archive: (path: string) => Promise<Buffer | null>) => {
    const personal = await archive('a/0/1/6')
    try { return personal ? narcFiles(personal).slice(0, 650).map(p => Array.from(p.subarray(0, 6))) : undefined } catch { return undefined }
  }
  // Species and place names, types, evolution lines, icons, type labels, boss portraits and teams, read from the ROM and cached per fingerprint.
  ipcMain.handle('rom:names', async (event, token: unknown): Promise<GameNames | null> => {
    const rom = window && event.sender === window.webContents && typeof token === 'string' ? roms.get(token) : undefined
    if (!rom) return null
    const cache = join(app.getPath('userData'), 'names', `${rom.sha256}-7.json`)
    try { return JSON.parse(await readFile(cache, 'utf8')) } catch { /* not cached yet */ }
    const file = await open(rom.path, 'r')
    try {
      const read = async (start: number, length: number) => { const b = Buffer.alloc(length); await file.read(b, 0, length, start); return b }
      const header = await read(0, 0x60)
      const fnt = await read(header.readUInt32LE(0x40), header.readUInt32LE(0x44)), fat = await read(header.readUInt32LE(0x48), header.readUInt32LE(0x4c))
      const archive = async (path: string) => { const r = locate(fnt, fat, path); return r ? read(r[0], r[1] - r[0]) : null }
      const text = gameNames(await archive('a/0/0/2'))
      const names = text ? { ...text, types: speciesTypes(await archive('a/0/1/6')), lines: evolutionLines(await archive('a/0/1/9')), icons: await iconsOf(archive), faces: await facesOf(archive), teams: await teamsOf(archive), typeLabels: await labelsOf(archive), categoryIcons: await categoriesOf(archive), base: await baseOf(archive), wild: await wildOf(archive) } : null
      if (names) { await mkdir(join(app.getPath('userData'), 'names'), { recursive: true }); await writeFile(cache, JSON.stringify(names)) }
      return names
    } catch { return null } finally { await file.close() }
  })
  // Music: one sequence from the ROM's own sound archive, by its symbol name.
  const sdats = new Map<string, { start: number } | null>()
  ipcMain.handle('rom:track', async (event, token: unknown, name: unknown) => {
    const rom = window && event.sender === window.webContents && typeof token === 'string' ? roms.get(token) : undefined
    if (!rom || typeof name !== 'string' || !/^SEQ_BGM_[A-Z0-9_]+$/.test(name)) return null
    const file = await open(rom.path, 'r')
    try {
      const read = async (o: number, n: number) => { const b = Buffer.alloc(n); await file.read(b, 0, n, o); return b }
      if (!sdats.has(rom.path)) sdats.set(rom.path, await findSdat(read))
      const sdat = sdats.get(rom.path)
      return sdat ? await readTrack(file, sdat.start, name) : null
    } catch { return null } finally { await file.close() }
  })
  ipcMain.handle('rom:forget', async (event, sha256: unknown) => {
    if (!window || event.sender !== window.webContents || typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) return
    await forget(app.getPath('userData'), sha256)
  })
  ipcMain.handle('rom:inspect', async (event): Promise<InspectResult> => {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
      return { status: 'error', message: 'ROM inspection is only available in the main Tandem window.' }
    }
    if (inspecting) return { status: 'error', message: 'Another ROM is being checked. Wait for it to finish.' }
    inspecting = true
    try {
      const selection = await dialog.showOpenDialog(window, {
        title: 'Choose your base ROM', properties: ['openFile'], filters: [{ name: 'Nintendo DS ROM', extensions: ['nds', 'srl'] }]
      })
      if (selection.canceled || !selection.filePaths[0]) return { status: 'cancelled' }
      const path = selection.filePaths[0]
      const file = await open(path, 'r')
      try {
        const stat = await file.stat()
        if (!stat.isFile()) throw new Error('Select a regular ROM file.')
        const header = Buffer.alloc(0x160)
        const { bytesRead } = await file.read(header, 0, header.length, 0)
        const info = inspectHeader(header.subarray(0, bytesRead), stat.size)
        const hash = createHash('sha256')
        for await (const chunk of file.createReadStream({ start: 0, autoClose: false })) hash.update(chunk)
        const after = await file.stat()
        if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) throw new Error('The ROM changed while it was being checked. Select it again.')
        const sha256 = hash.digest('hex'), token = randomUUID()
        // The library keeps its own copy in the app's data folder; the chosen file is left where it is.
        const kept = join(app.getPath('userData'), 'roms', `${sha256}.nds`)
        if (!existsSync(kept)) { await mkdir(join(app.getPath('userData'), 'roms'), { recursive: true }); await copyFile(path, kept) }
        roms.set(token, { path: kept, sha256, gameCode: info.gameCode })
        const rom = { ...info, name: basename(path), size: stat.size, sha256, token }
        await remember(app.getPath('userData'), { ...info, name: rom.name, size: rom.size, sha256, path: kept, addedAt: Date.now() }).catch(() => {})
        return { status: 'ok', rom }
      } finally { await file.close() }
    } catch (error) {
      // Filesystem errors contain local paths. Keep them out of the renderer.
      const message = error instanceof Error && !('code' in error)
        ? error.message : 'The ROM could not be read. Check that it is downloaded locally and accessible, then try again.'
      return { status: 'error', message }
    } finally { inspecting = false }
  })
  ipcMain.handle('emulator:start', async (event, token: unknown, runId: unknown): Promise<StartResult> => {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return { status: 'error', message: 'Play is only available in the main Tandem window.' }
    const rom = typeof token === 'string' ? roms.get(token) : undefined
    if (!rom) return { status: 'error', message: 'Choose the ROM again before playing.' }
    if (process.platform !== 'win32' || !existsSync(corePath())) return { status: 'error', message: 'The DS emulator core is not installed for this platform.' }
    stopEmulator()
    const data = app.getPath('userData')
    const run = typeof runId === 'string' ? (await readRuns(data)).find(r => r.id === runId && !r.endedAt && r.romSha === rom.sha256) : undefined
    if (run) await mkdir(join(data, 'runs'), { recursive: true })
    const config: EmulatorConfig = {
      core: corePath(), rom: rom.path,
      save: run ? runSave(data, run.id) : savePath(rom),
      systemDir: join(data, 'emulator', 'system'), saveDir: join(data, 'emulator', 'saves'),
      warmToTitle: /^IR[DE]/.test(rom.gameCode),
      hold: true
    }
    const child = utilityProcess.fork(join(__dirname, 'emulator.js'), [], { serviceName: 'Tandem emulator', stdio: process.env.TANDEM_EMULATOR_LOG ? 'inherit' : 'ignore' })
    emulator = child
    child.once('exit', () => { if (emulator === child) emulator = null })
    const { port1, port2 } = new MessageChannelMain()
    child.postMessage(config, [port1])
    window.webContents.postMessage('emulator:port', null, [port2])
    return { status: 'ok' }
  })
  ipcMain.handle('emulator:stop', event => {
    if (!window || event.sender !== window.webContents) return
    stopEmulator()
  })
  app.on('before-quit', stopEmulator)
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
