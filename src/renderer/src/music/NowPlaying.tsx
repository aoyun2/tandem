import { useEffect, useRef, useState } from 'react'
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { audio } from '../sfx'
import { SequencePlayer } from './player'
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
 * Music on the menus from the game in the slot, played from its own sound data, with what is playing shown as a
 * small pill. It fades out when play starts and comes back after.
 */
export function NowPlaying({ token, game, quiet, hidden = false }: { token?: string; game?: string; quiet: boolean; hidden?: boolean }) {
  const [index, setIndex] = useState(0), [paused, setPaused] = useState(false), [ready, setReady] = useState(false)
  const player = useRef<SequencePlayer | null>(null), fade = useRef(2)
  useEffect(() => {
    const ctx = audio(), out = output()
    if (!token || !ctx || !out || paused || quiet) return
    let cancelled = false, timer = 0
    void window.tandem?.track(token, PLAYLIST[index].name).then(track => {
      if (cancelled || !track) return
      const p = new SequencePlayer(ctx, track, out)
      // One piece hands over to the next by crossfading; a skip crossfades quickly.
      player.current = p; p.start(fade.current); setReady(true)
      timer = window.setTimeout(() => { fade.current = CROSSFADE; setIndex(i => (i + 1) % PLAYLIST.length) }, PIECE_SECONDS * 1000)
    })
    return () => { cancelled = true; clearTimeout(timer); player.current?.stop(quiet ? 1.2 : fade.current); player.current = null }
  }, [token, index, paused, quiet])
  if (!token) return null
  const step = (by: number) => { fade.current = 1; setPaused(false); setIndex(i => (i + by + PLAYLIST.length) % PLAYLIST.length) }
  return <div className="now-playing" data-playing={ready && !paused} data-quiet={quiet || hidden} aria-label="Now playing">
    <span className="now-playing-title"><b>{PLAYLIST[index].title}</b><em>Pokémon {game}</em></span>
    <button className="island-icon" onClick={() => step(-1)} aria-label="Previous"><SkipBack size={14}/></button>
    <button className="island-icon" onClick={() => setPaused(!paused)} aria-label={paused ? 'Play music' : 'Pause music'}>{paused ? <Play size={14}/> : <Pause size={14}/>}</button>
    <button className="island-icon" onClick={() => step(1)} aria-label="Next"><SkipForward size={14}/></button>
  </div>
}
