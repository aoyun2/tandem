import { _electron as electron } from '@playwright/test'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

await mkdir('work/review', { recursive: true })
const bytes = Buffer.alloc(4096)
bytes.write('IREO', 12)
bytes.writeUInt32LE(4096, 0x80)
for (const offset of [0x20, 0x30]) { bytes.writeUInt32LE(0x200, offset); bytes.writeUInt32LE(128, offset + 12) }
let crc = 0xffff
for (const byte of bytes.subarray(0, 0x15e)) { crc ^= byte; for (let i=0;i<8;i++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1 }
bytes.writeUInt16LE(crc, 0x15e)
const fixture = resolve('work/synthetic-header.nds')
await writeFile(fixture, bytes)
const hash = createHash('sha256').update(bytes).digest('hex')
const env = { ...process.env, TANDEM_NO_SPLASH: "1", TANDEM_WINDOWED: "1" }; delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ args: ['.'], env })
const errors = []
try {
  const page = await app.firstWindow()
  page.on('pageerror', error => errors.push(error.message))
  await page.getByRole('heading', { name: 'Set up', exact: true }).waitFor()
  assert.equal(await page.evaluate(() => typeof window.tandem?.inspectRom), 'function')
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined')
  await page.evaluate(() => document.fonts.ready)
  await page.locator('.ds-scene[data-loaded="true"]').first().waitFor()
  await page.locator('.ds-scene[data-cartridge-loaded="true"]').waitFor()
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'work/review/desktop.png', fullPage: true })
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(800, 800))
  await page.screenshot({ path: 'work/review/compact.png', fullPage: true })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), true)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1320, 900))
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }) }, fixture)
  await page.getByRole('button', { name: 'Choose base ROM' }).click()
  await page.getByText('ROM details', { exact: true }).click()
  await page.getByText('Header and file structure checked. Emulator compatibility not checked.', {exact:true}).waitFor()
  assert.equal(await page.locator('code').innerText(), hash)
  assert.equal(createHash('sha256').update(await readFile(fixture)).digest('hex'), hash)
  await page.screenshot({ path: 'work/review/inspected.png', fullPage: true })
  await page.locator('.shared-scene[data-screens-loaded=true]').waitFor()
  assert.equal(await page.locator('.object-controls').count(), 0)
  assert.equal(await page.locator('video').count(), 0)
  await page.screenshot({ path: 'work/review/connection.png', fullPage: true })
  await page.getByRole('button', { name: 'Controls', exact: true }).click()
  assert.equal(await page.locator('.key-grid').count(), 0)
  await page.locator('.keyboard-scene[data-loaded=true]').waitFor()
  await page.screenshot({ path: 'work/review/controls.png', fullPage: true })
  await page.getByRole('button', { name: 'Set up', exact: true }).click()
  await page.locator('.ds-scene[data-cartridge-loaded="true"]').waitFor()
  assert.equal(await page.locator('.ds-scene[data-insertion]').count(), 0, 'Selecting a ROM does not insert it')
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.getByRole('region', { name: 'Play layout preview' }).waitFor()
  await page.screenshot({ path: 'work/review/ds-play.png', fullPage: true })
  await page.getByRole('button', { name: 'Back to setup' }).click()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(760, 620))
  await page.getByRole('button', { name: 'Set up', exact: true }).click()
  assert.equal(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight), true)
  await page.locator('.ds-scene[data-loaded="true"]').first().waitFor()
  for (const expanded of [false, true]) {
    if (expanded) await page.getByText('ROM details', { exact: true }).click()
    assert.equal(await page.locator('#your-game').evaluate(el => {
      const heading = el.getBoundingClientRect(), panel = el.closest('.setup-stage').getBoundingClientRect()
      return heading.top >= panel.top && heading.bottom <= panel.bottom && el.closest('.setup-stage').scrollHeight <= el.closest('.setup-stage').clientHeight + 1
    }), true, 'Your game heading and panel content fit')
    await page.screenshot({ path: `work/review/minimum${expanded ? '-expanded' : ''}.png`, fullPage: true })
  }
  await page.getByRole('button', { name: 'Toggle fullscreen' }).click()
  await page.waitForFunction(() => innerWidth >= 760)
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()), true)
  await page.screenshot({ path: 'work/review/fullscreen.png', fullPage: true })
  await page.getByRole('button', { name: 'Toggle fullscreen' }).click()
  assert.deepEqual(errors, [])
  console.log('PASS: Electron startup, isolated bridge, ROM dialog/inspection, read-only SHA-256, compact layout, DS models, Play-only cartridge insertion, removed demo, sourced interactive keyboard, fullscreen controls; synthetic fixture only.')
} finally { await app.close() }
