/**
 * Power-on and steady look of one DS screen. The backlight strikes with a short flicker and glows unevenly
 * through the light guide; the picture fades in over it from a cool, contrasty grade, blooms warm and
 * settles into the steady screen look: square pixels, a faint pixel grid, soft contrast, lifted blacks,
 * backlight falloff and a glass sheen.
 */
/** Seconds after a screen starts when the backlight strikes, the picture appears, and the grade settles. */
export const BACKLIGHT_AT = 0.3
export const PICTURE_AT = 0.85
export const SETTLE_AT = 2.1
export const SETTLE_LENGTH = 1.3
/** Seconds from a screen's start until it shows the steady picture. */
export const BOOT_SCREEN_LENGTH = SETTLE_AT + SETTLE_LENGTH

export const vertexSource = `
varying vec2 vUv;
void main() {
  vUv = vec2(uv.x, 1. - uv.y);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
}`

const f = (n: number) => n.toFixed(4)
export const fragmentSource = `
varying vec2 vUv;
uniform sampler2D uFeed;
uniform vec2 uSize;
uniform float uTime;
uniform float uSeed;
uniform float uDone;
uniform vec4 uRect;
uniform vec2 uTexSize;

const float BACKLIGHT = ${f(BACKLIGHT_AT)};
const float PICTURE = ${f(PICTURE_AT)};
const float SETTLE = ${f(SETTLE_AT)};
const float SETTLE_LENGTH = ${f(SETTLE_LENGTH)};

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed * 17.3) * 43758.5453); }

// Sharp bilinear: nearest-looking texels with a one-pixel blend at their edges.
vec3 sharp(vec2 uv) {
  vec2 texel = (uRect.xy + uv * uRect.zw) * uTexSize;
  vec2 scale = max(uSize / (uTexSize * uRect.zw), vec2(1.));
  vec2 range = .5 - .5 / scale;
  vec2 center = fract(texel) - .5;
  vec2 g = (center - clamp(center, -range, range)) * scale + .5;
  return texture(uFeed, (floor(texel) + g) / uTexSize).rgb;
}
// Light-guide glow of the backlight with nothing on the panel: brightest along the bottom edge where the LEDs sit.
vec3 backlight() {
  vec2 e = min(vUv, 1. - vUv);
  float guide = .55 + .45 * smoothstep(.5, 1., vUv.y) + .25 * (1. - smoothstep(0., .06, min(e.x, e.y)));
  return vec3(.07, .075, .085) * guide;
}
// Steady handheld LCD.
vec3 screenLook(vec3 c) {
  vec2 texel = (uRect.xy + vUv * uRect.zw) * uTexSize;
  vec2 f = fract(texel);
  float perTexel = uSize.y / (uTexSize.y * uRect.w);
  // Faint pixel grid once a texel spans four or more device pixels, antialiased to one device pixel so it cannot beat against the display.
  float detail = clamp((perTexel - 4.) / 3., 0., 1.);
  vec2 w = max(fwidth(texel), vec2(1e-4));
  vec2 line = 1. - smoothstep(vec2(0.), w, min(f, 1. - f));
  c *= 1. - detail * .07 * max(line.x, line.y);
  // Soft contrast and saturation, cool lifted blacks.
  float l = dot(c, vec3(.299, .587, .114));
  c = pow(mix(vec3(l), c, .93), vec3(1.07)) * .94 + vec3(.018, .021, .028);
  // Backlight falloff towards the edges and a faint bleed along the bottom.
  vec2 e = min(vUv, 1. - vUv);
  c *= .88 + .12 * smoothstep(0., .1, min(e.x, e.y * 1.33));
  c += vec3(.006, .007, .009) * smoothstep(.85, 1., vUv.y);
  // Glass: a broad diagonal sheen and very fine grain.
  c += smoothstep(.35, 0., abs(vUv.x * .7 + vUv.y - .45)) * .028;
  return c + (hash(floor(vUv * uSize)) - .5) * .006;
}
vec3 expose(vec3 c, float k) {
  vec3 hot = 1. - exp(-c * (1.6 + 2.2 * k));
  float l = dot(hot, vec3(.299, .587, .114));
  hot = mix(hot, vec3(l), .25) * vec3(1.05, 1., .92);
  return mix(c, hot, k);
}
// Unpowered panel: dark glass with the sheen.
vec3 off() { return vec3(.014, .015, .017) + smoothstep(.35, 0., abs(vUv.x * .7 + vUv.y - .45)) * .02; }

void main() {
  if (uDone > .5) { gl_FragColor = vec4(screenLook(sharp(vUv)), 1.); return; }
  float t = uTime - BACKLIGHT;
  if (t <= 0.) { gl_FragColor = vec4(off(), 1.); return; }
  // Backlight strike: catches, drops out, catches again, dips, then holds and warms up to full over half a second.
  float strike = t < .05 ? .7 : t < .13 ? .05 : t < .17 ? .9 : t < .26 ? .3 : .55 + .45 * smoothstep(.26, .55, t);
  vec3 color = off() + backlight() * strike;

  float local = uTime - PICTURE;
  if (local > 0.) {
    vec3 image = sharp(vUv);
    float fade = smoothstep(0., .9, local);
    vec3 cool = pow(image, vec3(1.5)) * vec3(.76, .9, 1.14);
    vec3 picture = mix(image, cool, 1. - smoothstep(.15, 1.2, local));
    float settle = smoothstep(0., SETTLE_LENGTH, uTime - SETTLE);
    float exposure = smoothstep(.3, 1.1, local) * (1. - settle * settle * (3. - 2. * settle));
    picture = expose(picture, exposure * .5);
    picture *= 1. + 1.1 * exp(-local * 7.) * smoothstep(0., .06, local);
    // Light crossing the glass as the panel comes up.
    float glass = smoothstep(.25, 0., abs(dot(vUv - vec2(.2, .1), normalize(vec2(1., .55))) - .25 - local * .32)) * exp(-local * 1.2);
    picture *= 1. + glass * .4 * (1. - settle);
    color = mix(color, screenLook(picture), fade * fade);
  }
  gl_FragColor = vec4(color, 1.);
}`
