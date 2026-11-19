import { _electron as electron } from '@playwright/test'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

// Setup scene, cancellable launch, play view boot and HUD. Synthetic ROM header only; no game runs.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const env = { ...process.env, TANDEM_NO_SPLASH: '1', TANDEM_WINDOWED: '1', TANDEM_USER_DATA: mkdtempSync(join(tmpdir(), 'tandem-smoke-')) }; delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ args: ['.'], env })
const errors = []
try {
  const page = await app.firstWindow()
  page.on('pageerror', e => errors.push(e.message))
  const scene = page.locator('.ds-scene')
  await page.locator('.ds-scene[data-loaded=true][data-lighting-loaded=true]').waitFor({ timeout: 30000 })
  const selectable = await page.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.body); const s = getSelection(); s.removeAllRanges(); s.addRange(r); const n = s.toString().trim().length; s.removeAllRanges(); return n })
  assert.equal(selectable, 0, 'interface text is not selectable')
  const welcome = page.getByRole('dialog', { name: 'Welcome' })
  await welcome.waitFor({ timeout: 5000 })
  await welcome.getByRole('textbox').fill('Smoke')
  await welcome.getByRole('button', { name: 'Continue' }).click()
  await welcome.getByRole('heading', { name: 'Welcome, Smoke' }).waitFor()
  await welcome.getByRole('button', { name: 'Later' }).click()
  await welcome.waitFor({ state: 'detached' })
  // The main menu is out from the start; Solo enters the solo stage.
  await page.getByRole('button', { name: 'Solo' }).click()
  await page.locator('.setup-stage[data-stage=mode]').waitFor()
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }) }, resolve('work/synthetic-header.nds'))
  await page.getByRole('button', { name: 'Add ROM' }).click()
  await page.locator('.ds-scene[data-cartridge-loaded=true]').waitFor()
  await page.locator('.ds-scene[data-rotation]').waitFor()
  const initial = await scene.getAttribute('data-rotation')
  const box = await scene.boundingBox()
  await scene.focus(); await page.keyboard.press('ArrowLeft')
  await page.waitForFunction(was => document.querySelector('.ds-scene')?.dataset.rotation !== was, initial, { timeout: 3000 }).catch(() => {})
  assert.notEqual(await scene.getAttribute('data-rotation'), initial, 'arrow keys rotate the cartridge')
  await page.keyboard.press('Home'); await page.waitForTimeout(80)
  await page.getByRole('button', { name: 'Start run' }).click(); await page.waitForTimeout(400)
  await page.getByRole('region', { name: 'New run' }).getByRole('button', { name: 'Start run' }).click(); await page.waitForTimeout(600)
  assert.equal(await page.locator('.setup-stage.launching').count(), 1)
  await page.keyboard.press('Escape'); await page.waitForTimeout(150)
  assert.equal(await scene.getAttribute('data-insertion'), null, 'Escape cancels insertion')
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  const view = page.getByRole('region', { name: 'Play' }); await view.waitFor({ timeout: 10000 })
  await page.waitForFunction(() => document.querySelector('.play-view')?.dataset.boot === 'done', null, { timeout: 15000 })
  assert.equal(await page.locator('.cockpit-canvas').count(), 1)
  for (const t of [0.5, 1, 1.4, 2]) { await page.evaluate(t => document.querySelector('.play-view').tandemDisplay.seek(t), t); await page.waitForTimeout(40) }
  await page.evaluate(() => document.querySelector('.play-view').tandemDisplay.seek(null))
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.locator('.play-hud[data-visible=true]').waitFor()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(760, 620)); await page.waitForTimeout(200)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), true)
  await page.keyboard.press('Escape')
  await page.locator('.ds-scene[data-cartridge-loaded=true]').waitFor()
  assert.deepEqual(errors, [])
  console.log('PASS: no selectable UI text, onboarding, main menu, new run, cartridge keyboard rotation, Escape cancels insertion, play boot, HUD, minimum window, Escape exits. Synthetic header only.')
} finally { await app.close() }
