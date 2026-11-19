import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { Ref } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { pixelRatio, studio } from './studio'
import { dsShellMaterial } from './dsMaterial'
import { BUTTONS, BUTTON_POINTS, buttonState, emitButton, withHighlights } from './input/buttons'
import type { ButtonAnchors } from './ControlsOverlay'
import { emptySlot } from './emptySlot'
import { loadCartridge } from './loadCartridge'
import { energyLink, type EnergyLink, type LinkState } from './energyLink'
import { cartridgeSound, connectingSound, igniteSound, preloadSounds } from './sfx'

/** A linked partner: their game, whether it pairs with yours, where they are, and the measured round trip (null when not measured). */
export type PartnerDetails = { name: string; game: 'Black 2' | 'White 2'; pairs: boolean; local: boolean; simulated: boolean; ping: number | null }

export type DSPreviewHandle = { insert: () => boolean; reset: () => void }

/** What the top screen shows in setup under its header: a title, tiles, a room code, short lines, and buttons. */
export type RoomScreen = {
  title?: string; tiles?: { id: string; label: string }[]; code?: string; codeBoxes?: boolean; lines?: string[]
  /** Idle: the game in the slot, shown as its box art. */
  art?: 'Black 2' | 'White 2'
  /** Linked: both players and their games, joined by the link. */
  pair?: { you: { name: string; game?: 'Black 2' | 'White 2' }; partner: { name: string; game: 'Black 2' | 'White 2'; simulated: boolean; ping: number | null; pairs: boolean } }
  buttons?: { id: string; label: string; primary?: boolean; disabled?: boolean }[]
  /** Both screens from your last save of the game in the slot, shown on the console's own screens when idle. */
  save?: { top?: string; bottom?: string }
}
/** The top and touch screens' faces in the DS Lite texture atlas (canvas pixels). */
const TOP = { x0: 1635, y0: 28, x1: 1983, y1: 290 }, TOUCH = { x0: 1631, y0: 298, x1: 1987, y1: 567 }

/** DS Lite width in scene units after scaling the supplied model by .005. */
const DS_WIDTH = .56
/** Your console sits centred in the lower half with the cartridge beside it and the island above; the link runs out of frame on the right. */
const ISLAND_AT = new THREE.Vector3(-.2, .38, -.3)
const LOCAL_X = -.2
const FAR_END = new THREE.Vector3(5, -.3, -2.4)
/** Cartridge height at the DS model's scale; the slot pocket is measured for this size. */
const CART_HEIGHT = .063
const DISPLAY_SCALE = 1.9
const MARK = '#ece8e0'
/** How far the console moves left on screen while the menu's panels are out beside it. */
const MENU_SHIFT_PX = 225
/** How far the console rises on screen on the menu, below the title. */
const MENU_LIFT_PX = 64
/** How far the camera swings round to the right on the menu, in radians. */
const MENU_TURN = .5
const UP = new THREE.Vector3(0, 1, 0)

/** Insertion timeline in seconds. */
const TRAVEL = 1.15, SEAT = 1.5, END = 3.4, COMPLETE = 3.05

const ease = (t: number) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))

export function DSPreview({ game, ref, onInsertComplete, onReady, link: linkState = 'idle', player, partner, room, onTouch, view = 'home', onAnchors, menu = 'open', onConsole }: { menu?: 'menu' | 'open'; onConsole?: () => void; game?: 'Black 2' | 'White 2'; ref?: Ref<DSPreviewHandle>; onInsertComplete?: () => void; onReady?: () => void; link?: LinkState; player?: string; partner?: PartnerDetails | null; room?: RoomScreen; onTouch?: (id: string) => void; view?: 'home' | 'library' | 'controls'; onAnchors?: (anchors: ButtonAnchors | null) => void }) {
  const viewRef = useRef(view); viewRef.current = view
  const anchorsTo = useRef(onAnchors); anchorsTo.current = onAnchors
  const menuRef = useRef(menu); menuRef.current = menu
  const consoleTo = useRef(onConsole); consoleTo.current = onConsole
  const info = useRef({ player, game, partner: partner ?? null, link: linkState, room }); info.current = { player, game, partner: partner ?? null, link: linkState, room }
  const tapped = useRef(onTouch); tapped.current = onTouch
  const repaint = useRef(() => {}), changeScreens = useRef(() => {})
  useEffect(() => { changeScreens.current() }, [player, game, partner, linkState, room])
  useEffect(() => { void document.fonts.ready.then(() => repaint.current()) }, [])
  const ready = useRef(onReady); ready.current = onReady
  const gameRef = useRef(game); gameRef.current = game
  const cardRef = useRef<(game: 'Black 2' | 'White 2' | undefined) => void>(() => {})
  const linkRef = useRef<{ set(state: LinkState): void } | null>(null)
  useEffect(() => { linkRef.current?.set(linkState) }, [linkState, partner])
  const linkInitial = useRef(linkState); linkInitial.current = linkState
  const complete = useRef(onInsertComplete); useEffect(() => { complete.current = onInsertComplete }, [onInsertComplete])
  const host = useRef<HTMLDivElement>(null), play = useRef<() => boolean>(() => false), reset = useRef<() => void>(() => {})
  const [failed, setFailed] = useState(false)
  useImperativeHandle(ref, () => ({ insert: () => play.current(), reset: () => reset.current() }), [])

  useEffect(() => {
    const element = host.current!
    let stage: ReturnType<typeof studio>
    try { stage = studio(element, { aoIntensity: .6, aoRadius: .02 }) } catch { setFailed(true); return }
    const { renderer, scene } = stage
    const overlay = new THREE.Scene()
    // The link draws on its own transparent layer above the island, so it passes in front of it; the layer ignores the pointer.
    const front = new THREE.WebGLRenderer({ alpha: true, antialias: true, premultipliedAlpha: true })
    front.setClearColor(0, 0)
    front.domElement.className = 'scene-front'
    element.append(front.domElement)
    const camera = new THREE.PerspectiveCamera(26, 1, .01, 20)
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    let disposed = false

    // Camera poses: home frames the console; insert looks over its back edge; front is a three-quarter view as the game starts.
    const home = { target: new THREE.Vector3(LOCAL_X, .24, -.02), dir: new THREE.Vector3(0, .42, 1).normalize(), distance: 2 }
    const insertView = { target: new THREE.Vector3(LOCAL_X, .04, -.12), position: new THREE.Vector3() }
    insertView.position.copy(insertView.target).add(new THREE.Vector3(-.8, .32, -.5).normalize().multiplyScalar(.6))
    // Camera paths swing around the left of your console instead of through it.
    const toSlot = new THREE.CubicBezierCurve3(), toFront = new THREE.CubicBezierCurve3()
    // Once seated, the camera swings back round the left to a three-quarter view of the front as the screens light.
    const frontView = { target: new THREE.Vector3(LOCAL_X, .13, -.06), position: new THREE.Vector3() }
    const planPaths = () => {
      const h = homePosition(), i = insertView.position
      toSlot.v0.copy(h); toSlot.v1.set(h.x - 1.5, h.y + .05, h.z - .35); toSlot.v2.set(i.x - .9, i.y + .12, i.z + .7); toSlot.v3.copy(i)
      frontView.position.copy(frontView.target).addScaledVector(new THREE.Vector3(-.42, .5, 1).normalize(), home.distance * .82)
      const f = frontView.position
      toFront.v0.copy(i); toFront.v1.set(i.x - .45, i.y + .08, i.z + .35); toFront.v2.set(f.x - .7, f.y + .02, f.z - .25); toFront.v3.copy(f)
    }
    const fit = (width: number, height: number, margin: number) => {
      const vertical = THREE.MathUtils.degToRad(camera.fov / 2)
      const horizontal = Math.atan(Math.tan(vertical) * camera.aspect)
      return Math.max((width / 2 + margin) / Math.tan(horizontal), (height / 2 + margin) / Math.tan(vertical))
    }
    const homePosition = () => home.target.clone().addScaledVector(home.dir, home.distance)
    const look = new THREE.Vector3()
    const setCamera = (position: THREE.Vector3, target: THREE.Vector3) => { camera.position.copy(position); look.copy(target); camera.lookAt(look) }

    // Consoles.
    const consoles: THREE.Group[] = []
    // Controls: the buttons' world positions on your console, and how brightly each glows.
    const buttonCentres = BUTTONS.map(b => new THREE.Vector3(BUTTON_POINTS[b][0] + LOCAL_X - .004, BUTTON_POINTS[b][1], BUTTON_POINTS[b][2]))
    const buttonRadii = BUTTONS.map(b => BUTTON_POINTS[b][3])
    const buttonGlow = { value: new Array(BUTTONS.length).fill(0) }
    // Controls pose: looking down over the base so every button and its label fits.
    const controlsView = { target: new THREE.Vector3(LOCAL_X - .004, .1, 0), dir: new THREE.Vector3(0, .72, 1.25).normalize(), distance: 1.4 }
    let blend = viewRef.current === 'controls' ? 1 : 0, lastAnchors = ''
    let dsMeshes: THREE.Mesh[] = []
    const screens: { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; paint: (power: number) => void; repaint: () => void; change: () => void; fading: () => boolean; tick: () => void }[] = []
    const textures = new THREE.TextureLoader(), shellTextures: THREE.Texture[] = []
    const shellImage = new Image()
    const shellLoaded = new Promise<void>(resolve => { shellImage.onload = () => resolve() })
    shellImage.src = './models/ds-lite/DS_texture.png'
    // Box art for the top screen, as in the island.
    const boxArt: Record<'Black 2' | 'White 2', HTMLImageElement> = { 'Black 2': new Image(), 'White 2': new Image() }
    boxArt['Black 2'].src = './art/black2.png'; boxArt['White 2'].src = './art/white2.png'
    for (const img of Object.values(boxArt)) img.onload = () => { for (const screen of screens) screen.repaint() }
    const cover = (c: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) => {
      if (!img.complete || !img.naturalWidth) return
      const s = Math.max(w / img.naturalWidth, h / img.naturalHeight), sw = w / s, sh = h / s
      c.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h)
    }
    const mark = new Path2D('M14 22h68v16H61v36H45V38H30v36H14V22Z'), markSide = new Path2D('M68 49h14v25H68z')
    /** The Tandem mark centred at (x, y), `k` times its 96-unit size, breathing softly with a sheen passing over it. */
    const drawMark = (c: CanvasRenderingContext2D, x: number, y: number, k: number) => {
      const t = motion.matches ? 0 : performance.now() / 1000, breathe = .5 + .5 * Math.sin(t * 1.6)
      c.save(); c.translate(x - 48 * k, y - 48 * k); c.scale(k, k)
      c.shadowColor = `rgba(200,214,255,${.25 + .3 * breathe})`; c.shadowBlur = 10 + 12 * breathe
      c.globalAlpha = .55 + .2 * breathe; c.fillStyle = MARK; c.fill(mark); c.globalAlpha = .35 + .15 * breathe; c.fill(markSide)
      c.shadowBlur = 0
      // The sheen: a soft band of light crossing the mark every four seconds.
      const sweep = ((t % 4) / 4) * 180 - 40
      const band = c.createLinearGradient(sweep - 24, 0, sweep + 24, 40)
      band.addColorStop(0, 'rgba(255,255,255,0)'); band.addColorStop(.5, 'rgba(255,255,255,.55)'); band.addColorStop(1, 'rgba(255,255,255,0)')
      c.globalAlpha = 1; c.fillStyle = band; c.fill(mark); c.fill(markSide)
      c.restore()
    }
    // The shell's texture atlas is painted once. Both screens live on their own small canvas that covers only their part
    // of the atlas, so repainting them uploads a fraction of the texture.
    const SCREEN_AREA = { x: 1625, y: 27, w: 373, h: 548 }, SCREEN_SCALE = 2
    const makeAtlas = (partner: boolean) => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 2048
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = renderer.capabilities.getMaxAnisotropy()
      { const c = canvas.getContext('2d')!; c.drawImage(shellImage, 0, 0, 2048, 2048); c.fillStyle = '#070809'; c.fillRect(1625, 27, 373, 266); c.fillRect(1631, 293, 357, 281) }
      const { x: SX, y: SY, w: SW, h: SH } = SCREEN_AREA, K = SCREEN_SCALE
      const face = document.createElement('canvas'); face.width = SW * K; face.height = SH * K
      const screenTexture = new THREE.CanvasTexture(face); screenTexture.colorSpace = THREE.SRGBColorSpace; screenTexture.anisotropy = texture.anisotropy
      screenTexture.repeat.set(2048 / SW, 2048 / SH); screenTexture.offset.set(-SX / SW, -(2048 - SY - SH) / SH)
      let lit = 0, fadeStart = 0
      // The screens' previous picture, kept while the new one fades in over it.
      const before = document.createElement('canvas'); before.width = face.width; before.height = face.height
      const paint = (power: number) => {
        lit = power
        const c = face.getContext('2d')!
        c.setTransform(K, 0, 0, K, -SX * K, -SY * K)
        c.drawImage(shellImage, SX, SY, SW, SH, SX, SY, SW, SH)
        c.fillStyle = '#070809'; c.fillRect(1625, 27, 373, 266); c.fillRect(1631, 293, 357, 281)
        if (!partner) { paintRoom(c, power); paintTouchScreen(c) }
        c.setTransform(1, 0, 0, 1, 0, 0)
        if (fadeStart) {
          const t = (performance.now() - fadeStart) / 320
          if (t < 1) { c.globalAlpha = 1 - ease(t); c.drawImage(before, 0, 0); c.globalAlpha = 1 } else fadeStart = 0
        }
        screenTexture.needsUpdate = true
      }
      const change = () => {
        if (!shellImage.complete) return
        if (!motion.matches) { const b = before.getContext('2d')!; b.clearRect(0, 0, before.width, before.height); b.drawImage(face, 0, 0); fadeStart = performance.now() }
        paint(lit)
      }
      screens.push({ canvas: face, texture: screenTexture, paint, repaint: () => { if (shellImage.complete) paint(lit) }, change, fading: () => fadeStart > 0, tick: () => paint(lit) })
      return { texture, screenTexture, paint, repaint: () => paint(lit) }
    }
    // Top screen: a header with your name and game, then the room interface; button rectangles are kept for tapping.
    let touchButtons: { id: string; x: number; y: number; w: number; h: number; disabled?: boolean }[] = []
    let touchHover = ''
    const font = (weight: number, size: number) => `${weight} ${size}px "Source Sans 3", sans-serif`
    const paintRoom = (c: CanvasRenderingContext2D, power: number) => {
      const ui = info.current.room, { player: name, game: inserted } = info.current
      const T = TOP, cx = (T.x0 + T.x1) / 2, pad = 18
      touchButtons = []
      c.save(); c.textBaseline = 'middle'
      // Backlight.
      const glow = c.createRadialGradient(cx, T.y0 + 90, 0, cx, T.y0 + 90, 260)
      glow.addColorStop(0, `rgba(236,232,224,${.05 + .06 * power})`); glow.addColorStop(1, 'rgba(236,232,224,0)')
      c.fillStyle = glow; c.fillRect(T.x0, T.y0, T.x1 - T.x0, T.y1 - T.y0)
      // Behind everything: the top screen from your last save, dimmed; without one, your game's art, blurred.
      const backdrop = ui?.save?.top && !ui.art ? saveImage(ui.save.top) : null
      if (backdrop) {
        c.save(); c.imageSmoothingEnabled = false; c.globalAlpha = .5 + .15 * power
        c.drawImage(backdrop, T.x0, T.y0, T.x1 - T.x0, T.y1 - T.y0); c.imageSmoothingEnabled = true; c.globalAlpha = 1
        const shade = c.createLinearGradient(0, T.y0, 0, T.y1); shade.addColorStop(0, 'rgba(8,9,11,.3)'); shade.addColorStop(1, 'rgba(8,9,11,.7)')
        c.fillStyle = shade; c.fillRect(T.x0, T.y0, T.x1 - T.x0, T.y1 - T.y0); c.restore()
      } else if (inserted && ui && Object.keys(ui).length) {
        c.save(); c.beginPath(); c.rect(T.x0, T.y0, T.x1 - T.x0, T.y1 - T.y0); c.clip()
        c.filter = 'blur(14px)'; c.globalAlpha = .32 + .1 * power
        cover(c, boxArt[inserted], T.x0 - 30, T.y0 - 30, T.x1 - T.x0 + 60, T.y1 - T.y0 + 60)
        c.filter = 'none'; c.globalAlpha = 1
        const shade = c.createLinearGradient(0, T.y0, 0, T.y1); shade.addColorStop(0, 'rgba(8,9,11,.35)'); shade.addColorStop(1, 'rgba(8,9,11,.78)')
        c.fillStyle = shade; c.fillRect(T.x0, T.y0, T.x1 - T.x0, T.y1 - T.y0)
        c.restore()
      }
      c.globalAlpha = 1; c.textAlign = 'center'
      if (!ui) { c.restore(); return }
      if (!ui.art && !ui.save?.top && ui.code === undefined && !ui.pair) { drawMark(c, cx, (T.y0 + T.y1) / 2, 1.5); c.restore(); return }
      // Idle with a save: the top screen exactly as you left the game.
      const shot = ui.art && ui.save?.top ? saveImage(ui.save.top) : null
      if (shot) { c.imageSmoothingEnabled = false; c.drawImage(shot, T.x0, T.y0, T.x1 - T.x0, T.y1 - T.y0); c.imageSmoothingEnabled = true }
      else if (ui.art) {
        const aw = 128, ah = aw * 453 / 512, ax = cx - aw / 2, ay = T.y0 + 34
        c.save(); c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 18; c.shadowOffsetY = 8
        c.beginPath(); c.roundRect(ax, ay, aw, ah, 10); c.fillStyle = '#16181b'; c.fill(); c.restore()
        c.save(); c.beginPath(); c.roundRect(ax, ay, aw, ah, 10); c.clip(); cover(c, boxArt[ui.art], ax, ay, aw, ah); c.restore()
        c.save(); c.beginPath(); c.roundRect(ax, ay, aw, ah, 10); c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,255,.16)'; c.stroke(); c.restore()
        c.fillStyle = MARK; c.globalAlpha = 1; c.font = font(600, 22); c.fillText(`Pokémon ${ui.art}`, cx, ay + ah + 26, 320)
      }
      // Box art as a capsule, as in the island; an empty slot is a dashed outline.
      const capsule = (img: HTMLImageElement | undefined, x: number, ay: number, aw: number, ah: number) => {
        c.save(); c.globalAlpha = 1; c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 16; c.shadowOffsetY = 6
        c.beginPath(); c.roundRect(x, ay, aw, ah, 8); c.fillStyle = '#16181b'; c.fill(); c.restore()
        if (img) { c.save(); c.beginPath(); c.roundRect(x, ay, aw, ah, 8); c.clip(); cover(c, img, x, ay, aw, ah); c.restore() }
        c.save(); c.beginPath(); c.roundRect(x, ay, aw, ah, 8); c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,255,.16)'; c.stroke(); c.restore()
      }
      const emptySlot = (x: number, ay: number, aw: number, ah: number) => {
        c.save(); c.beginPath(); c.roundRect(x, ay, aw, ah, 8); c.fillStyle = 'rgba(236,232,224,.07)'; c.fill()
        c.lineWidth = 1.5; c.strokeStyle = 'rgba(236,232,224,.14)'; c.stroke(); c.restore()
      }
      // Linked: both players' box art joined by a glowing link, names beneath.
      if (ui.pair) {
        const { you, partner } = ui.pair, aw = 100, ah = aw * 453 / 512, ay = T.y0 + 52, lx = T.x0 + 34, rx = T.x1 - 34 - aw
        capsule(you.game ? boxArt[you.game] : undefined, lx, ay, aw, ah); capsule(boxArt[partner.game], rx, ay, aw, ah)
        const y0 = ay + ah / 2, x0 = lx + aw + 10, x1 = rx - 10
        if (partner.pairs) {
          const beam = c.createLinearGradient(x0, 0, x1, 0)
          beam.addColorStop(0, 'rgba(255,255,255,0)'); beam.addColorStop(.2, 'rgba(244,241,255,.95)'); beam.addColorStop(.5, 'rgba(233,241,255,1)'); beam.addColorStop(.8, 'rgba(244,241,255,.95)'); beam.addColorStop(1, 'rgba(255,255,255,0)')
          c.save(); c.shadowColor = 'rgba(214,224,255,.9)'; c.shadowBlur = 12; c.fillStyle = beam; c.fillRect(x0, y0 - 1.5, x1 - x0, 3); c.restore()
        } else {
          c.save(); c.strokeStyle = 'rgba(236,232,224,.18)'; c.lineWidth = 2; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y0); c.stroke(); c.restore()
        }
        c.fillStyle = MARK; c.globalAlpha = 1; c.font = font(600, 16)
        c.fillText(you.name || 'Player', lx + aw / 2, ay + ah + 20, aw + 40); c.fillText(partner.name, rx + aw / 2, ay + ah + 20, aw + 40)
        if (partner.simulated) {
          c.font = font(600, 10); const w = c.measureText('TEST').width + 14, px = rx + aw / 2 - w / 2, py = ay + ah + 32
          c.beginPath(); c.roundRect(px, py, w, 16, 8); c.fillStyle = 'rgba(255,255,255,.1)'; c.fill()
          c.fillStyle = 'rgba(236,232,224,.6)'; c.fillText('TEST', rx + aw / 2, py + 8.5)
        }
        c.globalAlpha = 1
      }
      c.textAlign = 'center'
      let y = T.y0 + 56
      if (ui.title) { c.globalAlpha = .95; c.font = font(600, 19); c.fillText(ui.title, cx, y, 300); y += 30 }
      // Tiles: large side-by-side choices with a glyph and a hint.
      if (ui.tiles?.length) {
        const gap = 12, w = (T.x1 - T.x0 - pad * 2 - gap * (ui.tiles.length - 1)) / ui.tiles.length, h = 118, ty = T.y0 + 62
        ui.tiles.forEach((tile, i) => {
          const x = T.x0 + pad + i * (w + gap), hot = touchHover === tile.id, mid = x + w / 2
          c.globalAlpha = 1; c.beginPath(); c.roundRect(x, ty, w, h, 14)
          c.fillStyle = hot ? 'rgba(236,232,224,.15)' : 'rgba(236,232,224,.06)'; c.fill()
          c.lineWidth = 1.5; c.strokeStyle = hot ? 'rgba(236,232,224,.55)' : 'rgba(236,232,224,.16)'; c.stroke()
          c.strokeStyle = MARK; c.lineWidth = 2.2; c.lineCap = 'round'; c.globalAlpha = .9
          c.beginPath(); c.arc(mid, ty + 34, 15, 0, Math.PI * 2); c.stroke()
          c.beginPath()
          if (i === 0) { c.moveTo(mid - 7, ty + 34); c.lineTo(mid + 7, ty + 34); c.moveTo(mid, ty + 27); c.lineTo(mid, ty + 41) }
          else { c.moveTo(mid - 7, ty + 34); c.lineTo(mid + 6, ty + 34); c.moveTo(mid + 1, ty + 29); c.lineTo(mid + 6, ty + 34); c.lineTo(mid + 1, ty + 39) }
          c.stroke()
          c.fillStyle = MARK; c.globalAlpha = 1; c.font = font(600, 22); c.fillText(tile.label, mid, ty + 80, w - 16)
          touchButtons.push({ id: tile.id, x, y: ty, w, h })
        })
        y = ty + h + 14
      }
      // Hosting or joining: your box art and an empty slot for your partner, as in the linked view, with the room code
      // beneath in a glass pill like the island's. While typing, the next place shows a caret.
      if (ui.code !== undefined) {
        const aw = 84, ah = aw * 453 / 512, ay = T.y0 + 24, lx = cx - 26 - aw, rx = cx + 26
        capsule(inserted ? boxArt[inserted] : undefined, lx, ay, aw, ah); emptySlot(rx, ay, aw, ah)
        c.fillStyle = MARK; c.globalAlpha = .9; c.font = font(600, 15); c.fillText(name || 'Player', lx + aw / 2, ay + ah + 16, aw + 30)
        const code = ui.code, pitch = 44, pw = 6 * pitch + 28, ph = 60, px = cx - pw / 2, py = T.y1 - ph - 20, mid = py + ph / 2
        c.save(); c.globalAlpha = 1
        c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 18; c.shadowOffsetY = 6
        c.beginPath(); c.roundRect(px, py, pw, ph, ph / 2); c.fillStyle = 'rgba(22,24,28,.92)'; c.fill(); c.restore()
        c.save(); c.beginPath(); c.roundRect(px, py, pw, ph, ph / 2); c.clip()
        const sheen = c.createLinearGradient(0, py, 0, py + ph); sheen.addColorStop(0, 'rgba(255,255,255,.07)'); sheen.addColorStop(.5, 'rgba(255,255,255,0)')
        c.fillStyle = sheen; c.fillRect(px, py, pw, ph); c.restore()
        c.save(); c.beginPath(); c.roundRect(px + .75, py + .75, pw - 1.5, ph - 1.5, ph / 2); c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,255,.12)'; c.stroke(); c.restore()
        const x0 = cx - pitch * 2.5
        for (let i = 0; i < 6; i++) {
          const x = x0 + i * pitch
          c.globalAlpha = 1
          if (code[i]) { c.fillStyle = '#f4efe6'; c.font = font(600, 34); c.fillText(code[i], x, mid + 1) }
          else if (ui.codeBoxes && i === code.length) { c.fillStyle = '#a8c8e4'; c.fillRect(x - 1.25, mid - 15, 2.5, 30) }
          else { c.globalAlpha = .3; c.fillStyle = MARK; c.beginPath(); c.arc(x, mid, 3, 0, Math.PI * 2); c.fill() }
        }
        c.globalAlpha = 1
        y = T.y1
      }
      c.globalAlpha = .55; c.font = font(400, 14)
      for (const line of ui.lines ?? []) { c.fillText(line, cx, y, 310); y += 19 }
      // Buttons along the bottom: primary pills, quiet ones as text.
      const buttons = ui.buttons ?? []
      if (buttons.length) {
        const by = T.y1 - 40, widths = buttons.map(b => b.primary ? 120 : 112), total = widths.reduce((sum, w) => sum + w, 0) + 10 * (buttons.length - 1)
        let x = cx - total / 2
        buttons.forEach((b, i) => {
          const w = widths[i], hot = touchHover === b.id
          c.globalAlpha = b.disabled ? .35 : 1
          if (b.primary) { c.beginPath(); c.roundRect(x, by, w, 30, 15); c.fillStyle = hot ? '#ffffff' : MARK; c.fill(); c.fillStyle = '#101113'; c.font = font(600, 15) }
          else { if (hot) { c.beginPath(); c.roundRect(x, by, w, 30, 15); c.fillStyle = 'rgba(236,232,224,.1)'; c.fill() } c.fillStyle = MARK; c.globalAlpha *= hot ? 1 : .7; c.font = font(400, 15) }
          c.fillText(b.label, x + w / 2, by + 16, w - 12)
          touchButtons.push({ id: b.id, x, y: by, w, h: 30, disabled: b.disabled })
          x += w + 10
        })
      }
      c.restore()
    }
    // Touch screen: where your last save left off, or the Tandem mark glowing softly before the game has saved.
    const saves = new Map<string, HTMLImageElement>()
    const saveImage = (url: string) => {
      let img = saves.get(url)
      if (!img) { img = new Image(); img.onload = () => { for (const screen of screens) screen.repaint() }; img.src = url; if (saves.size > 6) saves.clear(); saves.set(url, img) }
      return img.complete && img.naturalWidth ? img : null
    }
    const paintTouchScreen = (c: CanvasRenderingContext2D) => {
      const ui = info.current.room
      const cx = (TOUCH.x0 + TOUCH.x1) / 2, cy = (TOUCH.y0 + TOUCH.y1) / 2
      c.save()
      const glow = c.createRadialGradient(cx, cy, 0, cx, cy, 200)
      glow.addColorStop(0, 'rgba(236,232,224,.06)'); glow.addColorStop(1, 'rgba(236,232,224,0)')
      c.fillStyle = glow; c.fillRect(TOUCH.x0, TOUCH.y0, TOUCH.x1 - TOUCH.x0, TOUCH.y1 - TOUCH.y0)
      const img = ui?.save?.bottom ? saveImage(ui.save.bottom) : null
      if (img) {
        c.imageSmoothingEnabled = false; c.globalAlpha = .92
        c.drawImage(img, TOUCH.x0, TOUCH.y0, TOUCH.x1 - TOUCH.x0, TOUCH.y1 - TOUCH.y0)
        c.imageSmoothingEnabled = true; c.globalAlpha = 1
      } else drawMark(c, cx, cy, 1.15)
      c.restore()
    }
    const scenePlace = (x: number) => { const g = new THREE.Group(); g.position.x = x; scene.add(g); consoles.push(g); return g }
    const localDS = scenePlace(LOCAL_X)

    new GLTFLoader().load('./models/ds-lite/ds-lite.glb', async gltf => {
      if (disposed) return
      await shellLoaded
      if (disposed) return
      const template = gltf.scene
      template.scale.setScalar(.005); template.position.x = -.004; template.updateMatrixWorld(true)
      template.traverse(c => {
        if (!(c instanceof THREE.Mesh)) return
        if (c.name === 'Glass') { c.visible = false; return }
        if (c.name === 'base') emptySlot(c)
        for (const m of Array.isArray(c.material) ? c.material : [c.material]) m.dispose()
        const geometry = c.geometry, uv = geometry.getAttribute('uv'), index = geometry.index
        geometry.clearGroups()
        const count = index ? index.count : geometry.getAttribute('position').count
        for (let i = 0; i < count; i += 3) {
          let u = 0, v = 0
          for (let j = 0; j < 3; j++) { const vertex = index ? index.getX(i + j) : i + j; u += uv.getX(vertex) / 3; v += uv.getY(vertex) / 3 }
          geometry.addGroup(i, 3, u > .793 && u < .977 && v > .719 && v < .989 ? 1 : 0)
        }
      })
      for (const [parent, partner] of [[localDS, false]] as const) {
        const ds = template.clone(true)
        const atlas = makeAtlas(partner)
        atlas.paint(0)
        repaint.current = atlas.repaint
        changeScreens.current = () => { for (const screen of screens) screen.change() }
        const shell = dsShellMaterial(atlas.texture, renderer); shellTextures.push(atlas.texture)
        if (!partner) withHighlights(shell, buttonCentres, buttonRadii, buttonGlow)
        const display = new THREE.MeshBasicMaterial({ map: atlas.screenTexture, toneMapped: false, side: THREE.DoubleSide })
        ds.traverse(c => { if (c instanceof THREE.Mesh && c.visible) { c.material = [shell, display]; c.castShadow = true; c.receiveShadow = true } })
        parent.add(ds)
      }
      scene.updateMatrixWorld(true)
      const meshes = (group: THREE.Object3D) => { const list: THREE.Mesh[] = []; group.traverse(o => { if (o instanceof THREE.Mesh && o.visible) list.push(o) }); return list }
      // The port sits on the console's right side wall, level with the hinge; the link leaves the frame towards the partner.
      link = energyLink(meshes(localDS), [], [new THREE.Vector3(LOCAL_X + DS_WIDTH / 2 + .004, .06, -.07), FAR_END], .12)
      portLight.position.set(LOCAL_X + DS_WIDTH / 2 + .05, .08, .02)
      overlay.add(link.group)
      link.group.visible = true; front.compile(overlay, camera); link.group.visible = false
      link.setState(linked)
      dsMeshes = meshes(localDS)
      dsBox = new THREE.Box3().setFromObject(localDS)
      resize()
      // Depth-only copies of the console in the overlay, so the link is hidden wherever the console is in front of it.
      const occluder = new THREE.MeshBasicMaterial({ colorWrite: false })
      for (const m of dsMeshes) { const o = new THREE.Mesh(m.geometry, occluder); o.matrixAutoUpdate = false; o.matrix.copy(m.matrixWorld); o.renderOrder = -10; overlay.add(o) }
      element.dataset.loaded = 'true'
    }, undefined, () => { if (!disposed) setFailed(true) })

    // The link lights the console from its port.
    // An invisible floor that only receives the key light's shadow, so the console sits in the space.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.ShadowMaterial({ opacity: .55 }))
    floor.rotation.x = -Math.PI / 2; floor.position.y = .004; floor.receiveShadow = true
    scene.add(floor)
    preloadSounds()

    const portLight = new THREE.PointLight(0xc9d8ff, 0, .9, 2)
    scene.add(portLight)


    // The link appears only while a partner is connected.
    let link: EnergyLink | undefined, linked: LinkState = linkInitial.current
    let jolt = -1, stopCrackle = () => {}
    linkRef.current = { set: next => {
      if (next === 'linked' && linked !== 'linked') { jolt = performance.now(); if (!motion.matches) igniteSound() }
      stopCrackle(); stopCrackle = next === 'connecting' && !motion.matches ? connectingSound() : () => {}
      linked = next; link?.setState(next)
    } }

    // Cartridge.
    let card: THREE.Group | undefined
    const homeCard = new THREE.Vector3(LOCAL_X - .27, .2, .32)
    const aligned = new THREE.Vector3(LOCAL_X + .00014, .01445, -.2), seated = new THREE.Vector3(LOCAL_X + .00014, .01445, -.0848)
    const initial = new THREE.Quaternion().setFromEuler(new THREE.Euler(-.22, .38, 0, 'YXZ'))
    const orientation = initial.clone(), launchRotation = new THREE.Quaternion()
    const slotRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))
    const travel = new THREE.CubicBezierCurve3(homeCard, new THREE.Vector3(LOCAL_X - .62, .26, .02), new THREE.Vector3(LOCAL_X - .42, .03, -.5), aligned)
    // The cartridge swaps in place when the game changes; the console and lighting stay loaded.
    let cardRequest = 0, arrival = 0
    const swapCard = (next: 'Black 2' | 'White 2' | undefined) => {
      const request = ++cardRequest
      if (card) { scene.remove(card); card.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); for (const m of Array.isArray(o.material) ? o.material : [o.material]) { for (const t of Object.values(m)) if (t instanceof THREE.Texture) t.dispose(); m.dispose() } } }); card = undefined; delete element.dataset.cartridgeLoaded }
      if (!next) return
      void loadCartridge(next, CART_HEIGHT).then(model => {
        if (disposed || request !== cardRequest) return
        card = model
        card.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.side = THREE.DoubleSide } })
        card.position.copy(homeCard); card.scale.setScalar(DISPLAY_SCALE); card.quaternion.copy(orientation)
        scene.add(card); element.dataset.cartridgeLoaded = 'true'; arrival = motion.matches ? 0 : performance.now()
      }).catch(() => { if (!disposed) setFailed(true) })
    }
    cardRef.current = swapCard
    swapCard(gameRef.current)

    let started = 0, inserted = false, clicked = false, completed = false, dragging = false, lastX = 0, lastY = 0, lastInput = performance.now()
    const spin = new THREE.Quaternion(), tilt = new THREE.Quaternion()
    const grabSphere = new THREE.Sphere()
    let velocity = 0, lastMove = 0, lastFrame = performance.now()
    const cameraUp = new THREE.Vector3(), cameraRight = new THREE.Vector3()
    const ray = new THREE.Raycaster(), point = new THREE.Vector2()

    reset.current = () => {
      started = 0; inserted = false; clicked = false; completed = false; dragging = false
      delete element.dataset.insertion; delete element.dataset.phase
      if (card) { card.position.copy(homeCard); card.scale.setScalar(DISPLAY_SCALE); card.quaternion.copy(orientation) }
      for (const s of screens.slice(0, 1)) s.paint(0)
    }
    play.current = () => {
      if (!card || started || inserted) return false
      launchRotation.copy(card.quaternion); dragging = false; started = performance.now(); clicked = false; completed = false
      planPaths()
      element.dataset.insertion = 'playing'
      if (!motion.matches) cartridgeSound(TRAVEL, SEAT)
      return true
    }
    const home0 = initial.clone()
    const turn = (axis: THREE.Vector3, angle: number) => { orientation.premultiply(spin.setFromAxisAngle(axis, angle)).normalize(); lastInput = performance.now() }
    const restore = () => { if (!started && !inserted) { orientation.copy(home0); lastInput = performance.now() } }
    const key = (e: KeyboardEvent) => {
      if (started || inserted || !card) return
      const step = .12
      if (e.key === 'ArrowLeft') turn(cameraUp, -step); else if (e.key === 'ArrowRight') turn(cameraUp, step)
      else if (e.key === 'Home') restore(); else return
      e.preventDefault()
    }
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || started || inserted || !card) return
      const b = element.getBoundingClientRect()
      point.set((e.clientX - b.left) / b.width * 2 - 1, -(e.clientY - b.top) / b.height * 2 + 1)
      ray.setFromCamera(point, camera)
      dragging = ray.ray.intersectsSphere(grabSphere.set(card.position, CART_HEIGHT * DISPLAY_SCALE * .62))
      // A click anywhere else leaves the cartridge's spin and sway alone.
      if (!dragging) return
      velocity = 0
      lastX = e.clientX; lastY = e.clientY; lastInput = performance.now()
      if (dragging) { e.preventDefault(); orientation.copy(card.quaternion); element.setPointerCapture(e.pointerId); element.dataset.dragging = 'true' }
    }
    const move = (e: PointerEvent) => {
      if (!dragging) return
      const angle = (e.clientX - lastX) * .008, stamp = performance.now()
      velocity = THREE.MathUtils.lerp(velocity, angle / Math.max(.008, (stamp - lastMove) / 1000), .5); lastMove = stamp
      spin.setFromAxisAngle(cameraUp, angle); tilt.identity()
      orientation.premultiply(spin).premultiply(tilt).normalize()
      lastX = e.clientX; lastY = e.clientY; lastInput = performance.now()
    }
    const up = (e: PointerEvent) => { if (performance.now() - lastMove > 80) velocity = 0; dragging = false; delete element.dataset.dragging; lastInput = performance.now(); if (element.hasPointerCapture(e.pointerId)) element.releasePointerCapture(e.pointerId) }
    const cancel = () => { dragging = false; delete element.dataset.dragging }
    // Taps on the touch screen's buttons.
    const touchAt = (e: PointerEvent) => {
      if (started || inserted || !dsMeshes.length || !touchButtons.length) return ''
      const b = element.getBoundingClientRect()
      point.set((e.clientX - b.left) / b.width * 2 - 1, -(e.clientY - b.top) / b.height * 2 + 1)
      ray.setFromCamera(point, camera)
      const hit = ray.intersectObjects(dsMeshes, false)[0]
      if (!hit?.uv) return ''
      const x = hit.uv.x * 2048, y = (1 - hit.uv.y) * 2048
      return touchButtons.find(t => !t.disabled && x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h)?.id ?? ''
    }
    const buttonAt = (e: PointerEvent) => {
      const r = element.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top
      let best: typeof BUTTONS[number] | '' = '', bestD = 26
      BUTTONS.forEach((b, i) => { const v = buttonCentres[i].clone().project(camera); const d = Math.hypot(px - (v.x + 1) / 2 * r.width, py - (1 - v.y) / 2 * r.height); if (d < bestD) { best = b; bestD = d } })
      return best
    }
    let hovered = ''
    const controlsMove = (e: PointerEvent) => {
      if (viewRef.current !== 'controls' || blend < .75) return
      const b = buttonAt(e); element.style.cursor = b ? 'pointer' : ''
      if (b !== hovered) { hovered = b; emitButton('hover', b) }
    }
    const controlsDown = (e: PointerEvent) => {
      if (viewRef.current !== 'controls') return
      e.stopImmediatePropagation()
      const id = e.button === 0 ? touchAt(e) : ''
      if (id) { tapped.current?.(id); return }
      if (e.button === 0 && blend > .75) emitButton('pick', buttonAt(e))
    }
    element.addEventListener('pointerdown', controlsDown, { capture: true }); element.addEventListener('pointermove', controlsMove)
    const tap = (e: PointerEvent) => {
      if (e.button !== 0) return
      const id = touchAt(e); if (id) { e.stopImmediatePropagation(); tapped.current?.(id); return }
      // On the main menu the console itself is the button.
      if (menuRef.current !== 'open' && consoleTo.current && !started && !inserted && dsMeshes.length && viewRef.current === 'home') {
        const b = element.getBoundingClientRect()
        point.set((e.clientX - b.left) / b.width * 2 - 1, -(e.clientY - b.top) / b.height * 2 + 1)
        ray.setFromCamera(point, camera)
        if (ray.intersectObjects(dsMeshes, false).length) { e.stopImmediatePropagation(); consoleTo.current() }
      }
    }
    const hoverTouch = (e: PointerEvent) => {
      if (dragging || (!touchButtons.length && !touchHover)) return
      const id = touchAt(e)
      if (id !== touchHover) { touchHover = id; repaint.current() }
      element.style.cursor = id ? 'pointer' : ''
      element.dataset.touchHover = id
    }
    element.addEventListener('pointerdown', tap, { capture: true }); element.addEventListener('pointermove', hoverTouch)
    element.addEventListener('pointerdown', down); element.addEventListener('pointermove', move); element.addEventListener('pointerup', up)
    element.addEventListener('pointercancel', cancel); element.addEventListener('lostpointercapture', cancel)
    element.addEventListener('keydown', key)

    // Centres the console in the window (not just the scene beside the sidebar) and puts the island above it.
    const centre = () => {
      const box = new THREE.Box3().setFromObject(localDS)
      if (box.isEmpty()) return
      const middle = box.getCenter(new THREE.Vector3())
      ISLAND_AT.x = middle.x
      const rect = element.getBoundingClientRect(), want = innerWidth / 2 - rect.left
      for (let i = 0; i < 3; i++) {
        setCamera(homePosition(), home.target); camera.updateMatrixWorld()
        let x0 = Infinity, x1 = -Infinity
        for (let k = 0; k < 8; k++) {
          const v = new THREE.Vector3(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z).project(camera)
          const x = (v.x + 1) / 2 * element.clientWidth; x0 = Math.min(x0, x); x1 = Math.max(x1, x)
        }
        const perPx = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * home.distance * camera.aspect / element.clientWidth
        home.target.x += ((x0 + x1) / 2 - want) * perPx
      }
    }
    const resize = () => {
      const w = element.clientWidth, h = element.clientHeight
      if (!w || !h) return
      const r = pixelRatio(w, h); renderer.setPixelRatio(r); front.setPixelRatio(Math.min(r, devicePixelRatio)); renderer.setSize(w, h); front.setSize(w, h)
      camera.aspect = w / h; camera.updateProjectionMatrix()
      home.distance = fit(1.02, .78, .04)
      { const v = THREE.MathUtils.degToRad(camera.fov / 2); controlsView.distance = Math.max(.42 / Math.tan(v), .46 / (Math.tan(v) * camera.aspect)) }
      if (!started) { centre(); setCamera(homePosition(), home.target) }
      camera.updateMatrixWorld()
      // The cartridge turns about the world vertical only.
      cameraUp.set(0, 1, 0); cameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion)
    }
    const observer = new ResizeObserver(resize); observer.observe(element); resize()

    const position = new THREE.Vector3(), target = new THREE.Vector3()
    let shift = 0, orbit = 0, idleAt = 0, dsBox: THREE.Box3 | null = null
    const sideways = new THREE.Vector3()
    const clock = performance.now()
    renderer.setAnimationLoop(() => {
      if (!element.clientWidth || !element.clientHeight) return
      const now = performance.now(), time = (now - clock) / 1000
      queueMicrotask(() => { lastFrame = now })
      if (card && started) {
        const t = motion.matches ? END : (now - started) / 1000
        const travelT = ease(clamp01(t / TRAVEL)), seatT = clamp01((t - TRAVEL) / (SEAT - TRAVEL))
        if (t < TRAVEL) travel.getPoint(travelT, card.position)
        else card.position.lerpVectors(aligned, seated, seatT * seatT)
        card.scale.setScalar(THREE.MathUtils.lerp(DISPLAY_SCALE, 1, ease(clamp01(t / (TRAVEL * .9)))))
        card.quaternion.slerpQuaternions(launchRotation, slotRotation, ease(clamp01(t / (TRAVEL * .85))))
        if (!clicked && t >= SEAT) { clicked = true; screens[0]?.paint(1) }
        // Camera: home → over the slot → round to the front.
        const toInsert = ease(clamp01(t / TRAVEL))
        const swing = ease(clamp01((t - SEAT - .08) / (COMPLETE + .25 - SEAT - .08)))
        if (swing > 0) { toFront.getPoint(swing, position); target.lerpVectors(insertView.target, frontView.target, swing) }
        else { toSlot.getPoint(toInsert, position); target.copy(home.target).lerp(insertView.target, toInsert) }
        if (t >= SEAT && t < SEAT + .12) position.y += Math.sin((t - SEAT) * 80) * .002 * (1 - (t - SEAT) / .12)
        setCamera(position, target)
        element.dataset.phase = t < TRAVEL ? 'travel' : t < SEAT ? 'insert' : 'seat'
        if (!completed && t >= COMPLETE) { completed = true; complete.current?.() }
        if (t >= END) { started = 0; inserted = true; element.dataset.insertion = 'seated' }
      } else if (card && !inserted) {
        // Released spin carries on and slows with friction.
        if (!dragging && Math.abs(velocity) > .02 && !motion.matches) { const dt = Math.min(.05, (now - lastFrame) / 1000); orientation.premultiply(spin.setFromAxisAngle(cameraUp, velocity * dt)).normalize(); velocity *= Math.exp(-2.6 * dt); lastInput = now } else if (!dragging) velocity = 0
        // Left alone, the cartridge eases back to face the camera, then sways gently.
        if (!dragging && velocity === 0 && now - lastInput > 2600) orientation.slerp(home0, 1 - Math.exp(-Math.min(.05, (now - lastFrame) / 1000) * 2.2))
        const idle = !motion.matches && !dragging && now - lastInput > 1800 ? Math.sin((now - lastInput - 1800) / 1800) * .22 : 0
        card.position.copy(homeCard); card.position.y += motion.matches ? 0 : Math.sin(time * 1.1) * .006
        card.quaternion.copy(orientation).premultiply(spin.setFromAxisAngle(cameraUp, idle))
        // Arrival: drops in from above, where the island is, turning as it comes, and settles.
        if (arrival) {
          const a = clamp01((now - arrival) / 750), fall = 1 - Math.pow(1 - a, 3)
          card.position.y += (1 - fall) * .34; card.position.z -= (1 - fall) * .1
          card.quaternion.premultiply(spin.setFromAxisAngle(cameraUp, (1 - fall) * -1.4))
          if (a >= 1) arrival = 0
        }
        element.dataset.rotation = card.quaternion.toArray().map(v => v.toFixed(3)).join(',')
      }
      // Home and Controls share the scene: the camera eases between their poses, the cartridge steps aside for Controls,
      // and the buttons glow only there.
      const dt = Math.min(.05, (now - lastFrame) / 1000)
      blend += ((viewRef.current === 'controls' ? 1 : 0) - blend) * (motion.matches ? 1 : 1 - Math.exp(-dt * 6))
      if (Math.abs(blend - (viewRef.current === 'controls' ? 1 : 0)) < .002) blend = viewRef.current === 'controls' ? 1 : 0
      // Main menu: the console steps aside to the left while the menu is out.
      // With the menu out, the console and the panels beside it are centred together.
      const perPx = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * home.distance / Math.max(1, element.clientHeight)
      const goal = menuRef.current === 'menu' ? MENU_SHIFT_PX * perPx : 0
      shift += (goal - shift) * (motion.matches ? 1 : 1 - Math.exp(-dt * 6))
      if (Math.abs(goal - shift) < 1e-4) shift = goal
      // On the menu the camera swings round to the right, so the console reads as turned to the left.
      const orbitGoal = menuRef.current === 'menu' ? MENU_TURN : 0
      orbit += (orbitGoal - orbit) * (motion.matches ? 1 : 1 - Math.exp(-dt * 5))
      if (Math.abs(orbitGoal - orbit) < 1e-4) orbit = orbitGoal
      if (!started && !inserted && !(jolt > 0 && now >= jolt)) {
        const e = ease(blend)
        position.copy(homePosition()).lerp(controlsView.target.clone().addScaledVector(controlsView.dir, controlsView.distance), e)
        target.copy(home.target).lerp(controlsView.target, e)
        if (orbit) position.sub(target).applyAxisAngle(UP, orbit).multiplyScalar(1 + orbit / MENU_TURN * .14).add(target)
        // The shift runs along the camera's own right, so the console moves sideways on screen whatever the orbit.
        sideways.set(1, 0, 0).applyAxisAngle(UP, orbit)
        position.addScaledVector(sideways, shift); target.addScaledVector(sideways, shift)
        const lift = -shift * MENU_LIFT_PX / MENU_SHIFT_PX
        position.addScaledVector(UP, lift); target.addScaledVector(UP, lift)
        setCamera(position, target)
      }
      if (card) card.visible = started > 0 || inserted || (blend < .35 && menuRef.current === 'open')
      BUTTONS.forEach((b, i) => {
        const goal = blend < .75 ? 0 : buttonState.pressed.has(b) ? .8 : buttonState.capture === b ? .45 + .25 * Math.sin(now / 150) : buttonState.hover === b ? .45 : .16 + .06 * Math.sin(now / 700 + i * .6)
        buttonGlow.value[i] += (goal - buttonGlow.value[i]) * .25
      })
      if (blend > .75 && viewRef.current === 'controls') {
        camera.updateMatrixWorld()
        const w = element.clientWidth, h = element.clientHeight, points: ButtonAnchors['points'] = {}
        BUTTONS.forEach((b, i) => { const v = buttonCentres[i].clone().project(camera); points[b] = { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h } })
        const box = new THREE.Box3().setFromObject(localDS); let x0 = Infinity, x1 = -Infinity
        for (let k = 0; k < 8; k++) { const v = new THREE.Vector3(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z).project(camera); const x = (v.x + 1) / 2 * w; x0 = Math.min(x0, x); x1 = Math.max(x1, x) }
        const key = [w, h, Math.round(x0), Math.round(x1), ...Object.values(points).map(p => Math.round(p!.x) + ',' + Math.round(p!.y))].join('|')
        if (key !== lastAnchors) { lastAnchors = key; anchorsTo.current?.({ points, left: x0, right: x1, width: w, height: h }) }
        element.dataset.view = 'controls'
      } else if (lastAnchors) { lastAnchors = ''; anchorsTo.current?.(null); delete element.dataset.view }
      // The console's place on screen, for the menu around it.
      const frame = element.parentElement
      if (frame && dsBox) {
        camera.updateMatrixWorld()
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
        for (let k = 0; k < 8; k++) { const v = new THREE.Vector3(k & 1 ? dsBox.max.x : dsBox.min.x, k & 2 ? dsBox.max.y : dsBox.min.y, k & 4 ? dsBox.max.z : dsBox.min.z).project(camera); const x = (v.x + 1) / 2 * element.clientWidth, y = (1 - v.y) / 2 * element.clientHeight; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
        frame.style.setProperty('--ds-left', `${x0.toFixed(0)}px`); frame.style.setProperty('--ds-right', `${x1.toFixed(0)}px`)
        frame.style.setProperty('--ds-top', `${y0.toFixed(0)}px`); frame.style.setProperty('--ds-bottom', `${y1.toFixed(0)}px`)
      }
      // The island's bottom centre follows this point above the console.
      const anchor = ISLAND_AT.clone().project(camera), holder = element.parentElement
      if (holder) { holder.style.setProperty('--island-x', `${((anchor.x + 1) / 2 * element.clientWidth).toFixed(1)}px`); holder.style.setProperty('--island-y', `${((1 - anchor.y) / 2 * element.clientHeight).toFixed(1)}px`) }
      for (const screen of screens) if (screen.fading()) screen.tick()
      // The marks on the screens animate while the menu is up, at about thirty frames a second.
      if (menuRef.current === 'menu' && !motion.matches && now - idleAt > 33) { idleAt = now; for (const screen of screens) if (!screen.fading()) screen.repaint() }
      if (element.dataset.loaded && element.dataset.lightingLoaded && !element.dataset.ready) { element.dataset.ready = 'true'; ready.current?.() }
      link?.update(motion.matches ? 0 : time)
      portLight.intensity = (link?.level ?? 0) * (1.4 + .25 * Math.sin(time * 5.3))
      portLight.color.setHSL((time * .05) % 1, .35, .7)
      if (jolt > 0 && now >= jolt && !started && !motion.matches) {
        const j = (now - jolt) / 1000
        const rest = homePosition()
        if (j < .45) { const k = (1 - j / .45) ** 2 * .006; camera.position.set(rest.x + Math.sin(j * 90) * k, rest.y + Math.cos(j * 70) * k, rest.z); camera.lookAt(home.target) }
        else { jolt = -1; setCamera(rest, home.target) }
      }
      stage.render(camera)
      front.render(overlay, camera)
    })
    return () => {
      disposed = true; observer.disconnect(); renderer.setAnimationLoop(null)
      element.removeEventListener('pointerdown', controlsDown, { capture: true }); element.removeEventListener('pointermove', controlsMove)
      element.removeEventListener('pointerdown', tap, { capture: true }); element.removeEventListener('pointermove', hoverTouch)
      element.removeEventListener('pointerdown', down); element.removeEventListener('pointermove', move); element.removeEventListener('pointerup', up)
      element.removeEventListener('pointercancel', cancel); element.removeEventListener('lostpointercapture', cancel)
      element.removeEventListener('keydown', key)
      stopCrackle(); link?.dispose(); for (const s of screens) s.texture.dispose()
      for (const t of shellTextures) t.dispose()
      stage.dispose(); front.dispose(); front.domElement.remove()
    }
  }, [])
  useEffect(() => { cardRef.current(game) }, [game])
  return <div className="ds-scene shared-scene" ref={host} role="img" tabIndex={0} aria-label="Your console and cartridge. Drag or use the left and right arrow keys to turn the cartridge.">{failed && <span className="model-error">Scene could not load.</span>}</div>
}
