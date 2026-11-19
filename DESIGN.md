---
name: Tandem
description: Fresco smoked glass with interactive three-dimensional setup objects.
colors:
  board: "#26282a"
  raised: "#2e3134"
  chalk: "#f2f0e9"
  dim: "#b9b6ae"
  accent: "#a8c8e4"
  green: "#b3d2af"
  red: "#e2aca4"
  glass-smoke: "rgba(21,23,26,.6)"
  button-ink: "#14303f"
  accent-hover: "#bdd8ee"
typography:
  display:
    fontFamily: "'Source Sans 3', sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.18
    letterSpacing: "-.025em"
  wordmark:
    fontFamily: "'Source Serif 4', Georgia, serif"
    fontSize: "29px"
    fontWeight: 500
  headline:
    fontFamily: "'Source Sans 3', 'Segoe UI', sans-serif"
    fontSize: "19px"
    fontWeight: 600
  title:
    fontFamily: "'Source Sans 3', 'Segoe UI', sans-serif"
    fontSize: "18px"
    fontWeight: 600
  body:
    fontFamily: "'Source Sans 3', 'Segoe UI', sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Source Sans 3', 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 400
rounded:
  tag: "6px"
  navigation: "8px"
  button: "9px"
  panel: "16px"
  setup: "20px"
spacing:
  small: "8px"
  medium: "12px"
  item: "16px"
  panel: "24px"
components:
  button-primary:
    textColor: "{colors.button-ink}"
    rounded: "{rounded.button}"
    padding: "12px 18px"
    width: "100%"
  navigation:
    textColor: "{colors.chalk}"
    rounded: "{rounded.navigation}"
    padding: "10px 12px"
  navigation-active:
    textColor: "{colors.accent-hover}"
  tag:
    backgroundColor: "#ffffff08"
    textColor: "{colors.dim}"
    rounded: "{rounded.tag}"
    padding: "4px 8px"
    typography: "{typography.label}"
  glass-panel:
    rounded: "{rounded.panel}"
  setup-panel:
    backgroundColor: "rgba(17,20,23,.38)"
    rounded: "{rounded.setup}"
    padding: "24px"
---

# Design System: Tandem

## Overview

**Creative North Star: "Fresco glass with physical objects"**

Tandem retains Fresco's charcoal background, smoked liquid glass, reflective edges, warm text and pale blue accent. A rotatable cartridge and an angled monitor provide recognizable physical forms. Raised buttons and inset selected navigation retain subdued gradients and highlights.

The current desktop preview provides ROM inspection and raw controller detection. Its partner monitor displays a non-interactive NO SIGNAL and Partner offline placeholder. Emulation and networking are not implemented. This document records the current renderer; removed keyboard and session-demo surfaces do not define the current system.

**Key Characteristics:**

- Smoked glass and charcoal surfaces with selective reflective edges.
- Runtime 3D cartridge and monitor objects with material lighting.
- Sans-serif interface headings and a serif wordmark.
- Offline partner status attached to the monitor's screen plane.

## Colors

Warm neutral text sits on charcoal surfaces, with pale blue actions and restrained status colors. Frontmatter owns color values; gradient fills and state treatments are recorded in the sidecar.

### Primary

Pale blue (`accent`) identifies keyboard focus, interactive details. Lighter blue (`accent-hover`) marks selected navigation text. Primary actions use a light blue vertical gradient with dark blue (`button-ink`) text.

### Neutral

Charcoal (`board`) fills the application behind a subtle radial highlight. Raised charcoal (`raised`) remains a supporting surface color. Warm white (`chalk`) carries main text; warm gray (`dim`) carries supporting descriptions. Smoked black (`glass-smoke`) supplies the shared glass layer.

Green marks successful structural checks; muted red identifies errors. Status includes readable text.

**The Status Rule.** Keep unavailable features and verified checks explicitly distinguishable in visible copy.

## Typography

Bundled Source Sans 3 supplies interface text and page headings, with Segoe UI as the general interface fallback. Source Serif 4 with Georgia fallback supplies the wordmark. The current page heading is sans-serif, replacing the earlier serif page introductions.

The display role is used by Controls and Development; setup has a screen-reader heading. At compact widths page headings reduce to 26px. Section headings generally use the headline role; setup and development headings use 17px. Body paragraphs remain capped at 70ch. Supporting descriptions use 14px or 15px, status uses 13px, and tags use the label role. File fingerprints use small monospace text; controller values use tabular figures.

**The Type Role Rule.** Preserve the serif wordmark and use sans-serif for interface headings, controls and status.

## Layout

The desktop shell fills the viewport without document scrolling. It has a custom draggable 60px top bar, a 156px navigation column, a flexible content region capped at 1480px and a compact footer. Window buttons remain outside the draggable region. Controls can scroll within their content region.

Setup places the local cartridge and partner monitor in one shared glass container. Its two columns use 1.05:1 proportions, a 40px gap and panel spacing. Individual columns are transparent, with no nested glass borders. Headings and actions keep their height while artwork consumes the remaining space. The primary action is centered and capped at 360px. The monitor region uses a 1.15 aspect ratio. Its perspective camera has a subtle horizontal and vertical offset, while the offline placeholder follows the actual screen plane through CSS3DRenderer.

At 800px and below, navigation becomes horizontal, setup padding becomes 18px and its gap becomes 22px. At 590px setup stacks into one column. At viewport heights of 700px and below, the cartridge remains visible, including while the fingerprint is expanded. Its scene wrapper has a 180px minimum height and its canvas region has a 150px minimum height. The selected cartridge caption is hidden, metadata spacing is reduced, and the ROM action becomes compact to keep the object available. These are current preview behaviors, not a specification for future gameplay layouts.

Controls shows an emulation-unavailable message and the raw controller panel. Setup has no partner caption or action below the monitor: offline status appears on the monitor itself.

## Elevation & Depth

Fresco smoke and blur remain the base material. Shared glass panels use a blurred smoke layer, a masked reflective rim and diffuse shadow. The setup container uses its own softer inset edges and broader shadow. Physical objects use runtime material lighting, while controls use gradients, inset highlights and short shadows. Do not replace these objects with generic flat cards.

The shared glass filter is `blur(14px) saturate(1.4)`; setup uses `blur(18px)`. The shared panel shadow is `0 10px 28px #00000026`. Primary buttons combine an inset top highlight, lower edge and cast shadow; pressing lowers them by 2px and reduces the shadow. Navigation presses lower by 1px; selected navigation has an inset shadow.

The cartridge uses the user-supplied Nintendo DS cartridge glTF by littlengvfx (CC BY 4.0), retaining its original mesh and shell UVs/textures. The display normalizes its orientation and scale and substitutes official Black 2 or White 2 artwork for the sample label through a UV crop. The monitor uses the externally sourced Innerscene GLB. Both use RoomEnvironment reflections, a warm key light and cool rim light. Floor planes and cast floor shadows are absent; renderer shadow maps are disabled. This does not remove the established interface-control shadows.

**The Object Source Rule.** Use realistic, externally sourced 3D models for physical objects; preserve their attribution and licenses rather than substituting procedural or CSS approximations. Source and modification details live in `docs/ASSETS.md`.

## Shapes

Shared panels and the setup container have distinct rounded corners as recorded in frontmatter. Navigation and buttons have tighter corners. Window controls are rectangular. The cartridge silhouette and its printed label, monitor bezel and stand, remain object-specific forms rather than reusable card patterns.

## Components

### Buttons

The primary ROM action uses a raised pale-blue gradient, dark text, semibold weight and a minimum 48px height (36px in setup at viewport heights of 700px and below). Hover lightens the gradient; pressing lowers the control. Busy state disables activation, dims the button and shows a labeled spinner. All keyboard-focusable actions retain a two-pixel accent outline with five-pixel offset.

### Navigation and window controls

Navigation combines line icons with sentence-case labels. Default buttons are raised charcoal; the current page is inset with pale-blue text and `aria-current`. The top bar has minimize, fullscreen-toggle and close controls with accessible names. Close hover uses a distinct red fill.

### Glass containers and tags

Controls and development use the shared smoke and reflective rim. Setup uses one shared outer container with transparent local and partner columns. Tags are non-interactive labels for platform and development status. No text-field component is established; ROM selection uses the native file picker.

### Cartridge and fingerprint

The supplied cartridge model renders at runtime with its original geometry and shell textures. Official Black 2 or White 2 artwork replaces the sample front label, using texture offset .145 and horizontal repeat .855 to crop the retail spine. This is box artwork adapted to the model, not a scan of a game cartridge label.

The camera stays fixed. Pointer dragging rotates only the cartridge, with pitch limited to approximately +/-1.1 radians. Left and right arrow keys rotate it, while Home or double-click restores the initial orientation. Instructions are in the accessible name; there is no visible rotation-control row. After 1.8 seconds without interaction, a gentle idle yaw varies by +/-0.07 radians. It stops during interaction and under reduced motion. There is currently no insertion device or launch animation; those require a sourced real device and actual runtime launch integration.

Inspection results use polite announcements; errors use alert semantics. The native fingerprint disclosure allows the hash to wrap and be selected. Opening the fingerprint retains the cartridge scene at every supported height. Short views hide the selected caption and compact metadata instead.

### Monitor offline placeholder

The sourced monitor GLB has dark physical casing, a metallic stand and a glossy screen. The perspective camera sits at (.20, .31, .90) and looks toward the monitor center. CSS3DRenderer places a DOM placeholder at the screen plane using the same camera, so its text follows the monitor angle.

A low-contrast noise canvas fills the screen behind NO SIGNAL and Partner offline. There are no Connect, Create session, Join session or Back controls, and no partner caption below the monitor. Screen-space font sizes account for perspective scaling; do not reuse them as ordinary interface typography.

### Controller state

Controls contains a plain message that game controls will be available when emulation is connected, followed by raw controller detection. Connected devices show their identifier, pressed buttons and axis values. Keyboard visualization, keyboard testing and remapping are not present.

### Splash and motion

The splash centers the Tandem mark over translucent smoke with fine inset highlights. It holds for at least 2700ms, wipes the mark over 650ms, waits 800ms and fades over 320ms. Reduced-motion preference skips that sequence and stops the busy spinner. Monitor static refreshes every 120ms; reduced motion leaves one still noise image. Cartridge rotation is user-driven with a fixed camera; its subtle idle motion is disabled under reduced motion and suspended during interaction.

## Do's and Don'ts

### Do:

- Do retain Fresco smoke, reflective edges and the charcoal background.
- Do preserve sourced model geometry, shell textures, material lighting and attribution.
- Do place offline status on the monitor's screen plane.
- Do distinguish the sourced cartridge model from its adapted box-art label.
- Do preserve visible focus, readable status and wrapping technical values.

### Don't:

- Don't present the offline placeholder as working networking.
- Don't add floor planes or cast floor shadows beneath the objects.
- Don't substitute procedural or CSS approximations for externally sourced physical models.
- Don't hide the cartridge when the fingerprint opens, including at viewport heights of 700px and below.
- Don't restore removed keyboard or session-demo surfaces as established components.
