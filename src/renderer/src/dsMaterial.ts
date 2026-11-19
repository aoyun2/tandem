import * as THREE from 'three'

let normals: Promise<THREE.Texture | null> | null = null

/** Tangent-space normal map derived from the DS Lite bump map with a Sobel filter; shared by every scene. */
export function dsNormalMap(strength = 3) {
  normals ??= new Promise(resolve => {
    const img = new Image()
    img.onerror = () => resolve(null)
    img.onload = () => {
      const w = img.width, h = img.height
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
      const c = canvas.getContext('2d', { willReadFrequently: true })!
      c.drawImage(img, 0, 0)
      const src = c.getImageData(0, 0, w, h).data, out = c.createImageData(w, h), o = out.data
      const at = (x: number, y: number) => src[(Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 4] / 255
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) / 4
        const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)) / 4
        // Image rows run down while texture v runs up, so the y slope keeps its sign.
        let nx = -dx * strength, ny = dy * strength, nz = 1
        const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len
        const i = (y * w + x) * 4
        o[i] = (nx * .5 + .5) * 255; o[i + 1] = (ny * .5 + .5) * 255; o[i + 2] = (nz * .5 + .5) * 255; o[i + 3] = 255
      }
      c.putImageData(out, 0, 0)
      const texture = new THREE.CanvasTexture(canvas)
      texture.colorSpace = THREE.NoColorSpace; texture.anisotropy = 8
      resolve(texture)
    }
    img.src = './models/ds-lite/DS_bump_map.png'
  })
  return normals
}

/** DS Lite shell: the painted atlas over glossy coated plastic, with the derived normal map once it is ready. */
export function dsShellMaterial(map: THREE.Texture, renderer: THREE.WebGLRenderer) {
  map.anisotropy = renderer.capabilities.getMaxAnisotropy()
  const material = new THREE.MeshPhysicalMaterial({
    map, color: 0xffffff, roughness: .42, metalness: 0, clearcoat: .55, clearcoatRoughness: .16,
    specularIntensity: .45, envMapIntensity: .8, side: THREE.DoubleSide
  })
  void dsNormalMap().then(normal => {
    if (!normal) return
    normal.anisotropy = map.anisotropy
    material.normalMap = normal; material.normalScale.set(1, 1)
    material.needsUpdate = true
  })
  return material
}
