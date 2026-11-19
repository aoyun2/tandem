import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

import { Check, ChevronRight, FileCheck2, FileSearch, Gamepad2, Ghost, House, LayoutGrid, Map, Play, Minus, Copy, Skull, Users, Wand2, X as CloseIcon, Settings2 } from 'lucide-react'


import { PlayView } from './PlayView'

import { EmulatorSession } from './emulator/session'

import { TandemMark } from './TandemMark'

import { Island, type Room, type RunMode } from './Island'
import { ControlsOverlay, type ButtonAnchors } from './ControlsOverlay'
import { endPlay, saveShots, startPlay } from './LibraryView'
import { DSPreview, type DSPreviewHandle, type PartnerDetails, type RoomScreen } from './DSPreview'
import { canPair, counterpart } from '../../shared/pairing'

import type { GameNames, LibraryRom, Profile, RomInfo } from '../../shared/api'
import type { Rules, Run } from '../../shared/run'
import { Onboarding } from './Onboarding'
import { MainMenu } from './MainMenu'
import { SettingsPanel } from './SettingsPanel'
import { changeSettings, settings, watchSettings } from './settings'
import { resetBindings } from './input/bindings'
import { NowPlaying } from './music/NowPlaying'
import { MusicRing } from './music/MusicRing'
import { installInterfaceSounds } from './sfx'



type Page = 'setup' | 'library' | 'controls' | 'settings' | 'development' | 'play'


function Setup({ rom, library, libraryOpen, view, onHome, onPick, onForget, busy, error, onAdd, onLibrary, onInsertComplete, onLaunch, onCancel, onReady, active, player, onPartner, mode, onMode, run, otherRun, names, runs, onStartRun, onSettings, stage, setStage, music }: { rom: RomInfo | null; library: LibraryRom[]; libraryOpen: boolean; view: 'home' | 'library' | 'controls'; onHome: () => void; onPick: (rom: LibraryRom) => void; onForget: (rom: LibraryRom) => void; busy: boolean; error: string; onAdd: () => void; onLibrary: () => void; onInsertComplete:()=>void; onLaunch:(runId?:string)=>void; onCancel:()=>void; onReady:()=>void; active:boolean; player:string; onPartner:(name:string|null)=>void; mode:RunMode; onMode:(mode:RunMode)=>void; run:Run|null; otherRun:Run|null; names:GameNames|null; runs:Run[]; onStartRun:(rules:Rules)=>Promise<string|undefined>; onSettings:()=>void; stage:'menu'|'mode'; setStage:(stage:'menu'|'mode')=>void; music:boolean }) {
  // Main menu stages: the menu (the choices out beside the console), then inside Solo or Soul Link.
  const menu=stage==='menu'?'menu':'open'
  const [sheet,setSheet]=useState(false)
  useEffect(()=>{if(!active||libraryOpen)setSheet(false)},[active,libraryOpen])

  const localDS=useRef<DSPreviewHandle>(null)
  const [launching,setLaunching]=useState(false)
  const [link,setLink]=useState<'idle'|'connecting'|'linked'>('idle')
  const partner=useMemo<PartnerDetails>(()=>{
    const game=((rom&&counterpart(rom.gameCode))??'White 2') as PartnerDetails['game'], code=game==='White 2'?'IRDO':'IREO'
    return{name:'Test partner',game,pairs:!rom||canPair(rom.gameCode,code),local:true,simulated:true,ping:null}
  },[rom])
  useEffect(()=>{onPartner(link==='linked'?partner.name:null)},[link,partner])
  // Room flow lives on the island; the DS top screen mirrors it. Online rooms need the room service, which is not built.
  const [room,setRoom]=useState<Room>({mode:'menu'})
  const [anchors,setAnchors]=useState<ButtonAnchors|null>(null)
  // Settings live on the console's touch screen in the controls view.
  const [prefs,setPrefs]=useState(settings())
  useEffect(()=>watchSettings(setPrefs),[])
  const [keysVersion,setKeysVersion]=useState(0)
  const controlsRoom=useMemo<RoomScreen>(()=>({settings:prefs}),[prefs])
  const touch=(id:string)=>{
    const [kind,value]=id.split('-')
    if(kind==='music'||kind==='effects')changeSettings({[kind]:Number(value)/10})
    else if(kind==='quality')changeSettings({quality:value==='high'?'high':'balanced'})
    else if(id==='reset-keys'){resetBindings();setKeysVersion(v=>v+1)}
  }
  const mirror=useMemo<RoomScreen>(()=>{
    const save=saveShots(run?.id??rom?.sha256)
    if(mode==='solo')return{art:rom?.game,save}
    if(room.mode==='host')return{code:room.code,save}
    if(room.mode==='join')return{code:room.code,codeBoxes:true,save}
    if(link==='linked')return{save,pair:{you:{name:player,game:rom?.game},partner:{name:partner.name,game:partner.game,simulated:partner.simulated,ping:partner.ping,pairs:partner.pairs}}}
    return{art:rom?.game,save}
  },[room,link,partner,player,rom,mode,active,run])
  const host=()=>{const letters='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',bytes=crypto.getRandomValues(new Uint8Array(6));setRoom({mode:'host',code:Array.from(bytes,b=>letters[b%letters.length]).join('')})}
  useEffect(()=>{
    if(room.mode==='menu'||!active)return
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();setRoom({mode:'menu'});return}
      if(room.mode!=='join'||event.ctrlKey||event.metaKey||event.altKey)return
      if(event.key==='Backspace'){event.preventDefault();setRoom({...room,code:room.code.slice(0,-1),tried:false})}
      else if(event.key==='Enter'&&room.code.length===6)setRoom({...room,tried:true})
      else if(/^[a-z0-9]$/i.test(event.key)&&room.code.length<6)setRoom({...room,code:room.code+event.key.toUpperCase(),tried:false})
    }
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)
  },[room,active])
  const linkTimer=useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(()=>()=>clearTimeout(linkTimer.current),[])
  const chooseMode=(next:RunMode)=>{if(next==='solo'){clearTimeout(linkTimer.current);setLink('idle');setRoom({mode:'menu'})}onMode(next);setStage('mode')}
  useEffect(()=>{
    if(!active||libraryOpen||sheet||launching||room.mode!=='menu')return
    const key=(event:KeyboardEvent)=>{
      if(event.target instanceof HTMLInputElement||event.defaultPrevented)return
      if(event.key==='Escape'&&stage==='mode'){event.preventDefault();setStage('menu')}
    }
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)
  },[active,libraryOpen,sheet,launching,room.mode,stage])
  const toggleTestLink=()=>{clearTimeout(linkTimer.current);if(link!=='idle'){setLink('idle');return}setLink('connecting');linkTimer.current=setTimeout(()=>setLink('linked'),1800)}
  useEffect(()=>{if(active){localDS.current?.reset();setLaunching(false)}},[active])
  useEffect(()=>{if(!launching)return;const cancel=(event:KeyboardEvent)=>{if(event.key!=='Escape')return;event.preventDefault();localDS.current?.reset();setLaunching(false);onCancel()};window.addEventListener('keydown',cancel);return()=>window.removeEventListener('keydown',cancel)},[launching])

  const play = (runId = run?.id) => { if (rom && !busy && localDS.current?.insert()) { setLaunching(true); startPlay(rom.sha256); onLaunch(runId) } }
  const startRun = async (rules: Rules) => { const id = await onStartRun(rules); setSheet(false); if (id) play(id) }

  return <>

    <h1 className="sr-only">Set up</h1>

    <div className={launching ? 'setup-stage launching' : 'setup-stage'} data-view={view} data-stage={stage}>
      <MusicRing shown={view==='home'&&stage==='menu'&&active}/>
      {view==='home'&&<MainMenu stage={menu} onPick={chooseMode} onSettings={onSettings}/>}
      <NowPlaying token={(rom??library.find(r=>!r.missing))?.token} source={(rom??library.find(r=>!r.missing))?.sha256} game={(rom??library.find(r=>!r.missing))?.game} quiet={!music||launching} hidden={!active||view!=='home'||stage!=='menu'}/>

      <div className="scene-vignette" aria-hidden="true"/>
      <DSPreview menu={view==='home'?menu:'open'} game={rom ? (rom.game === 'White 2' ? 'White 2' : 'Black 2') : undefined} ref={localDS} onInsertComplete={onInsertComplete} onReady={onReady} link={link} player={player} partner={partner} room={view==='controls'?controlsRoom:stage==='mode'||view!=='home'?mirror:{}} onTouch={touch} view={view} onAnchors={setAnchors}/>
      {view === 'controls' && <ControlsOverlay key={keysVersion} anchors={anchors}/>}
      {libraryOpen && <div className="library-backdrop" aria-hidden="true" onPointerDown={onHome}/>}
      
      <Island run={run} otherRun={otherRun} names={names} runs={runs} sheet={sheet} onSheet={setSheet} onStartRun={rules => void startRun(rules)} onBack={() => setStage('menu')} mode={mode} onMode={chooseMode} rom={rom} library={library} link={link} partner={partner} room={room} busy={busy} launching={launching} error={error}
        libraryOpen={libraryOpen} onAdd={onAdd} onLibrary={onLibrary} onCloseLibrary={onHome} onForget={onForget} onPlay={() => play()}
        onPlayRom={entry => { onPick(entry); onHome() }}
        onHost={host} onJoin={()=>setRoom(old=>old.mode==='join'?{...old,tried:true}:old)} onStartJoin={()=>setRoom({mode:'join',code:'',tried:false})} onCancel={()=>setRoom({mode:'menu'})} onTest={toggleTestLink}/>

    </div>



  </>

}



function Development() {
  const stages: [string, typeof Check, number, string][] = [
    ['ROM inspection', FileSearch, 4, 'Identify Black 2 / White 2, validate header structure, and calculate a file fingerprint.'],
    ['Embedded play', Gamepad2, 4, 'Run the game with keyboard and controller input, sound and cartridge saves.'],
    ['Solo Nuzlocke', Skull, 3, 'Read the trainer, party, boxes and place from the running game; record catches by area, deaths, badges and level caps.'],
    ['Game preparation', Wand2, 2, 'Choose rules and randomizer options; build a reproducible playable copy from your base ROM.'],
    ['Play together', Users, 1, 'Share full-size game views, synchronize Soul Link events, and meet at story checkpoints.'],
    ['Unova map', Map, 1, 'Explore a 3D Unova map with locations, encounters, illuminated routes, and progress.'],
    ['Companion ghost', Ghost, 0, 'See a non-colliding friend avatar in supported areas and inspect their team.']
  ]
  return <><div className="page-heading"><h1>Development</h1></div><ul className="roadmap-tiles">{stages.map(([name, Icon, progress, description]) =>
    <li key={name} title={description} data-done={progress === 4}><Icon size={26} strokeWidth={1.6}/><b>{name}</b><i aria-label={`${progress} of 4`}>{[1, 2, 3, 4].map(n => <u key={n} data-on={n <= progress}/>)}</i></li>)}</ul></>
}



export function App() {  const [page, setPage] = useState<Page>('setup')

  const [rom, setRom] = useState<RomInfo | null>(null)
  const [library, setLibrary] = useState<LibraryRom[]>([])
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const refreshLibrary = () => { void window.tandem?.library().then(setLibrary).catch(() => {}) }
  useEffect(refreshLibrary, [])
  const inspect = async () => {
    if (!window.tandem) { setError('Open the Tandem desktop app to choose a ROM.'); return }
    setBusy(true); setError('')
    try {
      const result = await window.tandem.inspectRom()
      if (result.status === 'ok') { setRom(result.rom); refreshLibrary(); setPage('setup') }
      if (result.status === 'error') setError(result.message)
    } catch { setError('The ROM check did not finish. Try selecting the file again.') }
    finally { setBusy(false) }
  }
  const pick = (entry: LibraryRom) => { const { missing: _missing, ...picked } = entry; setRom(picked); setError('') }
  const forgetRom = (entry: LibraryRom) => { void window.tandem?.forgetRom(entry.sha256).then(refreshLibrary) }

  const [transition,setTransition]=useState<'idle'|'blackout'|'reveal'>('idle')

  const timers=useRef<ReturnType<typeof setTimeout>[]>([])

  const [ready,setReady]=useState(false)
  useEffect(()=>{const fallback=setTimeout(()=>setReady(true),5000);return()=>clearTimeout(fallback)},[])
  useEffect(()=>{if(ready)void window.tandem?.appReady()},[ready])
  // The page being left stays mounted while it fades out under the new one.
  const [leaving,setLeaving]=useState<Page|null>(null)
  const previous=useRef<Page>('setup')
  useEffect(()=>{if(previous.current===page)return;setLeaving(previous.current);previous.current=page;const t=setTimeout(()=>setLeaving(null),340);return()=>clearTimeout(t)},[page])
  const shown=(id:Page)=>page===id||leaving===id
  const [session,setSession]=useState<EmulatorSession|null>(null)
  const sessionRef=useRef<EmulatorSession|null>(null)
  const stopSession=()=>{sessionRef.current?.stop();sessionRef.current=null;setSession(null)}
  const [profile,setProfile]=useState<Profile|null>(null)
  const player=profile?.name??''
  const [runs,setRuns]=useState<Run[]>([])
  const refreshRuns=async()=>{const list=await window.tandem?.runs().catch(()=>[]);if(list)setRuns(list)}
  useEffect(()=>{void refreshRuns()},[])
  const [names,setNames]=useState<GameNames|null>(null)
  // ROM data is kept per fingerprint, and read once the cartridge animation has finished so it does not stall it.
  const namesCache=useRef(new globalThis.Map<string,GameNames|null>())
  useEffect(()=>{
    if(!rom){setNames(null);return}
    const known=namesCache.current.get(rom.sha256)
    if(known!==undefined){setNames(known);return}
    setNames(null)
    const token=rom.token,sha=rom.sha256
    const timer=window.setTimeout(()=>{void window.tandem?.names(token).then(n=>{namesCache.current.set(sha,n);setNames(n)}).catch(()=>{})},1600)
    return()=>clearTimeout(timer)
  },[rom?.sha256])
  const [playing,setPlaying]=useState<string|undefined>()
  const [renaming,setRenaming]=useState(false)
  // Home's main menu stage: the menu, or inside Solo or Soul Link. The title bar's tabs hide on the menu.
  const [stage,setStage]=useState<'menu'|'mode'>('menu')
  const onMenu=page==='setup'&&stage==='menu'
  const runsRef=useRef(runs);runsRef.current=runs
  const playingRef=useRef(playing);playingRef.current=playing
  const playStarted=useRef(0)
  const [partnerName,setPartnerName]=useState<string|null>(null)
  const [mode,setMode]=useState<RunMode>(()=>{try{return localStorage.getItem('run-mode')==='soul-link'?'soul-link':'solo'}catch{return'solo'}})
  useEffect(()=>{try{localStorage.setItem('run-mode',mode)}catch{/* storage unavailable */}},[mode])
  useEffect(()=>installInterfaceSounds(),[])
  const refreshProfile=async()=>{const p=await window.tandem?.profile();if(p)setProfile(p)}
  useEffect(()=>{void refreshProfile()},[])
  const nameYourself=async(name:string)=>{await window.tandem?.setProfile(name);await refreshProfile()}
  const [onboarding,setOnboarding]=useState(false)
  useEffect(()=>{if(profile&&!profile.set)setOnboarding(true)},[profile?.set])
  // The active run: the one solo run, or the Soul Link session with the linked partner.
  // The active run on the game in the slot: its solo run, or the Soul Link session with the linked partner.
  const runHere=!rom?null:mode==='solo'?runs.find(r=>r.mode==='solo'&&!r.endedAt&&r.romSha===rom.sha256)??null:partnerName?runs.find(r=>r.mode==='soul-link'&&r.partner===partnerName&&!r.endedAt&&r.romSha===rom.sha256)??null:null, otherRun=null
  const saveTimer=useRef<ReturnType<typeof setTimeout>>(undefined), pendingRun=useRef<Run|null>(null)
  const flushRun=()=>{clearTimeout(saveTimer.current);if(pendingRun.current){void window.tandem?.saveRun(pendingRun.current);pendingRun.current=null}}
  const updateRun=(run:Run)=>{setRuns(list=>list.map(r=>r.id===run.id?run:r));pendingRun.current=run;clearTimeout(saveTimer.current);saveTimer.current=setTimeout(flushRun,1500)}
  const startRun=async(rules:Rules)=>{if(!rom||!window.tandem)return undefined;const run=await window.tandem.createRun({token:rom.token,mode,partner:mode==='soul-link'?partnerName??undefined:undefined,rules});await refreshRuns();return run?.id}
  const launch=(runId?:string)=>{stopSession();if(!rom||!window.tandem)return;setPlaying(runId);playStarted.current=Date.now();const next=new EmulatorSession();sessionRef.current=next;setSession(next);void next.start(rom.token,runId)}
  const exitPlay=()=>{const run=runsRef.current.find(r=>r.id===playingRef.current);if(run&&playStarted.current){updateRun({...run,playTime:(run.playTime??0)+Date.now()-playStarted.current});playStarted.current=0}flushRun();setPlaying(undefined);endPlay();timers.current.forEach(clearTimeout);timers.current=[];setTransition('idle');setPage('setup');stopSession()}
  const launchActive=useRef(false)
  launchActive.current=page==='play'||transition!=='idle'

  const enterPlay=()=>{

    setTransition('blackout')

    timers.current.push(setTimeout(()=>{setPage('play');setTransition('reveal')},380))

    timers.current.push(setTimeout(()=>setTransition('idle'),900))

  }

  useEffect(()=>{const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!event.defaultPrevented&&launchActive.current)exitPlay()};window.addEventListener('keydown',escape);return()=>{window.removeEventListener('keydown',escape);timers.current.forEach(clearTimeout)}},[])

  return <div className={ready?'app ready':'app'}>

    <header className="app-bar" data-menu={onMenu}>{page!=='play'&&<nav className="tabs" aria-hidden={onMenu} aria-label="Main navigation">{([['setup',House,'Home'],['library',LayoutGrid,'Library'],['controls',Settings2,'Settings'],['development',Map,'Development']] as const).map(([id,Icon,label])=><button key={id} className="tab" aria-current={page===id?'page':undefined} onClick={()=>setPage(id)}><Icon size={16} strokeWidth={1.9}/>{label}</button>)}</nav>}{page!=='play'&&player&&<button className="profile" tabIndex={onMenu?-1:0} title="Your profile" aria-label="Your profile" onClick={()=>setRenaming(true)}><i>{profile?.photo?<img src={profile.photo} alt=""/>:player.slice(0,1).toUpperCase()}</i>{player}</button>}<a className="wordmark" href="#" onClick={event => { event.preventDefault(); exitPlay() }} aria-label="Tandem home"><TandemMark/><span>Tandem</span></a><div className="window-controls"><button aria-label="Minimize window" onClick={() => void window.tandem?.windowControl('minimize')}><Minus size={16}/></button><button aria-label="Toggle fullscreen" onClick={() => void window.tandem?.windowControl('resize')}><Copy size={14}/></button><button aria-label="Close window" onClick={() => void window.tandem?.windowControl('close')}><CloseIcon size={17}/></button></div></header>

    <div className={`workspace ${page==='play'?'play-mode':''}`}>

      <div className="page-deck">
      <main hidden={!shown('setup')&&!shown('library')&&!shown('controls')} data-active={page==='setup'||page==='library'||page==='controls'} className="page-setup"><Setup active={page==='setup'||page==='library'} libraryOpen={page==='library'} view={page==='library'?'library':page==='controls'?'controls':'home'} onHome={()=>setPage('setup')} onPick={pick} onForget={forgetRom} rom={rom} library={library} busy={busy} error={error} onAdd={inspect} onLibrary={()=>setPage('library')} onInsertComplete={enterPlay} onLaunch={launch} onCancel={stopSession} onReady={()=>setReady(true)} player={player} onPartner={setPartnerName} mode={mode} onMode={setMode} run={runHere} otherRun={otherRun} names={names} runs={runs} onStartRun={startRun} onSettings={()=>setPage('controls')} stage={stage} setStage={setStage} music={page!=='play'}/></main>
      <main hidden={!shown('settings')} data-active={page==='settings'} className="page-settings"><div className="settings-page"><SettingsPanel/><button className="island-chip" onClick={()=>setPage('controls')}><Gamepad2 size={15}/>Controller</button></div></main>
      <main hidden={!shown('development')} data-active={page==='development'} className="page-development"><Development/></main>
      {page==='play'&&<main className="page-play"><PlayView session={session} onExit={exitPlay} player={player} partner={mode==='solo'?null:partnerName} romSha={rom?.sha256} solo={mode==='solo'} run={runs.find(r=>r.id===playing)??null} names={names} onRun={updateRun}/></main>}
      </div>
      <div className="notification-region" role="status" aria-live="polite"/>


    </div><div className={`launch-curtain ${transition}`} aria-hidden="true"/>
    {profile&&(onboarding||renaming)&&<Onboarding profile={profile} manage={renaming&&!onboarding} rom={rom} library={library} busy={busy} error={error}
      onName={name=>void nameYourself(name)} onPhoto={photo=>void window.tandem?.setPhoto(photo).then(refreshProfile)} onAdd={()=>void inspect()} onStartRun={startRun}
      onClose={()=>{setOnboarding(false);setRenaming(false);if(!profile.set)void nameYourself(profile.name)}}/>}

  </div>

}

