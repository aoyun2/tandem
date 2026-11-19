/** Paints the idle feed for a screen at its device-pixel size. */
export function paintNoSignal(canvas: HTMLCanvasElement, width: number, height: number, touch: boolean, pixel: number) {
  canvas.width = Math.max(1, width)
  canvas.height = Math.max(1, height)
  const c = canvas.getContext('2d')!
  if (touch) {
    const fill = c.createLinearGradient(0, 0, width * .5, height)
    fill.addColorStop(0, '#0d0d0e'); fill.addColorStop(1, '#070708')
    c.fillStyle = fill; c.fillRect(0, 0, width, height)
    return
  }
  const fill = c.createRadialGradient(width / 2, height * .2, 0, width / 2, height * .2, Math.hypot(width, height) * .62)
  fill.addColorStop(0, '#141415'); fill.addColorStop(.5, '#0b0b0c'); fill.addColorStop(1, '#060607')
  c.fillStyle = fill; c.fillRect(0, 0, width, height)
  const scale = pixel * Math.min(1, Math.max(.6, height / pixel / 380))
  const icon = 34 * scale, cx = width / 2, cy = height / 2 - 14 * scale
  c.save()
  c.translate(cx - icon / 2, cy - icon / 2); c.scale(icon / 48, icon / 48)
  c.strokeStyle = '#5c5953'; c.lineWidth = 48 / icon * Math.max(1, scale)
  c.stroke(new Path2D('M4 16V4h12M32 4h12v12M44 32v12H32M16 44H4V32M18 24h12'))
  c.restore()
  c.fillStyle = '#6a665f'; c.textAlign = 'center'; c.textBaseline = 'middle'
  c.font = `400 ${Math.round(14 * scale)}px "Source Sans 3", sans-serif`
  c.fillText('No signal', cx, cy + icon / 2 + 22 * scale)
}
