/** App settings kept on this computer: music and effects volume, and the 3D scenes' graphics quality. */
export type Settings = { music: number; effects: number; quality: 'balanced' | 'high' }

const DEFAULTS: Settings = { music: .55, effects: .9, quality: 'high' }
const listeners = new Set<(s: Settings) => void>()

export function settings(): Settings {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('settings') || '{}') } } catch { return { ...DEFAULTS } }
}

export function changeSettings(patch: Partial<Settings>) {
  const next = { ...settings(), ...patch }
  try { localStorage.setItem('settings', JSON.stringify(next)) } catch { /* storage unavailable */ }
  for (const l of listeners) l(next)
}

/** Calls `fn` now and whenever the settings change; returns its removal. */
export function watchSettings(fn: (s: Settings) => void) { listeners.add(fn); fn(settings()); return () => { listeners.delete(fn) } }

/** Pixels each 3D scene may draw per frame for the chosen quality. */
export const pixelBudget = () => settings().quality === 'high' ? 4e6 : 2.2e6
