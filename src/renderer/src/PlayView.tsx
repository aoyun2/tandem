import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ArrowLeft, Eye, Settings2, Volume1, Volume2, VolumeX, X } from 'lucide-react'
import { Cockpit, type CockpitLayout } from './cockpit/Cockpit'
import { EmulatorSession } from './emulator/session'
import { KeyGuide } from './KeyGuide'
import { keepSaveShot } from './LibraryView'
import { RunMoments, RunScene } from './RunView'
import { SettingsPanel } from './SettingsPanel'
import type { GameState } from '../../shared/run'
import { track, type Run } from '../../shared/run'
import type { GameNames } from '../../shared/api'

const HUD_IDLE_MS = 2600

/** One screen of a frame as a PNG: the top half, or the bottom (touch) half. */
function screenImage(width: number, height: number, pixels: Uint8Array, bottom: boolean) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height / 2
  const half = width * height * 2, start = bottom ? half : 0
  const image = new ImageData(Uint8ClampedArray.from(pixels.subarray(start, start + half)), width, height / 2)
  canvas.getContext('2d')!.putImageData(image, 0, 0)
  return canvas.toDataURL('image/png')
}

function storedVolume() { try { const v = localStorage.getItem('volume'); return v !== null && Number.isFinite(Number(v)) ? Number(v) : .8 } catch { return .8 } }

export function PlayView({ session: emulator, onExit, player, partner, romSha, solo = false, run, names, onRun }: { session: EmulatorSession | null; onExit: () => void; player: string; partner: string | null; romSha?: string; solo?: boolean; run?: Run | null; names?: GameNames | null; onRun?: (run: Run) => void }) {
  const runRef = useRef(run ?? null); runRef.current = run ?? null
  const runTo = useRef(onRun); runTo.current = onRun
  const namesRef = useRef(names); namesRef.current = names
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [game, setGame] = useState<GameState | null>(null)
  useEffect(() => {
    if (!settingsOpen) return
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); setSettingsOpen(false) } }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [settingsOpen])
  const view = useRef<HTMLElement>(null), stage = useRef<HTMLDivElement>(null)
  const cockpit = useRef<Cockpit | null>(null)
  const [boot, setBoot] = useState<'booting' | 'done'>('booting')
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [volume, setVolume] = useState(storedVolume)
  const [muted, setMuted] = useState(false)
  const [hud, setHud] = useState(false)
  const [focus, setFocus] = useState<'local' | 'partner'>('local')
  const [layout, setLayout] = useState<CockpitLayout>({ partner: null, front: null, localBottom: null })
  const lastLayout = useRef('')

  useEffect(() => {
    const host = stage.current!, root = view.current!
    let deck: Cockpit, latest: { width: number; height: number; pixels: Uint8Array } | null = null
    const layoutChanged = (next: CockpitLayout) => {
      const key = JSON.stringify([next.partner && [next.partner.x, next.partner.y, next.partner.width].map(Math.round), next.localBottom && [next.localBottom.x, next.localBottom.y].map(Math.round), next.front && [next.front.right, next.front.bottom].map(Math.round), next.stations && [next.stations.local.x, next.stations.local.y, next.stations.partner?.x ?? 0, next.stations.partner?.y ?? 0].map(Math.round)])
      if (key !== lastLayout.current) { lastLayout.current = key; setLayout(next) }
    }
    try { deck = new Cockpit(host, setBoot, layoutChanged, matchMedia('(prefers-reduced-motion: reduce)').matches, emulator ? 6000 : 0, solo) }
    catch { setBoot('done'); return }
    cockpit.current = deck
    // When the screens' pictures are in, the keyboard powers on and the game starts, with its music from the top.
    deck.onPicture = () => { setReady(true); emulator?.begin() }
    Object.assign(root, { tandemDisplay: deck })
    if (emulator) {
      // Game audio stays silent while the screens power on, then fades in.
      emulator.silence()
      emulator.attach(host, {
        frame: (width, height, pixels) => {
          deck.setFrame('local', width, height, pixels)
          latest = { width, height, pixels }
        },
        status: status => {
          if (status.state === 'error') { setError(status.message ?? 'The game could not start.'); deck.beginBoot() }
          if (status.state === 'running') root.dataset.emulator = 'running'
          if (status.fps) root.dataset.fps = status.fps.toFixed(1)
          if (status.savedAt) {
            root.dataset.savedAt = String(status.savedAt)
            // Both screens as the game saves become this ROM's pictures in the library and on the console at Home.
            if (romSha && latest) keepSaveShot(romSha, { top: screenImage(latest.width, latest.height, latest.pixels, false), bottom: screenImage(latest.width, latest.height, latest.pixels, true) })
          }
          if (status.save) root.dataset.save = status.save
          if (status.audio) root.dataset.audio = status.audio
        },
        // Each reading of the game moves the run on; what happened shows as moments.
        game: state => {
          root.dataset.trainer = state.trainer?.name ?? ''
          setGame(state)
          const current = runRef.current
          if (!current) return
          const next = track(current, state, Date.now(), { types: namesRef.current?.types, lines: namesRef.current?.lines })
          if (next.run !== current) { runRef.current = next.run; runTo.current?.(next.run) }
        }
      }, (x, y) => deck.touchPoint(x, y))
    }
    return () => { emulator?.detach(); deck.dispose(); cockpit.current = null }
  }, [emulator, solo])

  useEffect(() => { emulator?.setInputEnabled(focus === 'local'); cockpit.current?.setFocus(focus) }, [focus, emulator])
  useEffect(() => {
    emulator?.setVolume(muted ? 0 : volume)
    try { localStorage.setItem('volume', String(volume)) } catch { /* storage unavailable */ }
  }, [emulator, volume, muted])

  useEffect(() => {
    if (boot !== 'done') return
    const host = view.current!
    let timer = 0
    const wake = () => {
      setHud(true)
      clearTimeout(timer)
      timer = window.setTimeout(() => { if (!host.querySelector('.play-hud:focus-within, .play-hud:hover, .play-volume:focus-within, .play-volume:hover, .spectate:hover')) setHud(false) }, HUD_IDLE_MS)
    }
    wake()
    host.addEventListener('pointermove', wake)
    host.addEventListener('focusin', wake)
    return () => { clearTimeout(timer); host.removeEventListener('pointermove', wake); host.removeEventListener('focusin', wake) }
  }, [boot])

  const level = muted ? 0 : volume
  const VolumeIcon = level === 0 ? VolumeX : level < .5 ? Volume1 : Volume2
  const side = layout.partner
  return <section className="play-view" ref={view} data-boot={boot} aria-label="Play">
    <div className="cockpit-stage" ref={stage} role="img" aria-label={focus === 'local' ? 'Your screens, with your partner\'s view to the right' : 'Your partner\'s screens, with yours to the side'}/>
    {layout.stations && player && <span className="pair-tag" data-player="local" style={{ left: layout.stations.local.left, top: layout.stations.local.top - (focus === 'local' ? 30 : 26) }}>{player}</span>}
    {layout.stations?.partner && partner && <span className="pair-tag" data-player="partner" style={{ left: layout.stations.partner.left, top: layout.stations.partner.top - (focus === 'partner' ? 30 : 26) }}>{partner}{focus === 'partner' && <em> · spectating</em>}</span>}
    {side && <button className="hud-button spectate" data-visible={hud || focus === 'partner'} style={{ left: side.right + 10, top: side.top - 4 }} onClick={() => setFocus(focus === 'local' ? 'partner' : 'local')} aria-pressed={focus === 'partner'} aria-label={focus === 'local' ? 'Spectate partner' : 'Back to your view'} title={focus === 'local' ? 'Spectate' : 'Your view'}><Eye size={16} strokeWidth={1.75}/></button>}
    {ready && emulator && layout.stations && <div className="key-strip-anchor" data-hidden={focus !== 'local'} style={{ left: layout.stations.local.x + layout.stations.local.width / 2, top: layout.stations.local.bottom }}><KeyGuide/></div>}
    {error && <p className="play-error" role="alert">{error}</p>}
    {run && <RunMoments events={run.events} names={names ?? null}/>}
    {run && ready && game?.trainer?.name && layout.front && <RunScene run={run} game={game} names={names ?? null} front={layout.front}/>}
    {settingsOpen && <div className="cockpit-settings" role="dialog" aria-label="Settings">
      <button className="hud-button cockpit-settings-close" onClick={() => setSettingsOpen(false)} aria-label="Close"><X size={16}/></button>
      <SettingsPanel/>
    </div>}
    <div className="play-hud" data-visible={hud}>
      <button className="hud-button" onClick={onExit} aria-label="Back to setup" title="Back (Esc)"><ArrowLeft size={16} strokeWidth={1.75}/></button>
      <button className="hud-button" onClick={() => setSettingsOpen(true)} aria-label="Settings" title="Settings"><Settings2 size={16} strokeWidth={1.75}/></button>
    </div>
    {layout.front && <div className="play-volume" data-visible={hud} style={{ left: layout.front.right + 14, top: layout.front.bottom - 32 }}>
      <div className="hud-volume">
        <input className="hud-slider" type="range" min={0} max={1} step={.01} value={level} aria-label="Volume" style={{ '--level': level } as CSSProperties}
          onChange={event => { setVolume(Number(event.target.value)); setMuted(false) }} onPointerUp={event => event.currentTarget.blur()}/>
        <button className="hud-button" onClick={() => setMuted(!muted)} aria-label={muted ? 'Unmute' : 'Mute'} aria-pressed={muted}><VolumeIcon size={16} strokeWidth={1.75}/></button>
      </div>
    </div>}
  </section>
}
