import * as THREE from 'three'

/**
 * Prismatic energy cable from your console's port out of frame towards your partner. While connecting, a soft
 * glow breathes at its root by the port; on link a bright front runs out along the cable with a light riding it, the
 * root glow dies down, and a soft glow gathers on the shell around the port.
 */

// Camera-facing ribbon along the cable: each vertex is pushed sideways in view space, so the glow has a
// smooth cross profile instead of a tube's hard silhouette.
const cableVertex = /* glsl */`
attribute vec3 aTangent;
attribute float aSide;
uniform float uTime;
uniform float uWidth;
varying vec2 vUv;
varying float vUp;
void main() {
  vUv = uv;
  vec4 view = modelViewMatrix * vec4(position, 1.);
  vec3 tangent = normalize((modelViewMatrix * vec4(aTangent, 0.)).xyz);
  vec3 side = normalize(cross(tangent, normalize(-view.xyz)));
  // Which way across the ribbon is up on screen, so the root flame rises.
  vUp = side.y >= 0. ? 1. : -1.;
  float taper = smoothstep(0., .04, uv.x) * smoothstep(0., .04, 1. - uv.x);
  view.xyz += side * aSide * uWidth * (.35 + .65 * taper);
  // A gentle sway along the free part of the strand.
  float free = sin(uv.x * 3.14159);
  view.y += free * (sin(uTime * .7 + uv.x * 2.3) * .006 + sin(uTime * 1.3 + uv.x * 5.1) * .003);
  gl_Position = projectionMatrix * view;
}`

const cableFragment = /* glsl */`
uniform float uTime;
uniform float uLevel;
uniform float uReach;
uniform float uFlash;
uniform float uKind;
uniform float uPhase;
uniform float uRoot;
varying vec2 vUv;
varying float vUp;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + 1.), u.x), u.y); }
vec3 spectrum(float h) { return clamp(abs(fract(h + vec3(0., .667, .333)) * 6. - 3.) - 1., 0., 1.); }
float fbm(vec2 p) { float v = 0., a = .55; for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 7.1; a *= .5; } return v; }
// Two strands of light spiralling round the core; each is brighter on the side facing you.
float strands(float s, float across, float width) {
  float a = s * 17. - uPhase, total = 0.;
  for (int i = 0; i < 2; i++) {
    float t = a + float(i) * 3.14159;
    float y = sin(t) * .6, facing = .35 + .65 * (.5 + .5 * cos(t));
    total += exp(-pow((across - y) / width, 2.)) * facing;
  }
  return total;
}
void main() {
  // s runs from your port (0) to the far end (1).
  float s = vUv.x, across = vUv.y * 2. - 1.;
  float plasma = noise(vec2(s * 10. - uTime * 1.8, across * 1.5)) * .75 + noise(vec2(s * 22. - uTime * 3.2, across * 3.)) * .25;
  float flow = pow(noise(vec2(s * 9. - uTime * 1.9, 3.7)), 3.) * 1.6;
  vec3 prism = spectrum(s * 1.1 - uTime * .1 + plasma * .2);
  // Ignition: a smooth, bright front runs out from your port; the freshly lit stretch behind it glows warm and
  // cools to the cable's pearl light. Its brightness flickers gently over time, never its shape.
  float frontS = uReach;
  float reach = 1. - smoothstep(frontS - .05, frontS, s);
  float burning = step(uReach, 1.05);
  float flick = .88 + .12 * noise(vec2(uTime * 7., 1.3)) + .06 * noise(vec2(uTime * 19., 4.1));
  // Soft streaks of brighter and dimmer light stream outwards through the burning stretch.
  float streaks = fbm(vec2(s * 46. - uTime * 9., across * 1.6 + uTime * .7));
  float flame = exp(-max(0., frontS - s) * 16.) * reach * burning * flick * (.55 + .9 * streaks);
  vec3 fire = mix(vec3(1., .8, .58), vec3(1., .95, .88), exp(-max(0., frontS - s) * 40.));
  float spark = exp(-pow((s - frontS) * 36., 2.)) * burning * flick;
  vec3 pearl = mix(vec3(1., .97, .94), prism, .24);
  vec3 color; float alpha;
  if (uKind < .5) {
    float core = exp(-across * across * 14.) * (.78 + .22 * plasma);
    float hot = exp(-across * across * 60.);
    float st = strands(s, across, .14) * .8;
    vec3 coreColor = mix(pearl, vec3(1.), hot * .8) * (1. + .35 * plasma + flow);
    vec3 strandColor = mix(vec3(1.), prism, .45) * 1.35;
    float lick = flame * .7 * exp(-across * across * 6.);
    float sum = core + st + spark * exp(-across * across * 4.) + lick;
    color = (coreColor * core + strandColor * st + vec3(2.6) * spark * exp(-across * across * 4.) + fire * 1.6 * lick) / max(sum, 1e-3);
    alpha = min(1., sum);
  } else if (uKind > 2.5) {
    // A soft glow at the cable's root in its own pearl light, leaning slightly upwards and breathing in brightness.
    float up = across * vUp;
    float body = exp(-s * 45.);
    float breathe = .8 + .2 * fbm(vec2(uTime * 2.2, s * 6. - uTime * 1.5));
    // Wisps drift outwards and upwards through the glow; they shade its brightness and never cut its edge.
    float wisps = fbm(vec2(s * 34. - uTime * 4.5, up * 1.8 - uTime * 2.4));
    float heat = body * exp(-pow(up - .12, 2.) * 2.2) * breathe * (.6 + .8 * wisps) * uRoot;
    color = mix(mix(pearl, prism, .25), vec3(1.), smoothstep(.3, .9, heat));
    alpha = min(1., heat * 1.5);
    gl_FragColor = vec4(color * alpha * uLevel, alpha * uLevel);
    return;
  } else {
    float glow = exp(-across * across * 3.2);
    color = mix(vec3(.82, .88, 1.), prism, .38);
    color = mix(color, fire, flame * .8);
    float wide = exp(-across * across * 2.);
    alpha = glow * (.22 + .16 * plasma + .25 * flow) + strands(s, across, .3) * .1 + spark * .9 * wide + wide * flame * .45;
  }
  alpha *= reach * uLevel * (1. + uFlash * 2.5 * exp(-s * 10.));
  gl_FragColor = vec4(color * alpha, alpha);
}`

function ribbon(curve: THREE.Curve<THREE.Vector3>, segments: number) {
  const positions: number[] = [], tangents: number[] = [], sides: number[] = [], uvs: number[] = [], index: number[] = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments, p = curve.getPointAt(t), d = curve.getTangentAt(t)
    for (const side of [-1, 1]) { positions.push(p.x, p.y, p.z); tangents.push(d.x, d.y, d.z); sides.push(side); uvs.push(t, side < 0 ? 0 : 1) }
    if (i < segments) { const k = i * 2; index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2) }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setAttribute('aTangent', new THREE.Float32BufferAttribute(tangents, 3))
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(sides, 1))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.setIndex(index)
  return g
}

const shellVertex = /* glsl */`
varying vec3 vWorld;
varying float vRim;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.);
  vWorld = world.xyz;
  vec3 n = normalize(mat3(modelMatrix) * normal);
  vRim = 1. - abs(dot(n, normalize(cameraPosition - world.xyz)));
  gl_Position = projectionMatrix * viewMatrix * world;
}`

const shellFragment = /* glsl */`
uniform float uTime;
uniform float uLink;
uniform float uWave;
uniform vec3 uPortA;
uniform vec3 uPortB;
varying vec3 vWorld;
varying float vRim;
vec3 spectrum(float h) { return clamp(abs(fract(h + vec3(0., .667, .333)) * 6. - 3.) - 1., 0., 1.); }
void main() {
  float d = min(distance(vWorld, uPortA), distance(vWorld, uPortB));
  float rim = pow(vRim, 3.);
  vec3 color = spectrum(d * 2.5 - uTime * .12);
  float alpha = rim * .35 * uLink * exp(-d * 6.);
  gl_FragColor = vec4(color * alpha, alpha);
}`

export type LinkState = 'idle' | 'connecting' | 'linked'
export type EnergyLink = { group: THREE.Group; update(time: number): void; setState(state: LinkState): void; readonly level: number; dispose(): void }

function glowTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128
  const c = canvas.getContext('2d')!
  const g = c.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.08, 'rgba(255,252,246,.9)'); g.addColorStop(.25, 'rgba(220,230,255,.32)'); g.addColorStop(.55, 'rgba(190,205,255,.08)'); g.addColorStop(1, 'rgba(190,205,255,0)')
  c.fillStyle = g; c.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; return t
}

/** `local` and `partner` are the console meshes with up-to-date world matrices; `ports` are their sockets. */
export function energyLink(local: THREE.Mesh[], partner: THREE.Mesh[], ports: [THREE.Vector3, THREE.Vector3], lift: number): EnergyLink {
  const [from, to] = ports
  // Leaves the port sideways, then sweeps away towards the far end.
  const curve = new THREE.CubicBezierCurve3(from, from.clone().add(new THREE.Vector3(.3, -.03, .08)), to.clone().add(new THREE.Vector3(-1.4, lift * .3, .5)), to)
  const materials: THREE.ShaderMaterial[] = []
  const cableMaterial = (kind: number, width: number) => {
    const m = new THREE.ShaderMaterial({
      vertexShader: cableVertex, fragmentShader: cableFragment,
      uniforms: { uTime: { value: 0 }, uLevel: { value: 0 }, uReach: { value: 0 }, uFlash: { value: 0 }, uKind: { value: kind }, uWidth: { value: width }, uPhase: { value: 0 }, uRoot: { value: 0 } },
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, toneMapped: false
    })
    materials.push(m); return m
  }
  const group = new THREE.Group()
  const geometries = [ribbon(curve, 600), ribbon(curve, 600), ribbon(curve, 600)]
  const halo = new THREE.Mesh(geometries[0], cableMaterial(1, .05)), core = new THREE.Mesh(geometries[1], cableMaterial(0, .012))
  const fire = new THREE.Mesh(geometries[2], cableMaterial(3, .04))
  halo.frustumCulled = core.frustumCulled = fire.frustumCulled = false
  group.add(halo, core, fire)

  const shell = new THREE.ShaderMaterial({
    vertexShader: shellVertex, fragmentShader: shellFragment,
    uniforms: { uTime: { value: 0 }, uLink: { value: 0 }, uWave: { value: -1 }, uPortA: { value: from.clone() }, uPortB: { value: to.clone() } },
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false
  })
  for (const mesh of [...local, ...partner]) {
    const skin = new THREE.Mesh(mesh.geometry, shell)
    skin.matrixAutoUpdate = false; skin.matrix.copy(mesh.matrixWorld)
    group.add(skin)
  }

  const texture = glowTexture()
  const sockets = ports.map(port => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, transparent: true, toneMapped: false }))
    sprite.position.copy(port); group.add(sprite); return sprite
  })
  const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, transparent: true, toneMapped: false }))
  head.visible = false; group.add(head)
  group.visible = false

  let state: LinkState = 'idle', level = 0, reach = 0, last = 0, ignitedAt = -1, phase = 0
  return {
    group,
    get level() { return level },
    setState(next) {
      if (next === 'linked' && state !== 'linked') ignitedAt = last
      if (next !== 'linked') ignitedAt = -1
      state = next
    },
    update(time) {
      const dt = Math.min(.1, Math.max(0, time - last)); last = time
      level = THREE.MathUtils.clamp(level + (state === 'idle' ? -dt / .4 : dt / .15), 0, 1)
      const since = ignitedAt >= 0 ? time - ignitedAt : -1
      // The flame catches slowly, then rushes along the cable.
      if (state === 'linked') reach = Math.min(1.1, Math.pow(since * 2.2, 1.4))
      else if (state === 'connecting') reach = .012 + .028 * Math.abs(Math.sin(time * 17) * Math.sin(time * 5.3) * Math.sin(time * 2.9))
      else if (level === 0) reach = 0
      const flash = since >= 0 ? Math.exp(-since * 5) * .8 : 0
      // The root flickers while connecting and dies down after the link catches.
      const root = state === 'connecting' ? 1 : since >= 0 ? Math.exp(-since * 2.2) : 0
      // The strands spin up fast at ignition and settle.
      phase += dt * (1.1 + (since >= 0 ? 5 * Math.exp(-since * 2.5) : 0))
      const sparking = state === 'connecting' ? .45 + .55 * Math.abs(Math.sin(time * 23) * Math.sin(time * 7.7)) : 1
      group.visible = level > 0
      for (const m of materials) { m.uniforms.uTime.value = time; m.uniforms.uLevel.value = level * sparking; m.uniforms.uReach.value = reach; m.uniforms.uPhase.value = phase; m.uniforms.uRoot.value = root; m.uniforms.uFlash.value = flash }
      shell.uniforms.uTime.value = time
      shell.uniforms.uLink.value = state === 'linked' ? Math.min(1, since * 2) * (.85 + .15 * Math.sin(time * 2.1)) : 0
      // The travelling light rides the front while it is on screen and fades as it leaves.
      const front = Math.min(reach, 1)
      head.visible = state === 'linked' && reach > .005 && reach < 1.05
      if (head.visible) {
        curve.getPointAt(front, head.position)
        const size = .07 * (.9 + .1 * Math.sin(time * 31)) * (1 - front * .4)
        head.scale.set(size * 1.4, size, 1); head.material.opacity = level * Math.min(1, (1.05 - reach) * 6)
      }
      for (const socket of sockets) {
        socket.scale.set(((state === 'linked' ? .09 : .05 * sparking) + .03 * flash) * 1.6, (state === 'linked' ? .09 : .05 * sparking) + .03 * flash, 1)
        socket.material.opacity = level * (state === 'linked' ? .9 : .7 * sparking)
      }
    },
    dispose() { for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); shell.dispose(); texture.dispose(); for (const s of sockets) s.material.dispose(); head.material.dispose() }
  }
}
