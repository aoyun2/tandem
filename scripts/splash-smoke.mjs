import {_electron as electron, expect} from '@playwright/test';
import assert from 'node:assert/strict';
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.TANDEM_NO_SPLASH;
const app=await electron.launch({args:['.'],env});
try{
const splash=await app.firstWindow();
await splash.locator('svg').waitFor();
await splash.screenshot({path:'work/review/splash.png'});
await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().filter(w=>w.isVisible()).length),{timeout:12000}).toBe(1);
await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.isVisible() && !w.webContents.getURL().includes('splash'))),{timeout:12000}).toBe(true);
assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),1);
console.log('PASS: splash displays then closes, main window becomes visible.');
}finally{await app.close()}
