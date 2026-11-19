/** Paints the idle feed for a screen at its device-pixel size. */
export function paintNoSignal(canvas: HTMLCanvasElement, width: number, height: number, touch: boolean, _pixel: number) {
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

}
