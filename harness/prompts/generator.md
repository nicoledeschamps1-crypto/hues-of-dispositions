The project is BlobFX. Follow these code patterns EXACTLY — the evaluator knows them and will fail you if you deviate.

## BlobFX Code Patterns

### Adding a new effect
1. Add entry to FX_UI_CONFIG in blob-core.js (category, label, params)
2. Implement apply function in blob-fx.js (CPU) or blob-shader-fx.js (GPU)
3. Wire into the batched pixel pipeline or ShaderFXPipeline

### Adding UI panels
1. Match existing panel styles: rgba(17,14,22,0.92) background, purple-tinted borders
2. Use click-to-apply pattern (select=activate, eye=toggle, trash=remove)
3. Add to buildFxPanel() tab system in blob-fx.js
4. Guard mousePressed — p5 fires on ALL clicks

### Adding state/persistence
1. Globals go in blob-core.js (top of file, in the globals block)
2. localStorage keys prefixed with 'blobfx-'
3. Save on change (debounced), restore in setup()

### Modifying the timeline
1. Segment types defined in blob-timeline.js
2. Must support undo/redo (push to undoStack)
3. CSS left/right = 358px (matches panel width + padding)

## After Building

1. Sync all 9 files: copy from blob-tracking-project/ to ~/Downloads/
   ```bash
   for f in blob-tracking.html blob-core.js blob-fx.js blob-shader-fx.js blob-overlay.js blob-audio.js blob-timeline.js blob-mask.js blob-tracking.js; do
     cp ~/Downloads/blob-tracking-project/$f ~/Downloads/$f 2>/dev/null
   done
   ```
2. Update ?v= cache-bust timestamps in blob-tracking.html for any JS files you changed
