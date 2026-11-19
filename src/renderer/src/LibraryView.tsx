import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ArrowDownToLine, Award, CalendarClock, Check, CircleDot, Clock, Flag, FolderOpen, Gamepad2, HardDrive, Plus, Save, Skull, Trash2, Trophy, UserRound } from 'lucide-react'
import type { Run } from '../../shared/run'
import type { LibraryRom, RomDetails, RomInfo } from '../../shared/api'
import { confirmSound, play as playSound } from './sfx'

type Game = 'Black 2' | 'White 2'
/** Games Tandem supports, in library order, with their published facts. */
const GAMES: { game: Game; prefix: string; year: number; accent: string; about: string }[] = [
  { game: 'Black 2', prefix: 'IRE', year: 2012, accent: '#8ec5ff', about: 'Two years after Black and White, Unova has changed. You set out from Aspertia City in the south-west as Team Plasma returns under new leadership. This version has Black City and Black Kyurem.' },
  { game: 'White 2', prefix: 'IRD', year: 2012, accent: '#ffb38a', about: 'Two years after Black and White, Unova has changed. You set out from Aspertia City in the south-west as Team Plasma returns under new leadership. This version has White Forest and White Kyurem.' }
]
const art = (game: string) => new URL(`./art/${game === 'White 2' ? 'white2' : 'black2'}.png`, document.baseURI).href

const read = <T,>(key: string): Record<string, T> => { try { return JSON.parse(localStorage.getItem(key) || '{}') } catch { return {} } }
const write = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage unavailable */ } }
let session: { sha256: string; started: number } | null = null
/** Records the start of play for a ROM; the time adds to its total when play ends. */
export function startPlay(sha256: string) {
  const played = read<number>('last-played'); played[sha256] = Date.now(); write('last-played', played)
  session = { sha256, started: Date.now() }
}
export function endPlay() {
  if (!session) return
  const totals = read<number>('play-time'); totals[session.sha256] = (totals[session.sha256] ?? 0) + Date.now() - session.started
  write('play-time', totals); session = null
}
export type SaveShot = { top: string; bottom: string }
/** Keeps both screens at the moment the game last saved, as that ROM's pictures. Stored on this computer only. */
export function keepSaveShot(sha256: string, shot: SaveShot) {
  const shots = read<SaveShot | string>('save-shots'); shots[sha256] = shot; write('save-shots', shots)
}
/** Both screens at the last save; a picture kept before both were stored counts as the top screen alone. */
export const saveShots = (sha256: string | undefined): Partial<SaveShot> | undefined => {
  const shot = sha256 ? read<SaveShot | string>('save-shots')[sha256] : undefined
  return typeof shot === 'string' ? { top: shot } : shot
}
/** The top screen at the last save. */
export const saveShot = (sha256: string | undefined) => saveShots(sha256)?.top

function ago(at: number) {
  const minutes = Math.round((Date.now() - at) / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return days === 1 ? 'Yesterday' : `${days} days ago`
}
const duration = (ms: number) => { const m = Math.round(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min` }
const megabytes = (bytes: number) => `${Math.round(bytes / 1048576)} MB`

/** A confirming click as a game is selected. */

/** A soft tick as the selection moves along the shelf. */
const tick = () => { if (!matchMedia('(prefers-reduced-motion: reduce)').matches) playSound('cartClick', { gain: .12, rate: 1.7, lowpass: 6500, space: .15 }) }

/**
 * The island's library, laid out like a console's: your last save of the selected game is the banner across the top,
 * over a glow of its box art; its cover stands large, with its facts, play history and Select, which puts it in the slot at Home;
 * every supported game sits on a shelf of covers beneath, yours in colour and the rest greyed out, followed by Add ROM.
 * Arrow keys, Enter and Escape, and a gamepad's d-pad, A and B, move along the shelf, select and close.
 */
export function LibraryView({ library, current, busy, error, onPlay, onAdd, onForget, onClose, runs = [] }: {
  library: LibraryRom[]; current: RomInfo | null; busy: boolean; error: string; runs?: Run[]
  onPlay: (rom: LibraryRom) => void; onAdd: () => void; onForget: (rom: LibraryRom) => void; onClose: () => void
}) {
  const filesOf = (prefix: string) => library.filter(rom => rom.gameCode.startsWith(prefix))
  const [selected, setSelected] = useState<Game>((current?.game ?? library[0]?.game ?? 'Black 2') as Game)
  const game = GAMES.find(g => g.game === selected)!, files = filesOf(game.prefix)
  const [file, setFile] = useState<string | undefined>(files[0]?.sha256)
  useEffect(() => { setFile(files.find(f => f.sha256 === current?.sha256)?.sha256 ?? files.find(f => !f.missing)?.sha256 ?? files[0]?.sha256) }, [selected, library.length])
  const chosen = files.find(f => f.sha256 === file)
  const [details, setDetails] = useState<RomDetails | null>(null)
  useEffect(() => {
    setDetails(null)
    if (chosen && !chosen.missing) void window.tandem?.romDetails(chosen.token).then(setDetails)
  }, [chosen?.sha256, chosen?.token])
  const played = chosen ? read<number>('last-played')[chosen.sha256] : undefined
  const time = chosen ? read<number>('play-time')[chosen.sha256] : undefined
  const usable = !!chosen && !chosen.missing
  const active = (sha?: string) => runs.find(r => r.mode === 'solo' && !r.endedAt && r.romSha === sha)
  const shot = saveShot(active(chosen?.sha256)?.id ?? chosen?.sha256) ?? files.map(f => saveShot(active(f.sha256)?.id ?? f.sha256)).find(Boolean)

  // Shelf focus: the games, then Add ROM.
  const [focus, setFocus] = useState(GAMES.findIndex(g => g.game === selected))
  const choose = (index: number) => {
    const next = Math.max(0, Math.min(GAMES.length, index))
    if (next === focus) return
    setFocus(next); tick()
    if (next < GAMES.length) setSelected(GAMES[next].game)
  }
  const select = (rom: LibraryRom, fromKey = false) => { if (fromKey) confirmSound(); onPlay(rom) }
  const act = useRef(() => {}); act.current = () => { if (focus === GAMES.length || !usable) onAdd(); else if (chosen) select(chosen, true) }
  const move = useRef(choose); move.current = choose
  const close = useRef(onClose); close.current = onClose
  const at = useRef(focus); at.current = focus
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'ArrowLeft') move.current(at.current - 1)
      else if (e.key === 'ArrowRight') move.current(at.current + 1)
      else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) act.current()
      else if (e.key === 'Escape') close.current()
      else return
      e.preventDefault()
    }
    // Gamepad: d-pad or stick left and right move, A plays, B closes; each press acts once.
    let frame = 0, last: Record<string, boolean> = {}, repeatAt = 0
    const poll = () => {
      const pad = [...(navigator.getGamepads?.() ?? [])].find(Boolean)
      if (pad) {
        const now = performance.now(), x = pad.axes[0] ?? 0
        const state = { left: !!pad.buttons[14]?.pressed || x < -.6, right: !!pad.buttons[15]?.pressed || x > .6, a: !!pad.buttons[0]?.pressed, b: !!pad.buttons[1]?.pressed }
        for (const [name, down] of Object.entries(state)) {
          const pressed = down && (!last[name] || ((name === 'left' || name === 'right') && now > repeatAt))
          if (pressed) {
            if (name === 'left' || name === 'right') { move.current(at.current + (name === 'left' ? -1 : 1)); repeatAt = now + (last[name] ? 140 : 420) }
            else if (name === 'a') act.current(); else close.current()
          }
        }
        last = state
      }
      frame = requestAnimationFrame(poll)
    }
    window.addEventListener('keydown', key); frame = requestAnimationFrame(poll)
    return () => { window.removeEventListener('keydown', key); cancelAnimationFrame(frame) }
  }, [])

  return <section className="library" aria-label="Library" data-banner={!!shot} style={{ '--accent-game': game.accent } as CSSProperties}>
    <div className="library-ambient" aria-hidden="true">{GAMES.map(g => <img key={g.game} src={art(g.game)} alt="" data-on={g.game === selected}/>)}</div>
    {shot && <div className="library-banner" key={shot} aria-hidden="true"><img src={shot} alt=""/></div>}
    <article className="library-hero" key={selected}>
      <figure className="library-cover">
        <img className="library-case" src={art(selected)} alt=""/>
      </figure>
      <div className="library-info">
        <h2 className="library-title">Pokémon {selected}</h2>
        <p className="library-facts">{game.year} · Game Freak · Nintendo DS</p>
        <p className="library-about">{game.about}</p>
        {files.length > 1 && <div className="library-files" role="radiogroup" aria-label="Files">
          {files.map(f => <button key={f.sha256} role="radio" aria-checked={f.sha256 === file} className="library-file" data-missing={f.missing} onClick={() => setFile(f.sha256)}>
            {f.language} · Rev {f.revision}{f.missing ? ' · missing' : ''}
          </button>)}
        </div>}
        {details?.save?.trainer && <div className="library-savecard" aria-label="Save">
          <span className="library-trainer"><UserRound size={16}/>{details.save.trainer.name}</span>
          <span className="run-badges" aria-label={`${details.save.trainer.badges} badges`}>{Array.from({ length: 8 }, (_, i) => <i key={i} data-on={i < details.save!.trainer!.badges}/>)}</span>
          <span title="Time played in the game"><Gamepad2 size={15}/>{details.save.trainer.played.hours}:{String(details.save.trainer.played.minutes).padStart(2, '0')}</span>
          <span title="Money">₽{details.save.trainer.money.toLocaleString()}</span>
        </div>}
        {chosen && <div className="library-stats">
          <span title="Play time"><Clock size={15}/>{time ? duration(time) : '0 min'}</span>
          <span title="Last played"><CalendarClock size={15}/>{played ? ago(played) : 'Never'}</span>
          <span title={`${chosen.language} · Revision ${chosen.revision}`}><HardDrive size={15}/>{megabytes(chosen.size)}</span>
        </div>}
        {(() => {
          const mine = runs.filter(r => !r.endedAt && files.some(f => f.sha256 === r.romSha))
          return mine.length > 0 && <ol className="library-runs" aria-label="Runs">{mine.map(r => {
            const caught = Object.keys(r.pokemon).length, fallen = Object.values(r.pokemon).filter(p => p.status === 'dead').length
            const Result = r.result === 'won' ? Trophy : r.result === 'lost' ? Skull : r.result === 'abandoned' ? Flag : CircleDot
            return <li key={r.id} data-result={r.result ?? 'active'} title={new Date(r.createdAt).toLocaleDateString()}>
              <img src={art(r.game)} alt=""/>
              <span className="library-run-who"><Result size={14}/>{r.trainer?.name ?? '—'}</span>
              <span className="library-run-stats">
                <span title="Badges" data-on={r.badges > 0}><Award size={14}/>{r.badges}</span>
                <span title="Caught"><CircleDot size={14}/>{caught}</span>
                {fallen > 0 && <span title="Fallen" data-tone="dead"><Skull size={14}/>{fallen}</span>}
                {!!r.playTime && <span title="Played"><Clock size={14}/>{duration(r.playTime)}</span>}
              </span>
            </li>
          })}</ol>
        })()}
        <div className="library-actions">
          {files.length ? <>
            <button className="library-play" data-confirm disabled={!usable} onClick={() => chosen && select(chosen)}>{chosen?.sha256 === current?.sha256 ? <><Check size={18}/>Selected</> : <><ArrowDownToLine size={18}/>Select</>}</button>
            <button className="library-tool" disabled={!usable} title="Show ROM in folder" aria-label="Show ROM in folder" onClick={() => chosen && void window.tandem?.revealRom(chosen.token, 'file')}><FolderOpen size={17}/></button>
            <button className="library-tool" disabled={!usable || !details?.save} title="Show save in folder" aria-label="Show save in folder" onClick={() => chosen && void window.tandem?.revealRom(chosen.token, 'save')}><Save size={17}/></button>
            {chosen && <button className="library-tool" title="Remove from library" aria-label="Remove from library" onClick={() => onForget(chosen)}><Trash2 size={17}/></button>}
          </> : <button className="library-play" disabled={busy} onClick={onAdd}>{busy ? <span className="spinner"/> : <Plus size={18}/>}Add ROM</button>}
        </div>
        {error && <p className="island-error" role="alert">{error}</p>}
      </div>
    </article>
    <div className="library-shelf" role="listbox" aria-label="Games">
      {GAMES.map((g, i) => {
        const owned = filesOf(g.prefix).some(f => !f.missing)
        return <button key={g.game} role="option" aria-selected={i === focus} className="library-capsule" data-owned={owned} style={{ '--accent-game': g.accent } as CSSProperties}
          onClick={() => choose(i)} onDoubleClick={() => { const f = filesOf(g.prefix).find(f => !f.missing); if (f) select(f) }} aria-label={`Pokémon ${g.game}${owned ? '' : ', not in your library'}`}>
          <img src={art(g.game)} alt=""/>
          {!owned && <span className="library-capsule-add"><Plus size={20}/></span>}
        </button>
      })}
      <button role="option" aria-selected={focus === GAMES.length} className="library-capsule library-add-tile" disabled={busy} onClick={() => { choose(GAMES.length); onAdd() }}>
        {busy ? <span className="spinner"/> : <Plus size={22}/>}<span>Add ROM</span>
      </button>
    </div>
  </section>
}
