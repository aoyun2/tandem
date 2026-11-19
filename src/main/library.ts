import { readFile, rename, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { RomInfo } from '../shared/api'

/** A ROM the player has opened before. The path stays in the main process. */
export type LibraryEntry = Omit<RomInfo, 'token'> & { path: string; addedAt: number }

const file = (userData: string) => join(userData, 'library.json')

export async function readLibrary(userData: string): Promise<LibraryEntry[]> {
  try {
    const entries = JSON.parse(await readFile(file(userData), 'utf8'))
    return Array.isArray(entries) ? entries.filter(e => e && typeof e.path === 'string' && typeof e.sha256 === 'string') : []
  } catch { return [] }
}

async function writeLibrary(userData: string, entries: LibraryEntry[]) {
  const target = file(userData), temp = `${target}.tmp`
  await writeFile(temp, JSON.stringify(entries, null, 2))
  await rename(temp, target)
}

/** Adds or refreshes an entry, keyed by the file's fingerprint; the most recent sits first. */
export async function remember(userData: string, entry: LibraryEntry) {
  const entries = (await readLibrary(userData)).filter(e => e.sha256 !== entry.sha256)
  await writeLibrary(userData, [entry, ...entries])
}

export async function forget(userData: string, sha256: string) {
  await writeLibrary(userData, (await readLibrary(userData)).filter(e => e.sha256 !== sha256))
}

/** True when the file is still where it was, with the same size. The fingerprint is not recomputed. */
export async function stillThere(entry: LibraryEntry) {
  try { const s = await stat(entry.path); return s.isFile() && s.size === entry.size } catch { return false }
}
