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
    freeze:           { label: 'Freeze Frame',    desc: 'Pause video on current frame' },
    reset_fx:         { label: 'Stop All FX',     desc: 'Turn off all active effects (remembers them)' },
    restore_fx:       { label: 'Restore FX',      desc: 'Bring back effects that were stopped' },
    cycle_preset:     { label: 'Cycle Preset',     desc: 'Jump to a random FX preset' },
    cycle_preset_next:{ label: 'Next Preset',      desc: 'Go to the next preset in sequence' },
    random_fx:        { label: 'Random Effect',    desc: 'Activate a random effect' },
    flash_fx:         { label: 'Flash Effect',     desc: 'Briefly flash a random intense effect' },
    boost:            { label: 'Boost Intensity',  desc: 'Push active effects to max for a beat' },
    intensity_spike:  { label: 'Intensity Spike',  desc: 'Push all effects to max for a longer moment' },
    toggle_viz:       { label: 'Toggle Hand Viz',  desc: 'Cycle through hand display styles' },
    audio_toggle:     { label: 'Play / Pause Music', desc: 'Toggle audio playback' },
    audio_volume_up:  { label: 'Volume Up',         desc: 'Raise music volume by 10%' },
    audio_volume_down:{ label: 'Volume Down',       desc: 'Lower music volume by 10%' },
    audio_restart:    { label: 'Restart Music',     desc: 'Jump audio to the start' },
    none:             { label: 'None',             desc: 'Gesture detected but no action' }
};

// ── Movement Triggers (dance-based) ─────────────────────────────
// Respond to HOW you move, not what shape your hand is

const MOVEMENT_TRIGGERS = {
    swipe_left:   { label: 'Swipe Left',    desc: 'Fast sweep left',           icon: '\u{1F448}', defaultAction: 'cycle_preset',      enabled: false, cooldown: 1200 },
    swipe_right:  { label: 'Swipe Right',   desc: 'Fast sweep right',          icon: '\u{1F449}', defaultAction: 'cycle_preset_next', enabled: false, cooldown: 1200 },
    swipe_up:     { label: 'Swipe Up',      desc: 'Fast sweep upward',         icon: '\u2B06',    defaultAction: 'boost',              enabled: false, cooldown: 1200 },
    swipe_down:   { label: 'Swipe Down',    desc: 'Fast sweep downward',       icon: '\u2B07',    defaultAction: 'random_fx',          enabled: false, cooldown: 1200 },
    speed_burst:  { label: 'Speed Burst',   desc: 'Sudden fast movement',      icon: '\u26A1',    defaultAction: 'flash_fx',           enabled: false, cooldown: 1000 },
    stillness:    { label: 'Stillness',     desc: 'Hold still after moving',   icon: '\u{1F9D8}', defaultAction: 'freeze',             enabled: false, cooldown: 1000 },
    hands_meet:   { label: 'Hands Meet',    desc: 'Bring palms together',      icon: '\u{1F932}', defaultAction: 'random_fx',          enabled: false, cooldown: 1000 },
    hands_spread: { label: 'Hands Spread',  desc: 'Pull hands apart wide',     icon: '\u{1F450}', defaultAction: 'restore_fx',         enabled: false, cooldown: 1000 },
    circle:       { label: 'Hand Circle',   desc: 'Trace a circle in the air', icon: '\u{1F300}', defaultAction: 'cycle_preset',       enabled: false, cooldown: 1000 }
};

// ── Movement Detection State ─────────────────────────────────────

// Palm history ring buffers (45 entries per hand, ~2.25s at 3-frame interval)
var _PALM_HIST_SIZE = 45;
var _palmHistory = [
    { buf: new Array(_PALM_HIST_SIZE), head: 0, len: 0 },
    { buf: new Array(_PALM_HIST_SIZE), head: 0, len: 0 }
];

function _palmHistPush(h, entry) {
    var hist = _palmHistory[h];
    hist.buf[hist.head] = entry;
    hist.head = (hist.head + 1) % _PALM_HIST_SIZE;
    if (hist.len < _PALM_HIST_SIZE) hist.len++;
}

function _palmHistGet(h, stepsBack) {
    var hist = _palmHistory[h];
    if (stepsBack >= hist.len) return null;
    var idx = (hist.head - 1 - stepsBack + _PALM_HIST_SIZE * 2) % _PALM_HIST_SIZE;
    return hist.buf[idx];
}

function _palmHistReset(h) {
    _palmHistory[h].head = 0;
    _palmHistory[h].len = 0;
}

// Acceleration
var _handPrevVelocity = [null, null];
var _handAcceleration = [0, 0];

// Two-hand relationship
var _twoHandDist = 0;
var _twoHandPrevDist = 0;
var _twoHandDistRate = 0;
var _twoHandMaxDist = 0;  // tracks recent max for meet detection

// Per-detector state
var _stillnessCounter = [0, 0];
var _stillnessFired = [false, false];
var _stillnessWasMoving = [false, false];
var _circleAngleAccum = [0, 0];
var _circlePrevAngle = [null, null];
var _circleStartTime = [0, 0];
var _handsMeetFired = false;
var _handsSpreadFired = false;

// Movement trigger cooldowns
var _moveTriggerState = {};

// Sequential preset cycling index
var _presetCycleIndex = 0;

// Flash FX timer
var _flashFxTimer = null;
var _flashFxEffect = null;

// Intensity spike timer
var _intensitySpikeActive = false;
var _intensitySpikeTimer = null;

// ── Movement Detection Thresholds ────────────────────────────────
var SWIPE_MIN_DISPLACEMENT = 0.15;
var SWIPE_DIRECTION_RATIO = 2.0;
var SWIPE_MIN_SPEED = 0.008;
var SWIPE_WINDOW = 10;

var BURST_VELOCITY = 0.025;
var BURST_ACCELERATION = 0.012;

var STILL_VELOCITY = 0.002;
var STILL_FRAMES = 20;
var STILL_PRIOR_MOVEMENT = 0.01;

var MEET_DIST_CLOSE = 0.08;
var MEET_DIST_FAR = 0.25;

var SPREAD_DIST = 0.5;
var SPREAD_RATE = 0.015;

var CIRCLE_MIN_RADIUS = 0.04;
var CIRCLE_ANGLE_THRESHOLD = Math.PI * 2 * 0.85;
var CIRCLE_CENTROID_WINDOW = 15;
var CIRCLE_TIMEOUT_MS = 3000;

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
                    palmCenterWorld: null,
                    palmNormal: null,
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

// ── Math helpers (palm geometry) ─────────────────────────────────

function _smoothstep01(edge0, edge1, x) {
    if (edge1 === edge0) return x >= edge1 ? 1 : 0;
    var t = (x - edge0) / (edge1 - edge0);
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    return t * t * (3 - 2 * t);
}

function _vec3Sub(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function _vec3Cross(a, b) {
    return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x
    };
}

function _vec3Dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

function _safeNormalize(v) {
    var m = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    if (m < 1e-6 || !isFinite(m)) return null;
    return { x: v.x / m, y: v.y / m, z: v.z / m };
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

    // Palm normal — cross((index_MCP - wrist), (pinky_MCP - wrist)).
    // Prefer worldLandmarks (meters, 3D) when present; fall back to image landmarks.
    // Sign-flip for Left hand so both hands' normals point the same way in world space.
    // `palmNormal` may be null when the triangle degenerates — downstream must null-check.
    const wlm = handData.worldLandmarks;
    const normalSrc = (wlm && wlm.length >= 21) ? wlm : lm;
    const _v1 = _vec3Sub(normalSrc[5], normalSrc[0]);
    const _v2 = _vec3Sub(normalSrc[17], normalSrc[0]);
    let _pn = _safeNormalize(_vec3Cross(_v1, _v2));
    if (_pn && handData.handedness === 'Left') {
        _pn = { x: -_pn.x, y: -_pn.y, z: -_pn.z };
    }
    handData.palmNormal = _pn;

    // Palm center in world coords (meters), when world landmarks are available.
    if (wlm && wlm.length >= 21) {
        let wx = 0, wy = 0, wz = 0;
        for (let i = 0; i < palmIdx.length; i++) {
            wx += wlm[palmIdx[i]].x;
            wy += wlm[palmIdx[i]].y;
            wz += wlm[palmIdx[i]].z;
        }
        handData.palmCenterWorld = { x: wx / 5, y: wy / 5, z: wz / 5 };
    } else {
        handData.palmCenterWorld = null;
    }

    // Velocity: wrist delta from previous frame
    const wrist = lm[0];
    if (_handPrevWrist[handIndex]) {
        const pw = _handPrevWrist[handIndex];
        const vx = wrist.x - pw.x;
        const vy = wrist.y - pw.y;
        handData.velocity = { x: vx, y: vy, magnitude: Math.sqrt(vx * vx + vy * vy) };
    }
    _handPrevWrist[handIndex] = { x: wrist.x, y: wrist.y };

    // Acceleration: velocity change between frames
    var prevVel = _handPrevVelocity[handIndex];
    if (prevVel && handData.velocity) {
        _handAcceleration[handIndex] = Math.abs(handData.velocity.magnitude - prevVel);
    }
    _handPrevVelocity[handIndex] = handData.velocity ? handData.velocity.magnitude : 0;

    // Push palm position to history ring buffer (discontinuity guard)
    var pc = handData.palmCenter;
    if (pc) {
        var prevPalm = _palmHistGet(handIndex, 0);
        if (prevPalm) {
            var jumpDist = Math.sqrt((pc.x - prevPalm.x) * (pc.x - prevPalm.x) + (pc.y - prevPalm.y) * (pc.y - prevPalm.y));
            if (jumpDist > 0.3) _palmHistReset(handIndex);  // hand swap protection
        }
        _palmHistPush(handIndex, {
            x: pc.x, y: pc.y,
            t: performance.now(),
            velMag: handData.velocity ? handData.velocity.magnitude : 0
        });
    }

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
    } else if (thumb && idx && !mid && !ring && !pinky) {
        handData.gesture = 'l_shape';  // director's framing gesture
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

        case 'cycle_preset_next':
            if (typeof FX_PRESETS !== 'undefined' && typeof applyPreset === 'function') {
                var pKeys = Object.keys(FX_PRESETS);
                if (pKeys.length > 0) {
                    _presetCycleIndex = (_presetCycleIndex + 1) % pKeys.length;
                    applyPreset(pKeys[_presetCycleIndex]);
                }
            }
            break;

        case 'flash_fx':
            // Briefly activate a random intense effect for 400ms
            if (typeof FX_UI_CONFIG !== 'undefined' && typeof activeEffects !== 'undefined') {
                var intenseFx = ['glitch', 'pixelate', 'datamosh_melt', 'kaleid', 'thermal', 'invert', 'edge'];
                var available = intenseFx.filter(function(n) { return FX_UI_CONFIG[n] && !activeEffects.has(n); });
                if (available.length === 0) available = intenseFx.filter(function(n) { return FX_UI_CONFIG[n]; });
                if (available.length > 0) {
                    var pick = available[Math.floor(Math.random() * available.length)];
                    // Remove previous flash if still active
                    if (_flashFxEffect && activeEffects.has(_flashFxEffect)) {
                        activeEffects.delete(_flashFxEffect);
                    }
                    clearTimeout(_flashFxTimer);
                    activeEffects.add(pick);
                    _flashFxEffect = pick;
                    if (typeof updateCardHighlights === 'function') updateCardHighlights();
                    _flashFxTimer = setTimeout(function() {
                        if (_flashFxEffect && typeof activeEffects !== 'undefined') {
                            activeEffects.delete(_flashFxEffect);
                            _flashFxEffect = null;
                            if (typeof updateCardHighlights === 'function') updateCardHighlights();
                        }
                    }, 400);
                }
            }
            break;

        case 'intensity_spike':
            // Push all active effects to max for 800ms (longer boost)
            _intensitySpikeActive = true;
            _gestureBoostActive = true;
            clearTimeout(_intensitySpikeTimer);
            _intensitySpikeTimer = setTimeout(function() {
                _intensitySpikeActive = false;
                _gestureBoostActive = false;
            }, 800);
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

        case 'audio_toggle':
            _gestureAudioToggle();
            break;

        case 'audio_volume_up':
            _gestureAudioVolume(0.1);
            break;

        case 'audio_volume_down':
            _gestureAudioVolume(-0.1);
            break;

        case 'audio_restart':
            _gestureAudioRestart();
            break;

        case 'none':
        default:
            break;
    }
}

// ── Audio control helpers ─────────────────────────────────────
// Works across the 3 audio sources: file (audioElement), video (videoEl),
// and mic (gain only — no play/pause concept). Silently no-ops if no
// controllable source is available.

function _gestureAudioToggle() {
    // Prefer uploaded audio file; fall back to video audio
    if (typeof audioElement !== 'undefined' && audioElement) {
        if (audioElement.paused) {
            audioElement.play().catch(function(){});
        } else {
            audioElement.pause();
        }
        return;
    }
    if (typeof videoEl !== 'undefined' && videoEl && videoEl.elt) {
        if (videoEl.elt.paused) {
            videoEl.elt.play().catch(function(){});
        } else {
            videoEl.elt.pause();
        }
    }
}

function _gestureAudioVolume(delta) {
    // Prefer Web Audio gain node (affects all sources routed through it)
    if (typeof audioGainNode !== 'undefined' && audioGainNode) {
        var cur = audioGainNode.gain.value;
        var next = Math.max(0, Math.min(1.5, cur + delta));
        try { audioGainNode.gain.value = next; } catch(e) {}
        // Sync UI slider if present
        var slider = document.getElementById('audio-volume');
        if (slider) slider.value = Math.round(next * 100);
        var valLabel = document.getElementById('audio-volume-val');
        if (valLabel) valLabel.textContent = Math.round(next * 100) + '%';
        return;
    }
    // Fallback: set volume directly on audio/video element
    if (typeof audioElement !== 'undefined' && audioElement) {
        audioElement.volume = Math.max(0, Math.min(1, audioElement.volume + delta));
        return;
    }
    if (typeof videoEl !== 'undefined' && videoEl && videoEl.elt) {
        videoEl.elt.volume = Math.max(0, Math.min(1, videoEl.elt.volume + delta));
    }
}

function _gestureAudioRestart() {
    if (typeof audioElement !== 'undefined' && audioElement) {
        try { audioElement.currentTime = 0; } catch(e) {}
        audioElement.play().catch(function(){});
        return;
    }
    if (typeof videoEl !== 'undefined' && videoEl && videoEl.elt) {
        try { videoEl.elt.currentTime = 0; } catch(e) {}
    }
}

// ── Movement Detection Functions ─────────────────────────────────

function _detectSwipe(h, hand) {
    if (_palmHistory[h].len < SWIPE_WINDOW) return null;
    var cur = _palmHistGet(h, 0);
    var past = _palmHistGet(h, SWIPE_WINDOW - 1);
    if (!cur || !past) return null;

    var dx = cur.x - past.x;
    var dy = cur.y - past.y;
    var adx = Math.abs(dx);
    var ady = Math.abs(dy);
    var disp = Math.sqrt(dx * dx + dy * dy);

    if (disp < SWIPE_MIN_DISPLACEMENT) return null;

    // Check average speed in window
    var avgSpd = 0;
    for (var i = 0; i < SWIPE_WINDOW; i++) {
        var p = _palmHistGet(h, i);
        if (p) avgSpd += p.velMag;
    }
    avgSpd /= SWIPE_WINDOW;
    if (avgSpd < SWIPE_MIN_SPEED) return null;

    // Direction ratio check
    if (adx > ady * SWIPE_DIRECTION_RATIO) {
        return dx < 0 ? 'swipe_left' : 'swipe_right';
    } else if (ady > adx * SWIPE_DIRECTION_RATIO) {
        return dy < 0 ? 'swipe_up' : 'swipe_down';
    }
    return null;
}

function _detectSpeedBurst(h, hand) {
    if (!hand.velocity) return false;
    return hand.velocity.magnitude > BURST_VELOCITY && _handAcceleration[h] > BURST_ACCELERATION;
}

function _detectStillness(h, hand) {
    if (!hand.velocity) return false;
    var vel = hand.velocity.magnitude;

    if (vel > STILL_PRIOR_MOVEMENT) {
        _stillnessWasMoving[h] = true;
    }

    if (vel < STILL_VELOCITY) {
        _stillnessCounter[h]++;
        if (_stillnessCounter[h] >= STILL_FRAMES && _stillnessWasMoving[h] && !_stillnessFired[h]) {
            _stillnessFired[h] = true;
            return true;
        }
    } else {
        _stillnessCounter[h] = 0;
        _stillnessFired[h] = false;
    }
    return false;
}

function _updateTwoHandState() {
    if (_handResults.length < 2) {
        _twoHandPrevDist = _twoHandDist;
        _twoHandDist = 0;
        _twoHandDistRate = 0;
        _twoHandMaxDist = 0;
        _handsMeetFired = false;
        _handsSpreadFired = false;
        return;
    }
    var a = _handResults[0].palmCenter;
    var b = _handResults[1].palmCenter;
    if (!a || !b) return;

    _twoHandPrevDist = _twoHandDist;
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    _twoHandDist = Math.sqrt(dx * dx + dy * dy);
    _twoHandDistRate = _twoHandDist - _twoHandPrevDist;

    if (_twoHandDist > _twoHandMaxDist) _twoHandMaxDist = _twoHandDist;
}

function _detectHandsMeet() {
    if (_handResults.length < 2 || _twoHandDist === 0) return false;
    if (_twoHandDist < MEET_DIST_CLOSE && _twoHandMaxDist > MEET_DIST_FAR && !_handsMeetFired) {
        _handsMeetFired = true;
        _twoHandMaxDist = 0;
        return true;
    }
    if (_twoHandDist > MEET_DIST_CLOSE * 2) {
        _handsMeetFired = false;
    }
    return false;
}

function _detectHandsSpread() {
    if (_handResults.length < 2 || _twoHandDist === 0) return false;
    if (_twoHandDist > SPREAD_DIST && _twoHandDistRate > SPREAD_RATE && !_handsSpreadFired) {
        _handsSpreadFired = true;
        return true;
    }
    if (_twoHandDist < SPREAD_DIST * 0.7) {
        _handsSpreadFired = false;
    }
    return false;
}

function _detectCircle(h) {
    if (_palmHistory[h].len < CIRCLE_CENTROID_WINDOW) return false;
    var now = performance.now();

    // Rolling centroid of last N positions
    var cx = 0, cy = 0, count = 0;
    for (var i = 0; i < CIRCLE_CENTROID_WINDOW; i++) {
        var p = _palmHistGet(h, i);
        if (p) { cx += p.x; cy += p.y; count++; }
    }
    if (count < CIRCLE_CENTROID_WINDOW) return false;
    cx /= count; cy /= count;

    var cur = _palmHistGet(h, 0);
    var dx = cur.x - cx;
    var dy = cur.y - cy;
    var radius = Math.sqrt(dx * dx + dy * dy);

    if (radius < CIRCLE_MIN_RADIUS) {
        _circleAngleAccum[h] = 0;
        _circlePrevAngle[h] = null;
        return false;
    }

    var angle = Math.atan2(dy, dx);

    if (_circlePrevAngle[h] !== null) {
        var delta = angle - _circlePrevAngle[h];
        // Normalize to [-PI, PI]
        if (delta > Math.PI) delta -= Math.PI * 2;
        if (delta < -Math.PI) delta += Math.PI * 2;
        _circleAngleAccum[h] += delta;

        // Timeout: reset if taking too long
        if (_circleStartTime[h] > 0 && now - _circleStartTime[h] > CIRCLE_TIMEOUT_MS) {
            _circleAngleAccum[h] = 0;
            _circleStartTime[h] = 0;
        }
    } else {
        _circleStartTime[h] = now;
    }
    _circlePrevAngle[h] = angle;

    if (Math.abs(_circleAngleAccum[h]) > CIRCLE_ANGLE_THRESHOLD) {
        _circleAngleAccum[h] = 0;
        _circlePrevAngle[h] = null;
        _circleStartTime[h] = 0;
        return true;
    }
    return false;
}

// ── Movement Trigger Engine ──────────────────────────────────────

var _lastMovementTrigger = null;

function processMovementTriggers() {
    if (!handsEnabled || _handResults.length === 0) return;

    _updateTwoHandState();

    var now = Date.now();

    // Two-hand triggers (hand-index independent)
    var twoHandChecks = [
        { key: 'hands_meet', detect: _detectHandsMeet },
        { key: 'hands_spread', detect: _detectHandsSpread }
    ];
    for (var t = 0; t < twoHandChecks.length; t++) {
        var chk = twoHandChecks[t];
        var cfg = MOVEMENT_TRIGGERS[chk.key];
        if (!cfg || !cfg.enabled) continue;
        if (_moveTriggerState[chk.key] && now - _moveTriggerState[chk.key] < cfg.cooldown) continue;
        if (chk.detect()) {
            _moveTriggerState[chk.key] = now;
            var action = cfg.action || cfg.defaultAction;
            _executeGestureAction(action, _handResults[0]);
            _showGestureToast(cfg.icon, cfg.label, GESTURE_ACTIONS[action] ? GESTURE_ACTIONS[action].label : action);
            _lastMovementTrigger = chk.key;
        }
    }

    // Per-hand triggers
    for (var h = 0; h < _handResults.length; h++) {
        var hand = _handResults[h];

        // Swipe
        var swipeDir = _detectSwipe(h, hand);
        if (swipeDir) {
            var swipeCfg = MOVEMENT_TRIGGERS[swipeDir];
            if (swipeCfg && swipeCfg.enabled) {
                var swipeKey = swipeDir + '_' + h;
                if (!_moveTriggerState[swipeKey] || now - _moveTriggerState[swipeKey] >= swipeCfg.cooldown) {
                    _moveTriggerState[swipeKey] = now;
                    var sAction = swipeCfg.action || swipeCfg.defaultAction;
                    _executeGestureAction(sAction, hand);
                    _showGestureToast(swipeCfg.icon, swipeCfg.label, GESTURE_ACTIONS[sAction] ? GESTURE_ACTIONS[sAction].label : sAction);
                    _lastMovementTrigger = swipeDir;
                    // Reset palm history after swipe to prevent re-detection
                    _palmHistReset(h);
                }
            }
        }

        // Speed burst
        var burstCfg = MOVEMENT_TRIGGERS.speed_burst;
        if (burstCfg && burstCfg.enabled && _detectSpeedBurst(h, hand)) {
            var burstKey = 'speed_burst_' + h;
            if (!_moveTriggerState[burstKey] || now - _moveTriggerState[burstKey] >= burstCfg.cooldown) {
                _moveTriggerState[burstKey] = now;
                var bAction = burstCfg.action || burstCfg.defaultAction;
                _executeGestureAction(bAction, hand);
                _showGestureToast(burstCfg.icon, burstCfg.label, GESTURE_ACTIONS[bAction] ? GESTURE_ACTIONS[bAction].label : bAction);
                _lastMovementTrigger = 'speed_burst';
            }
        }

        // Stillness
        var stillCfg = MOVEMENT_TRIGGERS.stillness;
        if (stillCfg && stillCfg.enabled && _detectStillness(h, hand)) {
            var stillKey = 'stillness_' + h;
            if (!_moveTriggerState[stillKey] || now - _moveTriggerState[stillKey] >= stillCfg.cooldown) {
                _moveTriggerState[stillKey] = now;
                var stAction = stillCfg.action || stillCfg.defaultAction;
                _executeGestureAction(stAction, hand);
                _showGestureToast(stillCfg.icon, stillCfg.label, GESTURE_ACTIONS[stAction] ? GESTURE_ACTIONS[stAction].label : stAction);
                _lastMovementTrigger = 'stillness';
            }
        }

        // Circle
        var circleCfg = MOVEMENT_TRIGGERS.circle;
        if (circleCfg && circleCfg.enabled && _detectCircle(h)) {
            var circleKey = 'circle_' + h;
            if (!_moveTriggerState[circleKey] || now - _moveTriggerState[circleKey] >= circleCfg.cooldown) {
                _moveTriggerState[circleKey] = now;
                var cAction = circleCfg.action || circleCfg.defaultAction;
                _executeGestureAction(cAction, hand);
                _showGestureToast(circleCfg.icon, circleCfg.label, GESTURE_ACTIONS[cAction] ? GESTURE_ACTIONS[cAction].label : cAction);
                _lastMovementTrigger = 'circle';
            }
        }
    }
}

// ── Conductor Mode — hand height controls volume ────────────────
// Raise hand = louder, lower = quieter. Like conducting an orchestra.

var _conductorMode = false;
var _conductorSmoothedVol = 0.5;
var _conductorSmoothing = 0.12;  // EMA rate — lower = smoother, higher = more responsive

function _updateConductorMode() {
    if (!_conductorMode || _handResults.length === 0) return;

    // Use first detected hand
    var hand = _handResults[0];
    if (!hand || !hand.palmCenter) return;

    // Palm Y: 0 = top of frame, 1 = bottom.
    // Invert so raising hand raises volume.
    // Clamp to [0.05, 0.95] to avoid needing to hit exact edges.
    var palmY = hand.palmCenter.y;
    var rawVol = 1 - palmY;
    rawVol = Math.max(0, Math.min(1, rawVol));

    // EMA smoothing
    _conductorSmoothedVol += (rawVol - _conductorSmoothedVol) * _conductorSmoothing;
    var vol = Math.max(0, Math.min(1, _conductorSmoothedVol));

    // Apply to gain node (preferred) or element volume
    if (typeof audioGainNode !== 'undefined' && audioGainNode) {
        try { audioGainNode.gain.value = vol; } catch(e) {}
    } else if (typeof audioElement !== 'undefined' && audioElement) {
        audioElement.volume = vol;
    } else if (typeof videoEl !== 'undefined' && videoEl && videoEl.elt) {
        videoEl.elt.volume = vol;
    }

    // Update conductor meter UI
    var meter = document.getElementById('conductor-meter-fill');
    if (meter) meter.style.height = Math.round(vol * 100) + '%';
    var valLabel = document.getElementById('conductor-vol-val');
    if (valLabel) valLabel.textContent = Math.round(vol * 100) + '%';
}

function _saveConductor() {
    try { localStorage.setItem('hod-conductor', JSON.stringify({ enabled: _conductorMode })); } catch(e) {}
}

function _loadConductor() {
    try {
        var raw = localStorage.getItem('hod-conductor');
        if (!raw) return;
        var data = JSON.parse(raw);
        if (data && typeof data.enabled === 'boolean') {
            _conductorMode = data.enabled;
            var toggle = document.getElementById('conductor-toggle');
            if (toggle) toggle.checked = _conductorMode;
        }
    } catch(e) {}
}

// ── Hand Frame (L-shape region effect) ──────────────────────────
// Both hands form L-shapes (thumb + index extended) to define a rectangle.
// An effect plays inside the rect only. Live-follow, no hold-to-lock.

var _handFrameMode = 'off';  // 'off' | 'cycle' | 'inv' | 'pixel' | ...
var _handFrameIntensity = 60;
var _handFrameActive = false;
var _handFrameRect = null;
var _handFrameCorners = null;  // array of 4 { x, y } points — 2 index tips + 2 thumb tips
var _handFrameCycleEffect = 'glitch';
var _handFrameCycleStart = 0;
var _HAND_FRAME_CYCLE_MS = 3000;
var _HAND_FRAME_MIN_SIZE = 20;
var _HAND_FRAME_DEACTIVATE_GRACE = 8;  // extra frames before deactivating (flicker protection)
var _handFrameGraceCounter = 0;
var _REGION_FX_MODE_LIST = ['inv','pixel','thermal','blur','glitch','tone','dither','crt','edge','zoom','water','fill'];
var _REGION_FX_MODE_LABELS = {
    off: 'Off', cycle: 'Cycle',
    inv: 'Invert', pixel: 'Pixelate', thermal: 'Thermal', blur: 'Blur',
    glitch: 'Glitch', tone: 'Halftone', dither: 'Dither', crt: 'CRT',
    edge: 'Edge', zoom: 'Zoom', water: 'Water', fill: 'Fill'
};

// Framing pose: index finger extended, middle/ring/pinky curled.
// Thumb state ignored — detection of thumb is unreliable at many angles and
// the "corner" is defined by the index fingertip anyway. This matches both
// the 'point' and 'l_shape' gestures from the classifier.
function _isHandFramePose(hand) {
    if (!hand || !hand.fingerStates) return false;
    var fs = hand.fingerStates;
    return fs[1] && !fs[2] && !fs[3] && !fs[4];
}

function _handFrameDeactivateStep() {
    if (_handFrameActive) {
        _handFrameGraceCounter++;
        if (_handFrameGraceCounter > _HAND_FRAME_DEACTIVATE_GRACE) {
            _handFrameActive = false;
            _handFrameRect = null;
            _handFrameCorners = null;
            _handFrameGraceCounter = 0;
        }
    }
}

function _updateHandFrame() {
    if (_handFrameMode === 'off' || _handResults.length < 2) {
        _handFrameDeactivateStep();
        return;
    }

    // Need both hands in the framing pose (index extended, 3 others curled)
    var h0 = _handResults[0];
    var h1 = _handResults[1];
    if (!_isHandFramePose(h0) || !_isHandFramePose(h1)) {
        _handFrameDeactivateStep();
        return;
    }

    _handFrameGraceCounter = 0;

    // Compute rect from 4 fingertips: both index tips (top edge) and both
    // thumb tips (bottom edge). Director's framing gesture.
    // landmark 8 = index tip, landmark 4 = thumb tip.
    var h0idx = _lmToScreen(h0.landmarks[8]);
    var h0thm = _lmToScreen(h0.landmarks[4]);
    var h1idx = _lmToScreen(h1.landmarks[8]);
    var h1thm = _lmToScreen(h1.landmarks[4]);
    _handFrameCorners = [h0idx, h0thm, h1idx, h1thm];

    var xs = [h0idx.x, h0thm.x, h1idx.x, h1thm.x];
    var ys = [h0idx.y, h0thm.y, h1idx.y, h1thm.y];
    var x = Math.min.apply(null, xs);
    var y = Math.min.apply(null, ys);
    var w = Math.max.apply(null, xs) - x;
    var h = Math.max.apply(null, ys) - y;

    // Skip degenerate rects — don't artificially stretch them, just wait for the user
    // to spread hands. This way size tracking is 1:1 with hand positions.
    if (w < _HAND_FRAME_MIN_SIZE || h < _HAND_FRAME_MIN_SIZE) {
        _handFrameDeactivateStep();
        return;
    }

    _handFrameRect = { x: x, y: y, w: w, h: h };
    _handFrameActive = true;

    // Cycle mode: rotate effect every _HAND_FRAME_CYCLE_MS
    if (_handFrameMode === 'cycle') {
        var now = performance.now();
        if (_handFrameCycleStart === 0 || now - _handFrameCycleStart > _HAND_FRAME_CYCLE_MS) {
            // Pick a random effect different from the current one
            var available = _REGION_FX_MODE_LIST.filter(function(m) { return m !== _handFrameCycleEffect; });
            _handFrameCycleEffect = available[Math.floor(Math.random() * available.length)];
            _handFrameCycleStart = now;
        }
    } else {
        _handFrameCycleStart = 0;
    }
}

function _getHandFrameActiveEffect() {
    if (_handFrameMode === 'cycle') return _handFrameCycleEffect;
    return _handFrameMode;
}

function _drawHandFrameOverlay(ctx) {
    if (!_handFrameActive || !_handFrameRect) return;

    var r = _handFrameRect;
    var effect = _getHandFrameActiveEffect();
    var label = _REGION_FX_MODE_LABELS[effect] || effect;

    ctx.save();
    ctx.strokeStyle = '#8B45E8';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.shadowColor = 'rgba(139,69,232,0.6)';
    ctx.shadowBlur = 8;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    // Corner markers at each of the 4 fingertips (index tips + thumb tips)
    if (_handFrameCorners) {
        ctx.fillStyle = 'rgba(139,69,232,0.9)';
        for (var ci = 0; ci < _handFrameCorners.length; ci++) {
            var c = _handFrameCorners[ci];
            ctx.beginPath();
            ctx.arc(c.x, c.y, 5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Effect label at top-center
    ctx.fillStyle = 'rgba(139,69,232,0.95)';
    ctx.font = 'bold 11px "Commit Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label.toUpperCase(), r.x + r.w / 2, r.y - 6);

    ctx.restore();
}

function _applyHandFrameFX() {
    if (!_handFrameActive || !_handFrameRect) return;
    if (typeof applyRegionFXToRect !== 'function') return;
    var canvasEl = document.getElementById('defaultCanvas0');
    if (!canvasEl) return;

    var effect = _getHandFrameActiveEffect();
    if (!effect || effect === 'off' || effect === 'cycle') return;

    var intensity = _handFrameIntensity / 100;
    applyRegionFXToRect(_handFrameRect.x, _handFrameRect.y, _handFrameRect.w, _handFrameRect.h,
                        effect, intensity, canvasEl);
}

// Persistence
function _saveHandFrame() {
    try {
        localStorage.setItem('hod-hand-frame', JSON.stringify({
            mode: _handFrameMode,
            intensity: _handFrameIntensity
        }));
    } catch(e) {}
}

function _loadHandFrame() {
    try {
        var raw = localStorage.getItem('hod-hand-frame');
        if (!raw) return;
        var data = JSON.parse(raw);
        if (data && typeof data === 'object') {
            if (typeof data.mode === 'string') _handFrameMode = data.mode;
            if (typeof data.intensity === 'number') _handFrameIntensity = data.intensity;
            var sel = document.getElementById('hand-frame-mode');
            if (sel) sel.value = _handFrameMode;
            var slider = document.getElementById('hand-frame-intensity');
            if (slider) slider.value = _handFrameIntensity;
        }
    } catch(e) {}
}

// ── Movement Trigger Persistence ─────────────────────────────────

function _saveMovementTriggers() {
    var data = {};
    for (var k of Object.keys(MOVEMENT_TRIGGERS)) {
        data[k] = { enabled: MOVEMENT_TRIGGERS[k].enabled, action: MOVEMENT_TRIGGERS[k].action || MOVEMENT_TRIGGERS[k].defaultAction };
    }
    try { localStorage.setItem('hod-movement-triggers', JSON.stringify(data)); } catch(e) {}
}

function _loadMovementTriggers() {
    try {
        var raw = localStorage.getItem('hod-movement-triggers');
        if (!raw) return;
        var data = JSON.parse(raw);
        for (var k of Object.keys(data)) {
            if (MOVEMENT_TRIGGERS[k]) {
                MOVEMENT_TRIGGERS[k].enabled = data[k].enabled;
                MOVEMENT_TRIGGERS[k].action = data[k].action;
                var toggle = document.querySelector('.movement-toggle[data-movement="' + k + '"]');
                if (toggle) {
                    toggle.checked = data[k].enabled;
                    var row = toggle.closest('.movement-trigger-row');
                    if (row) row.style.borderLeftColor = data[k].enabled ? '#E84393' : 'transparent';
                }
                var select = document.querySelector('.movement-action-select[data-movement="' + k + '"]');
                if (select) select.value = data[k].action;
            }
        }
    } catch(e) {}
}

// ── Movement Highlight ───────────────────────────────────────────

var _lastHighlightedMovement = null;

function _updateMovementHighlight() {
    if (!_lastMovementTrigger) return;
    // Unhighlight previous
    if (_lastHighlightedMovement && _lastHighlightedMovement !== _lastMovementTrigger) {
        var prev = document.querySelector('.movement-trigger-row[data-movement="' + _lastHighlightedMovement + '"]');
        if (prev) prev.style.background = 'var(--color-surface)';
    }
    var row = document.querySelector('.movement-trigger-row[data-movement="' + _lastMovementTrigger + '"]');
    if (row) row.style.background = 'rgba(232,67,147,0.15)';
    _lastHighlightedMovement = _lastMovementTrigger;

    // Auto-clear after 600ms
    clearTimeout(_updateMovementHighlight._timer);
    _updateMovementHighlight._timer = setTimeout(function() {
        if (_lastHighlightedMovement) {
            var r = document.querySelector('.movement-trigger-row[data-movement="' + _lastHighlightedMovement + '"]');
            if (r) r.style.background = 'var(--color-surface)';
            _lastHighlightedMovement = null;
        }
        _lastMovementTrigger = null;
    }, 600);
}

// ── Visualization ────────────────────────────────────────────────

function drawHandOverlay() {
    if (!handsEnabled) {
        _resetPalmSongState();
        return;
    }
    if (typeof videoX === 'undefined') return;

    // Envelope runs every frame so vizIntensity decays even when hands leave the frame.
    _updatePalmSongState();

    if (_handResults.length === 0) return;

    // Apply hand frame region effect (runs even if hand viz is off)
    _applyHandFrameFX();

    const ctx = drawingContext;

    // Hand frame overlay (drawn outside the video clip so it's always visible)
    if (_handFrameActive) {
        _drawHandFrameOverlay(ctx);
    }

    // Debug: palm-normal arrows (toggle via window.DEBUG_PALM_NORMAL).
    _drawPalmNormalDebug(ctx);

    // Skip rendering only if both per-hand viz and song viz are off.
    if (handVizMode === 'off' && !songBetweenHandsEnabled) return;

    ctx.save();

    // Clip to video rect
    ctx.beginPath();
    ctx.rect(videoX, videoY, videoW, videoH);
    ctx.clip();

    if (handVizMode !== 'off') for (let h = 0; h < _handResults.length; h++) {
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

    // Song between hands — renders on top of per-hand viz, gated by its own enable.
    if (songBetweenHandsEnabled) {
        _drawSongBetweenHands(ctx, songBetweenHandsMode);
    }

    ctx.restore();
}

// Called from draw loop — runs even when viz is off
function processHandFrame() {
    if (!handsEnabled || _handResults.length === 0) {
        _updateHandFrame();  // still runs so it can deactivate on empty
        return;
    }
    processGestureTriggers();
    processMovementTriggers();
    _updateHandFrame();
    _updateConductorMode();
    _updatePinchMeter();
    // Update live data + gesture highlight every 3 frames
    if (typeof frameCount !== 'undefined' && frameCount % 3 === 0) {
        _updateHandDataDisplay();
        _updateGestureHighlight();
        _updateMovementHighlight();
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
var _fireTrailMax = 44;  // longer trails for fluid feel
var _prevFireGesture = ['unknown', 'unknown'];
var _fireballCooldown = 0;
var _fireballs = [];  // active fireball explosions
var _fireEmbers = [];  // standalone ember particles
var _fireShockwaves = [];  // expanding ring impacts

// ── Charge-up state per hand ──
var _fistChargeStart = [0, 0];  // timestamp when fist started (0 = not charging)
var _fistChargeLevel = [0, 0];  // 0..1 smoothed charge level for rendering
var CHARGE_MIN_MS = 200;   // minimum hold before charge registers
var CHARGE_MAX_MS = 1800;  // full charge duration

function _checkFireball(landmarks, handIdx) {
    var handData = _handResults[handIdx];
    if (!handData) return;
    var cur = handData.gesture;
    var prev = _prevFireGesture[handIdx] || 'unknown';
    _prevFireGesture[handIdx] = cur;
    var now = Date.now();

    // ── Track fist hold for charge-up ──
    if (cur === 'fist') {
        if (_fistChargeStart[handIdx] === 0) {
            _fistChargeStart[handIdx] = now;
        }
        var held = now - _fistChargeStart[handIdx];
        var rawCharge = Math.max(0, Math.min(1, (held - CHARGE_MIN_MS) / (CHARGE_MAX_MS - CHARGE_MIN_MS)));
        // Smooth toward target
        _fistChargeLevel[handIdx] += (rawCharge - _fistChargeLevel[handIdx]) * 0.15;
    } else {
        // Decay charge when not holding fist
        _fistChargeLevel[handIdx] *= 0.85;
        if (_fistChargeLevel[handIdx] < 0.01) _fistChargeLevel[handIdx] = 0;
    }

    // ── Release fireball on fist → open_palm ──
    if (prev === 'fist' && cur === 'open_palm') {
        if (now - _fireballCooldown < 400) { _fistChargeStart[handIdx] = 0; return; }
        _fireballCooldown = now;

        var held = _fistChargeStart[handIdx] > 0 ? now - _fistChargeStart[handIdx] : 0;
        var charge = Math.max(0.15, Math.min(1, (held - CHARGE_MIN_MS) / (CHARGE_MAX_MS - CHARGE_MIN_MS)));
        _fistChargeStart[handIdx] = 0;
        _fistChargeLevel[handIdx] = 0;

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

        // Hand velocity adds momentum — scaled by charge
        var vx = handData.velocity.x * videoW * (0.4 + charge * 0.8);
        var vy = handData.velocity.y * videoH * (0.4 + charge * 0.8);

        _fireballs.push({
            x: palm.x, y: palm.y,
            dx: dx / dlen * (3 + charge * 6) + vx,
            dy: dy / dlen * (3 + charge * 6) + vy,
            life: 1, age: 0,
            charge: charge,  // affects size, embers, shockwave
            maxSize: 40 + charge * 180,  // 40px minimum → 220px at full charge
            emberRate: 0.3 + charge * 0.7  // probability per frame
        });

        var label = charge > 0.8 ? 'MEGA Fireball!' : charge > 0.4 ? 'Fireball!' : 'Fireball';
        _showGestureToast('\uD83D\uDD25', label, charge > 0.8 ? 'Full power!' : 'Released!');
    }

    // Reset charge if gesture leaves fist without releasing to open_palm
    if (prev === 'fist' && cur !== 'fist' && cur !== 'open_palm') {
        _fistChargeStart[handIdx] = 0;
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

        _fireTrails[f].push({
            x: tip.x, y: tip.y,
            dx: tip.x - dip.x, dy: tip.y - dip.y,
            t: performance.now()
        });
        if (_fireTrails[f].length > _fireTrailMax) _fireTrails[f].shift();
    }

    // ── 2. Draw fire streams — longer, more fluid trails ──
    ctx.globalCompositeOperation = 'lighter';

    for (var t = 0; t < 5; t++) {
        var trail = _fireTrails[t];
        if (trail.length < 3) continue;
        var len = trail.length;

        for (var i = 0; i < len; i++) {
            var progress = i / (len - 1);  // 0 = oldest, 1 = tip
            var pt = trail[i];
            var dirX = pt.dx || 0;
            var dirY = pt.dy || 0;

            // Smooth progress curve — tail fades more gradually
            var fadeProgress = progress * progress;  // quadratic for wispy tails

            var baseSize = (32 + intensity * 24) * fadeProgress;
            // More turbulence in the tail, less at the tip
            var chaos = (1 - progress) * (22 + intensity * 18);
            var heatRise = (1 - progress) * 5;  // older = more upward drift
            var offsetX = (Math.random() - 0.5) * chaos + dirX * 0.25;
            var offsetY = (Math.random() - 0.5) * chaos + dirY * 0.25 - heatRise;

            var bx = pt.x + offsetX;
            var by = pt.y + offsetY;

            // More blobs near the tip for volume
            var blobCount = progress > 0.7 ? 4 : progress > 0.4 ? 3 : 2;
            for (var b = 0; b < blobCount; b++) {
                var blobSize = baseSize * (0.5 + Math.random() * 0.9);
                var wobbleX = bx + (Math.random() - 0.5) * blobSize * 0.8;
                var wobbleY = by + (Math.random() - 0.5) * blobSize * 0.8;

                if (blobSize < 1.5) continue;

                var grad = ctx.createRadialGradient(wobbleX, wobbleY, 0, wobbleX, wobbleY, blobSize);
                if (progress > 0.75) {
                    // Fingertip: white-hot core
                    grad.addColorStop(0, 'rgba(255, 255, 230, 0.28)');
                    grad.addColorStop(0.25, 'rgba(255, 210, 60, 0.18)');
                    grad.addColorStop(0.6, 'rgba(255, 120, 10, 0.07)');
                    grad.addColorStop(1, 'rgba(200, 30, 0, 0)');
                } else if (progress > 0.35) {
                    // Middle: orange flame body
                    grad.addColorStop(0, 'rgba(255, 170, 30, 0.2)');
                    grad.addColorStop(0.35, 'rgba(255, 90, 0, 0.12)');
                    grad.addColorStop(1, 'rgba(180, 20, 0, 0)');
                } else if (progress > 0.12) {
                    // Tail: deep red wisps
                    grad.addColorStop(0, 'rgba(220, 60, 0, 0.1)');
                    grad.addColorStop(0.5, 'rgba(140, 20, 0, 0.05)');
                    grad.addColorStop(1, 'rgba(60, 0, 0, 0)');
                } else {
                    // Very tail: faint smoke wisps
                    grad.addColorStop(0, 'rgba(140, 30, 0, 0.06)');
                    grad.addColorStop(0.6, 'rgba(80, 10, 0, 0.02)');
                    grad.addColorStop(1, 'rgba(40, 0, 0, 0)');
                }

                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(wobbleX, wobbleY, blobSize, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Bright core dot at fingertip
        if (len > 0) {
            var tipPt = trail[len - 1];
            var coreR = 12 + intensity * 10;
            var coreGrad = ctx.createRadialGradient(tipPt.x, tipPt.y, 0, tipPt.x, tipPt.y, coreR);
            coreGrad.addColorStop(0, 'rgba(255, 255, 245, 0.55)');
            coreGrad.addColorStop(0.35, 'rgba(255, 210, 90, 0.25)');
            coreGrad.addColorStop(0.7, 'rgba(255, 120, 20, 0.08)');
            coreGrad.addColorStop(1, 'rgba(255, 60, 0, 0)');
            ctx.fillStyle = coreGrad;
            ctx.beginPath();
            ctx.arc(tipPt.x, tipPt.y, coreR, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ── 3. Heat aura + charge-up glow around palm ──
    var palmPts = [0, 5, 9, 13, 17];
    var pcx = 0, pcy = 0;
    for (var pi = 0; pi < palmPts.length; pi++) {
        var pp = _lmToScreen(landmarks[palmPts[pi]]);
        pcx += pp.x; pcy += pp.y;
    }
    pcx /= 5; pcy /= 5;

    // Base heat aura
    var auraSize = 80 + intensity * 50;
    var auraGrad = ctx.createRadialGradient(pcx, pcy, 0, pcx, pcy, auraSize);
    auraGrad.addColorStop(0, 'rgba(255, 200, 50, 0.08)');
    auraGrad.addColorStop(0.4, 'rgba(255, 100, 0, 0.04)');
    auraGrad.addColorStop(1, 'rgba(200, 30, 0, 0)');
    ctx.fillStyle = auraGrad;
    ctx.beginPath();
    ctx.arc(pcx, pcy, auraSize, 0, Math.PI * 2);
    ctx.fill();

    // Charge-up glow — pulsing, growing orb while fist is held
    for (var ch = 0; ch < _handResults.length; ch++) {
        var chargeLevel = _fistChargeLevel[ch];
        if (chargeLevel < 0.02) continue;

        var chLm = _handResults[ch].landmarks;
        var chPcx = 0, chPcy = 0;
        for (var cpi = 0; cpi < palmPts.length; cpi++) {
            var cpp = _lmToScreen(chLm[palmPts[cpi]]);
            chPcx += cpp.x; chPcy += cpp.y;
        }
        chPcx /= 5; chPcy /= 5;

        // Pulsing size based on charge
        var pulse = 1 + Math.sin(performance.now() * 0.008) * 0.15 * chargeLevel;
        var chargeR = (30 + chargeLevel * 90) * pulse;
        var chargeAlpha = 0.1 + chargeLevel * 0.4;

        // Outer charge glow
        var chGrad = ctx.createRadialGradient(chPcx, chPcy, 0, chPcx, chPcy, chargeR);
        chGrad.addColorStop(0, 'rgba(255, 255, 200,' + (chargeAlpha * 0.8) + ')');
        chGrad.addColorStop(0.2, 'rgba(255, 200, 50,' + (chargeAlpha * 0.6) + ')');
        chGrad.addColorStop(0.5, 'rgba(255, 120, 0,' + (chargeAlpha * 0.3) + ')');
        chGrad.addColorStop(0.8, 'rgba(200, 40, 0,' + (chargeAlpha * 0.1) + ')');
        chGrad.addColorStop(1, 'rgba(120, 0, 0, 0)');
        ctx.fillStyle = chGrad;
        ctx.beginPath();
        ctx.arc(chPcx, chPcy, chargeR, 0, Math.PI * 2);
        ctx.fill();

        // Spinning sparks around the charge orb at higher charges
        if (chargeLevel > 0.3) {
            var sparkCount = Math.floor(4 + chargeLevel * 8);
            var sparkTime = performance.now() * 0.003;
            for (var sp = 0; sp < sparkCount; sp++) {
                var sa = (sp / sparkCount) * Math.PI * 2 + sparkTime;
                var sr = chargeR * (0.6 + Math.random() * 0.5);
                var sx = chPcx + Math.cos(sa) * sr;
                var sy = chPcy + Math.sin(sa) * sr;
                var sparkSize = 3 + chargeLevel * 5 * Math.random();
                var spGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, sparkSize);
                spGrad.addColorStop(0, 'rgba(255, 240, 180,' + (chargeLevel * 0.5) + ')');
                spGrad.addColorStop(1, 'rgba(255, 100, 0, 0)');
                ctx.fillStyle = spGrad;
                ctx.beginPath();
                ctx.arc(sx, sy, sparkSize, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    // ── 4. Draw fireballs — Avatar firebending style ──
    // Elongated flame streams oriented along travel direction,
    // organic licking edges, trailing wisps, comet-shaped
    for (var fb = _fireballs.length - 1; fb >= 0; fb--) {
        var ball = _fireballs[fb];
        ball.x += ball.dx;
        ball.y += ball.dy;
        ball.dx *= 0.975;
        ball.dy *= 0.975;
        ball.dy -= 0.2 * (1 + ball.charge);
        ball.age++;
        ball.life -= 0.01 + (1 - ball.charge) * 0.006;

        // Track travel direction for orientation
        var spd = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
        var headAngle = Math.atan2(ball.dy, ball.dx);

        // Spawn embers along the tail
        if (Math.random() < ball.emberRate && ball.life > 0.1) {
            var eCount = ball.charge > 0.6 ? 3 : 2;
            for (var ei = 0; ei < eCount; ei++) {
                // Embers shed from behind the fireball
                var eOff = -0.5 - Math.random() * 0.5;  // behind
                var eLat = (Math.random() - 0.5) * 0.8;  // lateral spread
                var headW = ball.maxSize * 0.35;
                _fireEmbers.push({
                    x: ball.x + Math.cos(headAngle) * headW * eOff + Math.cos(headAngle + Math.PI / 2) * headW * eLat,
                    y: ball.y + Math.sin(headAngle) * headW * eOff + Math.sin(headAngle + Math.PI / 2) * headW * eLat,
                    dx: (Math.random() - 0.5) * 2 + ball.dx * 0.15,
                    dy: (Math.random() - 0.5) * 2 + ball.dy * 0.15 - 0.8,
                    life: 0.5 + Math.random() * 0.5,
                    size: 2 + Math.random() * 4 * (1 + ball.charge),
                    bright: Math.random()
                });
            }
        }

        if (ball.life <= 0) {
            // ── Shockwave on death — directional burst ──
            _fireShockwaves.push({
                x: ball.x, y: ball.y,
                maxR: ball.maxSize * (1.0 + ball.charge * 0.8),
                r: ball.maxSize * 0.15,
                life: 1,
                charge: ball.charge
            });
            // Directional ember burst — biased forward
            var burstCount = Math.floor(10 + ball.charge * 20);
            for (var bi = 0; bi < burstCount; bi++) {
                var bAngle = headAngle + (Math.random() - 0.5) * Math.PI * 1.2;
                var bSpd = 2 + Math.random() * 6 * (1 + ball.charge);
                _fireEmbers.push({
                    x: ball.x, y: ball.y,
                    dx: Math.cos(bAngle) * bSpd,
                    dy: Math.sin(bAngle) * bSpd - 1,
                    life: 0.4 + Math.random() * 0.6,
                    size: 2 + Math.random() * 6,
                    bright: Math.random()
                });
            }
            _fireballs.splice(fb, 1);
            continue;
        }

        // ── Flame body — same soft blob fire as fingertips, scaled up ──
        var ballR = ball.maxSize * 0.5 * (0.4 + ball.life * 0.6);
        var blobCount = 12 + Math.floor(ball.charge * 12);

        for (var bi2 = 0; bi2 < blobCount; bi2++) {
            var progress = bi2 / (blobCount - 1);  // 0=outer, 1=center
            var spread = (1 - progress) * ballR * 1.2;
            var blobSize = ballR * (0.3 + progress * 0.7) * (0.6 + Math.random() * 0.8);

            // Scatter blobs, denser near center
            var bx = ball.x + (Math.random() - 0.5) * spread * 2;
            var by = ball.y + (Math.random() - 0.5) * spread * 2;
            // Drift upward (heat rise) for outer blobs
            by -= (1 - progress) * ballR * 0.3;

            if (blobSize < 2) continue;

            var grad = ctx.createRadialGradient(bx, by, 0, bx, by, blobSize);
            if (progress > 0.7) {
                // Center: white-hot core
                grad.addColorStop(0, 'rgba(255, 255, 220,' + (ball.life * 0.3) + ')');
                grad.addColorStop(0.3, 'rgba(255, 200, 50,' + (ball.life * 0.18) + ')');
                grad.addColorStop(0.7, 'rgba(255, 100, 0,' + (ball.life * 0.07) + ')');
                grad.addColorStop(1, 'rgba(200, 30, 0, 0)');
            } else if (progress > 0.35) {
                // Mid: orange flame
                grad.addColorStop(0, 'rgba(255, 160, 20,' + (ball.life * 0.22) + ')');
                grad.addColorStop(0.4, 'rgba(255, 80, 0,' + (ball.life * 0.12) + ')');
                grad.addColorStop(1, 'rgba(180, 20, 0, 0)');
            } else {
                // Outer: deep red wisps
                grad.addColorStop(0, 'rgba(200, 50, 0,' + (ball.life * 0.12) + ')');
                grad.addColorStop(0.5, 'rgba(120, 15, 0,' + (ball.life * 0.05) + ')');
                grad.addColorStop(1, 'rgba(60, 0, 0, 0)');
            }

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(bx, by, blobSize, 0, Math.PI * 2);
            ctx.fill();
        }

        // Bright core glow at center
        if (ball.life > 0.2) {
            var coreR2 = ballR * 0.4;
            var cAlpha = (ball.life - 0.2) / 0.8 * (0.5 + ball.charge * 0.3);
            var cGrad = ctx.createRadialGradient(ball.x, ball.y, 0, ball.x, ball.y, coreR2);
            cGrad.addColorStop(0, 'rgba(255, 255, 240,' + cAlpha + ')');
            cGrad.addColorStop(0.4, 'rgba(255, 200, 80,' + (cAlpha * 0.4) + ')');
            cGrad.addColorStop(1, 'rgba(255, 100, 0, 0)');
            ctx.fillStyle = cGrad;
            ctx.beginPath();
            ctx.arc(ball.x, ball.y, coreR2, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ── 5. Draw ember particles ──
    for (var em = _fireEmbers.length - 1; em >= 0; em--) {
        var e = _fireEmbers[em];
        e.x += e.dx;
        e.y += e.dy;
        e.dy -= 0.08;  // embers float up
        e.dx *= 0.98;
        e.dy *= 0.98;
        e.life -= 0.02;
        e.size *= 0.985;  // shrink gently

        if (e.life <= 0 || e.size < 0.5) {
            _fireEmbers.splice(em, 1);
            continue;
        }

        var eAlpha = e.life * 0.7;
        // Color: bright ones are yellow, dim ones are red-orange
        var r = 255;
        var g = Math.floor(100 + e.bright * 155);
        var bv = Math.floor(e.bright * 50);

        var emGrad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.size);
        emGrad.addColorStop(0, 'rgba(' + r + ',' + g + ',' + bv + ',' + eAlpha + ')');
        emGrad.addColorStop(0.6, 'rgba(' + r + ',' + Math.floor(g * 0.5) + ',0,' + (eAlpha * 0.4) + ')');
        emGrad.addColorStop(1, 'rgba(120, 0, 0, 0)');
        ctx.fillStyle = emGrad;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
        ctx.fill();
    }

    // Cap embers to prevent runaway
    if (_fireEmbers.length > 200) _fireEmbers.splice(0, _fireEmbers.length - 200);

    // ── 6. Draw shockwave rings ──
    for (var sw = _fireShockwaves.length - 1; sw >= 0; sw--) {
        var wave = _fireShockwaves[sw];
        wave.r += (wave.maxR - wave.r) * 0.15;  // ease out expansion
        wave.life -= 0.035;

        if (wave.life <= 0) {
            _fireShockwaves.splice(sw, 1);
            continue;
        }

        // Bright expanding ring
        var ringWidth = 4 + wave.charge * 8;
        ctx.strokeStyle = 'rgba(255, 200, 60,' + (wave.life * 0.5) + ')';
        ctx.lineWidth = ringWidth * wave.life;
        ctx.beginPath();
        ctx.arc(wave.x, wave.y, wave.r, 0, Math.PI * 2);
        ctx.stroke();

        // Inner glow fill
        var swGrad = ctx.createRadialGradient(wave.x, wave.y, wave.r * 0.6, wave.x, wave.y, wave.r);
        swGrad.addColorStop(0, 'rgba(255, 180, 40,' + (wave.life * 0.08) + ')');
        swGrad.addColorStop(0.5, 'rgba(255, 80, 0,' + (wave.life * 0.04) + ')');
        swGrad.addColorStop(1, 'rgba(200, 20, 0, 0)');
        ctx.fillStyle = swGrad;
        ctx.beginPath();
        ctx.arc(wave.x, wave.y, wave.r, 0, Math.PI * 2);
        ctx.fill();

        // Flash on first few frames
        if (wave.life > 0.85) {
            var flashAlpha = (wave.life - 0.85) / 0.15 * 0.25 * (1 + wave.charge);
            var flashR = wave.r * 0.4;
            var flashGrad = ctx.createRadialGradient(wave.x, wave.y, 0, wave.x, wave.y, flashR);
            flashGrad.addColorStop(0, 'rgba(255, 255, 220,' + flashAlpha + ')');
            flashGrad.addColorStop(0.5, 'rgba(255, 200, 80,' + (flashAlpha * 0.4) + ')');
            flashGrad.addColorStop(1, 'rgba(255, 100, 0, 0)');
            ctx.fillStyle = flashGrad;
            ctx.beginPath();
            ctx.arc(wave.x, wave.y, flashR, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
}

// ── Song-between-hands viz ────────────────────────────────────────
// ORB / SPECTRUM / WAVEFORM / PULSE — audio rendered in the gap
// between the two palms (falls back to one-hand anchor if only 1).

var _songTimeDomain = null;

// Chrome ball — two sources, tried in priority order:
// 1. chrome-env.png (equirectangular HDRI panorama) → baked to a chrome
//    ball via sphere-reflection sampling. True environment reflection.
// 2. chrome-ball.png (pre-rendered chrome sphere, transparent bg) → used
//    directly as the orb surface.
// Neither present → falls back to procedural chrome.
var _chromeImg = null;
var _chromeImgReady = false;
var _chromeTried = false;

function _bakeChromeFromHDRI(hdri, size) {
    var out = document.createElement('canvas');
    out.width = size; out.height = size;
    var octx = out.getContext('2d');

    // Read HDRI pixels
    var hw = hdri.naturalWidth || hdri.width;
    var hh = hdri.naturalHeight || hdri.height;
    var hc = document.createElement('canvas');
    hc.width = hw; hc.height = hh;
    var hctx = hc.getContext('2d');
    hctx.drawImage(hdri, 0, 0);
    var hdrPx;
    try { hdrPx = hctx.getImageData(0, 0, hw, hh).data; }
    catch (e) { return null; }  // cross-origin taint

    var img = octx.createImageData(size, size);
    var px = img.data;
    var r = size / 2;

    for (var py = 0; py < size; py++) {
        for (var pxi = 0; pxi < size; pxi++) {
            var nx = (pxi - r) / r;
            var ny = (py - r) / r;
            var d2 = nx * nx + ny * ny;
            var oi = (py * size + pxi) * 4;
            if (d2 >= 1) { px[oi + 3] = 0; continue; }
            var nz = Math.sqrt(1 - d2);

            // Reflection: V = (0,0,1), N = (nx, ny, nz) → R = V - 2(V·N)N
            var rx = -2 * nz * nx;
            var ry = -2 * nz * ny;
            var rz = 1 - 2 * nz * nz;

            // Equirectangular UV
            var theta = Math.atan2(rx, rz);       // [-π, π]
            var phi = Math.asin(-ry);             // [-π/2, π/2], up = +
            var u = (theta + Math.PI) / (2 * Math.PI);
            var v = 0.5 - phi / Math.PI;

            var sx = Math.max(0, Math.min(hw - 1, Math.floor(u * hw)));
            var sy = Math.max(0, Math.min(hh - 1, Math.floor(v * hh)));
            var si = (sy * hw + sx) * 4;

            // Fresnel edge darkening via distance from center
            var fres = d2 > 0.82 ? Math.max(0, 1 - (d2 - 0.82) * 3.5) : 1;
            px[oi + 0] = hdrPx[si + 0] * fres;
            px[oi + 1] = hdrPx[si + 1] * fres;
            px[oi + 2] = hdrPx[si + 2] * fres;
            px[oi + 3] = 255;
        }
    }
    octx.putImageData(img, 0, 0);
    return out;
}

function _loadChromeImg() {
    if (_chromeTried) return;
    _chromeTried = true;

    // Try HDRI panorama first
    var hdri = new Image();
    hdri.crossOrigin = 'anonymous';
    hdri.onload = function() {
        try {
            var baked = _bakeChromeFromHDRI(hdri, 768);
            if (baked) { _chromeImg = baked; _chromeImgReady = true; return; }
        } catch (e) {}
        _tryChromeBallPng();
    };
    hdri.onerror = _tryChromeBallPng;
    hdri.src = 'chrome-env.png';
}

function _tryChromeBallPng() {
    var img = new Image();
    img.onload = function() { _chromeImg = img; _chromeImgReady = true; };
    img.onerror = function() { _chromeImgReady = false; };
    img.src = 'chrome-ball.png';
}

// ── Live-camera chrome reflection ────────────────────────────────
// Per-frame sphere reflection mapping from the live webcam onto a small
// offscreen canvas. A precomputed warp map (sampled-video → ball-pixel)
// keeps per-frame cost at ~4 loads + 4 multiplies per pixel; no trig.
// Classic light-probe warp: radial distance warped by sin(r·π/2) so ball
// center is mirror-flat and edges wrap around the sphere.

var _CHROME_LIVE_SIZE = 128;
var _chromeLiveCanvas = null;
var _chromeLiveCtx = null;
var _chromeVideoSampler = null;
var _chromeVideoSamplerCtx = null;
var _chromeWarpU = null;
var _chromeWarpV = null;
var _chromeFresnel = null;

function _buildChromeWarpMap() {
    if (_chromeWarpU) return;
    var size = _CHROME_LIVE_SIZE;
    _chromeWarpU = new Uint8Array(size * size);
    _chromeWarpV = new Uint8Array(size * size);
    _chromeFresnel = new Uint8Array(size * size);
    var r = size / 2;
    // True mirror-ball / light-probe mapping. For each ball pixel, compute
    // the surface normal, reflect the view direction, then project the
    // reflection vector radially by its spherical angle φ — center = mirror-
    // flat, edges wrap around the sphere like a real chrome ball.
    var WARP = 0.75;  // how much of the 180° wrap fits into the ball radius
    for (var py = 0; py < size; py++) {
        for (var pxi = 0; pxi < size; pxi++) {
            var nx = (pxi - r) / r;
            var ny = (py - r) / r;
            var d2 = nx * nx + ny * ny;
            var idx = py * size + pxi;
            if (d2 >= 1) { _chromeFresnel[idx] = 0; continue; }
            var nz = Math.sqrt(1 - d2);
            var Rx = -2 * nz * nx;
            var Ry = -2 * nz * ny;
            var Rz = 1 - 2 * nz * nz;
            var phi = Math.acos(-Rz);                    // 0 at center, π at edge
            var hlen = Math.sqrt(Rx * Rx + Ry * Ry);
            var ct = (hlen > 1e-6) ? (Rx / hlen) : 0;
            var st = (hlen > 1e-6) ? (Ry / hlen) : 0;
            var rad = (phi / Math.PI) * WARP;
            var u = 0.5 - rad * ct;                      // mirror X (webcam feel)
            var v = 0.5 + rad * st;
            if (u < 0) u = 0; else if (u > 1) u = 1;
            if (v < 0) v = 0; else if (v > 1) v = 1;
            _chromeWarpU[idx] = Math.floor(u * (size - 1));
            _chromeWarpV[idx] = Math.floor(v * (size - 1));
            // Chrome fresnel — bright center, dark shadow toward edge (floor at 15%).
            var fres = d2 > 0.62 ? Math.max(0.15, 1 - (d2 - 0.62) * 2.3) : 1;
            _chromeFresnel[idx] = Math.floor(fres * 255);
        }
    }
}

function _renderLiveChromeReflection() {
    if (typeof videoEl === 'undefined' || !videoEl || !videoEl.elt ||
        videoEl.elt.readyState < 2 || videoEl.elt.videoWidth === 0) return null;
    var size = _CHROME_LIVE_SIZE;
    if (!_chromeLiveCanvas) {
        _chromeLiveCanvas = document.createElement('canvas');
        _chromeLiveCanvas.width = size; _chromeLiveCanvas.height = size;
        _chromeLiveCtx = _chromeLiveCanvas.getContext('2d');
        _chromeVideoSampler = document.createElement('canvas');
        _chromeVideoSampler.width = size; _chromeVideoSampler.height = size;
        _chromeVideoSamplerCtx = _chromeVideoSampler.getContext('2d', { willReadFrequently: true });
    }
    _buildChromeWarpMap();
    var srcPx;
    try {
        _chromeVideoSamplerCtx.drawImage(videoEl.elt, 0, 0, size, size);
        srcPx = _chromeVideoSamplerCtx.getImageData(0, 0, size, size).data;
    } catch (e) { return null; }
    var out = _chromeLiveCtx.createImageData(size, size);
    var dstPx = out.data;
    var total = size * size;
    for (var i = 0; i < total; i++) {
        var fres = _chromeFresnel[i];
        var oi = i * 4;
        if (fres === 0) { dstPx[oi + 3] = 0; continue; }
        var si = (_chromeWarpV[i] * size + _chromeWarpU[i]) * 4;
        // Chrome look — S-curve contrast + slight desaturation toward luminance,
        // then fresnel-darkened. Center stays clean, shadows deepen.
        var sr = srcPx[si], sg = srcPx[si + 1], sb = srcPx[si + 2];
        var lum = sr * 0.299 + sg * 0.587 + sb * 0.114;
        var desatMix = 0.25;  // pull 25% toward gray — makes highlights read as metal not flesh
        sr = sr + (lum - sr) * desatMix;
        sg = sg + (lum - sg) * desatMix;
        sb = sb + (lum - sb) * desatMix;
        // S-curve: (x/255 - 0.5) * contrast + 0.5, then back to 0-255
        var cc = 1.55;  // contrast multiplier
        sr = ((sr / 255 - 0.5) * cc + 0.5) * 255;
        sg = ((sg / 255 - 0.5) * cc + 0.5) * 255;
        sb = ((sb / 255 - 0.5) * cc + 0.5) * 255;
        var fs = fres / 255;
        dstPx[oi]     = Math.max(0, Math.min(255, sr * fs));
        dstPx[oi + 1] = Math.max(0, Math.min(255, sg * fs));
        dstPx[oi + 2] = Math.max(0, Math.min(255, sb * fs));
        dstPx[oi + 3] = 255;
    }
    _chromeLiveCtx.putImageData(out, 0, 0);
    return _chromeLiveCanvas;
}

// ── Palm-to-palm song state ──────────────────────────────────────
// Time-based envelope + cached geometry for the song-between-hands gesture.

var SONG_VIZ_MODES = ['orb', 'morph', 'spectrum', 'waveform', 'pulse'];

var songBetweenHandsEnabled = false;
var songBetweenHandsMode    = 'orb';

function _saveSongHands() {
    try {
        localStorage.setItem('hod-song-hands', JSON.stringify({
            enabled: songBetweenHandsEnabled,
            mode: songBetweenHandsMode
        }));
    } catch(e) {}
}

function _loadSongHands() {
    try {
        var raw = localStorage.getItem('hod-song-hands');
        if (!raw) return;
        var data = JSON.parse(raw);
        if (data && typeof data.enabled === 'boolean') songBetweenHandsEnabled = data.enabled;
        if (data && SONG_VIZ_MODES.indexOf(data.mode) !== -1) songBetweenHandsMode = data.mode;
    } catch(e) {}
}

var _PALM_SONG_ATTACK_MS       = 150;   // time to ~63% on rise
var _PALM_SONG_RELEASE_MS      = 700;   // time to ~63% on fall
var _PALM_SONG_HOLD_MS         = 220;   // how long gate must pass before viz activates
var _PALM_SONG_HOLD_GRACE_MS   = 60;    // how long a transient drop is forgiven
var _PALM_SONG_STALE_MS        = 300;   // max time to reuse lastGoodGeometry after gate drops
var _PALM_SONG_FACING_THRESH   = 0.1;   // min dot(normal, axis) per hand — roughly facing, not precise
var _PALM_SONG_DT_CAP_MS       = 100;   // dt clamp — prevents huge jumps after tab blur

var _palmSongState = {
    targetIntensity: 0,       // gate output after hold filter (feeds envelope)
    vizIntensity:    0,       // smoothed output — what draws should use
    holdMs:          0,       // time gate has been passing
    badMs:           0,       // time gate has been failing (reset holdMs after grace)
    gateActive:      false,   // true once hold passed
    lastUpdateMs:    0,
    facing0:         0,       // diagnostic: last dot(n0, axis)
    facing1:         0,       // diagnostic: last dot(n1, -axis)
    lastRaw:         0,       // diagnostic: last _palmsEngaged return
    lastGoodGeometry: null,   // { a: {x,y}, b: {x,y} } screen-space points
    lastGoodMs:      0
};

function _resetPalmSongState() {
    var s = _palmSongState;
    s.targetIntensity = 0;
    s.vizIntensity    = 0;
    s.holdMs          = 0;
    s.badMs           = 0;
    s.gateActive      = false;
    s.lastUpdateMs    = 0;
    s.facing0         = 0;
    s.facing1         = 0;
    s.lastRaw         = 0;
    s.lastGoodGeometry = null;
    s.lastGoodMs      = 0;
}

// Returns raw 0..1 based on facing + distance, NOT hold-gated.
// Requires both hands + both palmNormals + successful inter-palm axis.
// Writes diagnostic facing values into state as a side effect.
// Toggle `window.DEBUG_PALM_INVERT_FACING = true` in DevTools if sign convention is inverted.
function _palmsEngaged() {
    _palmSongState.facing0 = 0;
    _palmSongState.facing1 = 0;
    if (_handResults.length < 2) return 0;

    var h0 = _handResults[0];
    var h1 = _handResults[1];
    var n0 = h0.palmNormal;
    var n1 = h1.palmNormal;
    if (!n0 || !n1) return 0;
    var pc0 = h0.palmCenter;
    var pc1 = h1.palmCenter;
    if (!pc0 || !pc1) return 0;

    // Inter-palm axis, preferring world coords; fall back to 2D image-space.
    var axis;
    if (h0.palmCenterWorld && h1.palmCenterWorld) {
        axis = _safeNormalize(_vec3Sub(h1.palmCenterWorld, h0.palmCenterWorld));
    } else {
        axis = _safeNormalize({ x: pc1.x - pc0.x, y: pc1.y - pc0.y, z: 0 });
    }
    if (!axis) return 0;

    var negAxis = { x: -axis.x, y: -axis.y, z: -axis.z };
    var invert = (typeof window !== 'undefined' && window.DEBUG_PALM_INVERT_FACING) ? -1 : 1;
    var f0 = _vec3Dot(n0, axis)    * invert;
    var f1 = _vec3Dot(n1, negAxis) * invert;
    _palmSongState.facing0 = f0;
    _palmSongState.facing1 = f1;

    var facing = Math.min(f0, f1);
    if (facing < _PALM_SONG_FACING_THRESH) return 0;

    // Distance-agnostic: hands can start apart. Intensity scales with how well palms face.
    return Math.min(1, Math.max(0, facing));
}

// Call every frame. Time-based envelope survives variable fps and detector gaps.
function _updatePalmSongState() {
    var s = _palmSongState;
    var now = performance.now();
    var prev = s.lastUpdateMs;
    var dt = prev > 0 ? Math.min(now - prev, _PALM_SONG_DT_CAP_MS) : 16;
    s.lastUpdateMs = now;

    var raw = _palmsEngaged();
    s.lastRaw = raw;

    // Hold-with-grace: transient drops under HOLD_GRACE_MS don't zero out holdMs.
    if (raw > 0.01) {
        s.holdMs += dt;
        s.badMs = 0;
    } else {
        s.badMs += dt;
        if (s.badMs > _PALM_SONG_HOLD_GRACE_MS) {
            s.holdMs = 0;
        }
    }
    s.gateActive = s.holdMs >= _PALM_SONG_HOLD_MS;

    // Effective target only flows through once hold gate has latched open.
    // Release is envelope-driven, not gate-driven — gate closing just sets target=0.
    var target = s.gateActive ? raw : 0;
    s.targetIntensity = target;

    // Asymmetric attack/release — rise fast, fall slow.
    var tau = (target > s.vizIntensity) ? _PALM_SONG_ATTACK_MS : _PALM_SONG_RELEASE_MS;
    var alpha = 1 - Math.exp(-dt / tau);
    s.vizIntensity += (target - s.vizIntensity) * alpha;

    // Cache screen-space palm positions whenever both hands are present, so draw code
    // always has fresh geometry and the release envelope can keep drawing after the gate closes.
    // Skip before videoEl is ready — screen-space coords aren't defined yet.
    var videoReady = (typeof videoEl !== 'undefined') && videoEl && videoEl.width;
    if (_handResults.length >= 2 && videoReady) {
        var pc0 = _handResults[0].palmCenter;
        var pc1 = _handResults[1].palmCenter;
        if (pc0 && pc1) {
            var a = _lmToScreen(pc0);
            var b = _lmToScreen(pc1);
            if (a.x > b.x) { var t2 = a; a = b; b = t2; }
            s.lastGoodGeometry = { a: a, b: b };
            s.lastGoodMs = now;
        }
    } else if (s.lastGoodGeometry && (now - s.lastGoodMs) > _PALM_SONG_STALE_MS) {
        s.lastGoodGeometry = null;
    }
}

// Debug overlay — magenta/cyan arrow from each palm along its normal's projected xy.
// Toggle at runtime: `window.DEBUG_PALM_NORMAL = true` in DevTools console.
// Unclipped so it stays visible in song mode; disabled by default.
function _drawPalmNormalDebug(ctx) {
    if (!window.DEBUG_PALM_NORMAL) return;
    if (!_handResults || _handResults.length === 0) return;

    var mirror = (typeof usingWebcam !== 'undefined' && usingWebcam &&
                  typeof _currentFacingMode !== 'undefined' && _currentFacingMode === 'user') ? -1 : 1;
    var ARROW_LEN = 90;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.font = 'bold 10px "Commit Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    for (var h = 0; h < _handResults.length; h++) {
        var hand = _handResults[h];
        if (!hand || !hand.palmCenter || !hand.palmNormal) continue;

        var start = _lmToScreen(hand.palmCenter);
        var n = hand.palmNormal;
        var tipX = start.x + n.x * ARROW_LEN * mirror;
        var tipY = start.y + n.y * ARROW_LEN;  // world-y may be up or down — verify visually

        var color = (hand.handedness === 'Left') ? '#00E0FF' : '#FF3B9F';

        // Shaft
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.shadowColor = 'rgba(0,0,0,0.55)';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();

        // Tip dot
        ctx.shadowBlur = 0;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(tipX, tipY, 5, 0, Math.PI * 2);
        ctx.fill();

        // Readout
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        var label = (hand.handedness || '?')[0] +
                    ' n(' + n.x.toFixed(2) + ',' + n.y.toFixed(2) + ',' + n.z.toFixed(2) + ')';
        ctx.fillText(label, start.x, start.y - 14);
    }

    // Envelope + gate diagnostics.
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.textAlign = 'left';
    var lineY = 18;
    if (_handResults.length === 2) {
        var h0 = _handResults[0];
        var h1 = _handResults[1];
        if (h0.palmNormal && h1.palmNormal) {
            var dot = _vec3Dot(h0.palmNormal, h1.palmNormal);
            ctx.fillText('dot(n0,n1)=' + dot.toFixed(2), 12, lineY);
            lineY += 14;
        }
    }
    var s = _palmSongState;
    ctx.fillText('facing0=' + s.facing0.toFixed(2) +
                 '  facing1=' + s.facing1.toFixed(2) +
                 '  raw=' + s.lastRaw.toFixed(2), 12, lineY);
    lineY += 14;
    ctx.fillStyle = s.gateActive ? 'rgba(120,255,160,0.95)' : 'rgba(255,220,100,0.95)';
    ctx.fillText((s.gateActive ? 'GATE OPEN' : 'gate closed') +
                 '  hold=' + Math.round(s.holdMs) + '/' + _PALM_SONG_HOLD_MS + 'ms' +
                 (s.badMs > 0 ? '  bad=' + Math.round(s.badMs) + 'ms' : ''), 12, lineY);
    lineY += 14;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText('target=' + s.targetIntensity.toFixed(2) +
                 '  viz=' + s.vizIntensity.toFixed(2) +
                 (s.lastGoodGeometry ? '  [cached]' : ''), 12, lineY);

    ctx.restore();
}

function _getAudioSample() {
    var has = (typeof audioLoaded !== 'undefined' && audioLoaded) &&
              ((typeof audioPlaying !== 'undefined' && audioPlaying) ||
               (typeof micActive !== 'undefined' && micActive) ||
               (typeof videoAudioActive !== 'undefined' && videoAudioActive));
    return {
        bass: has ? smoothBass : 0,
        mid: has ? smoothMid : 0,
        treble: has ? smoothTreble : 0,
        overall: has ? smoothOverall : 0,
        beat: has ? beatIntensity : 0,
        freq: (has && typeof frequencyData !== 'undefined') ? frequencyData : null,
        active: has
    };
}

// Dominant-frequency color: blends 3 anchor colors by band energy.
// bass → magenta, mid → purple, treble → cyan.
function _dominantFreqColor(a) {
    var total = a.bass + a.mid + a.treble + 0.001;
    var bW = a.bass / total, mW = a.mid / total, tW = a.treble / total;
    var bC = [232, 67, 147], mC = [139, 69, 232], tC = [0, 206, 201];
    var r, g, b;
    if (!a.active || a.overall < 0.05) {
        // Idle: brand magenta
        r = bC[0]; g = bC[1]; b = bC[2];
    } else {
        r = bW * bC[0] + mW * mC[0] + tW * tC[0];
        g = bW * bC[1] + mW * mC[1] + tW * tC[1];
        b = bW * bC[2] + mW * mC[2] + tW * tC[2];
    }
    return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
}

function _songRGBA(color, alpha) {
    return 'rgba(' + color.r + ',' + color.g + ',' + color.b + ',' + alpha + ')';
}

// ORB — reflective chrome sphere. The webcam feed IS the reflection
// (contrast-boosted, convex-compressed, mirrored). Soft specular crescent
// highlights on top, fresnel edge darkening. Song color only outside.
function _drawSongOrb(ctx, g, a) {
    var mx = g.mx, my = g.my, dist = g.dist;
    var baseR = Math.max(26, dist * 0.27);
    var breathe = 0.5 + 0.5 * Math.sin(performance.now() / 1400);
    var r = baseR * (0.92 + breathe * 0.06 + a.overall * 0.08);

    var color = _dominantFreqColor(a);

    _loadChromeImg();  // lazy — triggers one load attempt the first time

    ctx.save();

    // 1. Outer colored halo
    var halo = ctx.createRadialGradient(mx, my, r * 1.02, mx, my, r * 1.85);
    halo.addColorStop(0, _songRGBA(color, 0.35));
    halo.addColorStop(0.55, _songRGBA(color, 0.12));
    halo.addColorStop(1, _songRGBA(color, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(mx - r * 1.85, my - r * 1.85, r * 3.7, r * 3.7);

    // 2a. Live webcam reflection via sphere-warp map. Synthetic specular
    //     highlights (upper-left hotspot + lower-right secondary) sell the
    //     chrome feel without pulling in the HDRI cloud environment.
    var liveCanvas = _renderLiveChromeReflection();
    if (liveCanvas) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(mx, my, r, 0, Math.PI * 2);
        ctx.clip();

        ctx.drawImage(liveCanvas, mx - r, my - r, r * 2, r * 2);

        // Chrome specular — tight hard hotspot + crescent sheen + pinpoint.
        // Screen blend stacks bright-on-bright to push highlights toward white.
        ctx.globalCompositeOperation = 'screen';

        // Primary hotspot: sharp, small, white-hot
        var sx = mx - r * 0.38, sy = my - r * 0.42;
        var spec1 = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 0.45);
        spec1.addColorStop(0,    'rgba(255,255,255,1)');
        spec1.addColorStop(0.15, 'rgba(255,255,255,0.75)');
        spec1.addColorStop(0.45, 'rgba(255,255,255,0.2)');
        spec1.addColorStop(1,    'rgba(255,255,255,0)');
        ctx.fillStyle = spec1;
        ctx.fillRect(mx - r, my - r, r * 2, r * 2);

        // Crescent sheen arcing along the upper-left edge
        var sheen = ctx.createRadialGradient(mx - r * 0.15, my - r * 0.15, r * 0.85, mx - r * 0.15, my - r * 0.15, r * 1.08);
        sheen.addColorStop(0,   'rgba(255,255,255,0)');
        sheen.addColorStop(0.6, 'rgba(255,255,255,0.5)');
        sheen.addColorStop(1,   'rgba(255,255,255,0)');
        ctx.fillStyle = sheen;
        ctx.fillRect(mx - r, my - r, r * 2, r * 2);

        // Pinpoint — the glint that sells "polished metal"
        var gx = mx - r * 0.45, gy = my - r * 0.5;
        var glint = ctx.createRadialGradient(gx, gy, 0, gx, gy, r * 0.08);
        glint.addColorStop(0, 'rgba(255,255,255,1)');
        glint.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = glint;
        ctx.fillRect(gx - r * 0.1, gy - r * 0.1, r * 0.2, r * 0.2);

        // Bottom-rim dark fresnel — pulls focus to the top, deepens the ball
        ctx.globalCompositeOperation = 'multiply';
        var rim = ctx.createRadialGradient(mx, my + r * 0.25, r * 0.45, mx, my + r * 0.25, r * 1.05);
        rim.addColorStop(0,    'rgba(255,255,255,1)');
        rim.addColorStop(0.65, 'rgba(180,180,200,1)');
        rim.addColorStop(1,    'rgba(20,10,40,1)');
        ctx.fillStyle = rim;
        ctx.fillRect(mx - r, my - r, r * 2, r * 2);

        ctx.restore();

        // Thin bright glass rim + colored outer glow
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(mx, my, r, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = _songRGBA(color, 0.35);
        ctx.lineWidth = 1.5;
        ctx.shadowColor = _songRGBA(color, 1);
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(mx, my, r + 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        return;
    }

    // 2b. Procedural chrome body (fallback when no image provided)
    ctx.save();
    ctx.beginPath();
    ctx.arc(mx, my, r, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = '#0a0812';
    ctx.fillRect(mx - r, my - r, r * 2, r * 2);

    // Webcam reflection — contrast-boosted, desaturated slightly
    var reflected = false;
    try {
        if (typeof videoEl !== 'undefined' && videoEl && videoEl.elt &&
            videoEl.elt.readyState >= 2 && videoEl.elt.videoWidth > 0) {
            var vw = videoEl.elt.videoWidth;
            var vh = videoEl.elt.videoHeight;
            ctx.save();
            ctx.filter = 'contrast(1.6) brightness(1.15) saturate(0.7)';
            ctx.translate(mx, my);
            ctx.scale(-1, 1);
            var zoom = 0.55;
            var drawW = (r * 2) / zoom;
            var drawH = drawW * (vh / vw);
            // (Don't reset globalAlpha here — the outer _drawSongBetweenHands sets it
            // from vizIntensity so the viz can fade in/out cleanly.)
            ctx.drawImage(videoEl.elt, -drawW / 2, -drawH / 2, drawW, drawH);
            ctx.filter = 'none';
            ctx.restore();
            reflected = true;
        }
    } catch (e) {}

    if (!reflected) {
        var chromeG = ctx.createLinearGradient(mx, my - r, mx, my + r);
        chromeG.addColorStop(0.00, '#eee8f5');
        chromeG.addColorStop(0.20, '#b4aac2');
        chromeG.addColorStop(0.42, '#5a4f65');
        chromeG.addColorStop(0.52, '#080510');
        chromeG.addColorStop(0.60, '#201628');
        chromeG.addColorStop(0.80, '#554a60');
        chromeG.addColorStop(1.00, '#8a7ba0');
        ctx.fillStyle = chromeG;
        ctx.fillRect(mx - r, my - r, r * 2, r * 2);
    }

    // Spherical falloff — fakes the round 3D ball shape
    ctx.globalCompositeOperation = 'multiply';
    var sphereShade = ctx.createRadialGradient(mx, my, r * 0.45, mx, my, r);
    sphereShade.addColorStop(0, 'rgba(255,255,255,1)');
    sphereShade.addColorStop(0.7, 'rgba(140,130,160,1)');
    sphereShade.addColorStop(1, 'rgba(20,15,30,1)');
    ctx.fillStyle = sphereShade;
    ctx.fillRect(mx - r, my - r, r * 2, r * 2);

    // Horizon dark band
    ctx.globalCompositeOperation = 'multiply';
    var horizon = ctx.createLinearGradient(mx, my - r * 0.18, mx, my + r * 0.18);
    horizon.addColorStop(0.00, 'rgba(255,255,255,1)');
    horizon.addColorStop(0.50, 'rgba(35,28,45,1)');
    horizon.addColorStop(1.00, 'rgba(255,255,255,1)');
    ctx.fillStyle = horizon;
    ctx.fillRect(mx - r, my - r * 0.18, r * 2, r * 0.36);

    // Soft specular highlight crescent (top-left)
    ctx.globalCompositeOperation = 'lighter';
    var specX = mx - r * 0.3;
    var specY = my - r * 0.42;
    var specR = r * 0.44;
    var spec = ctx.createRadialGradient(specX, specY, 0, specX, specY, specR);
    spec.addColorStop(0.00, 'rgba(255,255,255,1)');
    spec.addColorStop(0.22, 'rgba(255,255,255,0.85)');
    spec.addColorStop(0.55, 'rgba(255,255,255,0.3)');
    spec.addColorStop(1.00, 'rgba(255,255,255,0)');
    ctx.fillStyle = spec;
    ctx.fillRect(specX - specR, specY - specR, specR * 2, specR * 2);

    // Hot spot
    var hotX = mx - r * 0.22;
    var hotY = my - r * 0.38;
    var hotR = r * 0.1;
    var hot = ctx.createRadialGradient(hotX, hotY, 0, hotX, hotY, hotR);
    hot.addColorStop(0, 'rgba(255,255,255,1)');
    hot.addColorStop(0.35, 'rgba(255,255,255,0.95)');
    hot.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hot;
    ctx.fillRect(hotX - hotR, hotY - hotR, hotR * 2, hotR * 2);

    // Secondary highlight
    var sec2X = mx + r * 0.3;
    var sec2Y = my - r * 0.3;
    var sec2R = r * 0.18;
    var sec2 = ctx.createRadialGradient(sec2X, sec2Y, 0, sec2X, sec2Y, sec2R);
    sec2.addColorStop(0, 'rgba(255,255,255,0.45)');
    sec2.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sec2;
    ctx.fillRect(sec2X - sec2R, sec2Y - sec2R, sec2R * 2, sec2R * 2);

    // Fresnel rim
    ctx.globalCompositeOperation = 'source-over';
    var fresnel = ctx.createRadialGradient(mx, my, r * 0.78, mx, my, r);
    fresnel.addColorStop(0, 'rgba(0,0,0,0)');
    fresnel.addColorStop(0.88, 'rgba(0,0,0,0.15)');
    fresnel.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = fresnel;
    ctx.fillRect(mx - r, my - r, r * 2, r * 2);

    ctx.restore(); // end clip

    // 3. Glass hairline
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(mx, my, r, 0, Math.PI * 2);
    ctx.stroke();

    // 4. Song-color outer glow
    ctx.strokeStyle = _songRGBA(color, 0.35);
    ctx.lineWidth = 1.5;
    ctx.shadowColor = _songRGBA(color, 1);
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(mx, my, r + 2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
}

// MORPH — reactive deforming blob. Radius pulses with bass, shape
// warps with treble/beat, sparks fly on peaks. Same color mapping.
function _drawSongMorph(ctx, g, a) {
    var mx = g.mx, my = g.my, dist = g.dist;
    var baseR = Math.max(28, dist * 0.28);
    var r = baseR * (0.85 + a.bass * 0.5 + a.beat * 0.35);

    var color = _dominantFreqColor(a);
    var t = performance.now() / 1000;
    var deform = 0.12 + a.treble * 0.35 + a.beat * 0.45;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Halo
    var halo = ctx.createRadialGradient(mx, my, 0, mx, my, r * 1.7);
    halo.addColorStop(0, _songRGBA(color, 0.55 + a.bass * 0.3));
    halo.addColorStop(0.5, _songRGBA(color, 0.2));
    halo.addColorStop(1, _songRGBA(color, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(mx - r * 1.7, my - r * 1.7, r * 3.4, r * 3.4);

    // Build blob path (polar deformation)
    var N = 72;
    ctx.beginPath();
    for (var i = 0; i <= N; i++) {
        var ang = (i / N) * Math.PI * 2;
        var wobble =
            Math.sin(ang * 3 + t * 1.5) * 0.5 +
            Math.sin(ang * 5 - t * 2.3) * 0.3 +
            Math.sin(ang * 7 + t * 3.1) * 0.2;
        var rad = r * (1 + wobble * deform);
        var x = mx + Math.cos(ang) * rad;
        var y = my + Math.sin(ang) * rad;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();

    // Fill gradient
    var fill = ctx.createRadialGradient(mx, my, 0, mx, my, r * 1.15);
    fill.addColorStop(0, _songRGBA(color, 0.9));
    fill.addColorStop(0.65, _songRGBA(color, 0.4));
    fill.addColorStop(1, _songRGBA(color, 0));
    ctx.fillStyle = fill;
    ctx.fill();

    // Glowing edge
    ctx.strokeStyle = _songRGBA(color, 0.9);
    ctx.lineWidth = 2;
    ctx.shadowColor = _songRGBA(color, 1);
    ctx.shadowBlur = 14;
    ctx.stroke();

    // Sparks on peaks
    if (a.beat > 0.25 || a.treble > 0.35) {
        ctx.shadowBlur = 0;
        var sparkCount = Math.min(20, Math.floor((a.beat + a.treble) * 14));
        ctx.fillStyle = 'rgba(255,255,255,' + Math.min(1, 0.4 + a.beat * 0.6) + ')';
        for (var s = 0; s < sparkCount; s++) {
            var sAng = Math.random() * Math.PI * 2;
            var sRad = r * (1.0 + Math.random() * 0.35);
            var sx = mx + Math.cos(sAng) * sRad;
            var sy = my + Math.sin(sAng) * sRad;
            ctx.beginPath();
            ctx.arc(sx, sy, 1.3 + Math.random() * 1.8, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Core
    ctx.shadowBlur = 0;
    var coreR = Math.max(4, r * 0.2 * (0.8 + a.beat * 0.5));
    var core = ctx.createRadialGradient(mx, my, 0, mx, my, coreR);
    core.addColorStop(0, 'rgba(255,255,255,' + (0.85 + a.beat * 0.15) + ')');
    core.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = core;
    ctx.fillRect(mx - coreR, my - coreR, coreR * 2, coreR * 2);

    ctx.restore();
}

function _drawSongSpectrum(ctx, g, a) {
    var dx = g.dx, dy = g.dy, dist = g.dist;
    if (dist < 12) return;

    var nx = -dy / dist, ny = dx / dist;
    var BAR_COUNT = 32;
    var maxBarH = Math.min(140, dist * 0.32);

    ctx.save();
    // Baseline guide
    ctx.strokeStyle = 'rgba(232,67,147,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(g.a.x, g.a.y);
    ctx.lineTo(g.b.x, g.b.y);
    ctx.stroke();

    var freq = a.freq;
    var usefulBins = freq ? Math.floor(freq.length * 0.6) : 0;

    ctx.lineCap = 'round';
    for (var i = 0; i < BAR_COUNT; i++) {
        var t = i / (BAR_COUNT - 1);
        var v;
        if (freq && usefulBins > 0) {
            var binIdx = Math.max(1, Math.floor(Math.pow(t, 1.5) * usefulBins));
            v = freq[binIdx] / 255;
        } else {
            // Idle animation when no audio
            v = 0.06 + 0.04 * Math.sin(performance.now() / 600 + t * 8);
        }

        var cx = g.a.x + dx * t;
        var cy = g.a.y + dy * t;
        var bh = v * maxBarH;
        var hue = 310 - t * 130;  // magenta → cyan
        ctx.strokeStyle = 'hsl(' + hue + ',85%,' + (52 + v * 18) + '%)';
        ctx.lineWidth = Math.max(2, (dist / BAR_COUNT) * 0.55);

        ctx.beginPath();
        ctx.moveTo(cx - nx * bh * 0.5, cy - ny * bh * 0.5);
        ctx.lineTo(cx + nx * bh * 0.5, cy + ny * bh * 0.5);
        ctx.stroke();
    }
    ctx.restore();
}

// WAVEFORM — chrome/mirrored. Audacity-style symmetric wave above and
// below the palm-to-palm axis; silvery metallic stroke with colored rim
// glow. Color follows dominant freq.
function _drawSongWaveform(ctx, g, a) {
    var dx = g.dx, dy = g.dy, dist = g.dist;
    if (dist < 12) return;

    var nx = -dy / dist, ny = dx / dist;
    var SAMPLE_COUNT = 128;
    var amp = Math.min(95, dist * 0.23) * (0.7 + a.overall * 0.5);

    var samples = null;
    if (a.active && typeof audioAnalyser !== 'undefined' && audioAnalyser && audioAnalyser.fftSize) {
        if (!_songTimeDomain || _songTimeDomain.length !== audioAnalyser.fftSize) {
            _songTimeDomain = new Uint8Array(audioAnalyser.fftSize);
        }
        try { audioAnalyser.getByteTimeDomainData(_songTimeDomain); samples = _songTimeDomain; } catch (e) {}
    }

    var color = _dominantFreqColor(a);
    var step = samples ? Math.floor(samples.length / SAMPLE_COUNT) : 0;

    // Build |v| for symmetric mirror
    var pts = [];
    for (var i = 0; i < SAMPLE_COUNT; i++) {
        var t = i / (SAMPLE_COUNT - 1);
        var v;
        if (samples) v = (samples[i * step] - 128) / 128;
        else v = Math.sin(performance.now() / 300 + t * Math.PI * 6) * 0.15;
        pts.push({ cx: g.a.x + dx * t, cy: g.a.y + dy * t, v: Math.abs(v) });
    }

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Helper: build a wave path (side = +1 above axis, -1 below)
    function buildPath(side) {
        ctx.beginPath();
        for (var i = 0; i < pts.length; i++) {
            var p = pts[i];
            var px = p.cx + nx * p.v * amp * side;
            var py = p.cy + ny * p.v * amp * side;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
    }

    // 1. Soft tinted fill between the two mirrored curves (chrome body)
    ctx.fillStyle = _songRGBA(color, 0.14);
    ctx.beginPath();
    for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        var px = p.cx + nx * p.v * amp;
        var py = p.cy + ny * p.v * amp;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    for (var i = pts.length - 1; i >= 0; i--) {
        var p = pts[i];
        var px = p.cx - nx * p.v * amp;
        var py = p.cy - ny * p.v * amp;
        ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    // 2. Colored outer glow stroke — thick, dominant-freq color
    ctx.strokeStyle = _songRGBA(color, 0.75);
    ctx.lineWidth = 5;
    ctx.shadowColor = _songRGBA(color, 1);
    ctx.shadowBlur = 16;
    buildPath(1); ctx.stroke();
    buildPath(-1); ctx.stroke();

    // 3. Silvery chrome body — silvery gradient along the axis
    var chromeG = ctx.createLinearGradient(g.a.x, g.a.y, g.b.x, g.b.y);
    chromeG.addColorStop(0.00, 'rgba(230,225,240,0.95)');
    chromeG.addColorStop(0.25, _songRGBA(color, 0.9));
    chromeG.addColorStop(0.50, 'rgba(245,240,255,1)');
    chromeG.addColorStop(0.75, _songRGBA(color, 0.9));
    chromeG.addColorStop(1.00, 'rgba(230,225,240,0.95)');
    ctx.strokeStyle = chromeG;
    ctx.lineWidth = 2.5;
    ctx.shadowBlur = 4;
    ctx.shadowColor = 'rgba(255,255,255,0.6)';
    buildPath(1); ctx.stroke();
    buildPath(-1); ctx.stroke();

    // 4. Bright highlight line along the crest (mirror shine)
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.7 + a.beat * 0.3) + ')';
    ctx.lineWidth = 1;
    ctx.shadowBlur = 0;
    buildPath(1); ctx.stroke();
    buildPath(-1); ctx.stroke();

    // 5. Center axis — faint mirror line
    ctx.strokeStyle = _songRGBA(color, 0.25);
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(g.a.x, g.a.y);
    ctx.lineTo(g.b.x, g.b.y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
}

function _drawSongPulse(ctx, g, a) {
    var mx = g.mx, my = g.my, dist = g.dist;
    var baseR = Math.max(32, dist * 0.45);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    var bands = [
        { val: a.treble, radius: baseR * (0.3 + a.treble * 0.35), rgb: '0,206,201' },
        { val: a.mid,    radius: baseR * (0.6 + a.mid * 0.35),    rgb: '139,69,232' },
        { val: a.bass,   radius: baseR * (1.0 + a.bass * 0.45 + a.beat * 0.3), rgb: '232,67,147' }
    ];

    for (var i = 0; i < bands.length; i++) {
        var b = bands[i];
        var alpha = 0.25 + b.val * 0.55;
        ctx.strokeStyle = 'rgba(' + b.rgb + ',' + alpha + ')';
        ctx.lineWidth = 2 + b.val * 5;
        ctx.shadowColor = 'rgba(' + b.rgb + ',0.75)';
        ctx.shadowBlur = 6 + b.val * 14;
        ctx.beginPath();
        ctx.arc(mx, my, b.radius, 0, Math.PI * 2);
        ctx.stroke();
    }

    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,' + (0.55 + a.beat * 0.4) + ')';
    ctx.beginPath();
    ctx.arc(mx, my, 3 + a.beat * 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function _drawSongBetweenHands(ctx, mode) {
    var s = _palmSongState;
    if (s.vizIntensity < 0.01) return;
    if (!s.lastGoodGeometry) return;

    var ga = s.lastGoodGeometry.a;
    var gb = s.lastGoodGeometry.b;
    var dx = gb.x - ga.x;
    var dy = gb.y - ga.y;
    var g = {
        a: ga,
        b: gb,
        dx: dx,
        dy: dy,
        dist: Math.sqrt(dx * dx + dy * dy),
        mx: (ga.x + gb.x) / 2,
        my: (ga.y + gb.y) / 2,
        viz: Math.max(0, Math.min(1, s.vizIntensity))
    };

    var a = _getAudioSample();
    ctx.save();
    ctx.globalAlpha = g.viz;
    if (mode === 'orb') _drawSongOrb(ctx, g, a);
    else if (mode === 'morph') _drawSongMorph(ctx, g, a);
    else if (mode === 'spectrum') _drawSongSpectrum(ctx, g, a);
    else if (mode === 'waveform') _drawSongWaveform(ctx, g, a);
    else if (mode === 'pulse') _drawSongPulse(ctx, g, a);
    ctx.restore();
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
        var labelDiv = document.createElement('div');
        labelDiv.style.cssText = 'font-size:9px;font-weight:700;color:var(--color-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
        labelDiv.textContent = uiCfg.label;
        var paramDiv = document.createElement('div');
        paramDiv.style.cssText = 'font-size:8px;color:var(--text-muted)';
        paramDiv.textContent = paramLabel + ' \u00B7 ' + String(srcInfo.label || '');
        info.appendChild(labelDiv);
        info.appendChild(paramDiv);

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

        // Wire movement trigger toggles
        document.querySelectorAll('.movement-toggle').forEach(function(toggle) {
            toggle.addEventListener('change', function() {
                var key = this.dataset.movement;
                if (MOVEMENT_TRIGGERS[key]) {
                    MOVEMENT_TRIGGERS[key].enabled = this.checked;
                    var row = this.closest('.movement-trigger-row');
                    if (row) row.style.borderLeftColor = this.checked ? '#E84393' : 'transparent';
                }
                _saveMovementTriggers();
            });
        });

        // Wire movement action selectors
        document.querySelectorAll('.movement-action-select').forEach(function(select) {
            select.addEventListener('change', function() {
                var key = this.dataset.movement;
                if (MOVEMENT_TRIGGERS[key]) {
                    MOVEMENT_TRIGGERS[key].action = this.value;
                }
                _saveMovementTriggers();
            });
        });

        // Load persisted movement triggers
        _loadMovementTriggers();

        // Wire Hand Frame controls
        var handFrameMode = document.getElementById('hand-frame-mode');
        if (handFrameMode) {
            handFrameMode.value = _handFrameMode;
            handFrameMode.addEventListener('change', function() {
                _handFrameMode = this.value;
                _handFrameCycleStart = 0;  // reset cycle timer
                _saveHandFrame();
            });
        }
        var handFrameInt = document.getElementById('hand-frame-intensity');
        var handFrameIntVal = document.getElementById('hand-frame-intensity-val');
        if (handFrameInt) {
            handFrameInt.value = _handFrameIntensity;
            if (handFrameIntVal) handFrameIntVal.textContent = String(_handFrameIntensity);
            handFrameInt.addEventListener('input', function() {
                _handFrameIntensity = parseInt(this.value, 10) || 0;
                if (handFrameIntVal) handFrameIntVal.textContent = String(_handFrameIntensity);
                _saveHandFrame();
            });
        }

        // Load persisted hand frame config
        _loadHandFrame();

        // Wire Conductor Mode
        var conductorToggle = document.getElementById('conductor-toggle');
        if (conductorToggle) {
            conductorToggle.addEventListener('change', function() {
                _conductorMode = this.checked;
                _conductorSmoothedVol = 0.5;  // reset to mid on toggle
                _saveConductor();
            });
        }
        _loadConductor();

        // Wire Song Between Hands
        _loadSongHands();
        var songToggle = document.getElementById('song-hands-toggle');
        if (songToggle) {
            songToggle.checked = songBetweenHandsEnabled;
            songToggle.addEventListener('change', function() {
                songBetweenHandsEnabled = this.checked;
                if (!songBetweenHandsEnabled) _resetPalmSongState();
                _saveSongHands();
            });
        }
        var songModeRow = document.getElementById('song-hands-mode-buttons');
        if (songModeRow) {
            songModeRow.querySelectorAll('.selector-btn').forEach(function(btn) {
                btn.classList.toggle('active', btn.getAttribute('data-value') === songBetweenHandsMode);
                btn.addEventListener('click', function() {
                    var v = this.getAttribute('data-value');
                    if (SONG_VIZ_MODES.indexOf(v) === -1) return;
                    songBetweenHandsMode = v;
                    songModeRow.querySelectorAll('.selector-btn').forEach(function(b) {
                        b.classList.toggle('active', b === btn);
                    });
                    _saveSongHands();
                });
            });
        }

        // Load persisted hand sync config
        _loadFxHandsSync();

        // Wire per-effect hand sync listeners (needs FX panel to be built first)
        // Use setTimeout to ensure blob-fx.js has built the FX panel
        setTimeout(function() {
            wireFxHandsSyncListeners();
        }, 100);
    });
})();
