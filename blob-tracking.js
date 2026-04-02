// ══════════════════════════════════════════
// SECTION: TRACKING (blob-tracking.js)
// Point tracking, line drawing, point info display
// ══════════════════════════════════════════

// Fisher-Yates shuffle — O(n), unbiased (replaces sort(() => Math.random() - 0.5))
function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        let tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
}

function trackPoints() {
    trackedPoints = [];
    if (currentMode === 0 || !videoLoaded || !videoPlaying) return;

    // FACE LANDMARK modes (EYES=15, LIPS=16, FACE=17) — uses MediaPipe landmarks but needs pixel data for color sampling
    if (currentMode >= 15 && currentMode <= 17) {
        videoEl.loadPixels();
        if (videoEl.pixels.length === 0) return;
        if (!window.mpFaceLandmarkerReady || !window.mpFaceLandmarker) {
            if (!window._faceWarnThrottle || Date.now() - window._faceWarnThrottle > 3000) {
                window._faceWarnThrottle = Date.now();
                console.warn('[FaceTrack] Not ready:', {
                    ready: window.mpFaceLandmarkerReady,
                    instance: !!window.mpFaceLandmarker,
                    initError: window.mpFaceInitError || 'none'
                });
            }
            return;
        }

        const w = videoEl.width, h = videoEl.height;

        // Detect every frame for smooth tracking
        faceDetectFrame++;
        if (faceDetectFrame >= FACE_DETECT_INTERVAL || !faceLandmarkCache) {
            faceDetectFrame = 0;
            try {
                // Use offscreen canvas — more reliable than raw video element with MediaPipe + p5.js
                const vid = videoEl.elt;
                if (!vid || vid.readyState < 2 || vid.videoWidth === 0) return;
                if (!window._mpFaceCanvas) {
                    window._mpFaceCanvas = document.createElement('canvas');
                }
                const fc = window._mpFaceCanvas;
                if (fc.width !== vid.videoWidth || fc.height !== vid.videoHeight) {
                    fc.width = vid.videoWidth;
                    fc.height = vid.videoHeight;
                }
                if (!window._mpFaceCtx) window._mpFaceCtx = fc.getContext('2d');
                window._mpFaceCtx.drawImage(vid, 0, 0);
                const ts = performance.now();
                const result = window.mpFaceLandmarker.detectForVideo(fc, ts);
                if (!window._faceDetectCount) window._faceDetectCount = 0;
                window._faceDetectCount++;
                if (result && result.faceLandmarks && result.faceLandmarks.length > 0) {
                    window._faceDetectErrors = 0; // Reset error counter on success
                    if (window.mpFaceInitError && window.mpFaceInitError.startsWith('Detection failing')) {
                        window.mpFaceInitError = null; // Clear transient error
                    }
                    let rawLandmarks = result.faceLandmarks;

                    // EMA smoothing: blend new detections with previous positions
                    if (smoothedLandmarks && smoothedLandmarks.length === rawLandmarks.length) {
                        for (let fi = 0; fi < rawLandmarks.length; fi++) {
                            let raw = rawLandmarks[fi];
                            let sm = smoothedLandmarks[fi];
                            if (sm.length === raw.length) {
                                for (let li = 0; li < raw.length; li++) {
                                    sm[li] = {
                                        x: sm[li].x * LANDMARK_SMOOTH + raw[li].x * (1 - LANDMARK_SMOOTH),
                                        y: sm[li].y * LANDMARK_SMOOTH + raw[li].y * (1 - LANDMARK_SMOOTH),
                                        z: sm[li].z * LANDMARK_SMOOTH + raw[li].z * (1 - LANDMARK_SMOOTH)
                                    };
                                }
                            } else {
                                smoothedLandmarks[fi] = raw.map(l => ({x: l.x, y: l.y, z: l.z}));
                            }
                        }
                    } else {
                        // First detection or face count changed — initialize smoothed
                        smoothedLandmarks = rawLandmarks.map(face =>
                            face.map(l => ({x: l.x, y: l.y, z: l.z}))
                        );
                    }
                    faceLandmarkCache = smoothedLandmarks;
                }
            } catch (e) {
                if (!window._faceDetectErrors) window._faceDetectErrors = 0;
                window._faceDetectErrors++;
                if (window._faceDetectErrors <= 5 || window._faceDetectErrors % 30 === 0) {
                    console.warn('[FaceTrack] Detection error #' + window._faceDetectErrors + ':', e.message || e);
                }
                // After 10 consecutive errors, clear stale cache and signal error
                if (window._faceDetectErrors >= 10) {
                    faceLandmarkCache = null;
                    smoothedLandmarks = null;
                    window.mpFaceInitError = 'Detection failing: ' + (e.message || 'unknown error');
                }
            }
        }

        if (!faceLandmarkCache || faceLandmarkCache.length === 0) return;

        // Select landmark indices based on mode
        let indices = null;
        if (currentMode === 15) indices = FACE_EYES_INDICES;
        else if (currentMode === 16) indices = FACE_LIPS_INDICES;
        // mode 17 (FACE) uses all landmarks — indices stays null

        let candidates = [];
        for (let faceIdx = 0; faceIdx < faceLandmarkCache.length; faceIdx++) {
            const landmarks = faceLandmarkCache[faceIdx];
            const landmarkList = indices
                ? indices.filter(i => i < landmarks.length).map(i => landmarks[i])
                : landmarks;

            for (const lm of landmarkList) {
                // MediaPipe landmarks are normalized [0,1]
                let vx = Math.floor(lm.x * w);
                let vy = Math.floor(lm.y * h);
                vx = Math.max(0, Math.min(w - 1, vx));
                vy = Math.max(0, Math.min(h - 1, vy));

                // Sample video pixel color at landmark position
                let idx = (vx + vy * w) * 4;
                let r = videoEl.pixels[idx], g = videoEl.pixels[idx + 1], b = videoEl.pixels[idx + 2];
                candidates.push(new CandidatePoint(vx, vy, color(r, g, b)));
            }
        }

        // Spectrum param: add interpolated points between landmarks for density
        let spectrum = map(paramValues[1], 0, 100, 0, 70);
        if (spectrum > 20 && candidates.length > 1) {
            let extras = [];
            let numExtras = Math.floor(map(spectrum, 20, 70, 0, candidates.length * 2));
            for (let i = 0; i < numExtras; i++) {
                let a = candidates[Math.floor(Math.random() * candidates.length)];
                let b_pt = candidates[Math.floor(Math.random() * candidates.length)];
                let t = Math.random();
                let mx = Math.floor(a.x + (b_pt.x - a.x) * t);
                let my = Math.floor(a.y + (b_pt.y - a.y) * t);
                mx = Math.max(0, Math.min(w - 1, mx));
                my = Math.max(0, Math.min(h - 1, my));
                let idx = (mx + my * w) * 4;
                let r = videoEl.pixels[idx], g = videoEl.pixels[idx + 1], b_v = videoEl.pixels[idx + 2];
                extras.push(new CandidatePoint(mx, my, color(r, g, b_v)));
            }
            candidates.push(...extras);
        }

        shuffleArray(candidates);
        let quantityLevel = paramValues[0];
        let numPoints = (quantityLevel <= 10) ? floor(quantityLevel) : floor(map(quantityLevel, 11, 100, 11, candidates.length));
        numPoints = min(numPoints, candidates.length);
        let blobVarLevel = paramValues[6];

        for (let i = 0; i < numPoints; i++) {
            let c = candidates[i];
            let sc = videoToScreenCoords(c.x, c.y);
            trackedPoints.push(new TrackedPoint(sc.x, sc.y, c.c, blobVarLevel));
        }
        return;
    }

    // MASK mode: AI re-segmentation — use mask directly for blob placement
    if (currentMode === 14 && maskReady && maskSegData && maskClickNorm) {
        videoEl.loadPixels();
        if (videoEl.pixels.length === 0) return;
        const w = videoEl.width, h = videoEl.height;

        // Adaptive re-segmentation: interval adjusts based on centroid drift
        maskFrameCount++;
        if (maskFrameCount >= maskResegInterval && window.mpSegmenterReady) {
            maskFrameCount = 0;
            maskSegmentWithPoint(maskClickNorm.x, maskClickNorm.y, false, 'replace');
        }

        // Use current mask to generate blob candidates
        let gridSize = 15;
        if (w > 1280) gridSize = 30;
        let candidates = [];
        const scaleX = maskSegW / w;
        const scaleY = maskSegH / h;

        for (let y = 0; y < h; y += gridSize) {
            for (let x = 0; x < w; x += gridSize) {
                let mx = Math.min(Math.floor(x * scaleX), maskSegW - 1);
                let my = Math.min(Math.floor(y * scaleY), maskSegH - 1);
                let maskVal = maskSegData[my * maskSegW + mx];
                if (maskVal > 0) {
                    // Soft density: probabilistically thin blobs at feathered edges
                    if (maskConfData) {
                        let conf = maskConfData[my * maskSegW + mx];
                        if (conf < 0.8 && Math.random() > conf) continue;
                    }
                    let idx = (x + y * w) * 4;
                    let r = videoEl.pixels[idx], g = videoEl.pixels[idx+1], b = videoEl.pixels[idx+2];
                    candidates.push(new CandidatePoint(x, y, color(r, g, b)));
                }
            }
        }

        shuffleArray(candidates);
        let quantityLevel = paramValues[0];
        let numPoints = (quantityLevel <= 10) ? floor(quantityLevel) : floor(map(quantityLevel, 11, 100, 11, candidates.length));
        numPoints = min(numPoints, candidates.length);
        let blobVarLevel = paramValues[6];
        for (let i = 0; i < numPoints; i++) {
            let c = candidates[i];
            let sc = videoToScreenCoords(c.x, c.y);
            trackedPoints.push(new TrackedPoint(sc.x, sc.y, c.c, blobVarLevel));
        }
        return;
    }

    // Pixel-based tracking modes (1-13) need pixel data
    videoEl.loadPixels();
    if (videoEl.pixels.length === 0) return;

    let candidates = [];
    let spectrum = map(paramValues[1], 0, 100, 0, 70);
    let gridSize = 15;
    const w = videoEl.width; const h = videoEl.height;
    if (w > 1280) gridSize = 30;

    let newGridPixels = {};

    for (let y = 0; y < h; y += gridSize) {
        for (let x = 0; x < w; x += gridSize) {
            let index = (x + y * w) * 4;
            let r = videoEl.pixels[index], g = videoEl.pixels[index+1], b = videoEl.pixels[index+2];
            let c = color(r, g, b);
            let hVal = hue(c), sVal = saturation(c), bVal = brightness(c);
            let validColor = false;

            if (currentMode === 1 && hVal > 100 && hVal < 260 && sVal > 20 && bVal > 20 && abs(hVal - 210) <= spectrum) validColor = true;
            else if (currentMode === 2 && sVal > 20 && bVal > 20) {
                let redDist = hVal > 180 ? 360 - hVal : hVal;
                if (redDist <= max(spectrum, 15)) validColor = true;
            }

            // MOTION: compare to previous frame — RGB distance exceeds threshold
            else if (currentMode === 3) {
                let key = x + ',' + y;
                newGridPixels[key] = { r: r, g: g, b: b };
                let prev = prevGridPixels[key];
                if (prev) {
                    let dist = Math.sqrt((r - prev.r) ** 2 + (g - prev.g) ** 2 + (b - prev.b) ** 2);
                    let motionThresh = map(spectrum, 0, 70, 10, 180);
                    if (dist > motionThresh) validColor = true;
                }
            }

            // SKIN: detect skin tones
            else if (currentMode === 4) {
                let hueTol = map(spectrum, 0, 70, 0, 25);
                let skinLow = -hueTol;
                let skinHigh = 50 + hueTol;
                let inHue = (hVal >= 0 && hVal <= skinHigh) || (skinLow < 0 && hVal >= (360 + skinLow));
                if (inHue && sVal >= 15 && sVal <= 75 && bVal >= 30 && bVal <= 90) {
                    validColor = true;
                }
            }

            // CUSTOM: track user-selected hue within spectrum tolerance
            else if (currentMode === 5) {
                let hueDist = abs(hVal - customHue);
                if (hueDist > 180) hueDist = 360 - hueDist;
                if (hueDist <= spectrum && sVal > 15 && bVal > 15) validColor = true;
            }

            // BRIGHT: track brightest pixels
            else if (currentMode === 6) {
                let briThresh = map(spectrum, 0, 70, 95, 40);
                if (bVal > briThresh) validColor = true;
            }

            // DARK: track darkest pixels
            else if (currentMode === 7) {
                let darkThresh = map(spectrum, 0, 70, 5, 50);
                if (bVal < darkThresh && bVal > 0) validColor = true;
            }

            // EDGE: gradient magnitude between neighboring pixels
            else if (currentMode === 8) {
                if (x + 1 < w && y + 1 < h) {
                    let idxR = ((x + 1) + y * w) * 4;
                    let idxB = (x + (y + 1) * w) * 4;
                    let gx = Math.abs(r - videoEl.pixels[idxR]) + Math.abs(g - videoEl.pixels[idxR+1]) + Math.abs(b - videoEl.pixels[idxR+2]);
                    let gy = Math.abs(r - videoEl.pixels[idxB]) + Math.abs(g - videoEl.pixels[idxB+1]) + Math.abs(b - videoEl.pixels[idxB+2]);
                    let gradient = (gx + gy) / 6;
                    let edgeThresh = map(spectrum, 0, 70, 80, 10);
                    if (gradient > edgeThresh) validColor = true;
                }
            }

            // CHROMA: track most saturated pixels
            else if (currentMode === 9) {
                let satThresh = map(spectrum, 0, 70, 80, 20);
                if (sVal > satThresh && bVal > 15) validColor = true;
            }

            // WARM: reds, oranges, yellows (hue 0-60° + 300-360°)
            else if (currentMode === 10) {
                let warmTol = map(spectrum, 0, 70, 0, 30);
                if ((hVal <= 60 + warmTol || hVal >= 300 - warmTol) && sVal > 15 && bVal > 15) validColor = true;
            }

            // COOL: blues, greens, purples (hue 150-270°)
            else if (currentMode === 11) {
                let coolTol = map(spectrum, 0, 70, 0, 40);
                if (hVal >= 150 - coolTol && hVal <= 270 + coolTol && sVal > 15 && bVal > 15) validColor = true;
            }

            // FLICKER: pixels that change rapidly over multiple frames
            else if (currentMode === 12) {
                let key = x + ',' + y;
                newGridPixels[key] = { r: r, g: g, b: b };
                let prev = prevGridPixels[key];
                if (prev) {
                    let dist = Math.sqrt((r - prev.r) ** 2 + (g - prev.g) ** 2 + (b - prev.b) ** 2);
                    if (dist > 25) {
                        flickerScores[key] = Math.min((flickerScores[key] || 0) + 0.35, 1.0);
                    } else {
                        flickerScores[key] = (flickerScores[key] || 0) * 0.7;
                    }
                }
                let flickThresh = map(spectrum, 0, 70, 0.3, 0.8);
                if ((flickerScores[key] || 0) > flickThresh) validColor = true;
            }

            // INVERT: complement of custom hue
            else if (currentMode === 13) {
                let invertHue = (customHue + 180) % 360;
                let hueDist = abs(hVal - invertHue);
                if (hueDist > 180) hueDist = 360 - hueDist;
                if (hueDist <= spectrum && sVal > 15 && bVal > 15) validColor = true;
            }

            if (validColor) candidates.push(new CandidatePoint(x, y, c));

            // Always store current pixels for motion/flicker modes
            if (currentMode !== 3 && currentMode !== 12) {
                let key = x + ',' + y;
                newGridPixels[key] = { r: r, g: g, b: b };
            }
        }
    }
    prevGridPixels = newGridPixels;
    shuffleArray(candidates);
    let quantityLevel = paramValues[0];
    let numPoints = (quantityLevel <= 10) ? floor(quantityLevel) : floor(map(quantityLevel, 11, 100, 11, candidates.length));
    numPoints = min(numPoints, candidates.length);
    let blobVarLevel = paramValues[6];

    for (let i = 0; i < numPoints; i++) {
        let c = candidates[i];
        let sc = videoToScreenCoords(c.x, c.y);
        trackedPoints.push(new TrackedPoint(sc.x, sc.y, c.c, blobVarLevel));
    }
}

function drawLines() {
    if (trackedPoints.length < 2) return;
    let opacity = map(paramValues[2], 0, 100, 0, 255);
    let c = color(lineColor);
    let lr = red(c), lg = green(c), lb = blue(c);
    stroke(lr, lg, lb, opacity);
    strokeWeight(lineWeight);
    noFill();
    if (lineDashed) drawingContext.setLineDash([8, 4]);

    if (connectionMode === 'hub') {
        // All lines route through canvas center
        let cx = width / 2, cy = height / 2;
        for (let p of trackedPoints) {
            line(p.posicao.x, p.posicao.y, cx, cy);
        }
    } else if (connectionMode === 'web') {
        // Connect nearby blobs (constellation/web look)
        let maxD = Math.min(width, height) * 0.3;
        let pts = trackedPoints;
        let len = Math.min(pts.length, 80); // cap for perf
        for (let i = 0; i < len; i++) {
            for (let j = i + 1; j < len; j++) {
                let dx = pts[i].posicao.x - pts[j].posicao.x;
                let dy = pts[i].posicao.y - pts[j].posicao.y;
                let d = Math.sqrt(dx*dx + dy*dy);
                if (d < maxD) {
                    let a = map(d, 0, maxD, opacity, 0);
                    stroke(lr, lg, lb, a);
                    line(pts[i].posicao.x, pts[i].posicao.y, pts[j].posicao.x, pts[j].posicao.y);
                }
            }
        }
    } else {
        // Chain mode (default — connect in point order)
        let curvatureLevel = lineStraight ? 0 : paramValues[3];
        beginShape();
        if (curvatureLevel === 0) {
            for (let p of trackedPoints) vertex(p.posicao.x, p.posicao.y);
        } else {
            let expFactor = pow(curvatureLevel / 100.0, 2.5);
            let chaosAmp = map(expFactor, 0, 1, 0, 120);
            let breakAmp = map(curvatureLevel, 60, 100, 0, 40);
            let timeFactor = frameCount * 0.01;
            curveVertex(trackedPoints[0].posicao.x, trackedPoints[0].posicao.y);
            for (let p of trackedPoints) {
                let nX1 = noise(p.posicao.x * 0.005, p.posicao.y * 0.005, timeFactor);
                let nY1 = noise(p.posicao.x * 0.005, p.posicao.y * 0.005, timeFactor + 100);
                let oX1 = map(nX1, 0, 1, -chaosAmp, chaosAmp);
                let oY1 = map(nY1, 0, 1, -chaosAmp, chaosAmp);
                let nX2 = noise(p.posicao.x * 0.1, p.posicao.y * 0.1, timeFactor + 200);
                let nY2 = noise(p.posicao.x * 0.1, p.posicao.y * 0.1, timeFactor + 300);
                let oX2 = map(nX2, 0, 1, -breakAmp, breakAmp);
                let oY2 = map(nY2, 0, 1, -breakAmp, breakAmp);
                curveVertex(p.posicao.x + oX1 + oX2, p.posicao.y + oY1 + oY2);
            }
            let last = trackedPoints[trackedPoints.length - 1];
            curveVertex(last.posicao.x, last.posicao.y);
        }
        endShape();
    }

    if (lineDashed) drawingContext.setLineDash([]);
}

function drawPointInfo(p) {
    if (activeVizModes.size === 0) return;

    let colorSquareSize = 24;
    let fontColor = color(255, 200);
    let offsetX = p.posicao.x + 12;
    let curY = p.posicao.y + 4;
    let modes = [...activeVizModes].sort((a, b) => a - b);

    for (let vizMode of modes) {
        fill(fontColor); noStroke(); textSize(11);

        if (vizMode === 0) { // XY
            text(`x${p.posicao.x.toFixed(0)},y${p.posicao.y.toFixed(0)}`, offsetX, curY);
            curY += 14;
        }
        else if (vizMode === 1) { // RGB
            let r = red(p.cor), g = green(p.cor), b = blue(p.cor);
            text(`R:${r.toFixed(0)} G:${g.toFixed(0)} B:${b.toFixed(0)}`, offsetX, curY);
            curY += 4;
            fill(p.cor); rectMode(CORNER);
            rect(offsetX, curY, colorSquareSize, colorSquareSize);
            curY += colorSquareSize + 6;
        }
        else if (vizMode === 2) { // SAT
            text(`st: ${saturation(p.cor).toFixed(0)}%`, offsetX, curY);
            curY += 14;
        }
        else if (vizMode === 3) { // TXT
            text(p.dynamicWord, offsetX, curY);
            curY += 14;
        }
        else if (vizMode === 4) { // HUE
            text(`hue: ${hue(p.cor).toFixed(0)}\u00B0`, offsetX, curY);
            curY += 14;
        }
        else if (vizMode === 5) { // HEX
            let rr = red(p.cor), gg = green(p.cor), bb = blue(p.cor);
            let hex = '#' + [rr, gg, bb].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
            text(hex, offsetX, curY);
            curY += 14;
        }
        else if (vizMode === 6) { // BRI
            text(`bri: ${brightness(p.cor).toFixed(0)}%`, offsetX, curY);
            curY += 14;
        }
        else if (vizMode === 8) { // TAG
            push();
            textSize(8); textStyle(BOLD); fill(255, 200);
            if (productInfo.brand) { text(productInfo.brand.toUpperCase(), offsetX, curY); curY += 11; }
            textStyle(NORMAL); textSize(10);
            if (productInfo.name) { text(productInfo.name, offsetX, curY); curY += 12; }
            textSize(8); fill(200, 160);
            let tagDetails = [productInfo.material, productInfo.size].filter(Boolean).join(' \u00B7 ');
            if (tagDetails) { text(tagDetails, offsetX, curY); curY += 11; }
            fill(255, 220); textStyle(BOLD);
            if (productInfo.price) { text(productInfo.price, offsetX, curY); curY += 11; }
            textStyle(NORMAL);
            pop();
            curY += 4;
        }
        else if (vizMode === 9) { // PLT
            push();
            let chipSize = 26;
            fill(p.cor); noStroke(); rectMode(CORNER);
            rect(offsetX, curY, chipSize, chipSize);
            noFill(); stroke(255, 100); strokeWeight(0.5);
            rect(offsetX, curY, chipSize, chipSize);
            let pr = red(p.cor), pg = green(p.cor), pb = blue(p.cor);
            let pHex = '#' + [pr, pg, pb].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
            noStroke(); fill(255, 160); textSize(8);
            text(pHex, offsetX, curY + chipSize + 10);
            pop();
            curY += chipSize + 16;
        }
    }
}

// ── BLOB STYLE RENDERING ──────────────────────────

function drawBlobStyle(p, w, h, tbc, alpha, weight) {
    let r = red(tbc), g = green(tbc), b = blue(tbc);
    let a = alpha !== undefined ? alpha : 255;
    let wt = weight || trackBoxWeight;
    let px = p.posicao.x, py = p.posicao.y;

    switch (blobStyle) {
        case 'lframe':   _drawLFrame(px, py, w, h, r, g, b, a, wt); break;
        case 'xframe':   _drawXFrame(px, py, w, h, r, g, b, a, wt); break;
        case 'scope':    _drawScope(px, py, w, h, r, g, b, a, wt); break;
        case 'win2k':    _drawWin2K(px, py, w, h, r, g, b, a, wt, p); break;
        case 'grid':     _drawGrid(px, py, w, h, r, g, b, a, wt); break;
        case 'dash':     _drawDash(px, py, w, h, r, g, b, a, wt); break;
        case 'glow':     _drawGlow(px, py, w, h, r, g, b, a, wt); break;
        case 'particle': _drawParticleSpawn(px, py, r, g, b); break;
        default: // box
            stroke(r, g, b, a); noFill(); strokeWeight(wt); rectMode(CENTER);
            rect(px, py, w, h);
    }
}

function _drawLFrame(px, py, w, h, r, g, b, a, wt) {
    let x1 = px - w/2, y1 = py - h/2;
    let x2 = px + w/2, y2 = py + h/2;
    let len = Math.min(w, h) * 0.25;
    stroke(r, g, b, a); strokeWeight(wt); noFill();
    // Top-left
    line(x1, y1, x1 + len, y1); line(x1, y1, x1, y1 + len);
    // Top-right
    line(x2, y1, x2 - len, y1); line(x2, y1, x2, y1 + len);
    // Bottom-left
    line(x1, y2, x1 + len, y2); line(x1, y2, x1, y2 - len);
    // Bottom-right
    line(x2, y2, x2 - len, y2); line(x2, y2, x2, y2 - len);
}

function _drawXFrame(px, py, w, h, r, g, b, a, wt) {
    let hw = w/2, hh = h/2;
    stroke(r, g, b, a); strokeWeight(wt); noFill();
    // Diagonals from corners
    line(px - hw, py - hh, px + hw, py + hh);
    line(px + hw, py - hh, px - hw, py + hh);
    // Center diamond
    let d = Math.min(w, h) * 0.15;
    line(px - d, py, px, py - d); line(px, py - d, px + d, py);
    line(px + d, py, px, py + d); line(px, py + d, px - d, py);
}

function _drawScope(px, py, w, h, r, g, b, a, wt) {
    let rad = Math.min(w, h) / 2;
    stroke(r, g, b, a); strokeWeight(wt); noFill();
    ellipse(px, py, rad * 2, rad * 2);
    // Crosshair with gap
    let ext = rad * 1.3, gap = rad * 0.3;
    line(px - ext, py, px - gap, py); line(px + gap, py, px + ext, py);
    line(px, py - ext, px, py - gap); line(px, py + gap, px, py + ext);
    // Tick marks
    let tk = rad * 0.1;
    strokeWeight(wt * 0.6);
    line(px - rad, py - tk, px - rad, py + tk);
    line(px + rad, py - tk, px + rad, py + tk);
    line(px - tk, py - rad, px + tk, py - rad);
    line(px - tk, py + rad, px + tk, py + rad);
    // Center dot
    fill(r, g, b, a); noStroke(); circle(px, py, 3);
}

function _drawWin2K(px, py, w, h, r, g, b, a, wt, pt) {
    // Enforce minimum size for Win2K chrome
    w = Math.max(w, 80); h = Math.max(h, 50);
    let ctx = drawingContext;
    let x = px - w/2, y = py - h/2;
    let titleH = Math.min(20, Math.max(14, h * 0.18));
    ctx.save();

    // Outer 3D raised border
    ctx.lineWidth = 1;
    // Highlight (top-left)
    ctx.strokeStyle = '#FFFFFF';
    ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y); ctx.lineTo(x + w, y); ctx.stroke();
    // Shadow (bottom-right)
    ctx.strokeStyle = '#404040';
    ctx.beginPath(); ctx.moveTo(x + w, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.stroke();
    // Inner highlight
    ctx.strokeStyle = '#D4D0C8';
    ctx.beginPath(); ctx.moveTo(x+1, y+h-1); ctx.lineTo(x+1, y+1); ctx.lineTo(x+w-1, y+1); ctx.stroke();
    // Inner shadow
    ctx.strokeStyle = '#808080';
    ctx.beginPath(); ctx.moveTo(x+w-1, y+1); ctx.lineTo(x+w-1, y+h-1); ctx.lineTo(x+1, y+h-1); ctx.stroke();

    // Title bar gradient (classic Windows 2000 blue)
    let grad = ctx.createLinearGradient(x+2, 0, x+w-2, 0);
    grad.addColorStop(0, '#0A246A');
    grad.addColorStop(1, '#A6CAF0');
    ctx.fillStyle = grad;
    ctx.fillRect(x+2, y+2, w-4, titleH);

    // Title text
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold ' + Math.round(titleH * 0.65) + 'px Tahoma, "MS Sans Serif", sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    let title = pt.dynamicWord || ('blob_' + Math.round(px) + '.exe');
    ctx.fillText(title, x+4, y+2+titleH/2, w-50);

    // Window buttons: close, maximize, minimize
    let bs = Math.min(titleH - 4, 14);
    let by = y + 2 + (titleH - bs) / 2;
    // Close (X)
    let bx = x + w - 4 - bs;
    _win2kButton(ctx, bx, by, bs);
    ctx.strokeStyle = '#000000'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bx+3, by+3); ctx.lineTo(bx+bs-3, by+bs-3);
    ctx.moveTo(bx+bs-3, by+3); ctx.lineTo(bx+3, by+bs-3);
    ctx.stroke();
    // Maximize
    bx -= bs + 2;
    _win2kButton(ctx, bx, by, bs);
    ctx.strokeStyle = '#000000'; ctx.lineWidth = 1;
    ctx.strokeRect(bx+3, by+3, bs-6, bs-6);
    ctx.fillStyle = '#000000'; ctx.fillRect(bx+3, by+3, bs-6, 2);
    // Minimize
    bx -= bs + 2;
    _win2kButton(ctx, bx, by, bs);
    ctx.fillStyle = '#000000'; ctx.fillRect(bx+3, by+bs-5, bs-6, 2);

    // Client area background (semi-transparent gray)
    ctx.fillStyle = 'rgba(192,192,192,0.15)';
    ctx.fillRect(x+2, y+2+titleH, w-4, h-4-titleH);

    ctx.restore();
}

function _win2kButton(ctx, x, y, sz) {
    ctx.fillStyle = '#C0C0C0';
    ctx.fillRect(x, y, sz, sz);
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y+sz); ctx.lineTo(x, y); ctx.lineTo(x+sz, y); ctx.stroke();
    ctx.strokeStyle = '#808080';
    ctx.beginPath(); ctx.moveTo(x+sz, y); ctx.lineTo(x+sz, y+sz); ctx.lineTo(x, y+sz); ctx.stroke();
}

function _drawGrid(px, py, w, h, r, g, b, a, wt) {
    let x1 = px - w/2, y1 = py - h/2;
    stroke(r, g, b, a); strokeWeight(wt); noFill(); rectMode(CORNER);
    rect(x1, y1, w, h);
    // 3×3 grid lines
    stroke(r, g, b, a * 0.4); strokeWeight(wt * 0.5);
    for (let i = 1; i < 3; i++) {
        let gx = x1 + (w * i / 3);
        let gy = y1 + (h * i / 3);
        line(gx, y1, gx, y1 + h);
        line(x1, gy, x1 + w, gy);
    }
    // Center crosshair
    stroke(r, g, b, a * 0.6); strokeWeight(wt * 0.3);
    let cx = px, cy = py, m = Math.min(w, h) * 0.08;
    line(cx - m, cy, cx + m, cy); line(cx, cy - m, cx, cy + m);
}

function _drawDash(px, py, w, h, r, g, b, a, wt) {
    let ctx = drawingContext;
    ctx.save();
    ctx.setLineDash([8, 4]);
    ctx.strokeStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + (a/255) + ')';
    ctx.lineWidth = wt;
    ctx.strokeRect(px - w/2, py - h/2, w, h);
    ctx.restore();
}

function _drawGlow(px, py, w, h, r, g, b, a, wt) {
    let ctx = drawingContext;
    ctx.save();
    ctx.shadowColor = 'rgba(' + r + ',' + g + ',' + b + ',' + (a/255) + ')';
    ctx.shadowBlur = Math.max(15, Math.min(w, h) * 0.3);
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + (a/255) + ')';
    ctx.lineWidth = wt;
    // Draw twice for stronger glow
    ctx.strokeRect(px - w/2, py - h/2, w, h);
    ctx.strokeRect(px - w/2, py - h/2, w, h);
    ctx.restore();
}

function _drawParticleSpawn(px, py, r, g, b) {
    if (_blobParticles.length < _MAX_PARTICLES) {
        for (let i = 0; i < 2; i++) {
            let angle = Math.random() * Math.PI * 2;
            let speed = 0.5 + Math.random() * 2;
            _blobParticles.push({
                x: px, y: py,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1.0,
                decay: 0.008 + Math.random() * 0.02,
                r: r, g: g, b: b,
                sz: 2 + Math.random() * 4
            });
        }
    }
}

function _updateBlobParticles() {
    let ctx = drawingContext;
    for (let i = _blobParticles.length - 1; i >= 0; i--) {
        let pt = _blobParticles[i];
        pt.x += pt.vx; pt.y += pt.vy;
        pt.vy += 0.02; // slight gravity
        pt.life -= pt.decay;
        if (pt.life <= 0) { _blobParticles.splice(i, 1); continue; }
        ctx.fillStyle = 'rgba(' + pt.r + ',' + pt.g + ',' + pt.b + ',' + (pt.life * 0.8) + ')';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.sz * pt.life, 0, Math.PI * 2);
        ctx.fill();
    }
}
