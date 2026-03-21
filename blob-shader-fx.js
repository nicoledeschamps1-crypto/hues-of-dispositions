// ═══════════════════════════════════════════════════════════════
// blob-shader-fx.js — WebGL2 GPU Shader Effects Pipeline
// Phase 1: 10 Core Effects ported to GLSL
// ═══════════════════════════════════════════════════════════════
// Architecture: Separate WebGL2 context (not p5's Canvas2D).
// Takes p5 canvas as input texture, runs shader chain via
// ping-pong framebuffers, writes result back to p5 canvas.
// CPU effect functions are automatically skipped for effects
// that have GPU shader versions when the pipeline is active.
// ═══════════════════════════════════════════════════════════════

'use strict';

// ── Fullscreen quad vertex shader (shared by all effects) ──
const VERT_PASSTHROUGH = `#version 300 es
precision highp float;
in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_texCoord;
void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
}`;

// ── Passthrough fragment shader ──
const FRAG_PASSTHROUGH = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
out vec4 fragColor;
void main() {
    fragColor = texture(u_texture, v_texCoord);
}`;


// ═══════════════════════════════════════════════════════════════
// GLSL Fragment Shaders — Phase 1 Core Effects
// ═══════════════════════════════════════════════════════════════

// ── 1. Bloom ─────────────────────────────────────────────────
// Single-pass bloom using Fibonacci disc sampling.
// Extracts bright pixels, blurs with weighted disc, blends back.
const FRAG_BLOOM = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_intensity;   // 0–1
uniform float u_threshold;   // 0–1
uniform float u_radius;      // 0–1 → maps to pixel spread
out vec4 fragColor;

void main() {
    vec4 original = texture(u_texture, v_texCoord);
    vec2 texel = 1.0 / u_resolution;
    float maxRad = u_radius * 20.0;

    vec3 bloom = vec3(0.0);
    float totalW = 0.0;
    const float GOLDEN_ANGLE = 2.39996323;
    const int SAMPLES = 32;

    for (int i = 0; i < SAMPLES; i++) {
        float r = sqrt(float(i) + 0.5) / sqrt(float(SAMPLES)) * maxRad;
        float theta = float(i) * GOLDEN_ANGLE;
        vec2 offset = vec2(cos(theta), sin(theta)) * r * texel;
        vec3 s = texture(u_texture, v_texCoord + offset).rgb;
        float lum = dot(s, vec3(0.299, 0.587, 0.114));
        if (lum > u_threshold) {
            float w = 1.0 - r / (maxRad + 0.001);
            bloom += s * w;
            totalW += w;
        }
    }
    if (totalW > 0.0) bloom /= totalW;
    fragColor = vec4(clamp(original.rgb + bloom * u_intensity, 0.0, 1.0), 1.0);
}`;


// ── 2. Blur / Sharpen ────────────────────────────────────────
// Gaussian-weighted 9-tap blur. Negative amount → unsharp mask.
const FRAG_BLUR_SHARP = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_amount;  // -100..+100: negative=sharpen, positive=blur
out vec4 fragColor;

void main() {
    vec2 texel = 1.0 / u_resolution;
    float radius = max(1.0, abs(u_amount) / 20.0);
    vec2 off = texel * radius;

    // 3x3 gaussian-weighted blur
    vec3 blur = vec3(0.0);
    blur += texture(u_texture, v_texCoord + vec2(-off.x, -off.y)).rgb * 0.0625;
    blur += texture(u_texture, v_texCoord + vec2(   0.0, -off.y)).rgb * 0.125;
    blur += texture(u_texture, v_texCoord + vec2( off.x, -off.y)).rgb * 0.0625;
    blur += texture(u_texture, v_texCoord + vec2(-off.x,    0.0)).rgb * 0.125;
    blur += texture(u_texture, v_texCoord).rgb * 0.25;
    blur += texture(u_texture, v_texCoord + vec2( off.x,    0.0)).rgb * 0.125;
    blur += texture(u_texture, v_texCoord + vec2(-off.x,  off.y)).rgb * 0.0625;
    blur += texture(u_texture, v_texCoord + vec2(   0.0,  off.y)).rgb * 0.125;
    blur += texture(u_texture, v_texCoord + vec2( off.x,  off.y)).rgb * 0.0625;

    vec3 original = texture(u_texture, v_texCoord).rgb;
    float t = abs(u_amount) / 100.0;

    vec3 result;
    if (u_amount > 0.0) {
        result = mix(original, blur, t);
    } else {
        // Unsharp mask: original + (original - blur) * strength
        result = original + (original - blur) * t * 3.0;
    }
    fragColor = vec4(clamp(result, 0.0, 1.0), 1.0);
}`;


// ── 3. CRT ───────────────────────────────────────────────────
// Combines chroma shift, scanlines, static noise, barrel curve.
const FRAG_CRT = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_chroma;      // 0–10 pixel offset
uniform float u_static;      // 0–1 noise amount
uniform float u_scanWeight;  // scanline darkness
uniform float u_glow;        // 0–1 phosphor glow
uniform float u_curvature;   // 0–1 barrel distortion
out vec4 fragColor;

// Hash-based noise
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    vec2 uv = v_texCoord;

    // Barrel distortion
    if (u_curvature > 0.05) {
        vec2 cc = uv - 0.5;
        float d = dot(cc, cc);
        uv = 0.5 + cc * (1.0 + d * u_curvature * 0.8);
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
            fragColor = vec4(0.0, 0.0, 0.0, 1.0);
            return;
        }
    }

    vec2 texel = 1.0 / u_resolution;

    // Chromatic aberration
    float chrOff = u_chroma * texel.x;
    float r = texture(u_texture, vec2(uv.x + chrOff, uv.y)).r;
    float g = texture(u_texture, uv).g;
    float b = texture(u_texture, vec2(uv.x - chrOff, uv.y)).b;
    vec3 col = vec3(r, g, b);

    // Scanlines
    if (u_scanWeight > 0.0) {
        float scanline = sin(uv.y * u_resolution.y * 3.14159) * 0.5 + 0.5;
        col *= 1.0 - (1.0 - scanline) * u_scanWeight * 0.3;
    }

    // Static noise
    if (u_static > 0.0) {
        float n = hash(uv * u_resolution + vec2(u_time * 1000.0));
        if (n > 1.0 - u_static * 0.3) {
            col += vec3(n * 0.25 * u_static);
        }
    }

    // Phosphor glow (simple bloom)
    if (u_glow > 0.2) {
        vec3 glow = vec3(0.0);
        float gStr = u_glow * 0.15;
        for (int i = -2; i <= 2; i++) {
            for (int j = -2; j <= 2; j++) {
                if (i == 0 && j == 0) continue;
                glow += texture(u_texture, uv + vec2(float(i), float(j)) * texel * 2.0).rgb;
            }
        }
        col += glow / 24.0 * gStr;
    }

    // Curvature vignette
    if (u_curvature > 0.05) {
        vec2 cc = uv - 0.5;
        float vig = 1.0 - dot(cc, cc) * u_curvature * 3.0;
        col *= clamp(vig, 0.0, 1.0);
    }

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;


// ── 4. Vignette ──────────────────────────────────────────────
const FRAG_VIGNETTE = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_intensity;  // 0–1
uniform float u_radius;     // 0–1 (inner radius fraction)
uniform vec3 u_color;       // vignette color (0–1 per channel)
out vec4 fragColor;

void main() {
    vec4 col = texture(u_texture, v_texCoord);
    vec2 cc = v_texCoord - 0.5;
    float dist = length(cc) * 2.0;  // 0 at center, ~1.41 at corners
    float inner = u_radius * 0.8;
    float outer = 0.9 + (1.0 - u_radius) * 0.5;
    float vig = smoothstep(inner, outer, dist);
    col.rgb = mix(col.rgb, u_color, vig * u_intensity);
    fragColor = col;
}`;


// ── 5. Duotone ───────────────────────────────────────────────
const FRAG_DUOTONE = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec3 u_shadow;     // shadow color (0–1)
uniform vec3 u_highlight;  // highlight color (0–1)
uniform float u_intensity; // 0–1 blend
out vec4 fragColor;

void main() {
    vec4 col = texture(u_texture, v_texCoord);
    float lum = dot(col.rgb, vec3(0.299, 0.587, 0.114));
    vec3 duo = mix(u_shadow, u_highlight, lum);
    col.rgb = mix(col.rgb, duo, u_intensity);
    fragColor = col;
}`;


// ── 6. Chromatic Aberration ──────────────────────────────────
const FRAG_CHROMATIC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_offset;  // pixel offset amount
uniform float u_radial;  // 0 = linear, 1 = radial
out vec4 fragColor;

void main() {
    vec2 texel = 1.0 / u_resolution;

    if (u_radial > 0.5) {
        // Radial: offset channels radially from center
        vec2 cc = v_texCoord - 0.5;
        float dist = length(cc);
        vec2 dir = normalize(cc + 0.0001);
        float radOff = dist * u_offset * texel.x * 2.0;
        float r = texture(u_texture, v_texCoord + dir * radOff).r;
        float g = texture(u_texture, v_texCoord).g;
        float b = texture(u_texture, v_texCoord - dir * radOff).b;
        fragColor = vec4(r, g, b, 1.0);
    } else {
        // Linear: horizontal R/B shift
        float off = u_offset * texel.x;
        float r = texture(u_texture, vec2(v_texCoord.x + off, v_texCoord.y)).r;
        float g = texture(u_texture, v_texCoord).g;
        float b = texture(u_texture, vec2(v_texCoord.x - off, v_texCoord.y)).b;
        fragColor = vec4(r, g, b, 1.0);
    }
}`;


// ── 7. Noise / Film Grain ────────────────────────────────────
const FRAG_NOISE = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_intensity;  // 0–1
uniform float u_scale;      // 1–10
uniform float u_mono;       // 1 = mono, 0 = color
out vec4 fragColor;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    vec4 col = texture(u_texture, v_texCoord);
    vec2 cell = floor(v_texCoord * u_resolution / u_scale);
    float seed = floor(u_time * 30.0);  // change every ~33ms

    if (u_mono > 0.5) {
        float n = hash(cell + seed) * 2.0 - 1.0;
        col.rgb += vec3(n) * u_intensity * 0.5;
    } else {
        float nr = hash(cell + seed) * 2.0 - 1.0;
        float ng = hash(cell + seed + 100.0) * 2.0 - 1.0;
        float nb = hash(cell + seed + 200.0) * 2.0 - 1.0;
        col.rgb += vec3(nr, ng, nb) * u_intensity * 0.5;
    }
    fragColor = vec4(clamp(col.rgb, 0.0, 1.0), 1.0);
}`;


// ── 8. Scanlines ─────────────────────────────────────────────
const FRAG_SCANLINES = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_intensity;  // 0–1
uniform float u_count;      // number of lines
uniform float u_vertical;   // 0 = horizontal, 1 = vertical
out vec4 fragColor;

void main() {
    vec4 col = texture(u_texture, v_texCoord);
    float coord = u_vertical > 0.5 ? v_texCoord.x : v_texCoord.y;
    float dim = u_vertical > 0.5 ? u_resolution.x : u_resolution.y;
    float line = sin(coord * u_count * 3.14159) * 0.5 + 0.5;
    col.rgb *= 1.0 - (1.0 - line) * u_intensity;
    fragColor = col;
}`;


// ── 9. Levels ────────────────────────────────────────────────
const FRAG_LEVELS = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_inBlack;   // 0–1 (input black point)
uniform float u_inWhite;   // 0–1 (input white point)
uniform float u_gamma;     // gamma exponent
uniform float u_outBlack;  // 0–1 (output black point)
uniform float u_outWhite;  // 0–1 (output white point)
out vec4 fragColor;

void main() {
    vec4 col = texture(u_texture, v_texCoord);
    float inRange = max(0.001, u_inWhite - u_inBlack);
    float invGamma = u_gamma > 0.0 ? 1.0 / u_gamma : 1.0;
    float outRange = u_outWhite - u_outBlack;

    vec3 v = clamp((col.rgb - u_inBlack) / inRange, 0.0, 1.0);
    v = pow(v, vec3(invGamma));
    v = u_outBlack + v * outRange;

    fragColor = vec4(clamp(v, 0.0, 1.0), 1.0);
}`;


// ── 10. Halftone ─────────────────────────────────────────────
const FRAG_HALFTONE = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_spacing;    // dot grid spacing in pixels
uniform float u_angle;      // rotation in radians
uniform float u_contrast;   // 0–2 brightness contrast
uniform vec3 u_ink;         // ink color (0–1)
uniform vec3 u_paper;       // paper color (0–1)
uniform float u_colorMode;  // 0 = bw, 1 = color
out vec4 fragColor;

void main() {
    vec2 px = v_texCoord * u_resolution;

    // Rotate grid
    float cs = cos(u_angle), sn = sin(u_angle);
    vec2 rotPx = vec2(px.x * cs - px.y * sn, px.x * sn + px.y * cs);

    // Find grid cell center
    vec2 cell = floor(rotPx / u_spacing + 0.5) * u_spacing;
    // Rotate back to get sample position
    vec2 samplePx = vec2(cell.x * cs + cell.y * sn, -cell.x * sn + cell.y * cs);
    vec2 sampleUV = samplePx / u_resolution;

    // Clamp sample UV
    sampleUV = clamp(sampleUV, 0.0, 1.0);
    vec4 sampled = texture(u_texture, sampleUV);

    // Distance from current pixel to dot center (in rotated space)
    float dist = length(rotPx - cell);

    // Brightness → dot size
    float lum = dot(sampled.rgb, vec3(0.299, 0.587, 0.114));
    lum = clamp(0.5 + (lum - 0.5) * u_contrast, 0.0, 1.0);
    float dotRadius = (1.0 - lum) * u_spacing * 0.48;

    if (dist < dotRadius) {
        if (u_colorMode > 0.5) {
            fragColor = vec4(sampled.rgb * 0.8, 1.0);
        } else {
            fragColor = vec4(u_ink, 1.0);
        }
    } else {
        fragColor = vec4(u_paper, 1.0);
    }
}`;


// ═══════════════════════════════════════════════════════════════
// ShaderFX Pipeline Class
// ═══════════════════════════════════════════════════════════════

class ShaderFXPipeline {
    constructor() {
        this.gl = null;
        this.glCanvas = null;
        this.quadVAO = null;
        this.quadVBO = null;
        this.sourceTexture = null;
        this.framebuffers = [null, null]; // ping-pong pair
        this.fbTextures = [null, null];
        this.programs = new Map();       // name → { program, uniforms }
        this.effectChain = [];           // ordered list of effect names to run
        this.activeEffects = new Set();  // which shader effects are enabled
        this.width = 0;
        this.height = 0;
        this.enabled = false;
        this.ready = false;
        this._pingPongIdx = 0;
    }

    // ── Initialize WebGL2 context and core resources ──
    init(width, height) {
        this.width = width;
        this.height = height;

        // Create offscreen canvas for WebGL2
        this.glCanvas = document.createElement('canvas');
        this.glCanvas.width = width;
        this.glCanvas.height = height;
        this.glCanvas.style.display = 'none';

        const gl = this.glCanvas.getContext('webgl2', {
            alpha: false,
            depth: false,
            stencil: false,
            antialias: false,
            premultipliedAlpha: false,
            preserveDrawingBuffer: true
        });

        if (!gl) {
            console.warn('[ShaderFX] WebGL2 not available — GPU effects disabled');
            return false;
        }

        this.gl = gl;
        console.log('[ShaderFX] WebGL2 context created:', gl.getParameter(gl.VERSION));

        // Create fullscreen quad geometry
        this._initQuad();

        // Create source texture (for uploading p5 canvas)
        this.sourceTexture = this._createTexture();

        // Create ping-pong framebuffers
        this._initFramebuffers();

        // Compile passthrough shader
        this.registerEffect('passthrough', VERT_PASSTHROUGH, FRAG_PASSTHROUGH);

        this.ready = true;
        this.enabled = true;
        console.log('[ShaderFX] Pipeline ready (' + width + 'x' + height + ')');
        return true;
    }

    // ── Create fullscreen quad VAO ──
    _initQuad() {
        const gl = this.gl;

        // Two triangles covering clip space, with flipped Y texcoords
        // (canvas pixels are top-down, GL textures are bottom-up)
        const vertices = new Float32Array([
            // pos (x,y)    texcoord (u,v)
            -1, -1,         0, 0,
             1, -1,         1, 0,
            -1,  1,         0, 1,
             1,  1,         1, 1,
        ]);

        this.quadVAO = gl.createVertexArray();
        gl.bindVertexArray(this.quadVAO);

        this.quadVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        // a_position = location 0
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
        // a_texCoord = location 1
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

        gl.bindVertexArray(null);
    }

    // ── Create a GL texture with standard settings ──
    _createTexture() {
        const gl = this.gl;
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        return tex;
    }

    // ── Create ping-pong framebuffer pair ──
    _initFramebuffers() {
        const gl = this.gl;
        for (let i = 0; i < 2; i++) {
            const tex = this._createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.width, this.height,
                          0, gl.RGBA, gl.UNSIGNED_BYTE, null);

            const fbo = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
                                    gl.TEXTURE_2D, tex, 0);

            const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
            if (status !== gl.FRAMEBUFFER_COMPLETE) {
                console.error('[ShaderFX] Framebuffer ' + i + ' incomplete:', status);
            }

            this.framebuffers[i] = fbo;
            this.fbTextures[i] = tex;
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    // ── Compile a single shader ──
    _compileShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const log = gl.getShaderInfoLog(shader);
            console.error('[ShaderFX] Shader compile error:\n' + log);
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    // ── Link a shader program ──
    _linkProgram(vertSrc, fragSrc) {
        const gl = this.gl;
        const vert = this._compileShader(gl.VERTEX_SHADER, vertSrc);
        const frag = this._compileShader(gl.FRAGMENT_SHADER, fragSrc);
        if (!vert || !frag) return null;

        const program = gl.createProgram();
        gl.attachShader(program, vert);
        gl.attachShader(program, frag);

        // Bind attribute locations before linking
        gl.bindAttribLocation(program, 0, 'a_position');
        gl.bindAttribLocation(program, 1, 'a_texCoord');

        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const log = gl.getProgramInfoLog(program);
            console.error('[ShaderFX] Program link error:\n' + log);
            gl.deleteProgram(program);
            return null;
        }

        // Detach and delete individual shaders (program keeps compiled code)
        gl.detachShader(program, vert);
        gl.detachShader(program, frag);
        gl.deleteShader(vert);
        gl.deleteShader(frag);

        return program;
    }

    // ── Register a named effect with its shaders ──
    registerEffect(name, vertSrc, fragSrc) {
        const program = this._linkProgram(vertSrc, fragSrc);
        if (!program) {
            console.error('[ShaderFX] Failed to register effect:', name);
            return false;
        }

        // Cache all active uniform locations
        const gl = this.gl;
        const uniforms = {};
        const numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < numUniforms; i++) {
            const info = gl.getActiveUniform(program, i);
            uniforms[info.name] = {
                location: gl.getUniformLocation(program, info.name),
                type: info.type,
                size: info.size
            };
        }

        this.programs.set(name, { program, uniforms });
        console.log('[ShaderFX] Registered effect:', name,
                    '(' + numUniforms + ' uniforms)');
        return true;
    }

    // ── Set a uniform value on a named effect ──
    setUniform(effectName, uniformName, value) {
        const entry = this.programs.get(effectName);
        if (!entry) return;
        const u = entry.uniforms[uniformName];
        if (!u) return;

        const gl = this.gl;
        gl.useProgram(entry.program);

        switch (u.type) {
            case gl.FLOAT:
                gl.uniform1f(u.location, value);
                break;
            case gl.FLOAT_VEC2:
                gl.uniform2fv(u.location, value);
                break;
            case gl.FLOAT_VEC3:
                gl.uniform3fv(u.location, value);
                break;
            case gl.FLOAT_VEC4:
                gl.uniform4fv(u.location, value);
                break;
            case gl.INT:
            case gl.SAMPLER_2D:
                gl.uniform1i(u.location, value);
                break;
            case gl.FLOAT_MAT3:
                gl.uniformMatrix3fv(u.location, false, value);
                break;
            case gl.FLOAT_MAT4:
                gl.uniformMatrix4fv(u.location, false, value);
                break;
            default:
                gl.uniform1f(u.location, value);
        }
    }

    // ── Set which effects are active and in what order ──
    setEffectChain(effectNames) {
        this.effectChain = effectNames.filter(n => this.programs.has(n));
    }

    // ── Main processing: source canvas → shader chain → output ──
    process(sourceCanvas) {
        if (!this.ready || !this.enabled) return;

        const gl = this.gl;
        const chain = this.effectChain.filter(n => this.activeEffects.has(n));

        // Nothing to do — skip entirely
        if (chain.length === 0) return;

        // Handle resize if needed
        if (sourceCanvas.width !== this.width || sourceCanvas.height !== this.height) {
            this.resize(sourceCanvas.width, sourceCanvas.height);
        }

        // Upload source canvas as texture
        gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);

        // Run shader chain with ping-pong
        this._pingPongIdx = 0;
        let inputTexture = this.sourceTexture;

        for (let i = 0; i < chain.length; i++) {
            const effectName = chain[i];
            const entry = this.programs.get(effectName);
            const isLast = (i === chain.length - 1);

            // Bind output: framebuffer (or screen for last pass)
            if (isLast) {
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                gl.viewport(0, 0, this.width, this.height);
            } else {
                const outIdx = this._pingPongIdx;
                gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[outIdx]);
                gl.viewport(0, 0, this.width, this.height);
            }

            // Use this effect's program
            gl.useProgram(entry.program);

            // Bind input texture to unit 0
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, inputTexture);
            if (entry.uniforms['u_texture']) {
                gl.uniform1i(entry.uniforms['u_texture'].location, 0);
            }

            // Set common uniforms if the shader declares them
            if (entry.uniforms['u_resolution']) {
                gl.uniform2f(entry.uniforms['u_resolution'].location,
                             this.width, this.height);
            }
            if (entry.uniforms['u_time']) {
                gl.uniform1f(entry.uniforms['u_time'].location,
                             performance.now() / 1000.0);
            }

            // Draw fullscreen quad
            gl.bindVertexArray(this.quadVAO);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            gl.bindVertexArray(null);

            // Next pass reads from this pass's output
            if (!isLast) {
                inputTexture = this.fbTextures[this._pingPongIdx];
                this._pingPongIdx = 1 - this._pingPongIdx;
            }
        }

        // Copy WebGL result back to p5's canvas
        // drawImage(glCanvas) is GPU-accelerated in modern browsers
        if (typeof drawingContext !== 'undefined' && drawingContext) {
            drawingContext.drawImage(this.glCanvas, 0, 0);
        }
    }

    // ── Handle canvas resize ──
    resize(w, h) {
        if (w === this.width && h === this.height) return;
        this.width = w;
        this.height = h;
        this.glCanvas.width = w;
        this.glCanvas.height = h;

        // Reallocate framebuffer textures
        const gl = this.gl;
        for (let i = 0; i < 2; i++) {
            gl.bindTexture(gl.TEXTURE_2D, this.fbTextures[i]);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h,
                          0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        }
        console.log('[ShaderFX] Resized to', w, 'x', h);
    }

    // ── Enable/disable a specific shader effect ──
    enableEffect(name) { this.activeEffects.add(name); }
    disableEffect(name) { this.activeEffects.delete(name); }
    toggleEffect(name) {
        if (this.activeEffects.has(name)) this.activeEffects.delete(name);
        else this.activeEffects.add(name);
    }
    isEffectActive(name) { return this.activeEffects.has(name); }

    // ── Cleanup ──
    destroy() {
        if (!this.gl) return;
        const gl = this.gl;

        this.programs.forEach(({ program }) => gl.deleteProgram(program));
        this.programs.clear();

        gl.deleteTexture(this.sourceTexture);
        for (let i = 0; i < 2; i++) {
            gl.deleteTexture(this.fbTextures[i]);
            gl.deleteFramebuffer(this.framebuffers[i]);
        }
        gl.deleteBuffer(this.quadVBO);
        gl.deleteVertexArray(this.quadVAO);

        this.glCanvas.remove();
        this.gl = null;
        this.ready = false;
        this.enabled = false;
        console.log('[ShaderFX] Pipeline destroyed');
    }
}


// ═══════════════════════════════════════════════════════════════
// Shader Effect Registry — maps CPU effect names to GLSL shaders
// and parameter sync functions
// ═══════════════════════════════════════════════════════════════

// Ordered chain: effects run in this order (matches CPU pipeline)
const SHADER_CHAIN_ORDER = [
    'levels',       // color tier
    'duotone',      // color tier
    'chroma',       // distortion tier (chromatic aberration)
    'blursharp',    // distortion tier
    'crt',          // overlay tier
    'bloom',        // pattern tier
    'noise',        // overlay tier
    'halftone',     // hybrid tier → now shader
    'scanlines',    // draw tier → now shader
    'vignette',     // draw tier → now shader
];

// Registry: effect name → { frag shader source, syncParams function }
const SHADER_EFFECT_REGISTRY = {};

// Helper: parse hex color to [r,g,b] floats (0–1)
function _hexToGL(hex) {
    hex = hex || '#000000';
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return [r, g, b];
}

// Register all core shader effects and their parameter sync functions
function registerCoreShaderEffects() {
    const effects = [
        {
            name: 'bloom', frag: FRAG_BLOOM,
            sync: () => {
                shaderFX.setUniform('bloom', 'u_intensity', bloomIntensity / 100);
                shaderFX.setUniform('bloom', 'u_threshold', bloomThreshold / 100);
                shaderFX.setUniform('bloom', 'u_radius', bloomRadius / 100);
            }
        },
        {
            name: 'blursharp', frag: FRAG_BLUR_SHARP,
            sync: () => {
                shaderFX.setUniform('blursharp', 'u_amount', blursharpAmount);
            }
        },
        {
            name: 'crt', frag: FRAG_CRT,
            sync: () => {
                shaderFX.setUniform('crt', 'u_chroma', crtChroma);
                shaderFX.setUniform('crt', 'u_static', crtStatic / 100);
                shaderFX.setUniform('crt', 'u_scanWeight', crtScanWeight);
                shaderFX.setUniform('crt', 'u_glow', crtGlow / 100);
                shaderFX.setUniform('crt', 'u_curvature', crtCurvature / 100);
            }
        },
        {
            name: 'vignette', frag: FRAG_VIGNETTE,
            sync: () => {
                shaderFX.setUniform('vignette', 'u_intensity', vigIntensity / 100);
                shaderFX.setUniform('vignette', 'u_radius', vigRadius / 100);
                const vc = _hexToGL(vigColor);
                shaderFX.setUniform('vignette', 'u_color', vc);
            }
        },
        {
            name: 'duotone', frag: FRAG_DUOTONE,
            sync: () => {
                shaderFX.setUniform('duotone', 'u_shadow', _hexToGL(duoShadow));
                shaderFX.setUniform('duotone', 'u_highlight', _hexToGL(duoHighlight));
                shaderFX.setUniform('duotone', 'u_intensity', duoIntensity / 100);
            }
        },
        {
            name: 'chroma', frag: FRAG_CHROMATIC,
            sync: () => {
                shaderFX.setUniform('chroma', 'u_offset', chromaOffset);
                shaderFX.setUniform('chroma', 'u_radial', chromaMode === 'radial' ? 1.0 : 0.0);
            }
        },
        {
            name: 'noise', frag: FRAG_NOISE,
            sync: () => {
                shaderFX.setUniform('noise', 'u_intensity', noiseIntensity / 100);
                shaderFX.setUniform('noise', 'u_scale', noiseScale);
                shaderFX.setUniform('noise', 'u_mono', noiseColorMode === 'mono' ? 1.0 : 0.0);
            }
        },
        {
            name: 'scanlines', frag: FRAG_SCANLINES,
            sync: () => {
                shaderFX.setUniform('scanlines', 'u_intensity', scanIntensity / 100);
                shaderFX.setUniform('scanlines', 'u_count', scanCount);
                shaderFX.setUniform('scanlines', 'u_vertical', scanVertical ? 1.0 : 0.0);
            }
        },
        {
            name: 'levels', frag: FRAG_LEVELS,
            sync: () => {
                shaderFX.setUniform('levels', 'u_inBlack', levelsInBlack / 255);
                shaderFX.setUniform('levels', 'u_inWhite', levelsInWhite / 255);
                shaderFX.setUniform('levels', 'u_gamma', levelsGamma);
                shaderFX.setUniform('levels', 'u_outBlack', levelsOutBlack / 255);
                shaderFX.setUniform('levels', 'u_outWhite', levelsOutWhite / 255);
            }
        },
        {
            name: 'halftone', frag: FRAG_HALFTONE,
            sync: () => {
                shaderFX.setUniform('halftone', 'u_spacing', halfSpacing);
                shaderFX.setUniform('halftone', 'u_angle', halfAngle * Math.PI / 180);
                shaderFX.setUniform('halftone', 'u_contrast', halfContrast / 50);
                const ink = _hexToGL(halfInverted ? halfPaperColor : halfInkColor);
                const paper = _hexToGL(halfInverted ? halfInkColor : halfPaperColor);
                shaderFX.setUniform('halftone', 'u_ink', ink);
                shaderFX.setUniform('halftone', 'u_paper', paper);
                shaderFX.setUniform('halftone', 'u_colorMode', halfColorMode === 'color' ? 1.0 : 0.0);
            }
        },
    ];

    let count = 0;
    for (const fx of effects) {
        if (shaderFX.registerEffect(fx.name, VERT_PASSTHROUGH, fx.frag)) {
            SHADER_EFFECT_REGISTRY[fx.name] = { sync: fx.sync };
            count++;
        }
    }
    console.log('[ShaderFX] Registered ' + count + '/10 core effects');
    return count;
}

// Sync CPU activeEffects → shader pipeline active set + uniforms
function syncShaderFromCPU() {
    shaderFX.activeEffects.clear();

    if (typeof activeEffects === 'undefined' || !masterFxEnabled) return;

    for (const name of activeEffects) {
        if (SHADER_EFFECT_REGISTRY[name]) {
            shaderFX.enableEffect(name);
            // Sync parameters
            SHADER_EFFECT_REGISTRY[name].sync();
        }
    }
}

// Check if an effect has a GPU shader version
function hasShaderVersion(name) {
    return shaderFX.ready && shaderFX.enabled && !!SHADER_EFFECT_REGISTRY[name];
}


// ═══════════════════════════════════════════════════════════════
// Global instance & integration hooks
// ═══════════════════════════════════════════════════════════════

const shaderFX = new ShaderFXPipeline();

// Call once after p5 setup()
function initShaderFX() {
    if (typeof p5Canvas === 'undefined' || !p5Canvas) {
        console.warn('[ShaderFX] p5Canvas not available — deferring init');
        return false;
    }
    const ok = shaderFX.init(p5Canvas.width, p5Canvas.height);
    if (ok) {
        // Register all 10 core shader effects
        registerCoreShaderEffects();
        // Set effect chain order
        shaderFX.setEffectChain(SHADER_CHAIN_ORDER);
        console.log('[ShaderFX] Phase 1 ready — 10 GPU shader effects available');
    }
    return ok;
}

// Call at end of draw() — syncs from CPU state and processes
function processShaderFX() {
    if (!shaderFX.ready || !shaderFX.enabled) return;
    syncShaderFromCPU();
    if (shaderFX.activeEffects.size === 0) return;
    shaderFX.process(p5Canvas);
}
