'use strict';

const TAU = Math.PI * 2;
const TURN_SECONDS = 16;
const startAngle = -1.15;
const colors = ['#bccf9d', '#8eb99b', '#dcb37c', '#afc7df'];
const world = document.querySelector('#world');
const sky = document.querySelector('#meteors');
const play = document.querySelector('#play');
const fullscreen = document.querySelector('#fullscreen');
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
vec3 groundColor(int s) {
  if (s == 0) return vec3(.208, .285, .135);
  if (s == 1) return vec3(.137, .228, .090);
  if (s == 2) return vec3(.408, .277, .134);
  return vec3(.667, .745, .835);
}
vec3 bladeColor(int s) {
  if (s == 0) return vec3(.423, .552, .253);
  if (s == 1) return vec3(.290, .459, .169);
  if (s == 2) return vec3(.717, .499, .254);
  return vec3(.798, .868, .946);
}
float softShadow(vec2 p, vec4 pet, vec2 size) {
  vec2 d = p - pet.xy - vec2(.093, .068);
  vec2 q = vec2(dot(d, pet.zw), dot(d, vec2(-pet.w, pet.z))) / size;
  float contact = exp(-dot(q, q) * 2.2);
  float penumbra = exp(-dot(q, q) * .72);
  return contact * .37 + penumbra * .17;
}
float petShadow(vec2 p) {
  return 1.0 - softShadow(p, uCat, vec2(.46, .18)) - softShadow(p, uDog, vec2(.56, .21));
}
float stylusLight(vec2 p) {
  float a = uStart + uSweep * PI2;
  vec2 d = vec2(cos(a), sin(a));
  float along = dot(p, d);
  float side = dot(p, vec2(-d.y, d.x));
  return (exp(-side * side * 18.5) * .13 + exp(-side * side * 1.5) * .09) *
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
    float h = meadowHeight(p);
    vec2 diff = rotation(uTwist) * vec2(h - meadowHeight(p + vec2(.043, 0)), h - meadowHeight(p + vec2(0, .043)));
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
  return mix(groundColor(season), texture(uTerrain, uv).rgb, season == 3 ? .78 : .72);
}
void main() {
  vec2 p = vP.xz;
  float r = length(p);
  vec3 n = normalize(vN);
  float l = dot(n, normalize(vec3(-.55, .85, -.31)));
  vec3 color;
  if (uPart == 0) {
    float season = seasonAt(p);
    float snow = mix(uFrom == 3 ? 1.0 : 0.0, uTo == 3 ? 1.0 : 0.0, season);
    vec2 q = rotation(-uTwist) * p;
    float grain = noise(q * 125.0);
    float folds = noise(q * 1.2 + noise(q * 3.0) * .72);
    float groundLight = (.75 + .18 * folds + .057 * grain) *
      (.64 + .42 * max(l, 0.0)) * (1.0 - .16 * smoothstep(4.5, 5.17, r));
    vec3 diffuse = mix(groundSample(uFrom, q), groundSample(uTo, q), season);
    vec3 reflected = mix(vec3(.84, .90, .89), vec3(.86, .93, 1.05), snow);
    color = diffuse * reflected * groundLight * petShadow(p);
    color += vec3(.045, .054, .060) * snow * pow(grain, 12.0);
    color += vec3(.49, .37, .13) * stylusLight(p);
  } else if (uPart == 1) {
    float band = .74 + .26 * smoothstep(-.26, .015, vP.y);
    color = vec3(.070, .086, .096) * band * (.67 + .52 * max(l, 0.0));
    color += vec3(.045, .059, .067) * pow(.5 + .5 * cos(vP.y * 174.0), 5.0) *
      (.22 + .78 * max(l, 0.0));
    color += vec3(.072, .083, .089) * smoothstep(-.052, .006, vP.y);
  } else if (uPart == 2) {
    float grooves = .5 + .5 * sin(r * 155.0);
    float specular = pow(max(dot(n, normalize(vec3(-.28, .85, -.38))), 0.0), 7.0);
    color = vec3(.036, .047, .050) + vec3(.10, .11, .114) * specular * .28;
    if (n.y > .6) {
      float edge = 1.0 - smoothstep(.004, .017, abs(r - .708));
      float inner = 1.0 - smoothstep(.003, .012, abs(r - .405));
      color += (grooves * .009 + edge * .38 + inner * .105) * vec3(.82, .87, .86);
    } else {
      color *= .72 + max(l, 0.0) * .38;
    }
  } else {
    float angle = fract((atan(p.y, p.x) - uTwist) / PI2 + 1.0);
    float hashmarks = smoothstep(.942, .996, fract(angle * 144.0));
    color = vec3(.19, .22, .235) * (.53 + .50 * max(l, 0.0));
    color += hashmarks * vec3(.18, .21, .22) * (.33 + .44 * max(l, 0.0));
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
  float tufts = noise(aSeed.xy * 1.43 + noise(aSeed.xy * 5.7) * .52);
  float height = (.067 + pow(aSeed.z, 2.0) * .216) * mix(.37, 1.31, smoothstep(.22, .72, tufts));
  height *= mix(1.0, .029 + .089 * pow(aSeed.z, 6.0), winter);
  float t = aBlade.y;
  float width = .008 + aSeed.w * .010;
  vec2 face = vec2(cos(aSeed.w * PI2), sin(aSeed.w * PI2));
  vec2 wind = vec2(sin(p.x * 1.3 + p.y * .61 - uTime * 1.2), cos(p.y * .63 - uTime * .9));
  vec2 slip = vec2(.019, .005) + wind * .056;
  float flatten = min(1.0, petShadow(p) * 1.30);
  vec2 stem = p + face * aBlade.x * width + (slip + face * .052) * t * t * (1.0 - winter * .85);
  gl_Position = project(vec3(stem.x, .018 + meadowHeight(aSeed.xy) + t * height * flatten, stem.y));
  vec3 base = mix(groundColor(uFrom), groundColor(uTo), season);
  vec3 tip = mix(bladeColor(uFrom), bladeColor(uTo), season);
  float sun = max(0.0, dot(face, vec2(-.75, -.55)));
  float lighting = (.59 + .25 * aSeed.z + .32 * sun) * (1.0 - .16 * smoothstep(4.15, 5.18, r));
  float pattern = .64 + .23 * tufts + .31 * noise(aSeed.xy * .81);
  vColor = mix(base * .67, tip, t * .79 + .16) * lighting * pattern * petShadow(p);
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
out float vSoft;
void main() {
  vec2 p;
  float height;
  float size;
  if (uGlow) {
    float a = uStart + uSweep * PI2;
    vec2 d = vec2(cos(a), sin(a));
    p = d * 4.91;
    height = .41;
    size = 61.0;
    vColor = vec4(1.0, .73, .30, .36);
    vSoft = 1.0;
  } else if (aSeed.w < .54) {
    p = rotation(uTwist) * aSeed.xy;
    float season = seasonAt(p);
    float spring = mix(uFrom == 0 ? 1.0 : 0.0, uTo == 0 ? 1.0 : 0.0, season);
    float summer = mix(uFrom == 1 ? 1.0 : 0.0, uTo == 1 ? 1.0 : 0.0, season);
    vec3 color = mix(vec3(.92, .88, .67), vec3(.78, .70, .82), aSeed.z * .62);
    vColor = vec4(color, (.58 + .22 * aSeed.z) * spring + .24 * summer);
    height = .054 + meadowHeight(aSeed.xy) + aSeed.z * .116;
    size = 1.0 + pow(aSeed.z, 2.8) * 2.1;
    vSoft = .05;
  } else {
    float life = fract(aSeed.z + uTime * (.18 + aSeed.w * .17));
    float a = uStart + uSweep * PI2 - life * (.37 + aSeed.w * .42) + aSeed.x * .027;
    float r = .72 + sqrt(abs(aSeed.y) / 5.1) * 4.48 + life * aSeed.x * .17;
    p = vec2(cos(a), sin(a)) * r;
    height = .14 + sin(life * 3.14159) * (.16 + aSeed.w * aSeed.w * (uTo == 3 ? 1.35 : .76));
    height += .073 * sin(uTime * 1.8 + aSeed.x);
    float brightness = pow(max(0.0, sin(life * 3.14159)), .68);
    vec3 warm = vec3(.97, .79, .49);
    vec3 tint = mix(warm, vec3(.78, .88, .99), uTo == 3 ? .90 : .22);
    vColor = vec4(tint, brightness * (.39 + mod(aSeed.y * 12.0, 1.0) * .58));
    size = 1.15 + aSeed.z * aSeed.z * 2.45;
    vSoft = .24;
  }
  gl_Position = project(vec3(p.x, height, p.y));
  gl_PointSize = max(1.0, size * uPixel);
}
`;
const fleckFragment = `
in vec4 vColor;
in float vSoft;
out vec4 outColor;
void main() {
  float r = length(gl_PointCoord - .5) * 2.0;
  float falloff = (1.0 - smoothstep(.28 - vSoft * .25, 1.0, r)) * exp(-r * r * vSoft * 3.5);
  outColor = vec4(vColor.rgb, vColor.a * falloff);
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
  float h = meadowHeight(rotation(-uTwist) * p) + .017 + uPetPose.w;
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
  vec3 color = pixel.rgb * vec3(.87, .90, .91) + pixel.rgb * warmth * vec3(.92, .49, .17);
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
  surface(1, 5.20, 5.15, .003, -.257, 192);
  surface(3, 5.205, 5.108, .010, .010, 192);
  const rows = 24;
  for (let row = 0; row < rows; row++) {
    surface(0, 5.135 * (rows - row) / rows, 5.135 * (rows - row - 1) / rows, .014, .014, 144, row > 0);
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
    const radius = Math.sqrt(.021 + random() * .979) * 5.118;
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
  const seeds = bufferData(fieldSeeds(59000, 4108));
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
  const count = 1980;
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
  const offset = puppy ? .78 + .20 * Math.sin(time * 1.2) : 0;
  const a = .45 + time * .93 + .22 * Math.sin(time * 1.3) - offset;
  const x = 1.66 * Math.sin(a) + .18 * Math.sin(a * 2);
  const z = 1.96 + .86 * Math.cos(a) + .12 * Math.sin(2 * a);
  const angle = Math.atan2(-.86 * Math.sin(a) + .24 * Math.cos(2 * a), 1.66 * Math.cos(a) + .36 * Math.cos(2 * a));
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
  link(batch, root, [4.63, .407, 0], [5.14, .434, 0], .052, [1, .85, .51], 1);
  link(batch, root, [4.79, .443, 0], [5.07, .461, 0], .028, [1, .96, .75], 1);
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
let elapsed = 0;
let turn = .23;
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
    const width = (pet.kind === 'puppy' ? .934 : .833) * (.78 + .22 * Math.abs(pet.c));
    const height = pet.kind === 'puppy' ? .608 : .570;
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
  const density = layout.width < 600 ? 37000 : 59000;
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
  gl.uniform1f(particles.Pixel, layout.pixel * Math.max(.72, Math.min(1.25, layout.unit / 91)));
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
