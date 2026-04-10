// ══════════════════════════════════════════════════════════════════
// HOD-HANDS: Hand & Finger Tracking (TouchDesigner-inspired)
// Completely independent from blob tracking — own data, own render
// ══════════════════════════════════════════════════════════════════

// ── State ────────────────────────────────────────────────────────
let handsEnabled = false;
let handVizMode = 'skeleton';  // 'skeleton' | 'dots' | 'tips' | 'off'
let handMaxCount = 2;

const HAND_DETECT_INTERVAL = 3;
const HAND_LANDMARK_SMOOTH = 0.35;

let _handDetectFrame = 0;
let _handResults = [];       // Array of HandData objects (up to 2)
let _handSmoothed = [];      // Smoothed landmark arrays per hand
let _handPrevWrist = [];     // Previous wrist positions for velocity
let _handTrails = [[], []];  // Fingertip trails per hand (array of 5 trail arrays each)
let _handDetectErrors = 0;
let _handTrailLength = 30;

// ── Gesture Triggers ─────────────────────────────────────────────
// Dance-friendly: poses that feel natural in movement, each toggleable

const GESTURE_TRIGGERS = {
    open_palm: {
        label: 'Open Palm',
        desc: 'Spread fingers wide — release, reveal, restore',
        icon: '\u{1F590}',
        defaultAction: 'restore_fx',
        enabled: false
    },
    fist: {
        label: 'Fist',
        desc: 'Close hand tight — stop everything, hold the moment',
        icon: '\u270A',
        defaultAction: 'reset_fx',
        enabled: false
    },
    peace: {
        label: 'Peace',
        desc: 'V sign — playful, toggle, switch it up',
        icon: '\u270C',
        defaultAction: 'cycle_preset',
        enabled: false
    },
    point: {
        label: 'Point',
        desc: 'Index finger out — aim, spotlight, direct',
        icon: '\u{1F446}',
        defaultAction: 'random_fx',
        enabled: false
    },
    thumbs_up: {
        label: 'Thumbs Up',
        desc: 'Approval — boost intensity, max it out',
        icon: '\u{1F44D}',
        defaultAction: 'boost',
        enabled: false
    }
};

const GESTURE_ACTIONS = {
    freeze:       { label: 'Freeze Frame',    desc: 'Pause video on current frame' },
    reset_fx:     { label: 'Stop All FX',     desc: 'Turn off all active effects (remembers them)' },
    restore_fx:   { label: 'Restore FX',      desc: 'Bring back effects that were stopped' },
    cycle_preset: { label: 'Cycle Preset',     desc: 'Jump to next FX preset' },
    random_fx:    { label: 'Random Effect',    desc: 'Activate a random effect' },
    boost:        { label: 'Boost Intensity',  desc: 'Push active effects to max for a beat' },
    toggle_viz:   { label: 'Toggle Hand Viz',  desc: 'Cycle through hand display styles' },
    none:         { label: 'None',             desc: 'Gesture detected but no action' }
};

let _savedActiveEffects = null;  // stored by Stop All, restored by Restore

let _gestureTriggerState = {};   // tracks cooldown per gesture
let _gestureCooldownMs = 800;    // prevent rapid re-triggering
let _gestureBoostActive = false;
let _gestureBoostTimer = null;

// ── Constants ────────────────────────────────────────────────────

const HAND_CONNECTIONS = [
    // Palm web
    [0, 1], [0, 5], [0, 17], [5, 9], [9, 13], [13, 17],
    // Thumb
    [1, 2], [2, 3], [3, 4],
    // Index
    [5, 6], [6, 7], [7, 8],
    // Middle
    [9, 10], [10, 11], [11, 12],
    // Ring
    [13, 14], [14, 15], [15, 16],
    // Pinky
    [17, 18], [18, 19], [19, 20]
];

const HAND_FINGERTIPS = [4, 8, 12, 16, 20];
const HAND_FINGER_PIPS = [3, 6, 10, 14, 18];
const HAND_JOINT_TYPES = {};  // index → 'tip' | 'mcp' | 'pip' | 'dip' | 'wrist'
(function _initJointTypes() {
    HAND_JOINT_TYPES[0] = 'wrist';
    [1, 5, 9, 13, 17].forEach(i => HAND_JOINT_TYPES[i] = 'mcp');
    [2, 6, 10, 14, 18].forEach(i => HAND_JOINT_TYPES[i] = 'pip');
    [3, 7, 11, 15, 19].forEach(i => HAND_JOINT_TYPES[i] = 'dip');
    [4, 8, 12, 16, 20].forEach(i => HAND_JOINT_TYPES[i] = 'tip');
})();

// ── Colors ───────────────────────────────────────────────────────
const HAND_COLOR_LINE = 'rgba(0, 206, 201, 0.7)';      // teal
const HAND_COLOR_JOINT = 'rgba(0, 230, 225, 0.9)';      // brighter teal
const HAND_COLOR_JOINT_TIP = 'rgba(255, 118, 117, 0.9)'; // pink for tips
const HAND_COLOR_TRAIL_START = [232, 67, 147];           // magenta
const HAND_COLOR_TRAIL_END = [116, 185, 255];            // blue

// ── Offscreen Canvas ─────────────────────────────────────────────

function _ensureHandCanvas() {
    const vid = videoEl.elt;
    if (!vid || vid.readyState < 2 || vid.videoWidth === 0) return false;
    if (!window._mpHandCanvas) window._mpHandCanvas = document.createElement('canvas');
    const hc = window._mpHandCanvas;
    if (hc.width !== vid.videoWidth || hc.height !== vid.videoHeight) {
        hc.width = vid.videoWidth;
        hc.height = vid.videoHeight;
    }
    if (!window._mpHandCtx) {
        window._mpHandCtx = hc.getContext('2d', { willReadFrequently: true });
    }
    window._mpHandCtx.drawImage(vid, 0, 0);
    return true;
}

// ── Detection ────────────────────────────────────────────────────

function detectHands() {
    if (!handsEnabled || !videoLoaded || !videoPlaying) return;
    if (!videoEl || !videoEl.elt) return;

    if (!window.mpHandLandmarkerReady || !window.mpHandLandmarker) {
        if (!window._handWarnThrottle || Date.now() - window._handWarnThrottle > 3000) {
            window._handWarnThrottle = Date.now();
            if (window.mpHandInitError) {
                console.warn('[HandTrack] Init error:', window.mpHandInitError);
            }
        }
        return;
    }

    _handDetectFrame++;
    if (_handDetectFrame < HAND_DETECT_INTERVAL && _handResults.length > 0) return;
    _handDetectFrame = 0;

    if (!_ensureHandCanvas()) return;

    try {
        const ts = performance.now();
        const result = window.mpHandLandmarker.detectForVideo(window._mpHandCanvas, ts);

        if (result && result.landmarks && result.landmarks.length > 0) {
            _handDetectErrors = 0;
            if (window.mpHandInitError && window.mpHandInitError.startsWith('Detection failing')) {
                window.mpHandInitError = null;
            }

            const rawHands = result.landmarks;
            const worldHands = result.worldLandmarks || [];
            const handedness = result.handednesses || [];

            // EMA smoothing
            if (_handSmoothed.length === rawHands.length) {
                for (let hi = 0; hi < rawHands.length; hi++) {
                    const raw = rawHands[hi];
                    const sm = _handSmoothed[hi];
                    if (sm.length === raw.length) {
                        for (let li = 0; li < raw.length; li++) {
                            sm[li] = {
                                x: sm[li].x * HAND_LANDMARK_SMOOTH + raw[li].x * (1 - HAND_LANDMARK_SMOOTH),
                                y: sm[li].y * HAND_LANDMARK_SMOOTH + raw[li].y * (1 - HAND_LANDMARK_SMOOTH),
                                z: sm[li].z * HAND_LANDMARK_SMOOTH + raw[li].z * (1 - HAND_LANDMARK_SMOOTH)
                            };
                        }
                    } else {
                        _handSmoothed[hi] = raw.map(l => ({ x: l.x, y: l.y, z: l.z }));
                    }
                }
            } else {
                _handSmoothed = rawHands.map(hand =>
                    hand.map(l => ({ x: l.x, y: l.y, z: l.z }))
                );
            }

            // Build hand data objects
            _handResults = [];
            for (let hi = 0; hi < _handSmoothed.length; hi++) {
                const lm = _handSmoothed[hi];
                const wlm = worldHands[hi] || null;
                const handed = (handedness[hi] && handedness[hi][0])
                    ? handedness[hi][0].categoryName
                    : 'Unknown';

                const handData = {
                    landmarks: lm,
                    worldLandmarks: wlm,
                    handedness: handed,
                    pinchDistance: 0,
                    palmCenter: { x: 0, y: 0 },
                    velocity: { x: 0, y: 0, magnitude: 0 },
                    fingerStates: [false, false, false, false, false],
                    gesture: 'unknown'
                };

                computeHandDerived(handData, hi);
                _handResults.push(handData);
            }
        } else {
            // No hands detected — clear results
            _handResults = [];
            _handSmoothed = [];
        }
    } catch (e) {
        _handDetectErrors++;
        if (_handDetectErrors <= 5 || _handDetectErrors % 30 === 0) {
            console.warn('[HandTrack] Detection error #' + _handDetectErrors + ':', e.message || e);
        }
        if (_handDetectErrors >= 10) {
            _handResults = [];
            _handSmoothed = [];
            window.mpHandInitError = 'Detection failing: ' + (e.message || 'unknown error');
        }
    }
}

// ── Derived Values ───────────────────────────────────────────────

function computeHandDerived(handData, handIndex) {
    const lm = handData.landmarks;
    if (!lm || lm.length < 21) return;

    // Pinch distance: thumb tip (4) to index tip (8), normalized
    const dx = lm[4].x - lm[8].x;
    const dy = lm[4].y - lm[8].y;
    const dz = lm[4].z - lm[8].z;
    handData.pinchDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Palm center: average of wrist + 4 MCP joints
    const palmIdx = [0, 5, 9, 13, 17];
    let px = 0, py = 0;
    for (let i = 0; i < palmIdx.length; i++) {
        px += lm[palmIdx[i]].x;
        py += lm[palmIdx[i]].y;
    }
    handData.palmCenter = { x: px / 5, y: py / 5 };

    // Velocity: wrist delta from previous frame
    const wrist = lm[0];
    if (_handPrevWrist[handIndex]) {
        const pw = _handPrevWrist[handIndex];
        const vx = wrist.x - pw.x;
        const vy = wrist.y - pw.y;
        handData.velocity = { x: vx, y: vy, magnitude: Math.sqrt(vx * vx + vy * vy) };
    }
    _handPrevWrist[handIndex] = { x: wrist.x, y: wrist.y };

    // Finger states: compare tip Y to PIP Y (lower Y = higher on screen = extended)
    const tipIdx = [4, 8, 12, 16, 20];
    const pipIdx = [3, 6, 10, 14, 18]; // thumb uses IP (3), others use PIP
    for (let f = 0; f < 5; f++) {
        if (f === 0) {
            // Thumb: compare tip X to IP X (depends on handedness)
            // Simple heuristic: tip farther from wrist than IP = extended
            const tipDist = Math.abs(lm[4].x - lm[0].x);
            const ipDist = Math.abs(lm[3].x - lm[0].x);
            handData.fingerStates[f] = tipDist > ipDist;
        } else {
            handData.fingerStates[f] = lm[tipIdx[f]].y < lm[pipIdx[f]].y;
        }
    }

    // Gesture recognition
    const [thumb, idx, mid, ring, pinky] = handData.fingerStates;
    if (thumb && idx && mid && ring && pinky) {
        handData.gesture = 'open_palm';
    } else if (!thumb && !idx && !mid && !ring && !pinky) {
        handData.gesture = 'fist';
    } else if (idx && !mid && !ring && !pinky) {
        handData.gesture = 'point';
    } else if (idx && mid && !ring && !pinky) {
        handData.gesture = 'peace';
    } else if (thumb && !idx && !mid && !ring && !pinky) {
        handData.gesture = 'thumbs_up';
    } else {
        handData.gesture = 'unknown';
    }
}

// ── Gesture Trigger Engine ────────────────────────────────────────

function processGestureTriggers() {
    if (!handsEnabled || _handResults.length === 0) return;

    for (var h = 0; h < _handResults.length; h++) {
        var hand = _handResults[h];
        var gesture = hand.gesture;
        if (gesture === 'unknown') continue;

        var triggerCfg = GESTURE_TRIGGERS[gesture];
        if (!triggerCfg || !triggerCfg.enabled) continue;

        // Cooldown check
        var stateKey = gesture + '_' + h;
        var now = Date.now();
        if (_gestureTriggerState[stateKey] && now - _gestureTriggerState[stateKey] < _gestureCooldownMs) continue;
        _gestureTriggerState[stateKey] = now;

        // Execute action
        var action = triggerCfg.action || triggerCfg.defaultAction;
        _executeGestureAction(action, hand);

        // Visual feedback toast
        _showGestureToast(triggerCfg.icon || gesture, triggerCfg.label, GESTURE_ACTIONS[action] ? GESTURE_ACTIONS[action].label : action);
    }
}

function _showGestureToast(icon, gestureName, actionName) {
    var toast = document.getElementById('gesture-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'gesture-toast';
        toast.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);' +
            'background:rgba(232,67,147,0.9);color:#fff;padding:8px 16px;border-radius:20px;' +
            'font-size:13px;font-weight:600;z-index:9999;pointer-events:none;' +
            'opacity:0;transition:opacity 0.2s;white-space:nowrap;' +
            'font-family:var(--font-mono,monospace);backdrop-filter:blur(8px)';
        document.body.appendChild(toast);
    }
    toast.textContent = icon + '  ' + gestureName + ' \u2192 ' + actionName;
    toast.style.opacity = '1';
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(function() { toast.style.opacity = '0'; }, 1200);
}

function _executeGestureAction(action, hand) {
    switch (action) {
        case 'freeze':
            if (typeof videoEl !== 'undefined' && videoEl && videoEl.elt) {
                if (videoEl.elt.paused) {
                    videoEl.elt.play().catch(function() {});
                } else {
                    videoEl.elt.pause();
                }
            }
            break;

        case 'reset_fx':
            if (typeof activeEffects !== 'undefined' && activeEffects.size > 0) {
                // Save current effects so Restore can bring them back
                _savedActiveEffects = new Set(activeEffects);
                activeEffects.clear();
                if (typeof hiddenEffects !== 'undefined') hiddenEffects.clear();
                if (typeof updateCardHighlights === 'function') updateCardHighlights();
            }
            break;

        case 'restore_fx':
            if (_savedActiveEffects && _savedActiveEffects.size > 0 && typeof activeEffects !== 'undefined') {
                for (var fx of _savedActiveEffects) activeEffects.add(fx);
                _savedActiveEffects = null;
                if (typeof updateCardHighlights === 'function') updateCardHighlights();
            }
            break;

        case 'cycle_preset':
            if (typeof FX_PRESETS !== 'undefined' && typeof applyPreset === 'function') {
                var presetKeys = Object.keys(FX_PRESETS);
                if (presetKeys.length > 0) {
                    var idx = Math.floor(Math.random() * presetKeys.length);
                    applyPreset(presetKeys[idx]);
                }
            }
            break;

        case 'random_fx':
            if (typeof FX_UI_CONFIG !== 'undefined') {
                var fxKeys = Object.keys(FX_UI_CONFIG);
                var randomFx = fxKeys[Math.floor(Math.random() * fxKeys.length)];
                if (typeof activeEffects !== 'undefined') {
                    if (activeEffects.has(randomFx)) {
                        activeEffects.delete(randomFx);
                    } else {
                        activeEffects.add(randomFx);
                    }
                    if (typeof updateCardHighlights === 'function') updateCardHighlights();
                }
            }
            break;

        case 'boost':
            // Temporarily push all active effect params toward max
            _gestureBoostActive = true;
            clearTimeout(_gestureBoostTimer);
            _gestureBoostTimer = setTimeout(function() { _gestureBoostActive = false; }, 500);
            break;

        case 'toggle_viz':
            var modes = ['skeleton', 'dots', 'tips', 'off'];
            var curIdx = modes.indexOf(handVizMode);
            handVizMode = modes[(curIdx + 1) % modes.length];
            // Update UI buttons
            document.querySelectorAll('#hand-viz-buttons .selector-btn').forEach(function(b) {
                b.classList.toggle('active', b.dataset.value === handVizMode);
            });
            break;

        case 'none':
        default:
            break;
    }
}

// ── Visualization ────────────────────────────────────────────────

function drawHandOverlay() {
    if (!handsEnabled || handVizMode === 'off' || _handResults.length === 0) return;
    if (typeof videoX === 'undefined') return;

    const ctx = drawingContext;
    ctx.save();

    // Clip to video rect
    ctx.beginPath();
    ctx.rect(videoX, videoY, videoW, videoH);
    ctx.clip();

    for (let h = 0; h < _handResults.length; h++) {
        const hand = _handResults[h];
        const lm = hand.landmarks;
        if (!lm || lm.length < 21) continue;

        if (handVizMode === 'skeleton') {
            _drawHandSkeleton(ctx, lm);
        } else if (handVizMode === 'dots') {
            _drawHandDots(ctx, lm);
        } else if (handVizMode === 'tips') {
            _drawHandTips(ctx, lm, h);
        } else if (handVizMode === 'glow') {
            _drawHandGlow(ctx, lm, h);
        } else if (handVizMode === 'neon') {
            _drawHandNeon(ctx, lm);
        } else if (handVizMode === 'minimal') {
            _drawHandMinimal(ctx, lm);
        } else if (handVizMode === 'rainbow') {
            _drawHandRainbow(ctx, lm);
        } else if (handVizMode === 'particle') {
            _drawHandParticle(ctx, lm);
        } else if (handVizMode === 'fire') {
            _drawHandFire(ctx, lm);
        }
    }

    ctx.restore();
}

// Called from draw loop — runs even when viz is off
function processHandFrame() {
    if (!handsEnabled || _handResults.length === 0) return;
    processGestureTriggers();
    _updatePinchMeter();
    // Update live data + gesture highlight every 3 frames
    if (typeof frameCount !== 'undefined' && frameCount % 3 === 0) {
        _updateHandDataDisplay();
        _updateGestureHighlight();
    }
}

function _lmToScreen(lm) {
    // Use videoToScreenCoords which handles webcam mirror (front camera flips X)
    const vx = lm.x * videoEl.width;
    const vy = lm.y * videoEl.height;
    return videoToScreenCoords(vx, vy);
}

function _drawHandSkeleton(ctx, landmarks) {
    // Draw connections
    ctx.strokeStyle = HAND_COLOR_LINE;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    for (let i = 0; i < HAND_CONNECTIONS.length; i++) {
        const [a, b] = HAND_CONNECTIONS[i];
        const pa = _lmToScreen(landmarks[a]);
        const pb = _lmToScreen(landmarks[b]);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
    }

    // Draw joints
    for (let i = 0; i < 21; i++) {
        const p = _lmToScreen(landmarks[i]);
        const type = HAND_JOINT_TYPES[i];
        const isTip = type === 'tip';
        const r = isTip ? 5 : (type === 'mcp' || type === 'wrist' ? 4 : 3);

        ctx.fillStyle = isTip ? HAND_COLOR_JOINT_TIP : HAND_COLOR_JOINT;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
    }
}

function _drawHandDots(ctx, landmarks) {
    for (let i = 0; i < 21; i++) {
        const p = _lmToScreen(landmarks[i]);
        const type = HAND_JOINT_TYPES[i];
        const isTip = type === 'tip';
        const r = isTip ? 5 : (type === 'mcp' || type === 'wrist' ? 4 : 3);

        ctx.fillStyle = isTip ? HAND_COLOR_JOINT_TIP : 'rgba(0, 206, 201, 0.6)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
    }
}

function _drawHandTips(ctx, landmarks, handIdx) {
    // Ensure trail arrays exist for this hand
    if (!_handTrails[handIdx]) _handTrails[handIdx] = [];
    while (_handTrails[handIdx].length < 5) _handTrails[handIdx].push([]);

    for (let f = 0; f < HAND_FINGERTIPS.length; f++) {
        const tipIdx = HAND_FINGERTIPS[f];
        const p = _lmToScreen(landmarks[tipIdx]);
        const trail = _handTrails[handIdx][f];

        // Push new position
        trail.push({ x: p.x, y: p.y });
        if (trail.length > _handTrailLength) trail.shift();

        // Draw trail as fading polyline
        if (trail.length > 1) {
            for (let t = 1; t < trail.length; t++) {
                const alpha = t / trail.length;
                const ratio = t / trail.length;
                const r = Math.round(HAND_COLOR_TRAIL_START[0] * (1 - ratio) + HAND_COLOR_TRAIL_END[0] * ratio);
                const g = Math.round(HAND_COLOR_TRAIL_START[1] * (1 - ratio) + HAND_COLOR_TRAIL_END[1] * ratio);
                const b = Math.round(HAND_COLOR_TRAIL_START[2] * (1 - ratio) + HAND_COLOR_TRAIL_END[2] * ratio);

                ctx.strokeStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + (alpha * 0.8) + ')';
                ctx.lineWidth = 1 + alpha * 2;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(trail[t - 1].x, trail[t - 1].y);
                ctx.lineTo(trail[t].x, trail[t].y);
                ctx.stroke();
            }
        }

        // Draw tip dot
        ctx.fillStyle = HAND_COLOR_JOINT_TIP;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fill();
    }
}

// ── Glow Visualization ───────────────────────────────────────────

function _drawHandGlow(ctx, landmarks, handIdx) {
    // Draw glowing connections (thicker, with gradient)
    for (var i = 0; i < HAND_CONNECTIONS.length; i++) {
        var a = HAND_CONNECTIONS[i][0], b = HAND_CONNECTIONS[i][1];
        var pa = _lmToScreen(landmarks[a]);
        var pb = _lmToScreen(landmarks[b]);

        // Outer glow
        ctx.strokeStyle = 'rgba(232, 67, 147, 0.15)';
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();

        // Inner line
        ctx.strokeStyle = 'rgba(232, 67, 147, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
    }

    // Draw glowing joints with radial gradient
    for (var j = 0; j < 21; j++) {
        var p = _lmToScreen(landmarks[j]);
        var type = HAND_JOINT_TYPES[j];
        var isTip = type === 'tip';
        var r = isTip ? 12 : (type === 'mcp' || type === 'wrist' ? 8 : 6);

        var grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        if (isTip) {
            grad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
            grad.addColorStop(0.3, 'rgba(232, 67, 147, 0.7)');
            grad.addColorStop(1, 'rgba(232, 67, 147, 0)');
        } else {
            grad.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
            grad.addColorStop(0.3, 'rgba(0, 206, 201, 0.5)');
            grad.addColorStop(1, 'rgba(0, 206, 201, 0)');
        }
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    // Also draw fingertip trails for glow mode
    _drawHandTips(ctx, landmarks, handIdx);
}

// ── Neon Visualization ───────────────────────────────────────────

function _drawHandNeon(ctx, landmarks) {
    var neonColor = '#E84393';

    // Triple-layer lines: wide blur → medium → thin bright
    var layers = [
        { width: 12, alpha: 0.08 },
        { width: 6,  alpha: 0.25 },
        { width: 2,  alpha: 0.9 }
    ];

    for (var l = 0; l < layers.length; l++) {
        ctx.strokeStyle = neonColor;
        ctx.globalAlpha = layers[l].alpha;
        ctx.lineWidth = layers[l].width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (var i = 0; i < HAND_CONNECTIONS.length; i++) {
            var pa = _lmToScreen(landmarks[HAND_CONNECTIONS[i][0]]);
            var pb = _lmToScreen(landmarks[HAND_CONNECTIONS[i][1]]);
            ctx.beginPath();
            ctx.moveTo(pa.x, pa.y);
            ctx.lineTo(pb.x, pb.y);
            ctx.stroke();
        }
    }
    ctx.globalAlpha = 1;

    // Bright dots at tips
    for (var t = 0; t < HAND_FINGERTIPS.length; t++) {
        var p = _lmToScreen(landmarks[HAND_FINGERTIPS[t]]);
        ctx.fillStyle = '#fff';
        ctx.shadowColor = neonColor;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.shadowBlur = 0;
}

// ── Minimal Visualization ────────────────────────────────────────

function _drawHandMinimal(ctx, landmarks) {
    // Just palm center + 5 fingertips — clean and subtle
    var palmIdx = [0, 5, 9, 13, 17];
    var cx = 0, cy = 0;
    for (var i = 0; i < palmIdx.length; i++) {
        cx += landmarks[palmIdx[i]].x;
        cy += landmarks[palmIdx[i]].y;
    }
    var palm = _lmToScreen({ x: cx / 5, y: cy / 5 });

    // Palm center — soft circle
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.beginPath();
    ctx.arc(palm.x, palm.y, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.arc(palm.x, palm.y, 4, 0, Math.PI * 2);
    ctx.fill();

    // Fingertips — small bright dots with subtle lines to palm
    for (var t = 0; t < HAND_FINGERTIPS.length; t++) {
        var tip = _lmToScreen(landmarks[HAND_FINGERTIPS[t]]);

        // Subtle line from palm to tip
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(palm.x, palm.y);
        ctx.lineTo(tip.x, tip.y);
        ctx.stroke();

        // Tip dot
        ctx.fillStyle = 'rgba(232, 67, 147, 0.8)';
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 4, 0, Math.PI * 2);
        ctx.fill();
    }
}

// ── Rainbow Visualization ────────────────────────────────────────

var _rainbowColors = [
    '#FF6B6B', // thumb — red
    '#FECA57', // index — yellow
    '#48DBFB', // middle — cyan
    '#FF9FF3', // ring — pink
    '#54A0FF'  // pinky — blue
];

var _fingerChains = [
    [0, 1, 2, 3, 4],       // thumb
    [0, 5, 6, 7, 8],       // index
    [0, 9, 10, 11, 12],    // middle
    [0, 13, 14, 15, 16],   // ring
    [0, 17, 18, 19, 20]    // pinky
];

function _drawHandRainbow(ctx, landmarks) {
    ctx.lineCap = 'round';

    // Draw each finger chain in its own color
    for (var f = 0; f < _fingerChains.length; f++) {
        var chain = _fingerChains[f];
        var col = _rainbowColors[f];

        // Glow layer
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.15;
        ctx.lineWidth = 10;
        for (var j = 1; j < chain.length; j++) {
            var pa = _lmToScreen(landmarks[chain[j - 1]]);
            var pb = _lmToScreen(landmarks[chain[j]]);
            ctx.beginPath();
            ctx.moveTo(pa.x, pa.y);
            ctx.lineTo(pb.x, pb.y);
            ctx.stroke();
        }

        // Solid layer
        ctx.globalAlpha = 0.8;
        ctx.lineWidth = 3;
        for (var k = 1; k < chain.length; k++) {
            var p1 = _lmToScreen(landmarks[chain[k - 1]]);
            var p2 = _lmToScreen(landmarks[chain[k]]);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        }

        // Tip dot
        var tip = _lmToScreen(landmarks[chain[chain.length - 1]]);
        ctx.globalAlpha = 1;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 5, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.globalAlpha = 1;

    // Palm web in white
    var palmConns = [[5, 9], [9, 13], [13, 17]];
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1.5;
    for (var w = 0; w < palmConns.length; w++) {
        var a = _lmToScreen(landmarks[palmConns[w][0]]);
        var b = _lmToScreen(landmarks[palmConns[w][1]]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
    }
}

// ── Particle Visualization ───────────────────────────────────────

var _handParticles = [];

function _drawHandParticle(ctx, landmarks) {
    // Spawn particles at each joint
    for (var i = 0; i < 21; i++) {
        var p = _lmToScreen(landmarks[i]);
        if (Math.random() < 0.3) {  // 30% chance per joint per frame
            _handParticles.push({
                x: p.x, y: p.y,
                vx: (Math.random() - 0.5) * 2,
                vy: (Math.random() - 0.5) * 2 - 0.5,
                life: 1,
                decay: 0.02 + Math.random() * 0.03,
                size: 1 + Math.random() * 3,
                isTip: HAND_JOINT_TYPES[i] === 'tip'
            });
        }
    }

    // Update and draw particles
    for (var j = _handParticles.length - 1; j >= 0; j--) {
        var pt = _handParticles[j];
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.life -= pt.decay;
        if (pt.life <= 0) {
            _handParticles.splice(j, 1);
            continue;
        }

        ctx.globalAlpha = pt.life * 0.8;
        ctx.fillStyle = pt.isTip ? '#E84393' : '#00CEC9';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size * pt.life, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Cap particle count
    if (_handParticles.length > 300) _handParticles.splice(0, _handParticles.length - 300);

    // Draw faint skeleton underneath
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    for (var c = 0; c < HAND_CONNECTIONS.length; c++) {
        var pa = _lmToScreen(landmarks[HAND_CONNECTIONS[c][0]]);
        var pb = _lmToScreen(landmarks[HAND_CONNECTIONS[c][1]]);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
    }
}

// ── Fire Visualization ───────────────────────────────────────────

var _fireTrails = [[], [], [], [], []];  // per-fingertip trail of screen positions
var _fireTrailMax = 24;
var _prevFireGesture = ['unknown', 'unknown'];
var _fireballCooldown = 0;
var _fireballs = [];  // active fireball explosions

function _checkFireball(landmarks, handIdx) {
    var handData = _handResults[handIdx];
    if (!handData) return;
    var cur = handData.gesture;
    var prev = _prevFireGesture[handIdx] || 'unknown';
    _prevFireGesture[handIdx] = cur;

    if (prev === 'fist' && cur === 'open_palm') {
        var now = Date.now();
        if (now - _fireballCooldown < 600) return;
        _fireballCooldown = now;

        // Palm center
        var palmIdx = [0, 5, 9, 13, 17];
        var cx = 0, cy = 0;
        for (var i = 0; i < palmIdx.length; i++) {
            cx += landmarks[palmIdx[i]].x; cy += landmarks[palmIdx[i]].y;
        }
        var palm = _lmToScreen({ x: cx / 5, y: cy / 5 });

        // Direction fingers are spreading toward
        var dx = 0, dy = 0;
        for (var f = 0; f < HAND_FINGERTIPS.length; f++) {
            var tp = _lmToScreen(landmarks[HAND_FINGERTIPS[f]]);
            dx += tp.x - palm.x; dy += tp.y - palm.y;
        }
        var dlen = Math.sqrt(dx * dx + dy * dy) || 1;

        // Hand velocity adds momentum
        var vx = handData.velocity.x * videoW * 0.6;
        var vy = handData.velocity.y * videoH * 0.6;

        _fireballs.push({
            x: palm.x, y: palm.y,
            dx: dx / dlen * 4 + vx, dy: dy / dlen * 4 + vy,
            life: 1, age: 0
        });

        _showGestureToast('\uD83D\uDD25', 'Fireball', 'Released!');
    }
}

function _drawHandFire(ctx, landmarks) {
    // Check fireball gesture per hand
    for (var hi = 0; hi < _handResults.length; hi++) {
        _checkFireball(_handResults[hi].landmarks, hi);
    }

    var handData = _handResults[0] || null;
    var speed = handData ? handData.velocity.magnitude : 0;
    var intensity = Math.min(speed / 0.012, 2.5);
    var dipIdx = [3, 7, 11, 15, 19];

    // ── 1. Build fire trails from each fingertip ──
    for (var f = 0; f < HAND_FINGERTIPS.length; f++) {
        var tip = _lmToScreen(landmarks[HAND_FINGERTIPS[f]]);
        var dip = _lmToScreen(landmarks[dipIdx[f]]);
        if (!_fireTrails[f]) _fireTrails[f] = [];

        // Push current tip + direction info
        _fireTrails[f].push({
            x: tip.x, y: tip.y,
            dx: tip.x - dip.x, dy: tip.y - dip.y
        });
        if (_fireTrails[f].length > _fireTrailMax) _fireTrails[f].shift();
    }

    // ── 2. Draw fire streams as billowing soft blobs along trail ──
    ctx.globalCompositeOperation = 'lighter';

    for (var t = 0; t < 5; t++) {
        var trail = _fireTrails[t];
        if (trail.length < 2) continue;

        var len = trail.length;

        // Walk along trail, place overlapping blobs
        for (var i = 0; i < len; i++) {
            var progress = i / (len - 1);  // 0 = oldest, 1 = fingertip (newest)
            var pt = trail[i];

            // Direction for this segment
            var dirX = pt.dx || 0;
            var dirY = pt.dy || 0;

            // Size: big at tip (newest), fades toward tail
            var baseSize = (28 + intensity * 20) * progress;
            // Turbulent offset — more chaotic toward the tail
            var chaos = (1 - progress) * (18 + intensity * 14);
            var offsetX = (Math.random() - 0.5) * chaos + dirX * 0.2;
            var offsetY = (Math.random() - 0.5) * chaos + dirY * 0.2 - (1 - progress) * 3;  // tail drifts up (heat)

            var bx = pt.x + offsetX;
            var by = pt.y + offsetY;

            // Multiple soft blobs per trail point for volume
            var blobCount = progress > 0.6 ? 3 : 2;
            for (var b = 0; b < blobCount; b++) {
                var blobSize = baseSize * (0.6 + Math.random() * 0.8);
                var wobbleX = bx + (Math.random() - 0.5) * blobSize * 0.7;
                var wobbleY = by + (Math.random() - 0.5) * blobSize * 0.7;

                if (blobSize < 2) continue;

                // Color based on progress: tip = white-yellow, tail = deep red
                var grad = ctx.createRadialGradient(wobbleX, wobbleY, 0, wobbleX, wobbleY, blobSize);
                if (progress > 0.7) {
                    // Near fingertip: white-hot core
                    grad.addColorStop(0, 'rgba(255, 255, 220, 0.25)');
                    grad.addColorStop(0.3, 'rgba(255, 200, 50, 0.15)');
                    grad.addColorStop(0.7, 'rgba(255, 100, 0, 0.06)');
                    grad.addColorStop(1, 'rgba(200, 30, 0, 0)');
                } else if (progress > 0.35) {
                    // Middle: orange flame
                    grad.addColorStop(0, 'rgba(255, 160, 20, 0.18)');
                    grad.addColorStop(0.4, 'rgba(255, 80, 0, 0.1)');
                    grad.addColorStop(1, 'rgba(180, 20, 0, 0)');
                } else {
                    // Tail: deep red smoke
                    grad.addColorStop(0, 'rgba(200, 50, 0, 0.1)');
                    grad.addColorStop(0.5, 'rgba(120, 15, 0, 0.05)');
                    grad.addColorStop(1, 'rgba(60, 0, 0, 0)');
                }

                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(wobbleX, wobbleY, blobSize, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Bright core dot at the fingertip itself
        if (len > 0) {
            var tipPt = trail[len - 1];
            var coreR = 10 + intensity * 8;
            var coreGrad = ctx.createRadialGradient(tipPt.x, tipPt.y, 0, tipPt.x, tipPt.y, coreR);
            coreGrad.addColorStop(0, 'rgba(255, 255, 240, 0.5)');
            coreGrad.addColorStop(0.4, 'rgba(255, 200, 80, 0.2)');
            coreGrad.addColorStop(1, 'rgba(255, 100, 0, 0)');
            ctx.fillStyle = coreGrad;
            ctx.beginPath();
            ctx.arc(tipPt.x, tipPt.y, coreR, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ── 3. Heat aura around palm ──
    var palmPts = [0, 5, 9, 13, 17];
    var pcx = 0, pcy = 0;
    for (var pi = 0; pi < palmPts.length; pi++) {
        var pp = _lmToScreen(landmarks[palmPts[pi]]);
        pcx += pp.x; pcy += pp.y;
    }
    pcx /= 5; pcy /= 5;

    var auraSize = 80 + intensity * 50;
    var auraGrad = ctx.createRadialGradient(pcx, pcy, 0, pcx, pcy, auraSize);
    auraGrad.addColorStop(0, 'rgba(255, 200, 50, 0.08)');
    auraGrad.addColorStop(0.4, 'rgba(255, 100, 0, 0.04)');
    auraGrad.addColorStop(1, 'rgba(200, 30, 0, 0)');
    ctx.fillStyle = auraGrad;
    ctx.beginPath();
    ctx.arc(pcx, pcy, auraSize, 0, Math.PI * 2);
    ctx.fill();

    // ── 4. Draw fireballs (expanding flame bursts) ──
    for (var fb = _fireballs.length - 1; fb >= 0; fb--) {
        var ball = _fireballs[fb];
        ball.x += ball.dx;
        ball.y += ball.dy;
        ball.dx *= 0.96;
        ball.dy *= 0.96;
        ball.dy -= 0.3; // rises
        ball.age++;
        ball.life -= 0.02;

        if (ball.life <= 0) {
            _fireballs.splice(fb, 1);
            continue;
        }

        var ballSize = (1 - ball.life) * 80 + 20;
        var coreSize = ballSize * 0.5;

        // Outer fire glow
        var outerGrad = ctx.createRadialGradient(ball.x, ball.y, 0, ball.x, ball.y, ballSize);
        outerGrad.addColorStop(0, 'rgba(255, 200, 50,' + (ball.life * 0.3) + ')');
        outerGrad.addColorStop(0.3, 'rgba(255, 100, 0,' + (ball.life * 0.2) + ')');
        outerGrad.addColorStop(0.6, 'rgba(200, 30, 0,' + (ball.life * 0.1) + ')');
        outerGrad.addColorStop(1, 'rgba(100, 0, 0, 0)');
        ctx.fillStyle = outerGrad;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ballSize, 0, Math.PI * 2);
        ctx.fill();

        // Hot core
        if (ball.life > 0.3) {
            var coreAlpha = (ball.life - 0.3) / 0.7;
            var coreGrad = ctx.createRadialGradient(ball.x, ball.y, 0, ball.x, ball.y, coreSize);
            coreGrad.addColorStop(0, 'rgba(255, 255, 220,' + (coreAlpha * 0.6) + ')');
            coreGrad.addColorStop(0.5, 'rgba(255, 180, 50,' + (coreAlpha * 0.3) + ')');
            coreGrad.addColorStop(1, 'rgba(255, 80, 0, 0)');
            ctx.fillStyle = coreGrad;
            ctx.beginPath();
            ctx.arc(ball.x, ball.y, coreSize, 0, Math.PI * 2);
            ctx.fill();
        }

        // Flickering edge flames around the fireball
        for (var ef = 0; ef < 8; ef++) {
            var a = (ef / 8) * Math.PI * 2 + ball.age * 0.15;
            var edgeR = ballSize * (0.7 + Math.random() * 0.5);
            var ex = ball.x + Math.cos(a) * edgeR;
            var ey = ball.y + Math.sin(a) * edgeR;
            var tongueSize = 8 + Math.random() * 12;
            var tongueGrad = ctx.createRadialGradient(ex, ey, 0, ex, ey, tongueSize);
            tongueGrad.addColorStop(0, 'rgba(255, 160, 0,' + (ball.life * 0.25) + ')');
            tongueGrad.addColorStop(1, 'rgba(200, 30, 0, 0)');
            ctx.fillStyle = tongueGrad;
            ctx.beginPath();
            ctx.arc(ex, ey, tongueSize, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
}

// ── Pinch Meter ──────────────────────────────────────────────────

// ── Live Gesture Indicator ────────────────────────────────────────

var _lastHighlightedGesture = null;

function _updateGestureHighlight() {
    if (_handResults.length === 0) {
        if (_lastHighlightedGesture) {
            var prevRow = document.querySelector('.gesture-trigger-row[data-gesture="' + _lastHighlightedGesture + '"]');
            if (prevRow) prevRow.style.background = 'var(--color-surface)';
            _lastHighlightedGesture = null;
        }
        return;
    }
    var gesture = _handResults[0].gesture;

    // Unhighlight previous
    if (_lastHighlightedGesture && _lastHighlightedGesture !== gesture) {
        var prev = document.querySelector('.gesture-trigger-row[data-gesture="' + _lastHighlightedGesture + '"]');
        if (prev) prev.style.background = 'var(--color-surface)';
    }

    // Highlight current
    if (gesture !== 'unknown') {
        var row = document.querySelector('.gesture-trigger-row[data-gesture="' + gesture + '"]');
        if (row) row.style.background = 'rgba(232, 67, 147, 0.12)';
        _lastHighlightedGesture = gesture;
    } else {
        if (_lastHighlightedGesture) {
            var prevR = document.querySelector('.gesture-trigger-row[data-gesture="' + _lastHighlightedGesture + '"]');
            if (prevR) prevR.style.background = 'var(--color-surface)';
        }
        _lastHighlightedGesture = null;
    }
}

function _updatePinchMeter() {
    var meter = document.getElementById('hand-pinch-meter-fill');
    if (!meter) return;
    if (_handResults.length === 0) {
        meter.style.width = '0%';
        return;
    }
    // Invert: small distance = high value (pinching)
    var pinch = Math.max(0, Math.min(1, 1 - _handResults[0].pinchDistance * 5));
    meter.style.width = Math.round(pinch * 100) + '%';
}

// ── Status Display ───────────────────────────────────────────────

function updateHandStatus() {
    if (!window._handStatusEl) window._handStatusEl = document.getElementById('hand-status');
    if (!window._handHintEl) window._handHintEl = document.getElementById('hand-hint');
    const sEl = window._handStatusEl;
    const hEl = window._handHintEl;
    if (!sEl) return;

    if (!handsEnabled) {
        sEl.textContent = 'OFF';
        sEl.style.color = 'var(--text-muted, #888)';
        if (hEl) hEl.textContent = 'Toggle on to detect hands. Works alongside blob tracking.';
        return;
    }

    if (window.mpHandInitError) {
        sEl.textContent = 'ERROR';
        sEl.style.color = '#E17055';
        if (hEl) hEl.textContent = window.mpHandInitError;
    } else if (!window.mpHandLandmarkerReady) {
        sEl.textContent = 'LOADING';
        sEl.style.color = '#FDCB6E';
        if (hEl) hEl.textContent = 'Loading hand detection model...';
    } else if (_handResults.length > 0) {
        const count = _handResults.length;
        const labels = _handResults.map(h => h.handedness).join(' + ');
        sEl.textContent = count + ' HAND' + (count > 1 ? 'S' : '');
        sEl.style.color = '#00B894';
        const loadEl = document.getElementById('hand-loading');
        if (loadEl) loadEl.style.display = 'none';
        if (hEl) {
            const gestures = _handResults.map(h => h.gesture).filter(g => g !== 'unknown');
            hEl.textContent = labels + (gestures.length ? ' \u00B7 ' + gestures.join(', ') : '');
        }
    } else {
        sEl.textContent = 'SEARCHING';
        sEl.style.color = '#00CEC9';
        if (hEl) hEl.textContent = 'Show your hands to the camera';
    }

    // Update hand info group visibility
    const infoGroup = document.getElementById('hand-info-group');
    if (infoGroup) infoGroup.style.display = (_handResults.length > 0) ? '' : 'none';

    // Update right panel data display
    _updateHandDataDisplay();
}

function _updateHandDataDisplay() {
    if (_handResults.length === 0) return;
    const h = _handResults[0]; // Primary hand

    const pinchEl = document.getElementById('hand-data-pinch');
    const gestureEl = document.getElementById('hand-data-gesture');
    const velEl = document.getElementById('hand-data-velocity');
    const fingersEl = document.getElementById('hand-data-fingers');

    if (pinchEl) pinchEl.textContent = 'Pinch: ' + h.pinchDistance.toFixed(3);
    if (gestureEl) gestureEl.textContent = 'Gesture: ' + h.gesture + ' (' + h.handedness + ')';
    if (velEl) velEl.textContent = 'Velocity: ' + h.velocity.magnitude.toFixed(4);
    if (fingersEl) {
        const names = ['Thumb', 'Index', 'Mid', 'Ring', 'Pinky'];
        const states = h.fingerStates.map(function(s, i) { return names[i] + ':' + (s ? 'open' : 'closed'); });
        fingersEl.textContent = states.join(' ');
    }
}

// ── Hand Control Value Extraction ─────────────────────────────────

const HAND_SYNC_SOURCES = {
    pinch:      { label: 'Pinch',    desc: 'Thumb-to-index distance' },
    velocity:   { label: 'Velocity', desc: 'Hand movement speed' },
    palm_x:     { label: 'Palm X',   desc: 'Horizontal hand position' },
    palm_y:     { label: 'Palm Y',   desc: 'Vertical hand position' },
    curl_index: { label: 'Index Curl', desc: 'Index finger curl' },
    curl_middle:{ label: 'Mid Curl',   desc: 'Middle finger curl' },
    curl_ring:  { label: 'Ring Curl',  desc: 'Ring finger curl' },
    curl_pinky: { label: 'Pinky Curl', desc: 'Pinky finger curl' }
};

function getHandControlValue(source, handData) {
    if (!handData) return 0;
    switch (source) {
        case 'pinch':
            // Invert: small distance = high value (pinching = active)
            return Math.max(0, Math.min(1, 1 - handData.pinchDistance * 5));
        case 'velocity':
            return Math.min(handData.velocity.magnitude / 0.04, 1);
        case 'palm_x':
            return handData.palmCenter.x;  // already 0-1
        case 'palm_y':
            return handData.palmCenter.y;  // already 0-1
        case 'curl_index':
            return handData.fingerStates[1] ? 0 : 1;  // curled = 1
        case 'curl_middle':
            return handData.fingerStates[2] ? 0 : 1;
        case 'curl_ring':
            return handData.fingerStates[3] ? 0 : 1;
        case 'curl_pinky':
            return handData.fingerStates[4] ? 0 : 1;
        default: return 0;
    }
}

// ── Per-Effect Hand Sync Engine ──────────────────────────────────

let _handSyncUIFrame = 0;

function applyPerEffectHandsSync() {
    if (!handsEnabled || _handResults.length === 0) return;
    var keys = Object.keys(fxHandsSync);
    if (keys.length === 0) return;

    var doUI = (++_handSyncUIFrame % 6 === 0);

    for (var i = 0; i < keys.length; i++) {
        var effectName = keys[i];
        var cfg = fxHandsSync[effectName];

        var paramMap = FX_PARAM_MAP[effectName];
        if (!paramMap || !paramMap[cfg.paramIndex]) continue;
        var p = paramMap[cfg.paramIndex];

        if (!cfg.enabled || !activeEffects.has(effectName)) {
            if (cfg._baseValue != null) {
                p.s(cfg._baseValue);
                cfg._baseValue = null;
                cfg.smoothedValue = 0;
            }
            continue;
        }

        // Find matching hand
        var hand = null;
        for (var h = 0; h < _handResults.length; h++) {
            if (cfg.hand === 'any' || _handResults[h].handedness.toLowerCase() === cfg.hand) {
                hand = _handResults[h];
                break;
            }
        }
        if (!hand) {
            // No matching hand — decay smoothly
            if (cfg.smoothedValue > 0.001) cfg.smoothedValue *= 0.92;
            else cfg.smoothedValue = 0;
            if (cfg._baseValue != null) p.s(cfg._baseValue);
            continue;
        }

        // Capture baseline
        if (cfg._baseValue == null) {
            cfg._baseValue = p.g();
        }

        // Get control value
        var value = getHandControlValue(cfg.source, hand);

        // Sensitivity scaling
        var sens = (cfg.sensitivity / 50) * 1.5;
        value = Math.min(value * sens, 1);

        // Smoothing
        var smoothRate = 0.05 + (1 - cfg.smoothing / 100) * 0.45;
        cfg.smoothedValue += (value - cfg.smoothedValue) * smoothRate;

        // Find slider min/max from FX_UI_CONFIG
        var uiCfg = FX_UI_CONFIG[effectName];
        var minVal = 0, maxVal = 100;
        var sliderSid = null, valId = null;
        if (uiCfg) {
            var pName = p.v.replace(/([A-Z])/g, '-$1').toLowerCase();
            for (var c = 0; c < uiCfg.controls.length; c++) {
                var ctrl = uiCfg.controls[c];
                if (ctrl.type === 'slider' && ctrl.sid && ctrl.sid.includes(pName)) {
                    minVal = ctrl.min; maxVal = ctrl.max;
                    sliderSid = ctrl.sid; valId = ctrl.vid;
                    break;
                }
            }
        }

        // Modulate from baseline toward max
        var baseVal = cfg._baseValue;
        var modulated = baseVal + (maxVal - baseVal) * cfg.smoothedValue;
        modulated = Math.max(minVal, Math.min(maxVal, modulated));
        p.s(modulated);

        // Update UI slider so user sees it moving
        if (doUI && sliderSid) {
            var sl = document.getElementById(sliderSid);
            var inp = document.getElementById(valId);
            var displayVal = Math.round(modulated);
            if (sl) sl.value = displayVal;
            if (inp) inp.value = displayVal;
        }
    }

    // Update hand sync summary meters
    if (doUI) {
        for (var j = 0; j < keys.length; j++) {
            var c = fxHandsSync[keys[j]];
            var meter = document.getElementById('hand-sync-meter-' + keys[j]);
            if (meter) meter.style.width = Math.round((c.smoothedValue || 0) * 100) + '%';
        }
    }
}

// ── Hand Sync Persistence ────────────────────────────────────────

var _handsSyncSaveTimer = null;
function _saveFxHandsSync() {
    clearTimeout(_handsSyncSaveTimer);
    _handsSyncSaveTimer = setTimeout(function() {
        var data = {};
        for (var k of Object.keys(fxHandsSync)) {
            var v = fxHandsSync[k];
            data[k] = { enabled: v.enabled, source: v.source, hand: v.hand,
                         paramIndex: v.paramIndex, sensitivity: v.sensitivity,
                         smoothing: v.smoothing };
        }
        try { localStorage.setItem('hod-hands-sync', JSON.stringify(data)); } catch(e) {}
    }, 500);
}

function _loadFxHandsSync() {
    try {
        var raw = localStorage.getItem('hod-hands-sync');
        if (!raw) return;
        var data = JSON.parse(raw);
        for (var k of Object.keys(data)) {
            fxHandsSync[k] = Object.assign({}, FX_HANDS_SYNC_DEFAULTS, data[k], { smoothedValue: 0 });
        }
    } catch(e) {}
}

// ── Gesture Trigger Persistence ───────────────────────────────────

function _saveGestureTriggers() {
    var data = {};
    for (var k of Object.keys(GESTURE_TRIGGERS)) {
        data[k] = { enabled: GESTURE_TRIGGERS[k].enabled, action: GESTURE_TRIGGERS[k].action || GESTURE_TRIGGERS[k].defaultAction };
    }
    try { localStorage.setItem('hod-gesture-triggers', JSON.stringify(data)); } catch(e) {}
}

function _loadGestureTriggers() {
    try {
        var raw = localStorage.getItem('hod-gesture-triggers');
        if (!raw) return;
        var data = JSON.parse(raw);
        for (var k of Object.keys(data)) {
            if (GESTURE_TRIGGERS[k]) {
                GESTURE_TRIGGERS[k].enabled = data[k].enabled;
                GESTURE_TRIGGERS[k].action = data[k].action;
                // Sync UI
                var toggle = document.querySelector('.gesture-toggle[data-gesture="' + k + '"]');
                if (toggle) {
                    toggle.checked = data[k].enabled;
                    var row = toggle.closest('.gesture-trigger-row');
                    if (row) row.style.borderLeftColor = data[k].enabled ? '#E84393' : 'transparent';
                }
                var select = document.querySelector('.gesture-action-select[data-gesture="' + k + '"]');
                if (select) select.value = data[k].action;
            }
        }
    } catch(e) {}
}

function _ensureFxHandsSync(effectName) {
    if (!fxHandsSync[effectName]) {
        fxHandsSync[effectName] = Object.assign({}, FX_HANDS_SYNC_DEFAULTS);
    }
    return fxHandsSync[effectName];
}

// ── Hand Sync Summary Panel ──────────────────────────────────────

function buildHandsSyncSummaryPanel() {
    var container = document.getElementById('hands-sync-summary');
    if (!container) return;
    container.innerHTML = '';

    var entries = [];
    for (var name of Object.keys(fxHandsSync)) {
        var cfg = fxHandsSync[name];
        if (cfg && cfg.enabled) entries.push({ name: name, cfg: cfg });
    }

    if (entries.length === 0) {
        container.innerHTML = '<span class="hint-text" style="display:block;padding:4px 0">No effects synced to hands yet. Enable Hand Sync on any effect card to see it here.</span>';
        return;
    }

    var list = document.createElement('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin-top:4px';

    entries.forEach(function(entry) {
        var uiCfg = FX_UI_CONFIG[entry.name];
        if (!uiCfg) return;

        var paramMap = FX_PARAM_MAP[entry.name];
        var paramLabel = '\u2014';
        if (paramMap && paramMap[entry.cfg.paramIndex]) {
            paramLabel = paramMap[entry.cfg.paramIndex].v.replace(/([A-Z])/g, ' $1').replace(/^./, function(s) { return s.toUpperCase(); });
        }

        var srcInfo = HAND_SYNC_SOURCES[entry.cfg.source] || { label: entry.cfg.source };

        var row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 6px;background:var(--color-surface);border-radius:4px;border-left:2px solid #E84393';

        var info = document.createElement('div');
        info.style.cssText = 'flex:1;min-width:0';
        info.innerHTML =
            '<div style="font-size:9px;font-weight:700;color:var(--color-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + uiCfg.label + '</div>' +
            '<div style="font-size:8px;color:var(--text-muted)">' + paramLabel + ' \u00B7 ' + srcInfo.label + '</div>';

        var meter = document.createElement('div');
        meter.style.cssText = 'width:40px;height:8px;background:var(--color-elevated);border-radius:2px;overflow:hidden;flex-shrink:0';
        var fill = document.createElement('div');
        fill.id = 'hand-sync-meter-' + entry.name;
        fill.style.cssText = 'height:100%;width:0%;background:#E84393;border-radius:2px;transition:width 0.1s';
        meter.appendChild(fill);

        var disableBtn = document.createElement('button');
        disableBtn.style.cssText = 'background:none;border:1px solid var(--color-border);border-radius:3px;color:var(--text-muted);font-size:8px;padding:1px 4px;cursor:pointer;flex-shrink:0';
        disableBtn.textContent = '\u2715';
        disableBtn.title = 'Disable hand sync for ' + uiCfg.label;
        disableBtn.addEventListener('click', (function(n, c) {
            return function() {
                c.enabled = false;
                c._baseValue = null;
                _saveFxHandsSync();
                if (typeof syncFxHandsSyncUI === 'function') syncFxHandsSyncUI(n);
                if (typeof updateCardHighlights === 'function') updateCardHighlights();
                buildHandsSyncSummaryPanel();
            };
        })(entry.name, entry.cfg));

        row.appendChild(info);
        row.appendChild(meter);
        row.appendChild(disableBtn);
        list.appendChild(row);
    });

    container.appendChild(list);
}

// ── Per-Effect Hand Sync UI Builder ──────────────────────────────

function buildFxHandsSyncSection(effectName, group) {
    if (typeof FX_PARAM_MAP === 'undefined') return;
    var paramMap = FX_PARAM_MAP[effectName];
    if (!paramMap || paramMap.length === 0) return;

    var defaults = (typeof FX_DEFAULTS !== 'undefined') ? (FX_DEFAULTS[effectName] || {}) : {};
    var numericParams = paramMap.filter(function(p) {
        var def = defaults[p.v];
        return typeof def === 'number' || def === undefined;
    });
    if (numericParams.length === 0) return;

    var section = document.createElement('div');
    section.className = 'fx-audio-sync collapsed';
    section.id = 'fx-hand-sync-' + effectName;

    // Header row
    var header = document.createElement('div');
    header.className = 'fx-audio-sync-header';
    header.style.borderLeftColor = '#E84393';
    header.innerHTML =
        '<span class="sync-label" style="color:#E84393">HAND SYNC</span>' +
        '<label class="fx-toggle-switch" style="margin-left:auto" onclick="event.stopPropagation()">' +
            '<input type="checkbox" id="fx-hsync-toggle-' + effectName + '">' +
            '<span class="toggle-slider"></span>' +
        '</label>' +
        '<span class="sync-chevron" style="font-size:10px;color:var(--text-muted);transition:transform 0.2s">\u203A</span>';
    section.appendChild(header);

    // Body
    var body = document.createElement('div');
    body.className = 'fx-audio-sync-body';

    // Parameter selector
    var paramRow = document.createElement('div');
    paramRow.style.cssText = 'margin:6px 0 4px;';
    var paramLabel = document.createElement('label');
    paramLabel.style.cssText = 'font-size:8px;font-weight:700;letter-spacing:0.5px;color:var(--text-muted);text-transform:uppercase;display:block;margin-bottom:2px';
    paramLabel.textContent = 'Target Parameter';
    var paramSelect = document.createElement('select');
    paramSelect.id = 'fx-hsync-param-' + effectName;
    paramSelect.style.cssText = 'width:100%;background:var(--btn-bg);color:var(--color-text);border:1px solid var(--btn-border);border-radius:4px;padding:3px 6px;font-size:9px;outline:none';
    numericParams.forEach(function(p) {
        var realIndex = paramMap.indexOf(p);
        var opt = document.createElement('option');
        opt.value = realIndex;
        var label = p.v.replace(/([A-Z])/g, ' $1').replace(/^./, function(s) { return s.toUpperCase(); });
        opt.textContent = label;
        paramSelect.appendChild(opt);
    });
    paramRow.appendChild(paramLabel);
    paramRow.appendChild(paramSelect);
    body.appendChild(paramRow);

    // Source selector (instead of frequency band)
    var srcLabel = document.createElement('label');
    srcLabel.style.cssText = 'font-size:8px;font-weight:700;letter-spacing:0.5px;color:var(--text-muted);text-transform:uppercase;display:block;margin:6px 0 2px';
    srcLabel.textContent = 'Hand Source';
    body.appendChild(srcLabel);
    var srcRow = document.createElement('div');
    srcRow.className = 'selector-row';
    srcRow.id = 'fx-hsync-source-' + effectName;
    srcRow.style.cssText = 'flex-wrap:wrap;gap:3px';
    var sources = ['pinch', 'velocity', 'palm_x', 'palm_y', 'curl_index', 'curl_middle', 'curl_ring', 'curl_pinky'];
    sources.forEach(function(s, i) {
        var btn = document.createElement('button');
        btn.className = 'selector-btn' + (i === 0 ? ' active' : '');
        btn.dataset.value = s;
        btn.textContent = (HAND_SYNC_SOURCES[s] || {}).label || s.toUpperCase();
        btn.style.cssText = 'font-size:8px;padding:2px 6px';
        srcRow.appendChild(btn);
    });
    body.appendChild(srcRow);

    // Hand selector
    var handLabel = document.createElement('label');
    handLabel.style.cssText = 'font-size:8px;font-weight:700;letter-spacing:0.5px;color:var(--text-muted);text-transform:uppercase;display:block;margin:6px 0 2px';
    handLabel.textContent = 'Which Hand';
    body.appendChild(handLabel);
    var handRow = document.createElement('div');
    handRow.className = 'selector-row';
    handRow.id = 'fx-hsync-hand-' + effectName;
    ['any', 'left', 'right'].forEach(function(h, i) {
        var btn = document.createElement('button');
        btn.className = 'selector-btn' + (i === 0 ? ' active' : '');
        btn.dataset.value = h;
        btn.textContent = h.toUpperCase();
        btn.style.cssText = 'font-size:8px;padding:2px 6px';
        handRow.appendChild(btn);
    });
    body.appendChild(handRow);

    // Sliders: Sensitivity, Smoothing
    var sliders = [
        { id: 'sensitivity', label: 'Sensitivity', min: 0, max: 100, val: 50 },
        { id: 'smoothing', label: 'Smoothing', min: 0, max: 100, val: 50 }
    ];
    sliders.forEach(function(s) {
        var row = document.createElement('div');
        row.className = 'fx-inline-slider';
        row.innerHTML =
            '<label class="fx-slider-label">' + s.label + '</label>' +
            '<input type="range" id="fx-hsync-' + s.id + '-' + effectName + '" min="' + s.min + '" max="' + s.max + '" step="1" value="' + s.val + '">' +
            '<input type="number" id="fx-hsync-' + s.id + '-val-' + effectName + '" min="' + s.min + '" max="' + s.max + '" step="1" value="' + s.val + '" style="width:36px">';
        body.appendChild(row);
    });

    // Energy meter
    var meterWrap = document.createElement('div');
    meterWrap.className = 'fx-audio-sync-meter';
    meterWrap.innerHTML = '<div class="fx-audio-sync-meter-fill" id="fx-hand-meter-' + effectName + '" style="width:0%;background:#E84393"></div>';
    body.appendChild(meterWrap);

    section.appendChild(body);
    group.appendChild(section);
}

function syncFxHandsSyncUI(effectName) {
    var cfg = fxHandsSync[effectName];
    if (!cfg) return;
    var section = document.getElementById('fx-hand-sync-' + effectName);
    if (!section) return;

    var toggle = document.getElementById('fx-hsync-toggle-' + effectName);
    if (toggle) toggle.checked = cfg.enabled;

    section.classList.toggle('collapsed', !cfg.enabled);
    var label = section.querySelector('.sync-label');
    if (label) label.classList.toggle('active', cfg.enabled);
    var chevron = section.querySelector('.sync-chevron');
    if (chevron) chevron.style.transform = cfg.enabled ? 'rotate(90deg)' : '';

    var paramSel = document.getElementById('fx-hsync-param-' + effectName);
    if (paramSel) paramSel.value = cfg.paramIndex;

    // Source buttons
    document.querySelectorAll('#fx-hsync-source-' + effectName + ' .selector-btn').forEach(function(b) {
        b.classList.toggle('active', b.dataset.value === cfg.source);
    });

    // Hand buttons
    document.querySelectorAll('#fx-hsync-hand-' + effectName + ' .selector-btn').forEach(function(b) {
        b.classList.toggle('active', b.dataset.value === cfg.hand);
    });

    // Sliders
    ['sensitivity', 'smoothing'].forEach(function(key) {
        var sl = document.getElementById('fx-hsync-' + key + '-' + effectName);
        var inp = document.getElementById('fx-hsync-' + key + '-val-' + effectName);
        if (sl) sl.value = cfg[key];
        if (inp) inp.value = cfg[key];
    });
}

function wireFxHandsSyncListeners() {
    if (typeof FX_UI_CONFIG === 'undefined') return;
    for (var effectName of Object.keys(FX_UI_CONFIG)) {
        (function(eName) {
            var section = document.getElementById('fx-hand-sync-' + eName);
            if (!section) return;

            // Toggle
            var toggle = document.getElementById('fx-hsync-toggle-' + eName);
            if (toggle) {
                toggle.addEventListener('change', function() {
                    var cfg = _ensureFxHandsSync(eName);
                    cfg.enabled = toggle.checked;
                    cfg._baseValue = null;
                    section.classList.toggle('collapsed', !cfg.enabled);
                    var label = section.querySelector('.sync-label');
                    if (label) label.classList.toggle('active', cfg.enabled);
                    var chevron = section.querySelector('.sync-chevron');
                    if (chevron) chevron.style.transform = cfg.enabled ? 'rotate(90deg)' : '';
                    _saveFxHandsSync();
                    if (typeof updateCardHighlights === 'function') updateCardHighlights();
                    buildHandsSyncSummaryPanel();
                });
            }

            // Header click expands/collapses
            var header = section.querySelector('.fx-audio-sync-header');
            if (header) {
                header.addEventListener('click', function(e) {
                    if (e.target.closest('.fx-toggle-switch')) return;
                    var cfg = fxHandsSync[eName];
                    if (!cfg || !cfg.enabled) return;
                    section.classList.toggle('collapsed');
                    var chevron = section.querySelector('.sync-chevron');
                    if (chevron) chevron.style.transform = section.classList.contains('collapsed') ? '' : 'rotate(90deg)';
                });
            }

            // Parameter selector
            var paramSel = document.getElementById('fx-hsync-param-' + eName);
            if (paramSel) {
                paramSel.addEventListener('change', function() {
                    var cfg = _ensureFxHandsSync(eName);
                    cfg.paramIndex = parseInt(paramSel.value) || 0;
                    cfg._baseValue = null;
                    _saveFxHandsSync();
                });
            }

            // Source selector
            document.querySelectorAll('#fx-hsync-source-' + eName + ' .selector-btn').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    var cfg = _ensureFxHandsSync(eName);
                    cfg.source = btn.dataset.value;
                    document.querySelectorAll('#fx-hsync-source-' + eName + ' .selector-btn')
                        .forEach(function(b) { b.classList.remove('active'); });
                    btn.classList.add('active');
                    _saveFxHandsSync();
                });
            });

            // Hand selector
            document.querySelectorAll('#fx-hsync-hand-' + eName + ' .selector-btn').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    var cfg = _ensureFxHandsSync(eName);
                    cfg.hand = btn.dataset.value;
                    document.querySelectorAll('#fx-hsync-hand-' + eName + ' .selector-btn')
                        .forEach(function(b) { b.classList.remove('active'); });
                    btn.classList.add('active');
                    _saveFxHandsSync();
                });
            });

            // Sliders
            ['sensitivity', 'smoothing'].forEach(function(key) {
                var sl = document.getElementById('fx-hsync-' + key + '-' + eName);
                var inp = document.getElementById('fx-hsync-' + key + '-val-' + eName);
                if (sl && inp) {
                    sl.addEventListener('input', function() {
                        var v = parseFloat(sl.value);
                        inp.value = v;
                        var cfg = _ensureFxHandsSync(eName);
                        cfg[key] = v;
                        _saveFxHandsSync();
                    });
                    inp.addEventListener('change', function() {
                        var v = Math.max(parseFloat(sl.min), Math.min(parseFloat(sl.max), parseFloat(inp.value) || 0));
                        sl.value = v; inp.value = v;
                        var cfg = _ensureFxHandsSync(eName);
                        cfg[key] = v;
                        _saveFxHandsSync();
                    });
                    inp.addEventListener('keydown', function(e) { e.stopPropagation(); });
                }
            });

            // Restore from persisted config
            if (fxHandsSync[eName]) {
                syncFxHandsSyncUI(eName);
            }
        })(effectName);
    }
}

// ── UI Wiring ────────────────────────────────────────────────────

(function wireHandsUI() {
    document.addEventListener('DOMContentLoaded', function() {
        // Hand toggle
        const handToggle = document.getElementById('hand-toggle');
        if (handToggle) {
            handToggle.addEventListener('change', function() {
                handsEnabled = this.checked;
                if (handsEnabled) {
                    if (typeof window.initHandLandmarkerLazy === 'function') {
                        window.initHandLandmarkerLazy();
                    }
                } else {
                    _handResults = [];
                    _handSmoothed = [];
                    _handPrevWrist = [];
                    _handTrails = [[], []];
                    // Clear status
                    window._handStatusEl = null;
                    window._handHintEl = null;
                }
                updateHandStatus();
            });
        }

        // Viz mode buttons
        document.querySelectorAll('#hand-viz-buttons .selector-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                document.querySelectorAll('#hand-viz-buttons .selector-btn').forEach(function(b) {
                    b.classList.remove('active');
                });
                this.classList.add('active');
                handVizMode = this.dataset.value;
                // Clear trails when switching away from tips
                if (handVizMode !== 'tips') {
                    _handTrails = [[], []];
                }
            });
        });

        // Wire gesture trigger toggles
        document.querySelectorAll('.gesture-toggle').forEach(function(toggle) {
            toggle.addEventListener('change', function() {
                var gesture = this.dataset.gesture;
                if (GESTURE_TRIGGERS[gesture]) {
                    GESTURE_TRIGGERS[gesture].enabled = this.checked;
                    // Highlight active row
                    var row = this.closest('.gesture-trigger-row');
                    if (row) row.style.borderLeftColor = this.checked ? '#E84393' : 'transparent';
                }
                _saveGestureTriggers();
            });
        });

        // Wire gesture action selectors
        document.querySelectorAll('.gesture-action-select').forEach(function(select) {
            select.addEventListener('change', function() {
                var gesture = this.dataset.gesture;
                if (GESTURE_TRIGGERS[gesture]) {
                    GESTURE_TRIGGERS[gesture].action = this.value;
                }
                _saveGestureTriggers();
            });
        });

        // Load persisted gesture triggers
        _loadGestureTriggers();

        // Load persisted hand sync config
        _loadFxHandsSync();

        // Wire per-effect hand sync listeners (needs FX panel to be built first)
        // Use setTimeout to ensure blob-fx.js has built the FX panel
        setTimeout(function() {
            wireFxHandsSyncListeners();
        }, 100);
    });
})();
