import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { forget, readLibrary, remember, stillThere, type LibraryEntry } from '../src/main/library'

const entry = (sha256: string, path: string, size = 4): LibraryEntry => ({
  sha256, path, size, name: 'game.nds', game: 'Black 2', gameCode: 'IREO', revision: 0, language: 'English', addedAt: 1
})

describe('ROM library', () => {
  it('keeps one entry per fingerprint, most recent first', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tandem-library-'))
    await remember(dir, entry('a'.repeat(64), '/one'))
    await remember(dir, entry('b'.repeat(64), '/two'))
    await remember(dir, entry('a'.repeat(64), '/moved'))
    const list = await readLibrary(dir)
    expect(list.map(e => e.path)).toEqual(['/moved', '/two'])
  })
  it('forgets an entry', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tandem-library-'))
    await remember(dir, entry('a'.repeat(64), '/one'))
    await forget(dir, 'a'.repeat(64))
    expect(await readLibrary(dir)).toEqual([])
  })
  it('reads an empty library when the file is missing or malformed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tandem-library-'))
    expect(await readLibrary(dir)).toEqual([])
    await writeFile(join(dir, 'library.json'), '{not json')
    expect(await readLibrary(dir)).toEqual([])
  })
  it('notices a moved or resized file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tandem-library-'))
    const path = join(dir, 'game.nds')
    await writeFile(path, 'abcd')
    expect(await stillThere(entry('a'.repeat(64), path, 4))).toBe(true)
    expect(await stillThere(entry('a'.repeat(64), path, 8))).toBe(false)
    expect(await stillThere(entry('a'.repeat(64), join(dir, 'gone.nds')))).toBe(false)
  })
})
