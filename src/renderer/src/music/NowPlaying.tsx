import { useEffect, useRef, useState } from 'react'
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { audio } from '../sfx'
import { SequencePlayer } from './player'
import { MiniSpectrum } from './MusicRing'
import { watchSettings } from '../settings'

/** Pieces from the game's soundtrack, by their names in its sound archive. */
const PLAYLIST = [
  { name: 'SEQ_BGM_TITLE', title: 'Title Screen' },
  { name: 'SEQ_BGM_POKECEN', title: 'Pokémon Center' },
  { name: 'SEQ_BGM_GYM', title: 'Pokémon Gym' },
  { name: 'SEQ_BGM_NAMINORI', title: 'Surfing' },
  { name: 'SEQ_BGM_BICYCLE', title: 'Bicycle' },
  { name: 'SEQ_BGM_POKEMON_LEAGUE', title: 'Pokémon League' },
  { name: 'SEQ_BGM_E_DENDOUIRI', title: 'Hall of Fame' },
  { name: 'SEQ_BGM_ENDING', title: 'Ending' }
]
/** The playlist in a new random order each time the app starts. */
const ORDER = PLAYLIST.map((_, i) => i)
for (let i = ORDER.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ORDER[i], ORDER[j]] = [ORDER[j], ORDER[i]] }
const piece = (index: number) => PLAYLIST[ORDER[index % ORDER.length]]
/** Each piece loops in the game; here one plays for this long, then crossfades into the next over CROSSFADE seconds. */
const PIECE_SECONDS = 150, CROSSFADE = 4

let musicOut: GainNode | null = null, analyser: AnalyserNode | null = null
const output = () => {
  const ctx = audio(); if (!ctx) return null
  if (!musicOut) { musicOut = ctx.createGain(); const gain = musicOut.gain; watchSettings(s => { gain.value = s.music }); musicOut.connect(ctx.destination); analyser = ctx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = .78; musicOut.connect(analyser) }
  return musicOut
}

/** The music's analyser, for the ring around the console. */
export const musicAnalyser = () => analyser

/**
 * Music on the menus from the game in the slot, played from its own sound data, with what is playing shown under the
 * console on the main menu and as a slim strip along the bottom elsewhere. Pausing holds the piece where it is. Each piece hands over to the next by crossfading once the next is loaded, when the piece
 * ends or after PIECE_SECONDS. It fades out when play starts and comes back after.
 */
export function NowPlaying({ token, source, game, quiet, strip = false }: { token?: string; source?: string; game?: string; quiet: boolean; strip?: boolean }) {
  const [index, setIndex] = useState(0), [paused, setPaused] = useState(false), [ready, setReady] = useState(false)
  const player = useRef<SequencePlayer | null>(null), fade = useRef(2), tokenRef = useRef(token)
  tokenRef.current = token
  const silent = !source || quiet
  const pausedRef = useRef(paused); pausedRef.current = paused
  useEffect(() => { if (paused) player.current?.pause(); else player.current?.resume() }, [paused])
  useEffect(() => {
    if (!silent) return
    player.current?.stop(quiet ? 1.2 : .6); player.current = null
  }, [silent])
  useEffect(() => {
    const ctx = audio(), out = output(), from = tokenRef.current
    if (silent || !ctx || !out || !from) return
    let cancelled = false, timer = 0
    const next = () => { if (!cancelled) { cancelled = true; fade.current = CROSSFADE; setIndex(i => i + 1) } }
    void window.tandem?.track(from, piece(index).name).then(track => {
      if (cancelled) return
      if (!track) { next(); return }
      const p = new SequencePlayer(ctx, track, out)
      player.current?.stop(fade.current)
      player.current = p; p.onEnd = next; p.start(fade.current, fade.current >= CROSSFADE ? 6 : 0); setReady(true)
      if (pausedRef.current) p.pause(.01)
      timer = window.setTimeout(next, PIECE_SECONDS * 1000)
    })
    return () => { cancelled = true; clearTimeout(timer) }
  }, [source, index, silent])
  useEffect(() => () => { player.current?.stop(.6); player.current = null }, [])
  if (!source) return null
  const step = (by: number) => { fade.current = 1; setPaused(false); setIndex(i => i + by + PLAYLIST.length) }
  return <div className="now-playing" data-playing={ready && !paused} data-quiet={quiet} data-strip={strip} aria-label="Now playing">
    <button className="np-button" onClick={() => step(-1)} aria-label="Previous"><SkipBack size={16}/></button>
    {strip && <MiniSpectrum live={ready && !paused && !quiet}/>}
    <span className="now-playing-title"><b>{piece(index).title}</b><em>Pokémon {game}</em></span>
    <button className="np-button" onClick={() => setPaused(!paused)} aria-label={paused ? 'Play music' : 'Pause music'}>{paused ? <Play size={16}/> : <Pause size={16}/>}</button>
    <button className="np-button" onClick={() => step(1)} aria-label="Next"><SkipForward size={16}/></button>
  </div>
}
