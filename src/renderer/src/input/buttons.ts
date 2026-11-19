import * as THREE from 'three'
import type { DSButton } from '../../../shared/emulator'

export const BUTTONS: DSButton[] = ['L', 'R', 'Up', 'X', 'Left', 'Y', 'Right', 'A', 'Down', 'B', 'Select', 'Start']

/** Button surface points on the DS Lite model at its origin and .005 scale, measured by raycasting a render, and highlight radii. */
export const BUTTON_POINTS: Record<DSButton, [number, number, number, number]> = {
  A: [.2588, .0665, .0147, .016], B: [.2246, .0665, .0475, .016], X: [.2246, .0665, -.0193, .016], Y: [.1909, .0665, .0147, .016],
  Start: [.1855, .0632, .1242, .011], Select: [.1855, .0623, .1589, .011],
  Up: [-.2183, .0652, -.005, .015], Down: [-.2183, .0655, .0525, .015], Left: [-.2466, .0653, .0239, .015], Right: [-.1895, .0652, .0238, .015],
  L: [-.2439, .0919, -.0776, .02], R: [.2452, .0919, -.0776, .02]
}

/** What the controls view is doing with the buttons: the scene lights them from this, the overlay writes it. */
export const buttonState = { hover: '' as DSButton | '', capture: '' as DSButton | '', pressed: new Set<DSButton>() }

/** The scene reports pointer hover and clicks on buttons here; the controls overlay listens. */
export const buttonEvents = new EventTarget()
export const emitButton = (type: 'hover' | 'pick', button: DSButton | '') => buttonEvents.dispatchEvent(new CustomEvent(type, { detail: button }))

/** Adds per-button emissive highlights to a shell material: each button glows within its radius by its entry in `glow`. */
export function withHighlights(material: THREE.MeshPhysicalMaterial, centres: THREE.Vector3[], radii: number[], glow: { value: number[] }) {
  const previous = material.onBeforeCompile
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer)
    shader.uniforms.uCentres = { value: centres }; shader.uniforms.uRadii = { value: radii }; shader.uniforms.uGlow = glow
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWorldPos;\nuniform vec3 uCentres[${centres.length}];\nuniform float uRadii[${centres.length}];\nuniform float uGlow[${centres.length}];`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\nfor (int i = 0; i < ${centres.length}; i++) { float d = distance(vWorldPos, uCentres[i]); totalEmissiveRadiance += vec3(1., .94, .86) * uGlow[i] * (1. - smoothstep(uRadii[i] * .35, uRadii[i], d)); }`)
  }
  material.customProgramCacheKey = () => 'ds-highlights'
  material.needsUpdate = true
}
