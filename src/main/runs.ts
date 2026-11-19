import { readFile, rename, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { Run } from '../shared/run'

/**
 * Runs and the local profile, in the app's data folder. Each run's cartridge save is runs/<id>.sav; each game has at
 * most one active solo run, and each partner one Soul Link session. Ending a run keeps its record and save.
 */

const runsFile = (userData: string) => join(userData, 'runs.json')
const profileFile = (userData: string) => join(userData, 'profile.json')
export const runSave = (userData: string, id: string) => join(userData, 'runs', `${id}.sav`)

async function writeJson(target: string, value: unknown) {
  const temp = `${target}.tmp`
  await writeFile(temp, JSON.stringify(value, null, 2))
  await rename(temp, target)
}

export async function readRuns(userData: string): Promise<Run[]> {
  try { const runs = JSON.parse(await readFile(runsFile(userData), 'utf8')); return Array.isArray(runs) ? runs.filter(r => r && typeof r.id === 'string') : [] } catch { return [] }
}

/** Adds a run. A new solo run ends the active one on the same game; a Soul Link session ends any earlier one with the same partner. */
export async function addRun(userData: string, run: Run) {
  await mkdir(join(userData, 'runs'), { recursive: true })
  const now = Date.now()
  const runs = (await readRuns(userData)).map(r => !r.endedAt && r.mode === run.mode && (r.mode === 'solo' ? r.romSha === run.romSha : r.partner === run.partner)
    ? { ...r, endedAt: now, result: 'abandoned' as const, events: [...r.events, { at: now, kind: 'ended' as const, result: 'abandoned' as const }] } : r)
  await writeJson(runsFile(userData), [run, ...runs])
  return run
}

/** Replaces a run's record; the id, mode, partner, ROM and creation time cannot change. */
export async function saveRun(userData: string, run: Run) {
  const runs = await readRuns(userData), at = runs.findIndex(r => r.id === run.id)
  if (at < 0) return
  const old = runs[at]
  runs[at] = { ...run, id: old.id, mode: old.mode, partner: old.partner, romSha: old.romSha, createdAt: old.createdAt }
  await writeJson(runsFile(userData), runs)
}

/** Your name and, when you chose one, your photo as a small image data URL. */
export type StoredProfile = { name: string; photo?: string }

export const isPhoto = (v: unknown): v is string => typeof v === 'string' && v.length < 400_000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v)

export async function readProfile(userData: string): Promise<StoredProfile | null> {
  try {
    const p = JSON.parse(await readFile(profileFile(userData), 'utf8'))
    if (typeof p?.name !== 'string' || !p.name.trim()) return null
    return { name: p.name.trim().slice(0, 16), ...(isPhoto(p.photo) ? { photo: p.photo } : {}) }
  } catch { return null }
}

export async function saveProfile(userData: string, profile: StoredProfile) {
  await writeJson(profileFile(userData), { name: profile.name.trim().slice(0, 16), ...(isPhoto(profile.photo) ? { photo: profile.photo } : {}), updatedAt: Date.now() })
}
