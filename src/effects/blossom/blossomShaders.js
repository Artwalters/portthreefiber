// GLSL for the Blossom petal effect.
// Technique reference: Unseen Studio "Blossom" lab — GPGPU petal particles
// attracted to the cursor with curl-noise turbulence.
// Noise based on Ashima Arts webgl-noise (MIT), 4D simplex with derivatives.

export const noise4dGLSL = /* glsl */ `
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
float mod289(float x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
float permute(float x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float taylorInvSqrt(float r) { return 1.79284291400159 - 0.85373472095314 * r; }

vec4 grad4(float j, vec4 ip) {
    const vec4 ones = vec4(1.0, 1.0, 1.0, -1.0);
    vec4 p, s;
    p.xyz = floor(fract(vec3(j) * ip.xyz) * 7.0) * ip.z - 1.0;
    p.w = 1.5 - dot(abs(p.xyz), ones.xyz);
    s = vec4(lessThan(p, vec4(0.0)));
    p.xyz = p.xyz + (s.xyz * 2.0 - 1.0) * s.www;
    return p;
}

#define F4 0.309016994374947451

// 4D simplex noise, returns analytic derivatives (dx, dy, dz, dw)
vec4 snoise4(vec4 v) {
    const vec4 C = vec4(0.138196601125011, 0.276393202250021, 0.414589803375032, -0.447213595499958);
    vec4 i = floor(v + dot(v, vec4(F4)));
    vec4 x0 = v - i + dot(i, C.xxxx);

    vec4 i0;
    vec3 isX = step(x0.yzw, x0.xxx);
    vec3 isYZ = step(x0.zww, x0.yyz);
    i0.x = isX.x + isX.y + isX.z;
    i0.yzw = 1.0 - isX;
    i0.y += isYZ.x + isYZ.y;
    i0.zw += 1.0 - isYZ.xy;
    i0.z += isYZ.z;
    i0.w += 1.0 - isYZ.z;

    vec4 i3 = clamp(i0, 0.0, 1.0);
    vec4 i2 = clamp(i0 - 1.0, 0.0, 1.0);
    vec4 i1 = clamp(i0 - 2.0, 0.0, 1.0);

    vec4 x1 = x0 - i1 + C.xxxx;
    vec4 x2 = x0 - i2 + C.yyyy;
    vec4 x3 = x0 - i3 + C.zzzz;
    vec4 x4 = x0 + C.wwww;

    i = mod289(i);
    float j0 = permute(permute(permute(permute(i.w) + i.z) + i.y) + i.x);
    vec4 j1 = permute(permute(permute(permute(
        i.w + vec4(i1.w, i2.w, i3.w, 1.0))
        + i.z + vec4(i1.z, i2.z, i3.z, 1.0))
        + i.y + vec4(i1.y, i2.y, i3.y, 1.0))
        + i.x + vec4(i1.x, i2.x, i3.x, 1.0));

    vec4 ip = vec4(1.0 / 294.0, 1.0 / 49.0, 1.0 / 7.0, 0.0);
    vec4 p0 = grad4(j0, ip);
    vec4 p1 = grad4(j1.x, ip);
    vec4 p2 = grad4(j1.y, ip);
    vec4 p3 = grad4(j1.z, ip);
    vec4 p4 = grad4(j1.w, ip);

    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    p4 *= taylorInvSqrt(dot(p4, p4));

    vec3 values0 = vec3(dot(p0, x0), dot(p1, x1), dot(p2, x2));
    vec2 values1 = vec2(dot(p3, x3), dot(p4, x4));

    vec3 m0 = max(0.5 - vec3(dot(x0, x0), dot(x1, x1), dot(x2, x2)), 0.0);
    vec2 m1 = max(0.5 - vec2(dot(x3, x3), dot(x4, x4)), 0.0);

    vec3 temp0 = -6.0 * m0 * m0 * values0;
    vec2 temp1 = -6.0 * m1 * m1 * values1;
    vec3 mmm0 = m0 * m0 * m0;
    vec2 mmm1 = m1 * m1 * m1;

    float dx = temp0[0] * x0.x + temp0[1] * x1.x + temp0[2] * x2.x + temp1[0] * x3.x + temp1[1] * x4.x
        + mmm0[0] * p0.x + mmm0[1] * p1.x + mmm0[2] * p2.x + mmm1[0] * p3.x + mmm1[1] * p4.x;
    float dy = temp0[0] * x0.y + temp0[1] * x1.y + temp0[2] * x2.y + temp1[0] * x3.y + temp1[1] * x4.y
        + mmm0[0] * p0.y + mmm0[1] * p1.y + mmm0[2] * p2.y + mmm1[0] * p3.y + mmm1[1] * p4.y;
    float dz = temp0[0] * x0.z + temp0[1] * x1.z + temp0[2] * x2.z + temp1[0] * x3.z + temp1[1] * x4.z
        + mmm0[0] * p0.z + mmm0[1] * p1.z + mmm0[2] * p2.z + mmm1[0] * p3.z + mmm1[1] * p4.z;
    float dw = temp0[0] * x0.w + temp0[1] * x1.w + temp0[2] * x2.w + temp1[0] * x3.w + temp1[1] * x4.w
        + mmm0[0] * p0.w + mmm0[1] * p1.w + mmm0[2] * p2.w + mmm1[0] * p3.w + mmm1[1] * p4.w;

    return vec4(dx, dy, dz, dw) * 49.0;
}
`

// Position simulation, one texel per petal: xyz = world position, w = life (1 -> 0).
// Dead petals respawn on a small sphere around the (moving) cursor; alive ones
// drift toward the cursor and get pushed around by curl noise.
export const simulationFragmentShader = /* glsl */ `
uniform float uTime;
uniform float uDieSpeed;
uniform float uAttraction;
uniform float uNormDelta;
uniform float uRadius;
uniform float uCurlSize;
uniform float uCurlSpeed;
uniform float uLerpSpeed;
uniform float uMouseRadius;
uniform vec3 uMouse;
uniform vec3 uPrevMouse;
uniform vec3 uForce;
uniform vec3 uMouseVelocity;
uniform sampler2D tHome;

${noise4dGLSL}

// Curl noise: build three noise potential fields (one per axis, offset so they
// are independent) and take the curl of that vector field. The result is a
// divergence-free "wind" — particles swirl organically and never bunch up.
// 3 octaves: each octave doubles the frequency and fades by 'persistence'.
vec3 curl(in vec3 p, in float noiseTime, in float persistence) {
    vec4 potentialX = vec4(0.0); // noise potential + its xyz derivatives
    vec4 potentialY = vec4(0.0);
    vec4 potentialZ = vec4(0.0);
    for (int octave = 0; octave < 3; octave++) {
        float frequency = pow(2.0, float(octave));
        float amplitude = 0.5 * frequency * pow(persistence, float(octave));
        potentialX += snoise4(vec4(p * frequency, noiseTime)) * amplitude;
        potentialY += snoise4(vec4((p + vec3(123.4, 129845.6, -1239.1)) * frequency, noiseTime)) * amplitude;
        potentialZ += snoise4(vec4((p + vec3(-9519.0, 9051.0, -123.0)) * frequency, noiseTime)) * amplitude;
    }
    // curl = (dPz/dy - dPy/dz, dPx/dz - dPz/dx, dPy/dx - dPx/dy)
    return vec3(
        potentialZ[1] - potentialY[2],
        potentialX[2] - potentialZ[0],
        potentialY[0] - potentialX[1]
    );
}

// Distance from point p to segment a-b
float lineDist(vec3 p, vec3 a, vec3 b) {
    vec3 pa = p - a;
    vec3 ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}

void main() {
    // one texel = one petal: xyz = world position, w = life (1 = fresh, 0 = dead)
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 petal = texture2D(tPosition, uv);
    vec4 home = texture2D(tHome, uv);

    float life = petal.w - uDieSpeed * uNormDelta;
    vec3 position = petal.xyz;

    // Per-petal variation of the respawn target: petals whose texel-uv lies
    // "close" to the prevMouse->mouse segment get pushed further along the
    // cursor's motion (uForce), spreading spawns along the stroke.
    float mouseSpeed = max(length(uMouseVelocity), 0.5);
    float strokeInfluence = smoothstep(
        1.0 - uMouseRadius, 1.0,
        1.0 - min(lineDist(vec3(uv, 1.0), uPrevMouse, uMouse) / mouseSpeed, 1.0)
    );
    vec3 target = uMouse + strokeInfluence * uForce;

    if (life < 0.0) {
        // Dead: respawn on the home sphere, shrunk by uRadius, around the cursor.
        // uRadius is small while the mouse moves (tight trail) and large when
        // it rests (wide cloud).
        position = home.xyz * uRadius + target;
        life = 1.0;
    } else {
        // Alive: gentle pull toward the cursor (stronger for fresh petals) ...
        vec3 toTarget = target - position;
        float distanceFalloff = 1.0 - smoothstep(50.0, 500.0, length(toTarget));
        position += toTarget * (0.005 + life * 0.01) * uAttraction * distanceFalloff * uLerpSpeed * uNormDelta * 0.1;
        // ... plus curl-noise wind, slightly more turbulent near end of life
        position += curl(position * uCurlSize, uTime * uCurlSpeed, 0.1 + (1.0 - life) * 0.1) * uLerpSpeed * uNormDelta;
    }

    gl_FragColor = vec4(position, life);
}
`

// --- Injected chunks for MeshStandardMaterial / MeshDepthMaterial ---

export const petalVertexPars = /* glsl */ `
attribute vec3 position2;
attribute vec3 normal2;
attribute vec3 position3;
attribute vec3 normal3;
attribute float aIndex;
attribute float aColor;
attribute vec2 aReference;
attribute vec3 aRandom;

varying vec2 vPetalUv;
varying float vPetalColor;

uniform sampler2D tPosition;
uniform float uParticleSize;
uniform float uTime;
uniform vec2 uLifespan;
uniform vec3 uRotBase;
uniform float uRotSpeed;

mat4 rotationAxisAngle(vec3 axis, float angle) {
    axis = normalize(axis);
    float s = sin(angle);
    float c = cos(angle);
    float oc = 1.0 - c;
    return mat4(
        oc * axis.x * axis.x + c,          oc * axis.x * axis.y - axis.z * s, oc * axis.z * axis.x + axis.y * s, 0.0,
        oc * axis.x * axis.y + axis.z * s, oc * axis.y * axis.y + c,          oc * axis.y * axis.z - axis.x * s, 0.0,
        oc * axis.z * axis.x - axis.y * s, oc * axis.y * axis.z + axis.x * s, oc * axis.z * axis.z + c,          0.0,
        0.0, 0.0, 0.0, 1.0
    );
}

// Scale over life: pop in just after spawn (life ~1), shrink away near death (life ~0)
float lifeScale(float life, vec2 lifespan) {
    float fadeIn = smoothstep(0.0, lifespan.x, life);
    float fadeOut = smoothstep(1.0, lifespan.y, life);
    float middle = step(lifespan.x, life) * step(life, lifespan.y);
    return mix(fadeIn, 1.0, middle) * mix(1.0, fadeOut, step(lifespan.y, life));
}
`

// Picks the geometry variant, builds the per-petal tumble rotation and
// exposes bPosition / bNormal / rX / rY / rZ for the chunks below.
const petalSetup = /* glsl */ `
vPetalUv = uv;
vPetalColor = aColor;

vec3 bPosition = position;
vec3 bNormal = normal;
if (aIndex == 2.0) { bPosition = position2; bNormal = normal2; }
else if (aIndex == 3.0) { bPosition = position3; bNormal = normal3; }

// Tumble rotation: base orientation + continuous spin. Each petal spins at
// its own speed because aRandom differs per instance.
mat4 rotateX = rotationAxisAngle(vec3(1.0, 0.0, 0.0), radians(uRotBase.x) + uTime * uRotSpeed * aRandom.x);
mat4 rotateY = rotationAxisAngle(vec3(0.0, 1.0, 0.0), radians(uRotBase.y) + uTime * uRotSpeed * aRandom.y);
mat4 rotateZ = rotationAxisAngle(vec3(0.0, 0.0, 1.0), radians(uRotBase.z) + uTime * uRotSpeed * aRandom.z);
`

// Reads this petal's texel from the simulation texture (aReference = its uv),
// then rotates, scales and moves the vertex there. 'transformed' is the
// variable name three.js' own shader chunks expect downstream.
const petalTransform = /* glsl */ `
vec4 simData = texture2D(tPosition, aReference);
float life = clamp(simData.w, 0.0, 1.0);

vec3 transformed = (vec4(bPosition, 1.0) * rotateX * rotateY * rotateZ).xyz;
float petalScale = uParticleSize * aRandom.z * lifeScale(life, uLifespan);
transformed *= petalScale;
transformed += simData.xyz;
`

// MeshStandardMaterial: beginnormal_vertex runs before begin_vertex,
// so the setup lives there and begin_vertex reuses its variables.
export const standardBeginNormalChunk = /* glsl */ `
${petalSetup}
vec3 objectNormal = (vec4(bNormal, 0.0) * rotateX * rotateY * rotateZ).xyz;
#ifdef USE_TANGENT
vec3 objectTangent = vec3( tangent.xyz );
#endif
`

export const standardBeginVertexChunk = petalTransform

// MeshDepthMaterial has no beginnormal_vertex, everything goes in begin_vertex.
export const depthBeginVertexChunk = /* glsl */ `
${petalSetup}
${petalTransform}
`

export const petalFragmentPars = /* glsl */ `
uniform sampler2D tPetal;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec3 uColor4;

varying vec2 vPetalUv;
varying float vPetalColor;

vec3 petalPaletteColor() {
    int idx = int(floor(vPetalColor * 4.0));
    idx = clamp(idx, 0, 3);
    vec3 c = uColor4;
    if (idx == 0) c = uColor1;
    if (idx == 1) c = uColor2;
    if (idx == 2) c = uColor3;
    return c;
}
`

// Replaces "vec4 diffuseColor = vec4( diffuse, opacity );"
export const petalDiffuseChunk = /* glsl */ `
vec4 petalTex = texture2D(tPetal, vPetalUv);
vec3 petalColor = petalPaletteColor();
vec4 diffuseColor = vec4(clamp(petalColor + petalTex.r, 0.0, 1.0), opacity);
`
