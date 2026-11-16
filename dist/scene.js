const TAU = Math.PI * 2;
const SEASON_DURATION = 15;
const seasons = [
  { word: '春', english: 'SPRING', color: '#edb8ee', rgb: '237, 184, 238', particles: '251, 191, 230' },
  { word: '夏', english: 'SUMMER', color: '#d6e9ab', rgb: '214, 233, 171', particles: '242, 253, 150' },
  { word: '秋', english: 'AUTUMN', color: '#ffc49c', rgb: '255, 196, 156', particles: '255, 162, 81' },
  { word: '冬', english: 'WINTER', color: '#b9d9fc', rgb: '185, 217, 252', particles: '227, 244, 255' },
];

const sky = document.querySelector('#sky');
const life = document.querySelector('#life');
const skyContext = sky.getContext('2d');
const lifeContext = life.getContext('2d');
const starMap = document.createElement('canvas');
const mapContext = starMap.getContext('2d');
const record = document.querySelector('#record-spin');
const buttons = [...document.querySelectorAll('[data-season]')];
const tiles = [...document.querySelectorAll('[data-tile]')];
const playButton = document.querySelector('#play');
const skySize = { width: 0, height: 0 };
const discSize = { width: 0, height: 0 };
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const pets = [
  { image: new Image(), size: .139, phase: 2.04, bob: 0 },
  { image: new Image(), size: .163, phase: 1.03, bob: 1.45 },
];
pets[0].image.src = 'assets/cat.png';
pets[1].image.src = 'assets/dog.png';
for (const pet of pets) pet.image.addEventListener('load', renderScene);

let activeSeason = 0;
let playing = !motion.matches;
let elapsed = 0;
let seasonTime = 0;
let lastFrame = 0;
let frameRequest = 0;
let fadingTile;
let transitionTimer;

function seededRandom(seed) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const random = seededRandom(512);
const stars = Array.from({ length: 530 }, () => ({
  x: random(), y: random(), radius: .28 + random() ** 4 * 1.25,
  brightness: .11 + random() ** 2 * .72, tint: random(), phase: random() * TAU,
}));
const glints = [
  [.14, .21, 4.6], [.82, .23, 3.6], [.87, .58, 4], [.22, .72, 3.1], [.67, .105, 2.5],
  [.08, .53, 3.2], [.92, .36, 2.7], [.33, .155, 2.55], [.77, .74, 2.4], [.48, .92, 2.4],
];
const meteors = [
  { x: .91, y: .14, angle: 2.66, period: 8.1, offset: .31, length: 176 },
  { x: .27, y: .15, angle: .54, period: 10.9, offset: 10.82, length: 126 },
  { x: .96, y: .56, angle: 2.72, period: 12.3, offset: 7.1, length: 156 },
];
const motes = Array.from({ length: 33 }, () => ({
  phase: random(), angle: random() * TAU, radius: .14 + random() * .25, size: .6 + random() * 1.4,
}));

function fitCanvas(canvas, context, size) {
  const bounds = canvas.getBoundingClientRect();
  const resolution = Math.min(devicePixelRatio || 1, 2);
  size.width = bounds.width;
  size.height = bounds.height;
  canvas.width = Math.max(1, Math.round(bounds.width * resolution));
  canvas.height = Math.max(1, Math.round(bounds.height * resolution));
  context.setTransform(resolution, 0, 0, resolution, 0, 0);
}

function mapSky() {
  const { width, height } = skySize;
  starMap.width = sky.width;
  starMap.height = sky.height;
  mapContext.setTransform(starMap.width / width, 0, 0, starMap.height / height, 0, 0);
  const cloudRandom = seededRandom(4108);
  mapContext.globalCompositeOperation = 'screen';
  for (let i = 0; i < 130; i++) {
    const progress = cloudRandom();
    const x = progress * width;
    const y = (.93 - progress * .73 + (cloudRandom() - .5) * .25) * height;
    const radius = (cloudRandom() * .13 + .024) * Math.min(width, height);
    const color = progress > .57 ? '126, 68, 158' : '62, 73, 162';
    const glow = mapContext.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, `rgba(${color}, ${.021 + cloudRandom() * .05})`);
    glow.addColorStop(1, `rgba(${color}, 0)`);
    mapContext.fillStyle = glow;
    mapContext.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  for (const star of stars) {
    const tint = star.tint > .72 ? '217, 181, 252' : '201, 215, 255';
    mapContext.fillStyle = `rgba(${tint}, ${star.brightness})`;
    mapContext.beginPath();
    mapContext.arc(star.x * width, star.y * height, star.radius, 0, TAU);
    mapContext.fill();
  }
}

function drawGlint(context, x, y, radius, glow) {
  context.fillStyle = `rgba(229, 207, 255, ${glow})`;
  context.beginPath();
  context.moveTo(x, y - radius);
  context.quadraticCurveTo(x + .6, y - .7, x + radius * .85, y);
  context.quadraticCurveTo(x + .6, y + .7, x, y + radius);
  context.quadraticCurveTo(x - .6, y + .7, x - radius * .85, y);
  context.quadraticCurveTo(x - .6, y - .7, x, y - radius);
  context.fill();
}

function drawSky() {
  const { width, height } = skySize;
  if (!width || !height) return;
  skyContext.clearRect(0, 0, width, height);
  skyContext.drawImage(starMap, 0, 0, width, height);
  for (const [x, y, size] of glints) {
    drawGlint(skyContext, x * width, y * height, size, .49 + Math.sin(elapsed * 1.45 + x * 19) * .24);
  }
  if (motion.matches && !playing) return;
  for (const meteor of meteors) {
    const age = (elapsed + meteor.offset) % meteor.period;
    if (age >= 1.8) continue;
    const distance = age * Math.min(width * .53, 620);
    const dx = Math.cos(meteor.angle);
    const dy = Math.sin(meteor.angle);
    const x = width * meteor.x + dx * distance;
    const y = height * meteor.y + dy * distance;
    const length = Math.min(width * .26, meteor.length) * Math.min(1, age * 3.8);
    if (length < 1) continue;
    const endX = x - length * dx;
    const endY = y - length * dy;
    const brightness = Math.min(.95, age * 5, (1.8 - age) * 1.65);
    const trail = skyContext.createLinearGradient(x, y, endX, endY);
    trail.addColorStop(0, `rgba(250, 231, 255, ${brightness})`);
    trail.addColorStop(.19, `rgba(198, 152, 251, ${brightness * .62})`);
    trail.addColorStop(1, 'rgba(170, 129, 246, 0)');
    skyContext.strokeStyle = trail;
    skyContext.lineWidth = 1.4;
    skyContext.beginPath();
    skyContext.moveTo(endX, endY);
    skyContext.lineTo(x, y);
    skyContext.stroke();
    drawGlint(skyContext, x, y, 3.5, brightness);
  }
}

function trackPet(pet) {
  const angle = pet.phase - elapsed * .77 + .16 * Math.sin(elapsed * 1.22 + pet.phase);
  return {
    pet,
    x: .5 + Math.cos(angle) * .197,
    y: .508 + Math.sin(angle) * .115,
    facing: Math.sin(angle) < 0 ? -1 : 1,
    stride: Math.sin(elapsed * 12 + pet.bob),
  };
}

function drawPet({ pet, x, y, facing, stride }, size) {
  if (!pet.image.complete || !pet.image.naturalWidth) return;
  x *= size;
  y *= size;
  const width = size * pet.size;
  const height = width * pet.image.naturalHeight / pet.image.naturalWidth;
  const lift = (stride + 1) * size * .007;
  lifeContext.fillStyle = `rgba(24, 11, 31, ${.37 - stride * .09})`;
  lifeContext.beginPath();
  lifeContext.ellipse(x, y + 1, width * .34, width * .083, 0, 0, TAU);
  lifeContext.fill();
  lifeContext.save();
  lifeContext.translate(x, y - lift);
  lifeContext.scale(facing * (1 + stride * .032), 1 - stride * .036);
  lifeContext.rotate(.073 * stride);
  lifeContext.drawImage(pet.image, -width / 2, -height * .94, width, height);
  lifeContext.restore();
}

function drawMeadow() {
  const { width } = discSize;
  if (!width) return;
  lifeContext.clearRect(0, 0, width, width);
  const runningPets = pets.map(trackPet).sort((first, second) => first.y - second.y);
  for (const pet of runningPets) drawPet(pet, width);
  const particleColor = seasons[activeSeason].particles;
  for (const mote of motes) {
    const drift = (mote.phase + elapsed * (.072 + mote.size * .016)) % 1;
    const angle = mote.angle + elapsed * .14;
    const x = width * (.5 + Math.cos(angle) * mote.radius + .06 * drift);
    const y = width * (.525 + Math.sin(angle) * mote.radius * .565 - .105 * drift);
    const brightness = Math.sin(drift * Math.PI) * .76;
    const scale = Math.max(.66, width / 600);
    const radius = mote.size * scale;
    if (activeSeason === 1) {
      drawGlint(lifeContext, x, y, radius * 1.65, brightness);
      continue;
    }
    lifeContext.fillStyle = `rgba(${particleColor}, ${brightness})`;
    lifeContext.beginPath();
    lifeContext.ellipse(x, y, radius * (activeSeason === 2 ? 1.5 : 1), radius * (activeSeason === 3 ? 1 : .59), angle * 2, 0, TAU);
    lifeContext.fill();
  }
}

function renderScene() {
  record.style.transform = `rotate(${elapsed * 90 / SEASON_DURATION % 360}deg)`;
  drawSky();
  drawMeadow();
}

function resizeScene() {
  fitCanvas(sky, skyContext, skySize);
  fitCanvas(life, lifeContext, discSize);
  mapSky();
  renderScene();
}

function chooseSeason(index) {
  seasonTime = 0;
  const nextSeason = (index + seasons.length) % seasons.length;
  if (nextSeason === activeSeason) return;
  window.clearTimeout(transitionTimer);
  if (fadingTile) fadingTile.classList.remove('is-previous');
  fadingTile = tiles[activeSeason];
  fadingTile.classList.replace('is-visible', 'is-previous');
  activeSeason = nextSeason;
  tiles[activeSeason].classList.add('is-visible');
  transitionTimer = window.setTimeout(() => fadingTile.classList.remove('is-previous'), 1500);
  const season = seasons[activeSeason];
  document.querySelector('#season-word').textContent = season.word;
  document.querySelector('#season-english').textContent = season.english;
  document.documentElement.style.setProperty('--accent', season.color);
  document.documentElement.style.setProperty('--accent-rgb', season.rgb);
  buttons.forEach((button, index) => button.setAttribute('aria-pressed', index === activeSeason));
  renderScene();
}

function tick(now) {
  if (!playing || document.hidden) return;
  const delta = lastFrame ? Math.min(.05, (now - lastFrame) / 1000) : 0;
  lastFrame = now;
  elapsed += delta;
  seasonTime += delta;
  if (seasonTime >= SEASON_DURATION) chooseSeason(activeSeason + 1);
  else renderScene();
  frameRequest = requestAnimationFrame(tick);
}

function syncAnimation() {
  cancelAnimationFrame(frameRequest);
  lastFrame = 0;
  if (playing && !document.hidden) frameRequest = requestAnimationFrame(tick);
}

function setPlaying(nextPlaying) {
  playing = nextPlaying;
  document.body.dataset.playing = String(playing);
  document.querySelector('#playback-status').textContent = playing ? '循环播放中' : '已暂停';
  playButton.setAttribute('aria-label', playing ? '暂停转动' : '播放唱片');
  syncAnimation();
  renderScene();
}

buttons.forEach((button) => button.addEventListener('click', () => chooseSeason(Number(button.dataset.season))));
document.querySelector('#previous').addEventListener('click', () => chooseSeason(activeSeason - 1));
document.querySelector('#next').addEventListener('click', () => chooseSeason(activeSeason + 1));
playButton.addEventListener('click', () => setPlaying(!playing));
document.addEventListener('keydown', (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
  if (event.code === 'Space' && !event.target.closest('button, a, input, textarea, select')) {
    event.preventDefault();
    setPlaying(!playing);
  }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    chooseSeason(activeSeason + (event.key === 'ArrowLeft' ? -1 : 1));
  }
});
document.addEventListener('visibilitychange', syncAnimation);
motion.addEventListener('change', (event) => setPlaying(!event.matches));
window.addEventListener('resize', resizeScene);
resizeScene();
setPlaying(playing);
