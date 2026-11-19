import {_electron as electron} from '@playwright/test';import assert from 'node:assert/strict'
const env={...process.env,TANDEM_NO_SPLASH:'1',TANDEM_WINDOWED:'1'};delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({args:['.'],env});try{
const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message))
await page.locator('.ds-scene[data-loaded=true]').nth(1).waitFor();await page.locator('.ds-scene[data-cartridge-loaded=true]').waitFor();await page.locator('.ds-scene[data-lighting-loaded=true]').nth(1).waitFor();await page.waitForTimeout(300)
await page.screenshot({path:'work/review/ds-desktop.png'})
const local=page.locator('.ds-scene').first()
await local.click();await page.waitForTimeout(200);assert.equal(await local.getAttribute('data-insertion'),null,'Scene click must not insert')
await local.focus();await page.keyboard.press('Enter');await page.waitForTimeout(100);assert.equal(await local.getAttribute('data-insertion'),null,'Scene Enter must not insert')

await page.getByRole('button',{name:'Play',exact:true}).click();await page.waitForTimeout(1600);await page.screenshot({path:'work/review/ds-inserting.png'})
await page.locator('.ds-scene[data-insertion=seated]').waitFor();await page.screenshot({path:'work/review/ds-seated.png'})
await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(760,620));await page.screenshot({path:'work/review/ds-minimum.png'})
assert.deepEqual(errors,[]);console.log('PASS: two sourced DS models, insertion animation completes, no runtime errors')
}finally{await app.close()}
