'use strict';

const TAU = Math.PI * 2;
const TURN_SECONDS = 14;
const startAngle = -1.15;
const colors = ['#bccf9d', '#8eb99b', '#dcb37c', '#afc7df'];
const world = document.querySelector('#world');
const sky = document.querySelector('#meteors');
const play = document.querySelector('#play');
const fullscreen = document.querySelector('#fullscreen');
const music = document.querySelector('#music');
const musicStatus = document.querySelector('#music-status');
const soundtrack = document.querySelector('#soundtrack');
const progress = document.querySelector('#progress');
const buttons = [...document.querySelectorAll('[data-season]')];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const skyContext = sky.getContext('2d');
const gl = world.getContext('webgl2', { alpha: true, antialias: true, powerPreference: 'high-performance' });

function seededRandom(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const shaderHeader = `#version 300 es
precision highp float;
precision highp int;
const float PI2 = 6.2831853;
uniform vec2 uView;
uniform float uLift;
uniform float uTime;
uniform float uTwist;
uniform float uSweep;
uniform float uStart;
uniform int uFrom;
uniform int uTo;
uniform vec4 uCat;
uniform vec4 uDog;
vec4 project(vec3 p) {
  float lens = 1.0 + p.z * .014 + p.y * .016;
  return vec4(p.x * uView.x * lens, (p.y * .835 - p.z * .55) * uView.y * lens + uLift,
    (-p.y * .55 - p.z * .835) * .085, 1.0);
}
mat2 rotation(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, s, -s, c);
}
float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * .1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 w = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), w.x),
    mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), w.x), w.y);
}
float seasonAt(vec2 p) {
  float angle = fract((atan(p.y, p.x) - uStart) / PI2 + 1.0);
  float spread = .024 + .013 * noise(p * 2.0);
  float wind = (noise(p * 1.35 + 8.2) - .5) * .051 + (noise(p * 6.0) - .5) * .018;
  float front = 1.0 - smoothstep(uSweep - spread, uSweep + spread, angle + wind);
  return mix(front * smoothstep(0.0, .028, angle) * smoothstep(0.0, .029, uSweep),
    1.0, smoothstep(.943, 1.0, uSweep));
}
float meadowHeight(vec2 p) {
  float r = length(p);
  float fade = (1.0 - smoothstep(4.25, 5.12, r)) * smoothstep(.65, 1.35, r);
  float hill = noise(p * vec2(.63, 1.1) + 9.8);
  float mound = noise(p * 1.71 + vec2(1.0, 7.0));
  return fade * (.20 * hill * hill + .052 * mound);
}
float winterAt(vec2 p) {
  float season = seasonAt(p);
  return mix(uFrom == 3 ? 1.0 : 0.0, uTo == 3 ? 1.0 : 0.0, season);
}
float snowLayerHeight(vec2 world, vec2 local) {
  float r = length(local);
  float winter = winterAt(world);
  float cover = smoothstep(.74, 1.16, r) * (1.0 - smoothstep(4.13, 4.76, r));
  float broad = noise(local * .47 + vec2(7.4, 2.1));
  float pillows = noise(local * 1.18 + noise(local * .38 + 13.0) * .66);
  float wind = .5 + .5 * sin(local.x * .72 + local.y * .28 + broad * 2.2);
  return winter * cover * (.105 + broad * .085 + pillows * .055 + wind * .022);
}
float meadowSurfaceHeight(vec2 local) {
  vec2 world = rotation(uTwist) * local;
  return meadowHeight(local) + snowLayerHeight(world, local);
}
vec3 groundColor(int s) {
  if (s == 0) return vec3(.280, .382, .202);
  if (s == 1) return vec3(.163, .322, .162);
  if (s == 2) return vec3(.505, .298, .137);
  return vec3(.675, .760, .887);
}
vec3 bladeColor(int s) {
  if (s == 0) return vec3(.494, .626, .310);
  if (s == 1) return vec3(.301, .519, .269);
  if (s == 2) return vec3(.748, .471, .234);
  return vec3(.798, .868, .946);
}
vec3 meadowLight(vec2 p) {
  float key = exp(-dot(p + vec2(2.8, 2.2), p + vec2(2.8, 2.2)) * .057);
  float fill = exp(-dot(p - vec2(3.6, .9), p - vec2(3.6, .9)) * .065);
  return vec3(.82, .87, .96) + key * vec3(.47, .38, .21) + fill * vec3(.065, .14, .24);
}
float softShadow(vec2 p, vec4 pet, vec2 size) {
  vec2 d = p - pet.xy - vec2(.093, .068);
  vec2 q = vec2(dot(d, pet.zw), dot(d, vec2(-pet.w, pet.z))) / size;
  float contact = exp(-dot(q, q) * 2.2);
  float penumbra = exp(-dot(q, q) * .72);
  return contact * .37 + penumbra * .17;
}
float petShadow(vec2 p) {
  return 1.0 - softShadow(p, uCat, vec2(.51, .20)) - softShadow(p, uDog, vec2(.63, .23));
}
float stylusLight(vec2 p) {
  float a = uStart + uSweep * PI2;
  vec2 d = vec2(cos(a), sin(a));
  float along = dot(p, d);
  float side = dot(p, vec2(-d.y, d.x));
  return (exp(-side * side * 23.0) * .16 + exp(-side * side * 2.0) * .075) *
    smoothstep(.15, 2.0, along) * (1.0 - smoothstep(4.95, 5.7, along));
}
`;

const surfaceVertex = `
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
uniform int uPart;
out vec3 vP;
out vec3 vN;
void main() {
  vP = aPosition;
  vN = aNormal;
  if (uPart == 0) {
    vec2 p = rotation(-uTwist) * vP.xz;
    float h = meadowSurfaceHeight(p);
    vec2 diff = rotation(uTwist) * vec2(h - meadowSurfaceHeight(p + vec2(.043, 0)), h - meadowSurfaceHeight(p + vec2(0, .043)));
    vN = normalize(vec3(diff.x, .043, diff.y));
    vP.y += h;
  }
  gl_Position = project(vP);
}
`;
const surfaceFragment = `
in vec3 vP;
in vec3 vN;
uniform int uPart;
uniform sampler2D uTerrain;
uniform bool uHasTerrain;
out vec4 outColor;
vec3 groundSample(int season, vec2 p) {
  if (!uHasTerrain) return groundColor(season);
  vec2 origin = vec2(float(season % 2), float(season / 2)) * .5;
  vec2 uv = origin + .25 + p * .039;
  return mix(groundColor(season), texture(uTerrain, uv).rgb, season == 3 ? .66 : .61);
}
void main() {
  vec2 p = vP.xz;
  float r = length(p);
  vec3 n = normalize(vN);
  float l = dot(n, normalize(vec3(-.55, .85, -.31)));
  vec3 color;
  if (uPart == 0) {
    float season = seasonAt(p);
    float snow = winterAt(p);
    vec2 q = rotation(-uTwist) * p;
    float grain = noise(q * 125.0);
    float folds = noise(q * 1.2 + noise(q * 3.0) * .72);
    float snowSoftness = noise(q * .58 + 31.0) * .62 + noise(q * 1.84 + 4.0) * .38;
    float groundLight = (.80 + .19 * folds + .045 * grain) *
      (.67 + .40 * max(l, 0.0)) * (1.0 - .19 * smoothstep(4.35, 4.81, r));
    vec3 diffuse = mix(groundSample(uFrom, q), groundSample(uTo, q), season);
    float drifts = smoothstep(.32, .72, noise(q * 1.15 + 17.0));
    diffuse = mix(diffuse, vec3(.855, .906, .982), snow * (.56 + drifts * .34));
    color = diffuse * meadowLight(p) * groundLight * petShadow(p);
    color += vec3(.115, .135, .165) * snow * (.22 + snowSoftness * .18);
    color += vec3(.35, .43, .57) * snow * pow(grain, 19.0) * .32;
    color += vec3(.49, .37, .13) * stylusLight(p);
  } else if (uPart == 1) {
    float topLip = exp(-abs(vP.y + .028) * 52.0);
    float lowerLip = exp(-abs(vP.y + .226) * 46.0);
    float sideLight = .27 + .73 * pow(max(0.0, dot(n, normalize(vec3(-.72, .10, .79)))), 3.0);
    float blueLight = pow(max(0.0, dot(n, normalize(vec3(.85, .07, .44)))), 6.0);
    float machining = .5 + .5 * cos(vP.y * 163.0);
    color = vec3(.078, .087, .108) * (.55 + .55 * sideLight);
    color += (topLip * .49 + lowerLip * .18 + machining * .035) * sideLight * vec3(.89, .76, .60);
    color += (topLip * .25 + lowerLip * .14) * blueLight * vec3(.52, .68, .98);
  } else if (uPart == 2) {
    float grooves = .5 + .5 * sin(r * 155.0);
    float specular = pow(max(dot(n, normalize(vec3(-.28, .85, -.38))), 0.0), 7.0);
    color = vec3(.049, .057, .073) + vec3(.12, .13, .143) * specular * .38;
    if (n.y > .6) {
      float edge = 1.0 - smoothstep(.004, .017, abs(r - .708));
      float inner = 1.0 - smoothstep(.003, .012, abs(r - .405));
      color += (grooves * .018 + edge * .47 + inner * .21) * vec3(.91, .79, .63);
    } else {
      color *= .72 + max(l, 0.0) * .38;
    }
  } else {
    float angle = atan(p.y, p.x);
    float grooves = .5 + .5 * cos(r * 196.0);
    float warmReflection = pow(.5 + .5 * cos(angle - 2.10), 16.0);
    float coolReflection = pow(.5 + .5 * cos(angle + .38), 19.0);
    vec3 sheen = .56 + .44 * cos(13.0 * r + angle * 2.0 + vec3(0.0, 1.8, 3.7));
    float rim = smoothstep(5.10, 5.19, r);
    float edgeLine = exp(-abs(r - 5.177) * 76.0);
    float inlay = exp(-abs(r - 4.821) * 82.0);
    float spinGlint = pow(.5 + .5 * cos(3.0 * (angle - uTwist)), 14.0);
    color = vec3(.082, .104, .137) + grooves * vec3(.031, .038, .052);
    color += warmReflection * (vec3(.34, .26, .19) + sheen * .26);
    color += coolReflection * (vec3(.15, .22, .38) + sheen * .18);
    color += (rim * .040 + spinGlint * .021) * sheen;
    color += (edgeLine * .40 + inlay * .24) * vec3(.91, .80, .67);
  }
  outColor = vec4(color, 1.0);
}
`;

const grassVertex = `
layout(location=0) in vec2 aBlade;
layout(location=1) in vec4 aSeed;
out vec3 vColor;
out float vTip;
void main() {
  vec2 p = rotation(uTwist) * aSeed.xy;
  float r = length(p);
  float season = seasonAt(p);
  float winter = mix(uFrom == 3 ? 1.0 : 0.0, uTo == 3 ? 1.0 : 0.0, season);
  float tufts = noise(aSeed.xy * 1.18 + noise(aSeed.xy * 4.9) * .43);
  float height = (.073 + pow(aSeed.z, 1.75) * .225) * mix(.78, 1.44, smoothstep(.20, .76, tufts));
  height *= mix(1.0, .035 + .10 * pow(aSeed.z, 5.0), winter);
  float t = aBlade.y;
  float width = .010 + aSeed.w * .014;
  vec2 face = vec2(cos(aSeed.w * PI2), sin(aSeed.w * PI2));
  vec2 wind = vec2(sin(p.x * 1.3 + p.y * .61 - uTime * 1.2), cos(p.y * .63 - uTime * .9));
  vec2 slip = vec2(.018, .006) + wind * (.052 + aSeed.z * .023);
  float flatten = min(1.0, petShadow(p) * 1.30);
  vec2 stem = p + face * aBlade.x * width + (slip + face * .052) * t * t * (1.0 - winter * .85);
  gl_Position = project(vec3(stem.x, .018 + meadowHeight(aSeed.xy) + t * height * flatten, stem.y));
  vec3 base = mix(groundColor(uFrom), groundColor(uTo), season);
  vec3 tip = mix(bladeColor(uFrom), bladeColor(uTo), season);
  float sun = max(0.0, dot(face, vec2(-.75, -.55)));
  float lighting = (.63 + .27 * aSeed.z + .28 * sun) * (1.0 - .16 * smoothstep(4.13, 4.78, r));
  float pattern = .78 + .18 * tufts + .19 * noise(aSeed.xy * .81);
  vColor = mix(base * .67, tip, t * .79 + .16) * lighting * pattern * petShadow(p) * meadowLight(p);
  vColor += vec3(.64, .49, .20) * stylusLight(p) * (.56 + t * .74);
  vTip = t;
}
`;
const grassFragment = `
in vec3 vColor;
in float vTip;
out vec4 outColor;
void main() {
  outColor = vec4(vColor, .96 - vTip * .11);
}
`;

const shapeVertex = `
layout(location=0) in vec3 aPosition;
layout(location=1) in vec4 aX;
layout(location=2) in vec4 aY;
layout(location=3) in vec4 aZ;
layout(location=4) in vec4 aPaint;
out vec3 vN;
out vec3 vP;
out vec3 vObject;
out vec4 vPaint;
void main() {
  mat3 transform = mat3(aX.xyz, aY.xyz, aZ.xyz);
  vObject = aPosition;
  vP = transform * vObject + vec3(aX.w, aY.w, aZ.w);
  vN = normalize(mat3(aX.xyz / dot(aX.xyz, aX.xyz), aY.xyz / dot(aY.xyz, aY.xyz), aZ.xyz / dot(aZ.xyz, aZ.xyz)) * aPosition);
  vPaint = aPaint;
  gl_Position = project(vP);
}
`;
const shapeFragment = `
in vec3 vN;
in vec3 vP;
in vec3 vObject;
in vec4 vPaint;
out vec4 outColor;
void main() {
  vec3 n = normalize(vN);
  vec3 light = normalize(vec3(-.62, .79, .18));
  float direct = max(0.0, dot(n, light));
  float fill = max(0.0, dot(n, vec3(.40, .58, -.65)));
  float rim = pow(1.0 - max(0.0, dot(n, vec3(0, .55, .83))), 3.0);
  float grain = noise(vObject.xz * 34.0 + vObject.y * 16.0);
  vec3 color = vPaint.rgb * (.33 + direct * .50 + fill * .20 + grain * .12);
  color += vec3(.18, .21, .23) * rim * .25;
  color += vec3(.8, .55, .25) * stylusLight(vP.xz) * .13;
  color = mix(color, vPaint.rgb, max(0.0, vPaint.a));
  outColor = vec4(color, 1.0);
}
`;

const fleckVertex = `
layout(location=0) in vec4 aSeed;
uniform float uPixel;
uniform bool uGlow;
out vec4 vColor;
out vec3 vShape;
vec4 seasonalWeights(vec2 p) {
  return mix(vec4(equal(ivec4(uFrom), ivec4(0, 1, 2, 3))),
    vec4(equal(ivec4(uTo), ivec4(0, 1, 2, 3))), seasonAt(p));
}
void main() {
  vec2 p;
  float height;
  float size;
  if (uGlow) {
    float a = uStart + uSweep * PI2;
    vec2 d = vec2(cos(a), sin(a));
    p = d * 4.91;
    height = .41;
    size = 83.0;
    vColor = vec4(1.0, .68, .27, .43);
    vShape = vec3(2.0, 0.0, 0.0);
  } else if (aSeed.w < .54) {
    p = rotation(uTwist) * aSeed.xy;
    vec4 seasons = seasonalWeights(p);
    float cluster = smoothstep(.36, .68, noise(aSeed.xy * 1.55 + 3.0));
    vec3 petal = mix(vec3(.99, .63, .76), vec3(.98, .90, .84), smoothstep(.16, .70, aSeed.z));
    vec3 seed = vec3(.82, .76, .41);
    vec3 leaf = mix(vec3(.63, .20, .067), vec3(.98, .62, .27), aSeed.z);
    vec3 color = mat3(petal, seed, leaf) * seasons.xyz + vec3(.86, .93, 1.0) * seasons.w;
    float coverage = dot(seasons, vec4(.92 * cluster, .45 * cluster, .76, .34 * cluster));
    vColor = vec4(color * meadowLight(p), coverage * (.65 + .35 * aSeed.z));
    height = meadowSurfaceHeight(aSeed.xy) + mix(.065 + aSeed.z * .155, .045, seasons.z + seasons.w);
    size = mix(2.5 + pow(aSeed.z, 1.7) * 4.8, 1.8 + aSeed.z * 4.1, seasons.z + seasons.w);
    vShape = vec3(0.0, seasons.z, aSeed.z * PI2 + uTwist);
  } else {
    float life = fract(aSeed.z + uTime * (.115 + aSeed.w * .105));
    float a = uStart + uSweep * PI2 - life * (.48 + aSeed.w * .82) + aSeed.x * .047;
    float r = .75 + sqrt(abs(aSeed.y) / 4.8) * 4.00 + life * aSeed.x * .14;
    p = vec2(cos(a), sin(a)) * r;
    vec4 seasons = seasonalWeights(p);
    float base = meadowSurfaceHeight(rotation(-uTwist) * p);
    float arc = sin(life * 3.14159);
    float fall = pow(1.0 - life, .72);
    float springHeight = .12 + arc * (.52 + aSeed.w * .48);
    float summerHeight = .31 + arc * (.40 + aSeed.w * .36) + .09 * sin(uTime * 2.0 + aSeed.x);
    float autumnHeight = .08 + fall * (1.05 + aSeed.w * .68);
    float winterHeight = .08 + fall * (1.30 + aSeed.w * .88);
    height = base + dot(seasons, vec4(springHeight, summerHeight, autumnHeight, winterHeight));
    p += vec2(sin(life * 9.0 + aSeed.x), cos(life * 6.0 + aSeed.y)) *
      dot(seasons, vec4(.13, .045, .22, .17));
    float brightness = pow(max(0.0, arc), .38);
    vec3 tint = seasons.x * mix(vec3(1.0, .61, .76), vec3(1.0, .92, .91), aSeed.z) +
      seasons.y * vec3(1.0, .83, .34) +
      seasons.z * mix(vec3(1.0, .32, .08), vec3(1.0, .76, .20), aSeed.z) +
      seasons.w * mix(vec3(.78, .89, 1.0), vec3(1.0), aSeed.z);
    float visibility = dot(seasons, vec4(.72, .84, .91, .96));
    vColor = vec4(tint, brightness * visibility * (.55 + aSeed.w * .43));
    size = dot(seasons, vec4(3.6, 2.8, 5.8, 4.6)) + aSeed.z * aSeed.z *
      dot(seasons, vec4(4.5, 3.4, 6.8, 5.5));
    vShape = vec3(1.0, dot(seasons, vec4(0.0, 1.0, 2.0, 3.0)), life * 9.0 + aSeed.x);
  }
  gl_Position = project(vec3(p.x, height, p.y));
  gl_PointSize = max(1.0, size * uPixel);
}
`;
const fleckFragment = `
in vec4 vColor;
in vec3 vShape;
out vec4 outColor;
void main() {
  vec2 p = (gl_PointCoord - .5) * 2.0;
  float r = length(p);
  vec3 color = vColor.rgb;
  float opacity;
  if (vShape.x > 1.5) {
    opacity = exp(-r * r * 6.0) * (1.0 - smoothstep(.66, 1.0, r));
  } else {
    vec2 q = rotation(vShape.z) * p;
    float leaf = 1.0 - smoothstep(.44, .92, length(q * vec2(.99, 1.87)));
    if (vShape.x < .5) {
      float edge = .69 + .13 * cos(5.0 * atan(q.y, q.x + .0001));
      float bloom = 1.0 - smoothstep(edge - .20, edge + .07, r);
      color = mix(color, vec3(.96, .78, .42), (1.0 - smoothstep(.12, .26, r)) * (1.0 - vShape.y));
      opacity = mix(bloom, leaf, vShape.y);
    } else if (vShape.y < .5) {
      opacity = leaf;
    } else if (vShape.y < 1.5) {
      opacity = exp(-r * r * 3.6) * (1.0 - smoothstep(.72, 1.0, r));
    } else if (vShape.y < 2.5) {
      float vein = 1.0 - smoothstep(.025, .12, abs(q.x));
      opacity = leaf;
      color += vec3(.19, .055, .015) * vein * leaf * .48;
    } else {
      float angle = atan(q.y, q.x + .0001);
      float star = .63 + .18 * cos(angle * 6.0);
      opacity = 1.0 - smoothstep(star - .18, star + .14, r);
      opacity *= .72 + .28 * (1.0 - smoothstep(.12, .28, r));
    }
  }
  outColor = vec4(color, vColor.a * opacity);
}
`;

const petVertex = `
layout(location=0) in vec2 aCorner;
uniform vec4 uPetQuad;
uniform vec4 uPetPose;
out vec2 vUV;
out vec2 vGround;
void main() {
  vec2 p = uPetQuad.xy;
  vec2 local = rotation(-uTwist) * p;
  float h = meadowSurfaceHeight(local) + .017 + uPetPose.w;
  vec4 anchor = project(vec3(p.x, h, p.y));
  vec2 offset = vec2(aCorner.x - .5, aCorner.y - .085) * uPetQuad.zw * uView;
  gl_Position = anchor + vec4(offset * (1.0 + p.y * .014), .003 - aCorner.y * .023, 0.0);
  float x = uPetPose.z > 0.0 ? aCorner.x : 1.0 - aCorner.x;
  vUV = vec2((uPetPose.x + x) * .25, (uPetPose.y + 1.0 - aCorner.y) * .5);
  vGround = p;
}
`;
const petFragment = `
in vec2 vUV;
in vec2 vGround;
uniform sampler2D uPetImage;
out vec4 outColor;
void main() {
  vec4 pixel = texture(uPetImage, vUV);
  if (pixel.a < .07) discard;
  float warmth = stylusLight(vGround);
  vec3 color = pixel.rgb * (meadowLight(vGround) * .94 + vec3(.14, .11, .10));
  color += pixel.rgb * warmth * vec3(.92, .49, .17);
  float snow = mix(uFrom == 3 ? 1.0 : 0.0, uTo == 3 ? 1.0 : 0.0, seasonAt(vGround));
  color += pixel.rgb * vec3(.020, .034, .055) * snow;
  outColor = vec4(color, pixel.a);
}
`;

function createProgram(vertex, fragment) {
  const program = gl.createProgram();
  const shaders = [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]].map(([type, source]) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, shaderHeader + source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program, shader);
    return shader;
  });
  gl.linkProgram(program);
  for (const shader of shaders) gl.deleteShader(shader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  const names = ['View', 'Lift', 'Time', 'Twist', 'Sweep', 'Start', 'From', 'To', 'Cat', 'Dog', 'Part', 'Pixel', 'Glow',
    'Terrain', 'HasTerrain', 'PetQuad', 'PetPose', 'PetImage'];
  return { program, uniforms: Object.fromEntries(names.map(name => [name, gl.getUniformLocation(program, 'u' + name)])) };
}

function attribute(buffer, location, size, stride, offset = 0, divisor = 0) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride * 4, offset * 4);
  gl.vertexAttribDivisor(location, divisor);
}

function bufferData(data, usage = gl.STATIC_DRAW) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, usage);
  return buffer;
}

function terrainMesh() {
  const vertices = [];
  const parts = [];
  function surface(part, outer, inner, top, bottom, segments, join = false) {
    const start = vertices.length / 6;
    const cap = top === bottom;
    if (join) vertices.push(...vertices.slice(-6), outer, top, 0, 0, 1, 0);
    for (let i = 0; i <= segments; i++) {
      const a = TAU * i / segments;
      const x = Math.cos(a);
      const z = Math.sin(a);
      const normal = cap ? [0, 1, 0] : [x, 0, z];
      vertices.push(outer * x, top, outer * z, ...normal, inner * x, bottom, inner * z, ...normal);
    }
    if (join) parts.at(-1).count += vertices.length / 6 - start;
    else parts.push({ part, start, count: vertices.length / 6 - start });
  }
  surface(1, 5.207, 5.16, .004, -.272, 192);
  surface(3, 5.208, 4.77, .010, .010, 192);
  const rows = 40;
  for (let row = 0; row < rows; row++) {
    surface(0, 4.805 * (rows - row) / rows, 4.805 * (rows - row - 1) / rows, .015, .015, 144, row > 0);
  }
  surface(2, .732, .744, .181, .019, 96);
  surface(2, .732, 0, .182, .182, 96);
  surface(2, .081, .083, .248, .182, 32);
  surface(2, .081, 0, .248, .248, 32);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buffer = bufferData(new Float32Array(vertices));
  attribute(buffer, 0, 3, 6);
  attribute(buffer, 1, 3, 6, 3);
  return { vao, parts };
}

function fieldSeeds(count, seed, flowers = false) {
  const random = seededRandom(seed);
  const data = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const angle = random() * TAU;
    const radius = Math.sqrt(.027 + random() * .973) * 4.79;
    const offset = i * 4;
    data[offset] = Math.cos(angle) * radius;
    data[offset + 1] = Math.sin(angle) * radius;
    data[offset + 2] = random();
    data[offset + 3] = flowers ? (i < count * .65 ? random() * .52 : .55 + random() * .44) : random();
  }
  return data;
}

function grassMesh() {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const blade = bufferData(new Float32Array([-1, 0, 1, 0, -.67, .47, .67, .47, -.28, .78, .28, .78, 0, 1]));
  const seeds = bufferData(fieldSeeds(118000, 4108));
  attribute(blade, 0, 2, 2);
  attribute(seeds, 1, 4, 4, 0, 1);
  return vao;
}

function sphereMesh() {
  const vertices = [];
  const segments = 15;
  const rows = 9;
  function point(i, j) {
    const a = TAU * i / segments;
    const b = Math.PI * j / rows;
    return [Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a)];
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < rows; j++) {
      const top = point(i, j);
      const right = point(i + 1, j);
      const bottom = point(i, j + 1);
      const corner = point(i + 1, j + 1);
      vertices.push(...top, ...right, ...bottom, ...bottom, ...right, ...corner);
    }
  }
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  attribute(bufferData(new Float32Array(vertices)), 0, 3, 3);
  const instances = new Float32Array(24 * 16);
  const buffer = bufferData(instances.byteLength, gl.DYNAMIC_DRAW);
  for (let i = 0; i < 4; i++) attribute(buffer, i + 1, 4, 16, i * 4, 1);
  return { vao, buffer, instances, vertices: vertices.length / 3, used: 0 };
}

function fleckMesh() {
  const count = 2800;
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  attribute(bufferData(fieldSeeds(count, 74, true)), 0, 4, 4);
  return { vao, count };
}

function petMesh() {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  attribute(bufferData(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1])), 0, 2, 2);
  return vao;
}

function movePet(kind, time) {
  const puppy = kind === 'puppy';
  const offset = puppy ? .84 + .23 * Math.sin(time * 1.2) : 0;
  const a = .24 + time * .89 + .22 * Math.sin(time * 1.3) - offset;
  const x = 1.98 * Math.sin(a) + .24 * Math.sin(a * 2);
  const z = 1.82 + .97 * Math.cos(a) + .15 * Math.sin(2 * a);
  const angle = Math.atan2(-.97 * Math.sin(a) + .30 * Math.cos(2 * a), 1.98 * Math.cos(a) + .48 * Math.cos(2 * a));
  const gait = (time * (puppy ? 3.20 : 3.55) + .1 * Math.sin(time * 1.7) + offset) % 1;
  return { kind, x, z, gait, c: Math.cos(angle), s: Math.sin(angle) };
}

function addShape(batch, center, xAxis, yAxis, zAxis, paint, emission = 0) {
  const first = batch.used * 16;
  batch.instances.set([xAxis[0], xAxis[1], xAxis[2], center[0], yAxis[0], yAxis[1], yAxis[2], center[1],
    zAxis[0], zAxis[1], zAxis[2], center[2], paint[0], paint[1], paint[2], emission], first);
  batch.used++;
}

function modelPoint(root, [x, y, z]) {
  return [root.x + x * root.c - z * root.s, y, root.z + x * root.s + z * root.c];
}

function link(batch, root, a, b, width, paint, emission = 0) {
  const first = modelPoint(root, a);
  const second = modelPoint(root, b);
  const vector = second.map((value, i) => value - first[i]);
  const length = Math.hypot(...vector);
  const axis = vector.map(value => value / length);
  const sideLength = Math.hypot(axis[0], axis[2]);
  const side = sideLength > .001 ? [-axis[2] / sideLength, 0, axis[0] / sideLength] : [1, 0, 0];
  const normal = [axis[1] * side[2], axis[2] * side[0] - axis[0] * side[2], -axis[1] * side[0]];
  const center = first.map((value, i) => (value + second[i]) * .5);
  addShape(batch, center, axis.map(v => v * (length * .5 + width * .7)),
    normal.map(v => v * width), side.map(v => v * width), paint, emission);
}

function drawNeedle(batch, angle) {
  const root = { x: 0, z: 0, c: Math.cos(angle), s: Math.sin(angle) };
  let last = [.16, .279, 0];
  for (let i = 1; i <= 17; i++) {
    const t = i / 17;
    const next = [.16 + t * 4.70, .279 + .131 * t + .042 * Math.sin(t * Math.PI), .048 * Math.sin(t * Math.PI)];
    link(batch, root, last, next, .012 + .003 * t, [.78, .68, .42], .57);
    last = next;
  }
  link(batch, root, [4.64, .407, 0], [5.07, .434, 0], .043, [1, .82, .48], .93);
  link(batch, root, [4.74, .439, 0], [5.00, .452, 0], .026, [1, .96, .75], 1);
}

const images = {
  terrain: new Image(),
  kitten: new Image(),
  puppy: new Image(),
};

function uploadTexture(image) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.generateMipmap(gl.TEXTURE_2D);
  return texture;
}

function createScene() {
  const programs = {
    surface: createProgram(surfaceVertex, surfaceFragment),
    grass: createProgram(grassVertex, grassFragment),
    shapes: createProgram(shapeVertex, shapeFragment),
    flecks: createProgram(fleckVertex, fleckFragment),
    pets: createProgram(petVertex, petFragment),
  };
  const terrain = terrainMesh();
  const grasses = grassMesh();
  const shapes = sphereMesh();
  const flecks = fleckMesh();
  const pets = petMesh();
  const textures = {};
  for (const [name, image] of Object.entries(images)) {
    if (image.naturalWidth) textures[name] = uploadTexture(image);
  }
  gl.clearColor(0, 0, 0, 0);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  return { programs, terrain, grasses, shapes, flecks, pets, textures };
}

let scene;
let playing = !reducedMotion.matches;
let musicEnabled = true;
let musicAttempt = 0;
let elapsed = 0;
let turn = .14;
let season = 0;
let lastFrame;
let frameRequest;
let layout = { width: 0, height: 0, unit: 0, pixel: 1 };

function uniforms(shader, cat, dog) {
  const u = shader.uniforms;
  const { width, height, unit } = layout;
  gl.useProgram(shader.program);
  gl.uniform2f(u.View, 2 * unit / width, 2 * unit / height);
  gl.uniform1f(u.Lift, height < 500 ? .105 : width < 600 ? .036 : -.024);
  gl.uniform1f(u.Time, elapsed);
  gl.uniform1f(u.Twist, elapsed * .147);
  gl.uniform1f(u.Start, startAngle);
  gl.uniform1f(u.Sweep, turn);
  gl.uniform1i(u.From, season);
  gl.uniform1i(u.To, (season + 1) % 4);
  gl.uniform4f(u.Cat, cat.x, cat.z, cat.c, cat.s);
  gl.uniform4f(u.Dog, dog.x, dog.z, dog.c, dog.s);
  return u;
}

function renderPets(scene, cat, dog) {
  const u = uniforms(scene.programs.pets, cat, dog);
  gl.bindVertexArray(scene.pets);
  gl.uniform1i(u.PetImage, 1);
  gl.activeTexture(gl.TEXTURE1);
  for (const pet of [cat, dog]) {
    const texture = scene.textures[pet.kind];
    if (!texture) continue;
    const scale = layout.width < 600 ? 1.46 : 1.28;
    const width = (pet.kind === 'puppy' ? .934 : .833) * (.84 + .16 * Math.abs(pet.c)) * scale;
    const height = (pet.kind === 'puppy' ? .608 : .570) * scale;
    const pose = Math.floor(pet.gait * 4);
    const hop = Math.max(0, Math.cos(pet.gait * TAU + .22)) * .037;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform4f(u.PetQuad, pet.x, pet.z, width, height);
    gl.uniform4f(u.PetPose, pose, pet.s > -.10 ? 0 : 1, pet.c, hop);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  gl.activeTexture(gl.TEXTURE0);
}

function drawScene() {
  if (!scene || !layout.width) return;
  const { programs, terrain, grasses, shapes, flecks } = scene;
  const cat = movePet('kitten', elapsed + .20);
  const dog = movePet('puppy', elapsed + .20);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const surface = uniforms(programs.surface, cat, dog);
  gl.bindVertexArray(terrain.vao);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, scene.textures.terrain ?? null);
  gl.uniform1i(surface.Terrain, 0);
  gl.uniform1i(surface.HasTerrain, Number(Boolean(scene.textures.terrain)));
  for (const { part, start, count } of terrain.parts) {
    gl.uniform1i(surface.Part, part);
    gl.drawArrays(gl.TRIANGLE_STRIP, start, count);
  }

  uniforms(programs.grass, cat, dog);
  gl.bindVertexArray(grasses);
  const density = layout.width < 600 ? 70000 : 108000;
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 7, density);

  shapes.used = 0;
  drawNeedle(shapes, startAngle + turn * TAU);
  uniforms(programs.shapes, cat, dog);
  gl.bindVertexArray(shapes.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, shapes.buffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, shapes.instances.subarray(0, shapes.used * 16));
  gl.drawArraysInstanced(gl.TRIANGLES, 0, shapes.vertices, shapes.used);
  renderPets(scene, cat, dog);

  const particles = uniforms(programs.flecks, cat, dog);
  gl.bindVertexArray(flecks.vao);
  gl.uniform1f(particles.Pixel, layout.pixel * Math.max(.66, Math.min(1.3, layout.unit / 87)));
  gl.depthMask(false);
  gl.uniform1i(particles.Glow, 0);
  gl.drawArrays(gl.POINTS, 0, flecks.count);
  gl.uniform1i(particles.Glow, 1);
  gl.drawArrays(gl.POINTS, 0, 1);
  gl.depthMask(true);
}

const meteors = [
  { x: .89, y: .14, vx: -.86, vy: .51, offset: .27, period: 8.8, length: 160 },
  { x: .12, y: .22, vx: .84, vy: .54, offset: 12.08, period: 12.3, length: 105 },
  { x: .77, y: .23, vx: -.94, vy: .34, offset: 8.0, period: 13.3, length: 121 },
  { x: .98, y: .37, vx: -.93, vy: .39, offset: 8.1, period: 17.3, length: 193 },
];

function drawMeteors() {
  const { width, height } = layout;
  if (!skyContext) return;
  skyContext.clearRect(0, 0, width, height);
  if (!playing && reducedMotion.matches) return;
  for (const meteor of meteors) {
    const age = (elapsed + meteor.offset) % meteor.period;
    if (age > 1.52 || age < .02) continue;
    const speed = Math.min(width * .45, 560);
    const span = meteor.length * Math.min(1, width / 850) * Math.min(1, age * 3);
    const brightness = Math.min(.93, age * 4.6, (1.52 - age) * 1.15);
    const x = meteor.x * width + meteor.vx * speed * age;
    const y = meteor.y * height + meteor.vy * speed * age;
    const endX = x - meteor.vx * span;
    const endY = y - meteor.vy * span;
    const gradient = skyContext.createLinearGradient(x, y, endX, endY);
    gradient.addColorStop(0, 'rgba(237,246,255,' + brightness + ')');
    gradient.addColorStop(.28, 'rgba(169,198,222,' + brightness * .48 + ')');
    gradient.addColorStop(1, 'rgba(105,147,180,0)');
    skyContext.strokeStyle = gradient;
    skyContext.lineWidth = 1.15;
    skyContext.beginPath();
    skyContext.moveTo(x, y);
    skyContext.lineTo(endX, endY);
    skyContext.stroke();
    skyContext.fillStyle = 'rgba(247,250,255,' + brightness + ')';
    skyContext.beginPath();
    skyContext.arc(x, y, 1.2, 0, TAU);
    skyContext.fill();
  }
}

function displaySeason(index) {
  season = (index + 4) % 4;
  for (const [i, button] of buttons.entries()) button.setAttribute('aria-pressed', String(i === season));
  document.documentElement.style.setProperty('--accent', colors[season]);
}

function render() {
  progress.style.transform = 'scaleX(' + turn + ')';
  drawMeteors();
  drawScene();
}

function resize() {
  const { width, height } = world.getBoundingClientRect();
  if (!width || !height) return;
  const pixel = Math.min(devicePixelRatio || 1, width < 600 ? 1.65 : 1.5);
  const unit = Math.min(width * (width < 600 ? .945 : .785) / 10.6, height * (height < 500 ? .55 : .69) / 6.4);
  layout = { width, height, pixel, unit };
  for (const canvas of [sky, world]) {
    canvas.width = Math.round(width * pixel);
    canvas.height = Math.round(height * pixel);
  }
  if (skyContext) skyContext.setTransform(pixel, 0, 0, pixel, 0, 0);
  if (gl) gl.viewport(0, 0, world.width, world.height);
  render();
}

function tick(now) {
  if (!playing || document.hidden || !scene) return;
  const delta = lastFrame === undefined ? 0 : Math.min(.12, (now - lastFrame) / 1000);
  lastFrame = now;
  elapsed += delta;
  turn += delta / TURN_SECONDS;
  if (turn >= 1) {
    turn -= 1;
    displaySeason(season + 1);
  }
  render();
  frameRequest = requestAnimationFrame(tick);
}

function sync() {
  cancelAnimationFrame(frameRequest);
  lastFrame = undefined;
  if (playing && !document.hidden && scene) frameRequest = requestAnimationFrame(tick);
  syncMusic();
}

function syncMusic() {
  const attempt = ++musicAttempt;
  if (!musicEnabled || !playing || document.hidden || !scene) {
    soundtrack.pause();
    return;
  }
  musicStatus.textContent = '';
  if (!soundtrack.hasAttribute('src') || soundtrack.error) soundtrack.src = soundtrack.dataset.src;
  soundtrack.play().catch(error => {
    if (attempt !== musicAttempt) return;
    if (error?.name === 'NotAllowedError') {
      musicStatus.textContent = '点击页面后将自动播放背景音乐。';
      return;
    }
    reportMusicError();
  });
}

function setMusic(value) {
  musicEnabled = value;
  music.setAttribute('aria-pressed', String(value));
  musicStatus.textContent = value && !playing ? '播放唱片时将响起背景音乐。' : '';
  syncMusic();
}

function reportMusicError() {
  if (!musicEnabled) return;
  setMusic(false);
  musicStatus.textContent = '无法播放背景音乐，请重试。';
}

function setPlaying(value) {
  playing = value;
  play.setAttribute('aria-label', value ? '暂停' : '播放');
  document.body.dataset.playing = String(value);
  sync();
  render();
}

function selectSeason(index) {
  displaySeason(index);
  turn = .037;
  render();
}

function setSceneAvailable(available) {
  document.querySelector('#unavailable').hidden = available;
  document.querySelector('#controls').hidden = !available;
  music.disabled = !available;
  sync();
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    return;
  }
}

fullscreen.hidden = !document.fullscreenEnabled;
fullscreen.addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', () => {
  const label = document.fullscreenElement ? '退出全屏' : '全屏播放';
  fullscreen.setAttribute('aria-label', label);
  fullscreen.title = label;
});

for (const [i, button] of buttons.entries()) button.addEventListener('click', () => selectSeason(i));
play.addEventListener('click', () => setPlaying(!playing));
music.addEventListener('click', () => setMusic(!musicEnabled));
soundtrack.addEventListener('error', reportMusicError);
function resumeBlockedMusic() {
  if (musicEnabled && playing && soundtrack.paused) syncMusic();
}
document.addEventListener('pointerdown', resumeBlockedMusic, { passive: true });
document.addEventListener('keydown', resumeBlockedMusic);
document.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.repeat || !scene) return;
  if (event.code === 'Space' && !event.target.closest?.('button, a, input, textarea, select')) {
    event.preventDefault();
    setPlaying(!playing);
  }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    selectSeason(season + (event.key === 'ArrowRight' ? 1 : -1));
  }
});
document.addEventListener('visibilitychange', sync);
window.addEventListener('resize', resize);
reducedMotion.addEventListener('change', event => setPlaying(!event.matches));
world.addEventListener('webglcontextlost', event => {
  event.preventDefault();
  scene = undefined;
  setSceneAvailable(false);
});
world.addEventListener('webglcontextrestored', initialize);

function initialize() {
  if (gl) {
    try { scene = createScene(); }
    catch (error) { console.error('无法创建唱片场景', error); }
  }
  setSceneAvailable(Boolean(scene));
  resize();
  setPlaying(playing);
}

for (const [name, image] of Object.entries(images)) {
  image.addEventListener('load', () => {
    if (!scene) return;
    scene.textures[name] = uploadTexture(image);
    if (!playing) render();
  });
  image.src = name === 'terrain' ? 'assets/meadow-materials.jpg' : 'assets/' + name + '-gait.webp';
}
initialize();
