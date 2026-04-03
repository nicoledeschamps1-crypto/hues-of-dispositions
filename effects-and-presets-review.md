# BlobFX — Effects & Presets Review Document

## Context
BlobFX ("Hues of Dispositions") is a browser-based real-time video effects app. It has 68 effects and 40 presets. I need a fresh review to identify:
1. **Redundant/overlapping effects** — effects that do nearly the same thing
2. **Redundant/overlapping presets** — presets that look too similar
3. **Missing presets** — interesting combinations we should add
4. **Effects that could be merged** — candidates for consolidation
5. **Category organization** — are effects in the right categories?

## 68 Effects by Category

### COLOR (14)
- Sepia — warm tone shift (intensity, warmth)
- Tint — single-color overlay (preset colors + custom, intensity)
- Palette — color quantize to preset palettes (12 palettes, intensity)
- Bri/Con — brightness, contrast, saturation
- Thermal — heat-map false color (5 palette presets)
- Grad Map — 3-color gradient map (shadow/mid/highlight colors, midpoint, intensity)
- Duotone — 2-color shadow/highlight mapping (6 preset combos)
- Threshold — black/white cutoff (level, invert)
- Exposure — EV stop adjustment
- Color Temp — warm/cool shift
- RGB Gain — per-channel gain + gamma
- Levels — input black/white, gamma, output black/white
- Color Bal — shadow/mid/highlight R/G/B offsets (9 sliders)
- Color Mix — 3x3 color matrix

### DISTORTION (20)
- Chromatic — chromatic aberration (offset, linear/radial)
- RGB Shift — per-channel X/Y offset (5 sliders)
- Lens Curve — barrel/pinch/fisheye/squeeze/mustache distortion (intensity, chromatic fringe)
- Wave — sine wave deformation (amplitude, freq, speed, horizontal/vertical/circular)
- Jitter — random pixel displacement (intensity, block size, random/perlin/shake)
- Motion Blur — directional blur (intensity, angle)
- Emboss — relief/emboss (angle, strength, preserve color)
- Blur/Sharp — gaussian blur or sharpen (single slider, negative=blur)
- Modulate — periodic brightness modulation (frequency, depth, speed)
- Ripple — concentric ring distortion (amplitude, freq, speed)
- Swirl — spiral distortion (angle, radius)
- Reed Glass — vertical reed/ribbed glass effect (freq, amplitude)
- Polar→Rect — polar coordinate unwrap (intensity)
- Rect→Polar — rectangular to polar wrap (intensity)
- Radial Blur — blur from center outward (intensity)
- Zoom Blur — zoom/dolly blur from center (intensity)
- Circ Blur — circular/rotational blur (intensity)
- Elastic Grid — mesh deformation grid (grid size, amplitude, speed)
- Slide Stretch — directional pixel stretch (angle, amount, offset)
- Corner Pin — perspective transform (4 corner offsets)

### PATTERN (11)
- Bloom — glow/bloom (intensity, radius, threshold, spread, exposure, blend mode, anamorphic toggle)
- Dither — ordered/Floyd-Steinberg dithering (5 algorithms, 8 palettes, colors, pixelation, strength, B&W/color)
- Atkinson — Atkinson dithering specifically (B&W/color, threshold, spread, strength)
- Halftone — dot/pattern screening (dot size, angle, contrast, spread, 5 shapes, 12 ink/paper presets, ink/paper colors, B&W/color, invert)
- Pixel Sort — brightness-range pixel sorting (low/high threshold, horizontal/vertical)
- Pixelate — mosaic (size, square/hex)
- LED Screen — LED dot matrix (cell size, gap, glow, brightness, square/circle)
- ASCII — text art rendering (cell size, 7 charsets, 5 color modes, invert)
- Print Stamp — rubber stamp/letterpress look (size, ink, pressure, paper)
- Stripe — decorative stripe overlay (width, gap, angle, color, opacity)
- Automata — cellular automata (rule, cell size, speed, generation count)

### OVERLAY (18)
- Glitch — digital corruption (intensity, freq, channel shift, block size, seed, speed, 7 modes)
- Noise — noise overlay (intensity, scale, mono/color, random/simplex)
- Grain — film grain (intensity, size, mono/color)
- Dots — dot pattern overlay (angle, scale, opacity)
- Grid — grid line overlay (scale, width, opacity)
- Scanlines — horizontal/vertical scan lines (intensity, count, vertical toggle)
- Vignette — edge darkening (intensity, radius, color)
- CRT Screen — CRT simulation (scan weight, curvature, glow, chroma fringe, static, 4 phosphor types)
- Y2K Blue — early-2000s oversaturated blue look (blue shift, glow, grain)
- NTSC — analog TV signal artifacts (chroma bleed, instability, noise, rolling)
- Paper Scan — scanned paper texture (intensity, fiber, warmth)
- Xerox — photocopy degradation (contrast, noise, darkness)
- Grunge — dirty/grungy texture (tint color, posterize, grain)
- Datamosh — frame corruption art (intensity, block size, melt/shatter modes, decay)
- Pixel Sort GPU — GPU-accelerated pixel sort (threshold, vertical toggle, reverse)
- Sift — frequency/detail separation (radius, strength, mode)
- Smart Pixel — intelligent mosaic (cell size, edge sensitivity)
- Pixel Flow — directional pixel smearing (angle, length, threshold)

### GPU-ONLY (5 additional)
- Kaleidoscope — radial symmetry (segments, rotation)
- Feedback — video feedback loop (decay, zoom, rotation)
- Time Warp — temporal displacement (delay, blend)
- Flow Field — particle/flow simulation (scale, speed, density)
- Freeze — frame freeze with decay (threshold, blend)

---

## 40 Presets by Category

### FILM (9)
1. **Noir** — Crushed blacks, blown highlights (duotone + levels + vignette + grain)
2. **Cyanotype** — Deep blue sun-print (duotone + levels + grain + vignette)
3. **Kodachrome** — Saturated warm film stock (bricon + colortemp + levels + grain + vignette)
4. **Bleach Bypass** — Silver-retained high-contrast punch (bricon + levels + bloom + grain + colorbal + vignette)
5. **Polaroid** — Sun-bleached instant camera (colortemp + levels + bricon + bloom + grain + colorbal + vignette)
6. **Cinema Teal** — Orange & teal blockbuster grade (colorbal + bricon + levels + vignette)
7. **Super 8** — Grainy 8mm home movie (sepia + grain + bloom + levels + vignette + scanlines)
8. **Film Halation** — Red glow bleed on highlights (bloom + chroma + colorbal + grain + levels + vignette)
9. **Lomo** — Oversaturated tunnel-vision (bricon + colortemp + levels + bloom + vignette + grain)

### RETRO (7)
1. **VHS** — Trashed VHS tape playback (ntsc + rgbshift + bloom + noise + scanlines)
2. **CRT Monitor** — Curved phosphor screen (crt + bloom + vignette)
3. **Y2K Blue** — Oversaturated early-2000s web (y2kblue + bloom)
4. **Game Boy** — 4-color green LCD screen (palette + dither + scanlines + vignette + bricon)
5. **Synthwave** — Neon pink/purple 80s grid (gradmap + bloom + scanlines + vignette)
6. **Analog TV** — Warm 70s broadcast signal (ntsc + crt + colortemp + bloom + vignette)
7. **Matrix** — Digital rain phosphor green (gradmap + scanlines + bloom + noise + vignette)

### DIGITAL (6)
1. **LED Wall** — Giant LED display grid (led + bloom)
2. **Terminal** — Green phosphor console (ascii + scanlines + bloom + noise + vignette)
3. **Halftone** — CMYK newspaper print (halftone + levels)
4. **Pixel Art** — Retro game sprite look (pixel + dither + bricon + levels + scanlines)
5. **1-Bit Dither** — High-contrast graphic poster (dither + levels + bricon + vignette + scanlines)
6. **RGB Hatch** — Crosshatched color separation (rgbshift + halftone)

### CREATIVE (11)
1. **Thermal Cam** — Infrared heat vision (thermal + bloom + vignette)
2. **Night Vision** — Military green phosphor (thermal + noise + scanlines + vignette + grain)
3. **Neon Glow** — Electric overblown bloom (bloom + bricon + vignette)
4. **Dreamy** — Ethereal halation glow (bloom + blursharp + exposure + colortemp + colorbal + bricon + vignette)
5. **Psychedelic** — Acid-trip color warp (chroma + wave + bloom + bricon)
6. **Cross Process** — Wrong chemicals, wild colors (colorbal + bricon + levels + bloom + grain + vignette)
7. **ORB** — Pulsing radial energy sphere (radblur + bloom + chroma + duotone + vignette + bricon)
8. **Underwater** — Deep ocean blue-green murk (colorbal + bloom + wave + vignette)
9. **Fisheye** — Wide-angle lens bulge (curve + bloom + vignette)
10. **Cyberpunk** — Neon-soaked dystopia (gradmap + bloom + chroma + bricon + scanlines + vignette)
11. **Ink Wash** — Sumi-e watercolor dissolve (duotone + levels + grain + blursharp + vignette)

### GLITCH (7)
1. **Glitch Art** — Heavy digital corruption (glitch + rgbshift + noise)
2. **Data Corrupt** — Destroyed file blocks (glitch-corrupt + noise + bricon)
3. **Pixel Drift** — Melting downward pixel flow (glitch-drift + bloom)
4. **TV Static** — Dead channel snow (glitch-static + scanlines + vignette)
5. **Slice & Dice** — Sliced strips with gaps (glitch-slice + rgbshift + bricon)
6. **Xerox Copy** — 4th-gen photocopy (xerox + paperscan + grain)
7. **Emboss Dirt** — Textured relief with grit (emboss + grunge + noise)

---

## Questions for Review
1. Are Noir and Cyanotype too similar? (Both use duotone + levels + grain + vignette, just different colors)
2. Dither vs Atkinson — should these be one effect with an algorithm selector?
3. Noise vs Grain — significant overlap? Grain = film-like, Noise = digital. Worth keeping both?
4. Pixel Sort vs Pixel Sort GPU — redundant? GPU version is faster.
5. RGB Shift vs Chromatic — both do channel separation. Merge?
6. Radial Blur vs Zoom Blur vs Circ Blur — three very similar blur types. Consolidate?
7. Are there obvious preset gaps? (e.g., no "Instagram-style" warm filter, no "horror" preset, no "vintage home video")
8. Any effects that almost no one would use independently? (Candidates for preset-only inclusion)
9. Category placement: Is Bloom really a "Pattern"? Is Datamosh really an "Overlay"?
