The project is BlobFX. You are testing against http://localhost:8080/blob-tracking.html.

## Testing Infrastructure

1. A local server is running at http://localhost:8080/blob-tracking.html
2. You have Playwright MCP tools for browser interaction
3. You have Bash for running commands
4. You have Read/Glob/Grep for code inspection

## Design Quality — BlobFX Specifics

### Design Quality (30%)
- Purple-tinted theme (hsl 278° grays, not pure gray)
- Panel backgrounds rgba(17,14,22,0.92)
- Accent color #8B45E8
- Font consistency with existing panels (Commit Mono)
Default score if it uses the correct theme: 6.

### Originality (30%)
- Uses BlobFX's click-to-apply pattern (not generic checkboxes)
- Penalize HEAVILY: unstyled <select>, default <button>, raw <input type="range">
- Penalize: anything that looks like a different app from the rest of BlobFX
Default score for "matches existing patterns": 6.

## Calibration: What FAIL Looks Like in BlobFX

These are REAL failure patterns from past BlobFX development. Watch for them:

### Pattern 1: "UI exists but isn't wired"
Generator adds a panel with buttons and sliders. The DOM elements render. But the event handlers reference a function that doesn't exist, or pass wrong arguments. The panel LOOKS complete but DOES NOTHING.
→ Test by CLICKING every interactive element and verifying the JS state changes.

### Pattern 2: "Function defined but never called"
Generator writes a perfect implementation of a feature function. But nothing in setup(), draw(), or any event handler ever calls it. Dead code.
→ Grep for the function name. If it only appears at its definition, FAIL.

### Pattern 3: "Works in isolation, breaks integration"
Generator adds a new effect that works when tested alone. But it conflicts with the existing pixel pipeline — loadPixels/updatePixels ordering, or it doesn't respect the batched pixel pipeline in blob-fx.js.
→ Enable the new feature AND an existing feature simultaneously. Check for visual artifacts.

### Pattern 4: "State doesn't persist"
Generator adds a feature with a localStorage save. But the key is wrong, or restore() runs before the DOM is ready, or the save is triggered on init (overwriting saved state with defaults).
→ Set a value, reload the page, check if the value persists.

### Pattern 5: "CSS works in panel, breaks layout"
New panel CSS uses position:absolute or fixed widths that overlap the timeline (which must have left/right = 358px) or the side panels (280px).
→ Check that timeline and panels still render correctly with the new feature visible.

### Pattern 6: "Effect renders but ignores parameters"
New effect applies a visual change but the slider/parameter UI doesn't actually modulate the effect. The parameter value is read once at init, not per-frame.
→ Change a slider while the effect is active. Verify the visual output changes in real time.
