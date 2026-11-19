import { contextBridge, ipcRenderer } from 'electron'
import type { TandemAPI } from '../shared/api'

const api: TandemAPI = {
  windowControl: action => ipcRenderer.invoke('window:control', action),
  inspectRom: () => ipcRenderer.invoke('rom:inspect'),
  library: () => ipcRenderer.invoke('rom:library'),
  forgetRom: sha256 => ipcRenderer.invoke('rom:forget', sha256),
  romDetails: token => ipcRenderer.invoke('rom:details', token),
  revealRom: (token, what) => ipcRenderer.invoke('rom:reveal', token, what),
  startEmulator: (token, runId) => ipcRenderer.invoke('emulator:start', token, runId),
  stopEmulator: () => ipcRenderer.invoke('emulator:stop'),
  appReady: () => ipcRenderer.invoke('app:ready'),
  profile: () => ipcRenderer.invoke('app:profile'),
  setProfile: name => ipcRenderer.invoke('app:setProfile', name),
  runs: () => ipcRenderer.invoke('runs:list'),
  createRun: request => ipcRenderer.invoke('runs:create', request),
  saveRun: run => ipcRenderer.invoke('runs:save', run),
  names: token => ipcRenderer.invoke('rom:names', token),
  track: (token, name) => ipcRenderer.invoke('rom:track', token, name),
  platform: process.platform
}
contextBridge.exposeInMainWorld('tandem', api)
ipcRenderer.on('emulator:port', event => window.postMessage({ tandem: 'emulator-port' }, '*', event.ports))
