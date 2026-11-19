import * as THREE from 'three'
import { pixelRatio } from '../studio'
import { BOOT_SCREEN_LENGTH, PICTURE_AT, fragmentSource, vertexSource } from '../display/bootShader'
import { paintNoSignal } from '../display/noSignal'
import { playBootSound } from '../display/bootAudio'
import { DS_SCREEN } from '../../../shared/emulator'

type Source = 'local' | 'partner'
type Screen = {
  quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>; halo: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  source: Source; touch: boolean; delay: number; idle: THREE.CanvasTexture; glow: THREE.Vector3; target: THREE.Vector3
}
type Slot = { position: THREE.Vector3; yaw: number }
export type CockpitLayout = { partner: DOMRect | null; front: DOMRect | null; localBottom: { x: number; y: number } | null; stations?: { local: DOMRect; partner?: DOMRect } }

const SCREEN_W = .8, SCREEN_H = .6, HINGE_GAP = .06
/** The top screen leans back slightly; the touch screen folds towards the player about the hinge. */
const TOP_TILT = -.05, TOUCH_TILT = -.32
const SLOTS: Record<'front' | 'back', Slot> = {
  front: { position: new THREE.Vector3(0, 0, 0), yaw: 0 },
  back: { position: new THREE.Vector3(1.3, .02, -1.9), yaw: -.3 }
}
/** Swap paths bow apart so the two pairs pass beside each other: the outgoing pair swings right and back, the incoming pair left and forward. */
const SWAP_BOW = { back: new THREE.Vector3(.65, .05, 0), front: new THREE.Vector3(-.55, -.03, .45) }
const SWAP_SECONDS = .9
/** Normalised-device bounds the screens are fitted into; the bottom leaves room for the key strip. */
const FRAME = { left: -.9, right: .9, bottom: -.64, top: .8 }
const VIEW_DIR = new THREE.Vector3(0, .1, 1).normalize()

const backingVertex = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`
/** Smoked glass behind each screen: a rounded rectangle with a hairline edge that catches light along the top. */
const backingFragment = `
varying vec2 vUv;
uniform vec2 uAspect;
uniform float uLevel;
float box(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r; }
void main() {
  vec2 p = (vUv - .5) * uAspect;
  float d = box(p, uAspect * .5, .022);
  float inside = 1. - smoothstep(-.0015, .0015, d);
  float edge = (1. - smoothstep(0., .003, abs(d + .002))) * (.35 + .65 * smoothstep(.0, 1., vUv.y));
  vec3 glass = mix(vec3(.028, .03, .034), vec3(.05, .053, .06), vUv.y);
  vec3 lit = edge * vec3(.32, .34, .38) * (.4 + .6 * uLevel);
  float alpha = inside * .94;
  gl_FragColor = vec4(glass + lit, alpha);
}`
/** Light the screen throws onto the space around it, tinted by the picture. */
const haloFragment = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uLevel;
void main() {
  vec2 p = (vUv - .5) * vec2(1.7, 1.);
  vec2 e = abs(vUv - .5);
  float falloff = exp(-dot(p, p) * 12.) * (1. - smoothstep(.3, .5, max(e.x, e.y)));
  gl_FragColor = vec4(uColor * falloff * uLevel * .22, 1.);
}`

/**
 * The play view as a 3D cockpit of free-standing displays. Your top and touch screens stand in front;
 * in Soul Link your partner's pair stands behind and to the right, and spectating swaps the two pairs along bowed paths.
 * Each screen runs the power-on and then the steady screen look.
 */
export class Cockpit {
  readonly length = 1.05 + BOOT_SCREEN_LENGTH
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(26, 1, .05, 40)
  private screens: Screen[] = []
  private stations: Record<Source, THREE.Group> = { local: new THREE.Group(), partner: new THREE.Group() }
  private live: Record<Source, THREE.DataTexture | null> = { local: null, partner: null }
  private frameCount: Record<Source, number> = { local: 0, partner: 0 }
  private started = performance.now()
  private seekTime: number | null = null
  private holding: boolean
  private holdTimer = 0
  private state: 'booting' | 'done' | null = null
  private stopSound = () => {}
  private pointer = new THREE.Vector2()
  private sway = new THREE.Vector2()
  private focus: Source = 'local'
  private swap: { started: number; from: Record<Source, Slot> } | null = null
  private eye = new THREE.Vector3()
  private look = new THREE.Vector3()
  private fit = { target: new THREE.Vector3(), distance: 4, ready: false }
  private observer: ResizeObserver
  private disposed = false
  private ray = new THREE.Raycaster()
  private materials: THREE.Material[] = []
  private geometries: THREE.BufferGeometry[] = []
  /** Called once, when the last screen's picture has faded in. */
  onPicture: () => void = () => {}
  private pictured = false

  constructor(private host: HTMLElement, private onState: (state: 'booting' | 'done') => void, private onLayout: (layout: CockpitLayout) => void, private reducedMotion = false, waitMs = 0, private solo = false) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(pixelRatio(host.clientWidth, host.clientHeight))
    this.renderer.setClearColor(0, 0)
    this.renderer.domElement.className = 'cockpit-canvas'
    host.append(this.renderer.domElement)

    this.build('local', 0, .4)
    if (!solo) this.build('partner', .65, 1.05)
    this.place('local', SLOTS.front); this.place('partner', SLOTS.back)
    this.scene.add(this.stations.local, this.stations.partner)

    this.holding = !reducedMotion && waitMs > 0
    if (this.holding) this.holdTimer = window.setTimeout(() => this.beginBoot(), waitMs)
    if (reducedMotion) this.seekTime = this.length
    else if (!this.holding) this.playSound()

    host.addEventListener('pointermove', this.move)
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(host); this.resize()
    this.renderer.setAnimationLoop(this.render)
  }

  private build(source: Source, topDelay: number, touchDelay: number) {
    const group = this.stations[source]
    const plane = (w: number, h: number) => { const g = new THREE.PlaneGeometry(w, h); this.geometries.push(g); return g }
    for (const touch of [false, true]) {
      const idle = new THREE.CanvasTexture(document.createElement('canvas'))
      paintNoSignal(idle.image as HTMLCanvasElement, 1024, 768, touch, 2)
      idle.colorSpace = THREE.NoColorSpace; idle.minFilter = THREE.LinearFilter; idle.flipY = false; idle.needsUpdate = true
      const screenMaterial = new THREE.ShaderMaterial({
        vertexShader: vertexSource, fragmentShader: fragmentSource, toneMapped: false,
        uniforms: {
          uFeed: { value: idle }, uSize: { value: new THREE.Vector2(800, 600) }, uTime: { value: 0 }, uSeed: { value: touch ? 9 : 1 },
          uDone: { value: 0 }, uRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uTexSize: { value: new THREE.Vector2(1024, 768) }
        }
      })
      const margin = .045
      const backingMaterial = new THREE.ShaderMaterial({
        vertexShader: backingVertex, fragmentShader: backingFragment, transparent: true, depthWrite: false, toneMapped: false,
        uniforms: { uAspect: { value: new THREE.Vector2(SCREEN_W + margin, SCREEN_H + margin) }, uLevel: { value: 0 } }
      })
      const haloMaterial = new THREE.ShaderMaterial({
        vertexShader: backingVertex, fragmentShader: haloFragment, transparent: true, depthWrite: false, toneMapped: false,
        // Adds light only; alpha is left alone so the page behind the canvas stays visible.
        blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
        uniforms: { uColor: { value: new THREE.Vector3(.5, .52, .56) }, uLevel: { value: 0 } }
      })
      this.materials.push(screenMaterial, backingMaterial, haloMaterial)
      const quad = new THREE.Mesh(plane(SCREEN_W, SCREEN_H), screenMaterial)
      const backing = new THREE.Mesh(plane(SCREEN_W + margin, SCREEN_H + margin), backingMaterial); backing.position.z = -.006; backing.renderOrder = -1
      const halo = new THREE.Mesh(plane(SCREEN_W * 2.6, SCREEN_H * 2.4), haloMaterial); halo.position.z = -.05; halo.renderOrder = -2
      // Hinge at y = 0: the top screen rises from it, the touch screen hangs below and folds towards the player.
      const pivot = new THREE.Group(), face = new THREE.Group()
      pivot.rotation.x = touch ? TOUCH_TILT : TOP_TILT
      face.position.y = touch ? -(SCREEN_H / 2 + HINGE_GAP / 2) : SCREEN_H / 2 + HINGE_GAP / 2
      face.add(halo, backing, quad); pivot.add(face); group.add(pivot)
      this.screens.push({ quad, halo, source, touch, delay: touch ? touchDelay : topDelay, idle, glow: new THREE.Vector3(.5, .52, .56), target: new THREE.Vector3(.5, .52, .56) })
    }
  }

  get time() { return this.seekTime ?? (this.holding ? 0 : (performance.now() - this.started) / 1000) }

  beginBoot() {
    if (!this.holding || this.disposed) return
    this.holding = false; clearTimeout(this.holdTimer)
    this.started = performance.now(); this.playSound()
  }

  seek(seconds: number | null) {
    if (seconds !== null) { this.stopSound(); this.stopSound = () => {} }
    if (seconds === null && this.seekTime !== null) this.started = performance.now() - this.seekTime * 1000
    this.seekTime = seconds
  }

  setFrame(source: Source, width: number, height: number, pixels: Uint8Array) {
    let texture = this.live[source]
    if (!texture || texture.image.width !== width || texture.image.height !== height) {
      texture?.dispose()
      texture = new THREE.DataTexture(new Uint8Array(width * height * 4), width, height, THREE.RGBAFormat)
      texture.colorSpace = THREE.NoColorSpace; texture.minFilter = texture.magFilter = THREE.LinearFilter; texture.flipY = false
      this.live[source] = texture
      for (const s of this.screens) if (s.source === source) {
        const u = s.quad.material.uniforms
        u.uFeed.value = texture; u.uTexSize.value.set(width, height); u.uRect.value.set(0, s.touch ? .5 : 0, 1, .5)
      }
    }
    ;(texture.image.data as Uint8Array).set(pixels)
    texture.needsUpdate = true
    // Average colour of each screen, sampled sparsely every few frames, tints its halo.
    if (this.frameCount[source]++ % 6 === 0) for (const s of this.screens) if (s.source === source) {
      let r = 0, g = 0, b = 0, n = 0
      const y0 = s.touch ? height / 2 : 0
      for (let y = y0 + 4; y < y0 + height / 2; y += 12) for (let x = 4; x < width; x += 12) { const i = (y * width + x) * 4; r += pixels[i]; g += pixels[i + 1]; b += pixels[i + 2]; n++ }
      if (n) s.target.set(r / n / 255, g / n / 255, b / n / 255)
    }
    if (source === 'local') this.beginBoot()
  }

  setFocus(focus: Source) {
    if (focus === this.focus || this.solo) return
    const slot = (s: Source): Slot => ({ position: this.stations[s].position.clone(), yaw: this.stations[s].rotation.y })
    this.swap = this.reducedMotion ? null : { started: performance.now(), from: { local: slot('local'), partner: slot('partner') } }
    this.focus = focus
  }

  /** Maps a pointer position to coordinates on the focused touch screen, or null when it misses. */
  touchPoint(clientX: number, clientY: number) {
    const r = this.host.getBoundingClientRect()
    this.ray.setFromCamera(new THREE.Vector2((clientX - r.left) / r.width * 2 - 1, -(clientY - r.top) / r.height * 2 + 1), this.camera)
    const target = this.screens.find(s => s.source === this.focus && s.touch)
    const hit = target && this.ray.intersectObject(target.quad, false)[0]
    if (!hit?.uv) return null
    return { x: Math.min(DS_SCREEN.width - 1, hit.uv.x * DS_SCREEN.width), y: Math.min(DS_SCREEN.height - 1, (1 - hit.uv.y) * DS_SCREEN.height) }
  }

  dispose() {
    this.disposed = true
    this.stopSound(); clearTimeout(this.holdTimer)
    this.renderer.setAnimationLoop(null)
    this.observer.disconnect()
    this.host.removeEventListener('pointermove', this.move)
    for (const s of this.screens) s.idle.dispose()
    for (const t of Object.values(this.live)) t?.dispose()
    for (const m of this.materials) m.dispose()
    for (const g of this.geometries) g.dispose()
    this.renderer.dispose(); this.renderer.domElement.remove()
  }

  private playSound() {
    this.stopSound()
    if (this.reducedMotion) return
    const screens = [{ delay: 0, gain: 1, pan: -.04 }, { delay: .4, gain: .8, pan: .04 }, { delay: .65, gain: .4, pan: .5, distance: 1 }, { delay: 1.05, gain: .35, pan: .55, distance: 1 }]
    try { this.stopSound = playBootSound(this.solo ? screens.slice(0, 2) : screens) } catch { this.stopSound = () => {} }
  }

  private move = (e: PointerEvent) => {
    const r = this.host.getBoundingClientRect()
    this.pointer.set((e.clientX - r.left) / r.width * 2 - 1, (e.clientY - r.top) / r.height * 2 - 1)
  }

  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight
    if (!w || !h) return
    this.renderer.setPixelRatio(pixelRatio(w, h)); this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix()
  }

  private place(source: Source, slot: Slot) {
    this.stations[source].position.copy(slot.position)
    this.stations[source].rotation.y = slot.yaw
  }

  /** Station placement for this frame: at rest in its slot, or partway along its bowed swap path. */
  private arrange(now: number) {
    const slotOf = (s: Source) => s === this.focus ? 'front' : 'back'
    if (!this.swap) { for (const s of ['local', 'partner'] as const) this.place(s, SLOTS[slotOf(s)]); return }
    const t = Math.min(1, (now - this.swap.started) / 1000 / SWAP_SECONDS)
    const e = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    for (const s of ['local', 'partner'] as const) {
      const from = this.swap.from[s], to = SLOTS[slotOf(s)]
      const position = from.position.clone().lerp(to.position, e).addScaledVector(SWAP_BOW[slotOf(s)], Math.sin(Math.PI * e))
      this.place(s, { position, yaw: from.yaw + (to.yaw - from.yaw) * e })
    }
    if (t >= 1) this.swap = null
  }

  private corners(source?: Source) {
    const points: THREE.Vector3[] = []
    for (const s of this.screens) {
      if (source && s.source !== source) continue
      for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) points.push(new THREE.Vector3(x * SCREEN_W / 2, y * SCREEN_H / 2, 0).applyMatrix4(s.quad.matrixWorld))
    }
    return points
  }

  /** Moves the fitted camera target and distance so both pairs of screens sit inside FRAME, measured at rest in their slots. */
  private refit() {
    const points = this.corners()
    if (!this.fit.ready) { new THREE.Box3().setFromPoints(points).getCenter(this.fit.target); this.fit.ready = true }
    const camera = this.camera.clone()
    for (let i = 0; i < 4; i++) {
      camera.position.copy(this.fit.target).addScaledVector(VIEW_DIR, this.fit.distance); camera.lookAt(this.fit.target); camera.updateMatrixWorld()
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
      for (const p of points) { const v = p.clone().project(camera); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y) }
      const scale = Math.max((x1 - x0) / (FRAME.right - FRAME.left), (y1 - y0) / (FRAME.top - FRAME.bottom))
      const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * this.fit.distance, halfW = halfH * camera.aspect
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion), up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion)
      this.fit.target.addScaledVector(right, ((x0 + x1) / 2 - (FRAME.left + FRAME.right) / 2) * halfW).addScaledVector(up, ((y0 + y1) / 2 - (FRAME.bottom + FRAME.top) / 2) * halfH)
      this.fit.distance *= scale
    }
  }

  private render = () => {
    if (this.disposed || !this.host.clientWidth) return
    const now = performance.now()
    const time = this.time, done = time >= this.length

    // Fit the camera to the stations at rest, then place them for this frame.
    for (const s of ['local', 'partner'] as const) this.place(s, SLOTS[s === this.focus ? 'front' : 'back'])
    this.scene.updateMatrixWorld()
    this.refit()
    this.arrange(now)
    this.scene.updateMatrixWorld()

    const eye = this.fit.target.clone().addScaledVector(VIEW_DIR, this.fit.distance)
    const k = this.reducedMotion ? 1 : 1 - Math.exp(-1 / 60 * 4)
    if (!this.eye.lengthSq()) { this.eye.copy(eye); this.look.copy(this.fit.target) }
    this.eye.lerp(eye, k); this.look.lerp(this.fit.target, k)
    // Head sway: follows the pointer a little, plus a slow idle drift.
    const drift = this.reducedMotion ? 0 : 1, d = this.fit.distance
    this.sway.lerp(this.pointer, .04)
    this.camera.position.copy(this.eye).add(new THREE.Vector3((this.sway.x * .025 + Math.sin(now / 3100) * .004 * drift) * d, (-this.sway.y * .016 + Math.sin(now / 2300) * .003 * drift) * d, 0))
    this.camera.lookAt(this.look); this.camera.updateMatrixWorld()

    const pixel = this.renderer.getPixelRatio(), size = new THREE.Vector2(this.host.clientWidth * pixel, this.host.clientHeight * pixel)
    for (const s of this.screens) {
      const u = s.quad.material.uniforms, local = time - s.delay
      u.uTime.value = local; u.uDone.value = local >= BOOT_SCREEN_LENGTH ? 1 : 0
      const [tl, tr, bl] = [[-1, 1], [1, 1], [-1, -1]].map(([x, y]) => new THREE.Vector3(x * SCREEN_W / 2, y * SCREEN_H / 2, 0).applyMatrix4(s.quad.matrixWorld).project(this.camera))
      u.uSize.value.set(Math.max(1, Math.hypot((tr.x - tl.x) * size.x, (tr.y - tl.y) * size.y) / 2), Math.max(1, Math.hypot((bl.x - tl.x) * size.x, (bl.y - tl.y) * size.y) / 2))
      // Backing edge and halo follow the screen's power: off, backlight, picture.
      const level = local <= .3 ? 0 : Math.min(1, (local - .3) / 1.2)
      s.glow.lerp(s.target, .08)
      s.halo.material.uniforms.uColor.value.copy(s.glow).multiplyScalar(.6).addScalar(.12)
      s.halo.material.uniforms.uLevel.value = level
      const backing = (s.halo.parent!.children[1] as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>).material.uniforms
      backing.uLevel.value = level
    }
    this.renderer.render(this.scene, this.camera)
    this.host.dataset.bootTime = time.toFixed(3)
    const lastStart = Math.max(...this.screens.map(s => s.delay))
    if (!this.pictured && time >= lastStart + PICTURE_AT + .9) { this.pictured = true; this.onPicture() }
    const state = done ? 'done' : 'booting'
    if (state !== this.state) { this.state = state; this.onState(state) }
    this.onLayout(this.layout())
  }

  private layout(): CockpitLayout {
    const r = this.host.getBoundingClientRect()
    const project = (points: THREE.Vector3[]) => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
      for (const p of points) {
        const v = p.clone().project(this.camera), x = (v.x + 1) / 2 * r.width, y = (1 - v.y) / 2 * r.height
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
      }
      return new DOMRect(x0, y0, x1 - x0, y1 - y0)
    }
    const mine = project(this.corners(this.focus))
    if (this.solo) return { partner: null, front: mine, localBottom: { x: mine.x + mine.width / 2, y: mine.bottom }, stations: { local: mine } }
    const other = project(this.corners(this.focus === 'local' ? 'partner' : 'local'))
    return { partner: other, front: mine, localBottom: { x: mine.x + mine.width / 2, y: mine.bottom }, stations: { local: project(this.corners('local')), partner: project(this.corners('partner')) } }
  }
}
