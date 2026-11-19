import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { ArrowLeft, Award, Copy, Globe, LayoutGrid, Monitor, Play, Plus, RotateCcw, Skull, Unlink } from 'lucide-react'
import type { LibraryRom, RomInfo } from '../../shared/api'
import type { PartnerDetails } from './DSPreview'
import { LibraryView } from './LibraryView'
import { NewRun } from './NewRun'
import { TYPE_COLORS } from './pokemonTypes'
import { MonIcon } from './MonIcon'
import type { Rules, Run } from '../../shared/run'
import type { GameNames } from '../../shared/api'

export type Room = { mode: 'menu' } | { mode: 'host'; code: string } | { mode: 'join'; code: string; tried: boolean }
/** A run on your own, or a Soul Link with a partner. */
export type RunMode = 'solo' | 'soul-link'

type Props = {
  mode: RunMode; onMode: (mode: RunMode) => void
  /** The run on the game in the slot, and an active run on another game that a new run would end. */
  run: Run | null; otherRun: Run | null; names: GameNames | null; runs: Run[]
  sheet: boolean; onSheet: (open: boolean) => void; onStartRun: (rules: Rules) => void; onBack: () => void
  rom: RomInfo | null; library: LibraryRom[]; link: 'idle' | 'connecting' | 'linked'; partner: PartnerDetails; room: Room
  busy: boolean; launching: boolean; error: string
  libraryOpen: boolean
  onAdd: () => void; onLibrary: () => void; onCloseLibrary: () => void; onPlayRom: (rom: LibraryRom) => void; onForget: (rom: LibraryRom) => void; onPlay: () => void
  onHost: () => void; onJoin: () => void; onStartJoin: () => void; onCancel: () => void; onTest: () => void
}

/** Connection strength from the measured round trip; hollow when nothing has been measured. */
function Signal({ ping }: { ping: number | null }) {
  const bars = ping === null ? 0 : ping < 60 ? 4 : ping < 120 ? 3 : ping < 220 ? 2 : 1
  return <span className="signal" data-measured={ping !== null} title={ping === null ? 'Not measured' : `${Math.round(ping)} ms`}>
    {[1, 2, 3, 4].map(n => <b key={n} data-on={n <= bars} style={{ height: 3 + n * 2.5 }}/>)}
  </span>
}

const art = (game: string) => new URL(`./art/${game === 'White 2' ? 'white2' : 'black2'}.png`, document.baseURI).href

/**
 * The island above your console in setup: the game in the slot, the run mode, and in Soul Link the room and partner; on the Library tab it
 * expands into every ROM you have opened. The room code itself shows
 * on the DS top screen. The island tilts a little down towards you, leans towards the pointer, and resizes smoothly as
 * its content changes.
 */
export function Island({ mode, onMode: _onMode, onBack, run, otherRun, names, runs, sheet, onSheet, onStartRun, rom, library, libraryOpen, link, partner, room, busy, launching, error, onAdd, onLibrary, onCloseLibrary, onPlayRom, onForget, onPlay, onHost, onJoin, onStartJoin, onCancel, onTest }: Props) {
  const outer = useRef<HTMLElement>(null), inner = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ width: number; height: number }>()
  useLayoutEffect(() => {
    const el = inner.current!
    let settle = 0
    const measure = () => {
      setSize({ width: el.offsetWidth, height: el.offsetHeight })
      // The content fades out while the outline morphs to its new size, then back in.
      const host = outer.current!; host.dataset.morphing = 'true'; clearTimeout(settle); settle = window.setTimeout(() => { delete host.dataset.morphing }, 380)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(el); measure()
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const el = outer.current!
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect(), x = (e.clientX - (r.left + r.width / 2)) / innerWidth, y = (e.clientY - (r.top + r.height / 2)) / innerHeight
      el.style.setProperty('--lean-y', `${(x * 8).toFixed(2)}deg`); el.style.setProperty('--lean-x', `${(-y * 5).toFixed(2)}deg`)
    }
    window.addEventListener('pointermove', move)
    return () => window.removeEventListener('pointermove', move)
  }, [])
  const linked = link === 'linked'
  const team = run ? Object.values(run.pokemon).filter(p => p.status === 'alive' && !p.boxed).slice(0, 6) : []
  const fallen = run ? Object.values(run.pokemon).filter(p => p.status === 'dead').length : 0
  // A run is needed to play solo, or with a linked partner; Soul Link without one plays untracked.
  const needsRun = mode === 'solo' || link === 'linked'
  return <aside className="island" ref={outer} data-game={!!rom} data-link={link} data-mode={mode} data-sheet={sheet} data-library={libraryOpen} style={{ ...size, ...(size ? { '--island-h': `${size.height}px` } : {}), ...(rom ? { '--art': `url(${art(rom.game)})` } : {}) } as CSSProperties} aria-label="Game and partner">
      <div className="island-inner" ref={inner}>
        {sheet && rom ? <NewRun game={rom.game} partner={mode === 'soul-link' ? partner.name : undefined} replacing={(run ?? otherRun) ? (run ?? otherRun)!.game : undefined} onStart={onStartRun} onCancel={() => onSheet(false)}/>
        : libraryOpen ? <LibraryView library={library} current={rom} busy={busy} error={error} onPlay={onPlayRom} onAdd={onAdd} onForget={onForget} onClose={onCloseLibrary} runs={runs}/> : <>
        <button className="island-back" onClick={onBack} title="Main menu" aria-label="Main menu"><ArrowLeft size={17}/></button>
        <section className="island-game">
          {rom ? <>
            <img className="island-capsule" src={art(rom.game)} alt=""/>
            <div className="island-title">
              <h2>Pokémon {rom.game}</h2>
              {run && <div className="island-run">
                <span className="island-team" aria-label="Team">{team.map((p, i) => names?.icons?.[p.species]
                  ? <i key={i} data-icon title={`${p.nickname || names.species[p.species]}${p.level ? ` · Lv ${p.level}` : ''}`}><MonIcon names={names} species={p.species}/></i>
                  : <i key={i} title={names?.species[p.species]} style={{ '--type': TYPE_COLORS[names?.types?.[p.species]?.[0] ?? 0] } as CSSProperties}>{p.nickname || names?.species[p.species]}{p.level ? <b>{p.level}</b> : null}</i>)}</span>
                <span className="island-count" title="Badges" data-on={run.badges > 0}><Award size={14}/>{run.badges}</span>
                {fallen > 0 && <span className="island-count island-fallen" title="Fallen"><Skull size={13}/>{fallen}</span>}
              </div>}
            </div>
            <div className="island-actions">
              {needsRun && !run
                ? <button className="island-play" data-confirm disabled={busy || launching} onClick={() => onSheet(true)}><Play size={16}/>Start run</button>
                : <button className="island-play" data-confirm disabled={busy || launching} onClick={onPlay}><Play size={16}/>Play</button>}
              {run && <button className="island-icon" disabled={launching} onClick={() => onSheet(true)} title="New run" aria-label="New run"><RotateCcw size={15}/></button>}
              <button className="island-chip" disabled={launching} onClick={onLibrary}><LayoutGrid size={15}/>Library</button>
            </div>
          </> : library.some(r => !r.missing) ? <div className="island-shelf" aria-label="Your games">
            {library.filter(r => !r.missing).filter((r, i, all) => all.findIndex(o => o.game === r.game) === i).map(r =>
              <button key={r.sha256} className="island-cover" data-confirm onClick={() => onPlayRom(r)} title={`Pokémon ${r.game}`} aria-label={`Pokémon ${r.game}`}><img src={art(r.game)} alt=""/></button>)}
            <button className="island-chip" onClick={onLibrary}><LayoutGrid size={15}/>Library</button>
          </div> : <div className="island-actions">
            <button className="island-play" disabled={busy} onClick={onAdd}>{busy ? <span className="spinner"/> : <Plus size={16}/>}Add ROM</button>
          </div>}
          {error && <p className="island-error" role="alert">{error}</p>}
        </section>
        <section className="island-partner">
          {mode === 'soul-link' && <>
          {room.mode === 'host' ? <>
            <div className="island-status island-open"><i/>Room open</div>
            <p className="island-note">Online rooms are not connected yet.</p>
            <div className="island-actions">
              <button className="island-chip" onClick={() => void navigator.clipboard?.writeText(room.code)}><Copy size={14}/>Copy code</button>
              <button className="island-quiet" onClick={onCancel}>Cancel</button>
            </div>
          </>
          : room.mode === 'join' ? <>
            {room.tried && <p className="island-note">Online rooms are not connected yet.</p>}
            <div className="island-actions">
              <button className="island-play" disabled={room.code.length < 6} onClick={onJoin}>Join</button>
              <button className="island-quiet" onClick={onCancel}>Cancel</button>
            </div>
          </> : <div className="island-status" data-link={link}>
            {linked ? <><span className="island-avatar">{partner.name.slice(0, 1).toUpperCase()}</span>{partner.name}</>
              : link === 'connecting' ? <><span className="pearl-puck" aria-hidden="true"/>Connecting</>
              : <span className="island-avatar" data-empty title="No partner"><Unlink size={14}/></span>}
            {linked && partner.simulated && <span className="island-pill">Test</span>}
            {linked && <span className="island-where" title={partner.local ? 'On this computer' : undefined}>
              {partner.local ? <Monitor size={14} strokeWidth={1.75}/> : <Globe size={14} strokeWidth={1.75}/>}
              <Signal ping={partner.ping}/>
            </span>}
            {linked && <button className="island-quiet" onClick={onTest}>End test link</button>}
          </div>}
          {room.mode === 'menu' && link === 'idle' && <div className="island-actions">
            <button className="island-play" onClick={onHost}>Host</button>
            <button className="island-chip" onClick={onStartJoin}>Join</button>
            <button className="island-quiet" onClick={onTest}>Test link</button>
          </div>}
          </>}
        </section>
        </>}
      </div>
  </aside>
}
