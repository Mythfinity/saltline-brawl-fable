// Saltline Brawl — an original belt-scroll brawler demo.
// Everything (art, sound) is generated in code; there are no asset files.
(() => {
'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = 960, H = 540;
const FLOOR_TOP = 350, FLOOR_BOT = 520;   // walkable depth band (screen y)
const GRAV = 1700;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sign = v => (v < 0 ? -1 : 1);

// ───────────────────────── input ─────────────────────────
const MAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  KeyJ: 'attack', KeyZ: 'attack', KeyK: 'jump', KeyX: 'jump', Space: 'jump',
  KeyL: 'special', KeyC: 'special', Enter: 'start', KeyP: 'pause',
};
const keys = {}, pressed = {};
addEventListener('keydown', e => {
  const k = MAP[e.code];
  if (!k) return;
  e.preventDefault();
  if (!keys[k]) pressed[k] = true;
  keys[k] = true;
  initAudio();
});
addEventListener('keyup', e => { const k = MAP[e.code]; if (k) keys[k] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

// ───────────────────────── audio ─────────────────────────
let ac = null, noiseBuf = null;
function initAudio() {
  if (ac) return;
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.3, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (err) { ac = null; }
}
function tone(freq, to, dur, type, vol) {
  const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
  o.type = type; o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur);
}
function noise(dur, vol, cutoff) {
  const s = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter(), t = ac.currentTime;
  s.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.value = cutoff;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(ac.destination); s.start(t); s.stop(t + dur);
}
function sfx(name) {
  if (!ac) return;
  switch (name) {
    case 'swing': noise(0.08, 0.12, 2500); break;
    case 'hit': noise(0.12, 0.45, 1400); tone(180, 60, 0.1, 'square', 0.15); break;
    case 'heavy': noise(0.22, 0.6, 900); tone(120, 35, 0.22, 'sawtooth', 0.25); break;
    case 'jump': tone(260, 520, 0.12, 'square', 0.08); break;
    case 'pickup': tone(660, 660, 0.07, 'square', 0.1); setTimeout(() => ac && tone(990, 990, 0.12, 'square', 0.1), 70); break;
    case 'break': noise(0.25, 0.5, 3000); break;
    case 'ko': tone(300, 50, 0.5, 'sawtooth', 0.2); break;
    case 'go': tone(520, 780, 0.2, 'square', 0.1); break;
  }
}

// ───────────────────────── data ─────────────────────────
// a0..a1 = active window (seconds into the move) during which it can connect.
const ATK = {
  jab:        { dur: .22, a0: .05, a1: .14, range: 64, dmg: 6,  push: 70,  stun: .30, anim: 'punch' },
  cross:      { dur: .26, a0: .06, a1: .16, range: 68, dmg: 8,  push: 100, stun: .32, anim: 'punch' },
  upper:      { dur: .42, a0: .10, a1: .24, range: 74, dmg: 14, push: 260, launch: 430, down: true, anim: 'upper' },
  jumpkick:   { dur: 9,   a0: 0,   a1: 9,   range: 72, dmg: 12, push: 250, launch: 300, down: true },
  spin:       { dur: .5,  a0: .04, a1: .42, range: 96, dmg: 14, push: 320, launch: 380, down: true, both: true, depth: 40 },
  thugPunch:  { dur: .58, a0: .30, a1: .40, range: 62, dmg: 6,  push: 80,  stun: .30, anim: 'punch' },
  runnerSlash:{ dur: .55, a0: .24, a1: .40, range: 66, dmg: 8,  push: 130, stun: .32, anim: 'punch', lunge: 320, start: 110 },
  bruiserSlam:{ dur: 1.15,a0: .70, a1: .84, range: 84, dmg: 14, push: 260, launch: 380, down: true, anim: 'slam' },
  bossSwing:  { dur: 1.15,a0: .62, a1: .80, range: 100,dmg: 18, push: 320, launch: 420, down: true, anim: 'slam', depth: 32 },
  bossCharge: { dur: 1.15,a0: .35, a1: 1.0, range: 76, dmg: 16, push: 360, launch: 400, down: true, anim: 'charge', lunge: 430, start: 380, depth: 30 },
};

const LOOKS = {
  hero:    { skin: '#e8b48c', skinD: '#b98863', top: '#e2553a', pants: '#2f4f7f', pantsD: '#223a5e', shoe: '#1b1b22', belt: '#f2c94c', hair: 'pony', hairC: '#3a2418' },
  thug:    { skin: '#d9a47c', skinD: '#a97a58', top: '#5e7d4a', pants: '#3d3a36', pantsD: '#2a2825', shoe: '#15151a', belt: '#222', hair: 'cap', hairC: '#c9b458' },
  runner:  { skin: '#c98f6b', skinD: '#986a4d', top: '#7a4fa0', pants: '#2b2b3a', pantsD: '#1e1e2a', shoe: '#ddd', belt: '#e84d8a', hair: 'mohawk', hairC: '#f25fa0' },
  bruiser: { skin: '#b9805c', skinD: '#8a5d41', top: '#c97b2a', pants: '#4a3a2a', pantsD: '#35291d', shoe: '#15151a', belt: '#222', hair: 'bandana', hairC: '#b3302a' },
  boss:    { skin: '#d6a37f', skinD: '#a67a5c', top: '#1f2f4a', pants: '#14161f', pantsD: '#0d0e15', shoe: '#000', belt: '#d4af37', hair: 'hat', hairC: '#e9e4d4' },
};

const TYPES = {
  thug:    { name: 'DOCK RAT',        hp: 30,  speed: 95,  scale: 1.0,  atks: ['thugPunch'],   score: 500 },
  runner:  { name: 'GULL',            hp: 22,  speed: 165, scale: 0.92, atks: ['runnerSlash'], score: 700, weapon: 'blade' },
  bruiser: { name: 'STEVEDORE',       hp: 75,  speed: 62,  scale: 1.25, atks: ['bruiserSlam'], score: 1500, armor: true },
  boss:    { name: 'THE HARBORMASTER',hp: 220, speed: 88,  scale: 1.5,  atks: ['bossSwing', 'bossCharge'], score: 10000, armor: true, weapon: 'anchor' },
};

// Each encounter locks the camera at `x` until every spawn is defeated.
// spawn = [type, side (1 = from right, -1 = from left), delay seconds]
const WAVES = [
  { x: 320,  spawns: [['thug', 1, 0], ['thug', 1, 1.0], ['thug', -1, 2.5]] },
  { x: 1180, spawns: [['runner', 1, 0], ['thug', -1, .6], ['thug', 1, 1.8], ['runner', -1, 3.5]] },
  { x: 2080, spawns: [['bruiser', 1, 0], ['thug', -1, 1.2], ['runner', 1, 2.4], ['thug', 1, 4]] },
  { x: 3000, spawns: [['boss', 1, .8], ['thug', -1, 7], ['runner', 1, 14]], boss: true },
];
const STAGE_END = 3000 + W;
const BARRELS = [[720, 400, 'gem'], [1560, 480, 'food'], [1800, 380, 'gem'], [2560, 450, 'food'], [3380, 390, 'food']];

// ───────────────────────── state ─────────────────────────
let mode = 'title', paused = false, time = 0;
let player, enemies, barrels, pickups, parts;
let camX, waveIdx, wave, goTimer, banner, bannerT, hitstop, shake, hudTarget, hudTargetT, endT;
let nextId = 1;

function makeFighter(o) {
  return Object.assign({
    id: nextId++, x: 0, y: 430, z: 0, vx: 0, vy: 0, vz: 0, face: 1, scale: 1,
    state: 'idle', t: 0, atk: null, hitIds: null, anim: rand(0, 6),
    hp: 1, maxHp: 1, inv: 0, flash: 0, dead: false, fade: 0, poise: 0,
  }, o);
}

function reset() {
  player = makeFighter({ kind: 'player', name: 'MARA', x: 160, hp: 100, maxHp: 100, look: LOOKS.hero,
    lives: 2, score: 0, queued: false, kicked: false, spinPaid: false });
  enemies = []; pickups = []; parts = [];
  barrels = BARRELS.map(([x, y, drop]) => ({ id: nextId++, kind: 'barrel', x, y, z: 0, hp: 1, drop, inv: 0, state: 'idle' }));
  camX = 0; waveIdx = 0; wave = null; goTimer = 0; hitstop = 0; shake = 0;
  hudTarget = null; hudTargetT = 0; endT = 0;
  banner = 'STAGE 1 — PIER NINE'; bannerT = 2.5;
}

function spawnEnemy(type, side) {
  const T = TYPES[type];
  const e = makeFighter({
    kind: 'enemy', type, name: T.name, hp: T.hp, maxHp: T.hp, scale: T.scale, speed: T.speed,
    armor: !!T.armor, weapon: T.weapon, look: LOOKS[type],
    x: camX + (side > 0 ? W + 70 : -70), y: rand(FLOOR_TOP + 20, FLOOR_BOT - 10), face: -side,
    intent: 'approach', think: rand(0, .3), cd: rand(.2, .8), orbitY: rand(-70, 70), orbitX: rand(160, 240),
    nextAtk: T.atks[0],
  });
  enemies.push(e);
  return e;
}

// ───────────────────────── combat ─────────────────────────
function startAtk(f, name) {
  f.state = 'atk'; f.atk = name; f.t = 0; f.hitIds = new Set();
  sfx('swing');
}

function tryHit(att, def, targets) {
  if (att.t < def.a0 || att.t > def.a1) return;
  const depth = def.depth || 22;
  for (const tg of targets) {
    if (tg.dead || tg.inv > 0 || att.hitIds.has(tg.id)) continue;
    if (tg.state === 'down' || tg.state === 'getup') continue;
    const dx = (tg.x - att.x) * att.face;
    const reach = def.range * att.scale;
    const inX = def.both ? Math.abs(dx) < reach : dx > -12 && dx < reach;
    if (!inX || Math.abs(tg.y - att.y) > depth || Math.abs(tg.z - att.z) > 70) continue;
    att.hitIds.add(tg.id);
    applyHit(att, def, tg);
  }
}

function applyHit(att, def, tg) {
  const dir = sign(tg.x - att.x || att.face);
  const heavy = !!def.down;
  spark(tg.x - dir * 10, tg.y - tg.z - 50 * (tg.scale || 1), heavy ? '#ffd35a' : '#fff', heavy ? 12 : 7);
  hitstop = heavy ? .09 : .05; shake = Math.max(shake, heavy ? 7 : 3);
  sfx(heavy ? 'heavy' : 'hit');

  if (tg.kind === 'barrel') {
    tg.hp = 0; tg.dead = true; sfx('break');
    for (let i = 0; i < 10; i++) parts.push({ x: tg.x + rand(-14, 14), y: tg.y - rand(5, 40), vx: rand(-160, 160), vy: rand(-300, -60), life: .6, c: '#8a5a2b', s: rand(4, 8), g: 900 });
    pickups.push({ x: tg.x, y: tg.y, type: tg.drop, t: 0 });
    player.score += 100;
    return;
  }

  tg.hp = Math.max(0, tg.hp - def.dmg); tg.flash = .12;
  if (att.kind === 'player') {
    player.score += 50; hudTarget = tg; hudTargetT = 2.5;
    if (att.atk === 'spin' && !att.spinPaid) { att.spinPaid = true; att.hp = Math.max(1, att.hp - 6); }
  }

  let knock = heavy || tg.z > 0 || tg.hp <= 0;
  if (tg.type === 'boss' && tg.hp > 0) {       // the boss only goes down once its poise breaks
    tg.poise += def.dmg;
    knock = tg.poise >= 45;
    if (knock) tg.poise = 0;
  }
  if (knock) {
    tg.state = 'fall'; tg.atk = null; tg.face = -dir;
    tg.vz = def.launch || 320; tg.vx = dir * (def.push || 200) * .8; tg.z = Math.max(tg.z, 1);
    if (tg.hp <= 0) sfx('ko');
  } else if (!tg.armor) {
    tg.state = 'hurt'; tg.atk = null; tg.t = def.stun || .3; tg.face = -dir; tg.vx = dir * def.push;
  }
}

function spark(x, y, c, n) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), sp = rand(80, 320);
    parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(.12, .3), c, s: rand(3, 6), g: 0 });
  }
}

// Shared physics + the knocked-about states every fighter goes through.
// Returns true while the fighter is in a state it does not control.
function physics(f, dt) {
  f.anim += dt; f.inv = Math.max(0, f.inv - dt); f.flash = Math.max(0, f.flash - dt);
  f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
  f.y = clamp(f.y, FLOOR_TOP, FLOOR_BOT);
  let landed = false;
  if (f.z > 0) f.vz -= GRAV * dt;
  if (f.z <= 0) { f.z = 0; if (f.vz < 0) { f.vz = 0; landed = true; } }

  switch (f.state) {
    case 'hurt':
      f.vx *= Math.max(0, 1 - 8 * dt); f.vy = 0;
      f.t -= dt; if (f.t <= 0) f.state = 'idle';
      return true;
    case 'fall':
      f.vy = 0;
      if (landed) { f.state = 'down'; f.t = f.hp <= 0 ? .9 : .7; f.vx *= .3; shake = Math.max(shake, 3); }
      return true;
    case 'down':
      f.vx *= Math.max(0, 1 - 8 * dt);
      f.t -= dt; if (f.t <= 0) onDownEnd(f);
      return true;
    case 'getup':
      f.vx = 0; f.t -= dt; if (f.t <= 0) f.state = 'idle';
      return true;
  }
  f.landed = landed;
  return false;
}

function onDownEnd(f) {
  if (f.hp > 0) { f.state = 'getup'; f.t = .3; if (f.kind === 'player') f.inv = 1.3; return; }
  if (f.kind === 'player') {
    if (f.lives > 0) { f.lives--; f.hp = f.maxHp; f.state = 'getup'; f.t = .4; f.inv = 2.2; }
    else { mode = 'over'; endT = 0; }
  } else {
    f.dead = true; f.fade = .8; player.score += TYPES[f.type].score;
  }
}

// ───────────────────────── player ─────────────────────────
function updatePlayer(dt) {
  const p = player;
  const busy = physics(p, dt);
  p.x = clamp(p.x, camX + 26, camX + W - 26);
  if (busy) return;
  const ix = (keys.right ? 1 : 0) - (keys.left ? 1 : 0), iy = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
  const targets = () => enemies.concat(barrels);

  if (p.state === 'idle' || p.state === 'walk') {
    p.vx = ix * 200; p.vy = iy * 135;
    if (ix) p.face = ix;
    p.state = ix || iy ? 'walk' : 'idle';
    if (pressed.special) { startAtk(p, 'spin'); p.inv = .5; p.spinPaid = false; p.vx = p.vy = 0; }
    else if (pressed.attack) { startAtk(p, 'jab'); p.queued = false; p.vx = p.vy = 0; }
    else if (pressed.jump) { p.state = 'jump'; p.vz = 620; p.z = 1; p.kicked = false; p.atk = null; p.vy = 0; sfx('jump'); }
  } else if (p.state === 'atk') {
    const def = ATK[p.atk];
    p.t += dt; p.vx *= Math.max(0, 1 - 10 * dt); p.vy = 0;
    if (p.atk === 'spin') p.face = Math.floor(p.t / .07) % 2 ? 1 : -1;
    else if (pressed.attack) p.queued = true;
    tryHit(p, def, targets());
    if (p.t >= def.dur) {
      const next = { jab: 'cross', cross: 'upper' }[p.atk];
      if (p.queued && next) { if (ix) p.face = ix; startAtk(p, next); p.queued = false; p.vx = p.face * 60; }
      else { p.state = 'idle'; p.atk = null; }
    }
  } else if (p.state === 'jump') {
    p.vx = ix * 200; if (ix && !p.kicked) p.face = ix;
    if (pressed.attack && !p.kicked) { p.kicked = true; p.atk = 'jumpkick'; p.t = 0; p.hitIds = new Set(); sfx('swing'); }
    if (p.kicked) tryHit(p, ATK.jumpkick, targets());
    if (p.landed) { p.state = 'idle'; p.atk = null; }
  }
}

// ───────────────────────── enemies ─────────────────────────
function decide(e) {
  const p = player, def = ATK[e.nextAtk];
  const distX = Math.abs(p.x - e.x), distY = Math.abs(p.y - e.y);
  const info = {
    self: { type: e.type, hpRatio: e.hp / e.maxHp, distX, distY, cooldown: Math.max(0, e.cd),
      inRange: distX < (def.start || def.range * e.scale * .8) && distY < 16 },
    player: { hpRatio: p.hp / p.maxHp, isDown: p.state === 'down' || p.state === 'getup' || p.state === 'fall',
      isAttacking: p.state === 'atk', isAirborne: p.z > 0 },
    attackersNow: enemies.filter(o => o !== e && !o.dead && (o.intent === 'attack' || o.state === 'atk')).length,
    alliesAlive: enemies.filter(o => o !== e && !o.dead).length,
  };
  let r = 'approach';
  try { r = window.BrawlAI.chooseEnemyIntent(info); } catch (err) { console.error('chooseEnemyIntent failed', err); }
  return ['attack', 'circle', 'retreat', 'approach'].includes(r) ? r : 'approach';
}

function updateEnemy(e, dt) {
  if (e.dead) { e.fade -= dt; return; }
  if (physics(e, dt)) return;
  const p = player;
  e.cd -= dt;

  if (e.state === 'atk') {
    const def = ATK[e.atk];
    e.t += dt; e.vy = 0;
    if (def.lunge && e.t >= def.a0 && e.t <= def.a1) e.vx = e.face * def.lunge;
    else e.vx *= Math.max(0, 1 - 10 * dt);
    tryHit(e, def, [p]);
    if (e.t >= def.dur) { e.state = 'idle'; e.atk = null; e.cd = rand(.8, 1.8); e.intent = 'circle'; e.think = rand(.3, .6); }
    return;
  }

  e.think -= dt;
  if (e.think <= 0) {
    e.think = rand(.35, .7);
    const atks = TYPES[e.type].atks;
    e.nextAtk = atks[Math.floor(Math.random() * atks.length)];
    if (Math.random() < .3) e.orbitY = rand(-70, 70);
    e.intent = decide(e);
  }

  const def = ATK[e.nextAtk];
  const start = def.start || def.range * e.scale * .8;
  const side = e.x < p.x ? -1 : 1;
  let tx = e.x, ty = e.y;
  if (e.intent === 'attack' || e.intent === 'approach') { tx = p.x + side * start * .85; ty = p.y; }
  else if (e.intent === 'circle') {
    tx = p.x + side * e.orbitX; ty = p.y + e.orbitY;
    if (tx < camX + 40 || tx > camX + W - 40) tx = p.x - side * e.orbitX;   // no room on this side: swing round
  }
  else if (e.intent === 'retreat') { tx = e.x + side * 200; }
  // never loiter off-screen where the player cannot reach
  tx = clamp(tx, camX + 40, camX + W - 40); ty = clamp(ty, FLOOR_TOP, FLOOR_BOT);

  e.face = p.x >= e.x ? 1 : -1;
  if (e.intent === 'attack' && e.cd <= 0 && Math.abs(p.x - e.x) < start && Math.abs(p.y - e.y) < 16
      && p.state !== 'down' && p.state !== 'getup') {
    startAtk(e, e.nextAtk); e.vx = e.vy = 0;
    return;
  }
  const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
  if (d > 8) { e.vx = dx / d * e.speed; e.vy = dy / d * e.speed * .75; e.state = 'walk'; }
  else { e.vx = e.vy = 0; e.state = 'idle'; }
}

// ───────────────────────── stage flow ─────────────────────────
function updateStage(dt) {
  const alive = enemies.filter(e => !e.dead).length;
  if (wave) {
    wave.t += dt;
    if (!alive && wave.queue.length && wave.t < wave.queue[0][2]) wave.t = wave.queue[0][2];
    while (wave.queue.length && wave.t >= wave.queue[0][2]) {
      const [type, side] = wave.queue.shift();
      const e = spawnEnemy(type, side);
      if (type === 'boss') { banner = 'THE HARBORMASTER'; bannerT = 2.5; hudTarget = e; }
    }
    if (!wave.queue.length && !alive) {
      wave = null; waveIdx++;
      if (waveIdx >= WAVES.length) endT = 0.0001;
      else { goTimer = 3.5; sfx('go'); }
    }
  } else if (waveIdx < WAVES.length) {
    const next = WAVES[waveIdx];
    camX = clamp(Math.max(camX, player.x - W * .42), 0, next.x);
    if (camX >= next.x - .5) wave = { t: 0, queue: next.spawns.slice(), boss: !!next.boss };
  }
  if (waveIdx >= WAVES.length && endT > 0) { endT += dt; if (endT > 2.2) { mode = 'win'; endT = 0; } }
  goTimer = Math.max(0, goTimer - dt);
}

function update(dt) {
  time += dt;
  if (mode !== 'play') {
    endT += dt;
    if (pressed.start && (mode === 'title' || endT > .8)) { reset(); mode = 'play'; }
    return;
  }
  if (pressed.pause) paused = !paused;
  if (paused) return;
  if (hitstop > 0) { hitstop -= dt; return 'hold'; }

  updatePlayer(dt);
  for (const e of enemies) updateEnemy(e, dt);
  enemies = enemies.filter(e => !(e.dead && e.fade <= 0));
  barrels = barrels.filter(b => !b.dead);
  updateStage(dt);

  for (const k of pickups) {
    k.t += dt;
    if (Math.abs(k.x - player.x) < 30 && Math.abs(k.y - player.y) < 22 && player.z < 20 && k.t > .3) {
      k.got = true; sfx('pickup');
      if (k.type === 'food') player.hp = Math.min(player.maxHp, player.hp + 35); else player.score += 1000;
      spark(k.x, k.y - 20, k.type === 'food' ? '#7dff8a' : '#6fd3ff', 8);
    }
  }
  pickups = pickups.filter(k => !k.got);
  for (const q of parts) { q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += q.g * dt; }
  parts = parts.filter(q => q.life > 0);
  shake = Math.max(0, shake - 30 * dt);
  bannerT = Math.max(0, bannerT - dt); hudTargetT = Math.max(0, hudTargetT - dt);
}

// ───────────────────────── rendering ─────────────────────────
const hash = n => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, 330);
  g.addColorStop(0, '#2a1b4a'); g.addColorStop(.55, '#c2506a'); g.addColorStop(1, '#ffb25e');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 330);
  ctx.fillStyle = '#ffe2a0'; ctx.beginPath(); ctx.arc(700 - camX * .03, 250, 46, 0, 7); ctx.fill();

  // far skyline
  let off = camX * .15;
  for (let i = Math.floor(off / 70) - 1; i < (off + W) / 70 + 1; i++) {
    const h = 50 + hash(i) * 120, x = i * 70 - off;
    ctx.fillStyle = '#4a2c58'; ctx.fillRect(x, 300 - h, 56, h);
    ctx.fillStyle = 'rgba(255,214,130,.55)';
    for (let wy = 0; wy < h - 20; wy += 16) if (hash(i * 31 + wy) > .55) ctx.fillRect(x + 8 + (hash(i + wy) * 4 | 0) * 10, 300 - h + 8 + wy, 5, 7);
  }
  // cranes and container stacks
  off = camX * .45;
  for (let i = Math.floor(off / 260) - 1; i < (off + W) / 260 + 1; i++) {
    const x = i * 260 - off, r = hash(i + 99);
    ctx.fillStyle = '#2b1c3a';
    if (r > .5) {
      ctx.fillRect(x + 60, 110, 12, 200); ctx.fillRect(x + 20, 110, 170, 10); ctx.fillRect(x + 170, 120, 3, 60); ctx.fillRect(x + 160, 180, 22, 12);
    }
    const cols = ['#3d2748', '#4b2a45', '#33284f'];
    for (let c = 0; c < 3; c++) for (let s = 0; s < 1 + (hash(i * 7 + c) * 3 | 0); s++) {
      ctx.fillStyle = cols[(i + c + s) % 3 & 3] || cols[0]; ctx.fillRect(x + 90 + c * 52, 286 - s * 26, 50, 24);
    }
  }
  // water
  ctx.fillStyle = '#3a2a5e'; ctx.fillRect(0, 300, W, 40);
  ctx.fillStyle = 'rgba(255,190,120,.35)';
  for (let i = 0; i < 26; i++) { const x = (i * 97 - camX * .6 + Math.sin(time * 1.5 + i) * 8) % (W + 80); ctx.fillRect((x + W + 80) % (W + 80) - 40, 306 + (i % 5) * 7, 28, 2); }

  // dock
  ctx.fillStyle = '#5a4636'; ctx.fillRect(0, 336, W, H - 336);
  ctx.fillStyle = '#3c2d22'; ctx.fillRect(0, 336, W, 8);
  for (let y = 360, i = 0; y < H; y += 14 + i * 4, i++) { ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(0, y, W, 2); }
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  for (let i = Math.floor(camX / 120) - 1; i < (camX + W) / 120 + 1; i++) {
    const x = i * 120 - camX;
    ctx.fillRect(x + (i % 2 ? 40 : 0), 344, 2, 60); ctx.fillRect(x + (i % 2 ? 0 : 60), 404, 2, 70); ctx.fillRect(x + 20, 474, 2, 70);
    if (i % 4 === 0) { ctx.fillStyle = '#2a2530'; ctx.fillRect(x, 322, 14, 22); ctx.fillRect(x - 3, 320, 20, 6); ctx.fillStyle = 'rgba(0,0,0,.22)'; }
  }
  // exit marker at the far end
  const ex = STAGE_END - 60 - camX;
  if (ex < W + 100) { ctx.fillStyle = '#1e1a26'; ctx.fillRect(ex, 190, 140, 150); ctx.fillStyle = '#ffcf5a'; ctx.font = 'bold 18px monospace'; ctx.fillText('PIER 9', ex + 30, 225); }
}

function limb(x, y, ang, len, w, c, extra) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.fillStyle = c; ctx.fillRect(-w / 2, 0, w, len);
  if (extra) extra(len);
  ctx.restore();
}

function pose(f) {
  const P = { rot: 0, lean: 0, armF: -.5, armB: .3, legF: 0, legB: 0, bob: 0, lift: 0 };
  const s = Math.sin(f.anim * 11);
  switch (f.state) {
    case 'idle': P.bob = Math.sin(f.anim * 4) * 1.2; P.armF = -1.0; P.armB = -.6; P.legF = -.15; P.legB = .2; break;
    case 'walk': P.legF = s * .7; P.legB = -s * .7; P.armF = -.6 - s * .4; P.armB = -.2 + s * .4; P.bob = Math.abs(s) * 2; break;
    case 'jump':
      P.legF = -.9; P.legB = .5; P.armF = -2.2; P.armB = .8;
      if (f.atk === 'jumpkick') { P.legF = -1.45; P.legB = .9; P.rot = -.25; P.armF = -.4; }
      break;
    case 'atk': {
      const d = ATK[f.atk], pre = f.t < d.a0, act = f.t >= d.a0 && f.t <= d.a1;
      P.legF = -.3; P.legB = .35;
      if (f.atk === 'spin') { P.armF = -1.57; P.armB = 1.57; P.legF = -.6; P.legB = .6; }
      else if (d.anim === 'upper') { P.armF = pre ? .9 : act ? -2.6 : -1.6; P.lean = pre ? .2 : -.15; P.armB = -.8; }
      else if (d.anim === 'slam') { P.armF = pre ? -3.0 : act ? -1.1 : -.5; P.lean = pre ? -.25 : .4; P.armB = pre ? -2.6 : -.4; }
      else if (d.anim === 'charge') { P.lean = .5; P.armF = -1.3; P.armB = -1.0; P.legF = s * .9; P.legB = -s * .9; }
      else { P.armF = pre ? .5 : act ? -1.57 : -.9; P.lean = pre ? -.1 : act ? .22 : .08; P.armB = -.9; }
      break;
    }
    case 'hurt': P.lean = -.35; P.armF = .4; P.armB = .6; P.rot = -.1; break;
    case 'fall': P.rot = -1.1; P.armF = -2; P.armB = -1.6; P.legF = -.6; break;
    case 'down': P.rot = -Math.PI / 2; P.lift = 7; P.armF = -.3; break;
    case 'getup': P.rot = -.45; P.lean = .5; P.legF = -.8; break;
  }
  return P;
}

function drawFighter(f) {
  const sx = f.x - camX;
  if (sx < -150 || sx > W + 150) return;
  const sh = Math.max(.4, 1 - f.z / 320);
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath(); ctx.ellipse(sx, f.y, 24 * f.scale * sh, 7 * f.scale * sh, 0, 0, 7); ctx.fill();
  if (f.inv > 0 && f.state !== 'atk' && Math.floor(time * 20) % 2) return;

  const P = pose(f), L = f.look, C = c => (f.flash > 0 ? '#fff' : c);
  ctx.save();
  if (f.dead) ctx.globalAlpha = Math.floor(time * 16) % 2 ? .25 : .8;
  ctx.translate(sx, f.y - f.z - P.lift * f.scale); ctx.scale(f.face * f.scale, f.scale);
  ctx.rotate(P.rot); ctx.translate(0, -P.bob);
  const shoe = len => { ctx.fillStyle = C(L.shoe); ctx.fillRect(-5, len - 5, 14, 6); };
  limb(-5, -32, P.legB, 32, 9, C(L.pantsD), shoe);
  limb(5, -32, P.legF, 32, 9, C(L.pants), shoe);
  ctx.translate(0, -32); ctx.rotate(P.lean);
  limb(-5, -27, P.armB, 26, 7, C(L.skinD));
  ctx.fillStyle = C(L.top); ctx.fillRect(-11, -32, 22, 34);
  ctx.fillStyle = C(L.belt); ctx.fillRect(-11, -3, 22, 4);
  ctx.fillStyle = C(L.skin); ctx.fillRect(-8, -49, 16, 17);
  ctx.fillStyle = C('#1a1218'); ctx.fillRect(3, -43, 3, 3);
  ctx.fillStyle = C(L.hairC);
  if (L.hair === 'pony') { ctx.fillRect(-9, -52, 16, 6); ctx.fillRect(-13, -50, 6, 5); ctx.fillRect(-16, -47, 5, 14); }
  else if (L.hair === 'cap') { ctx.fillRect(-9, -53, 17, 7); ctx.fillRect(4, -48, 9, 3); }
  else if (L.hair === 'mohawk') { ctx.fillRect(-4, -58, 10, 10); }
  else if (L.hair === 'bandana') { ctx.fillRect(-9, -50, 18, 5); ctx.fillRect(-14, -49, 6, 3); }
  else if (L.hair === 'hat') {
    ctx.fillRect(-10, -56, 20, 8); ctx.fillStyle = C('#14161f'); ctx.fillRect(-8, -49, 22, 3);
    ctx.fillStyle = C('#cfcfcf'); ctx.fillRect(-2, -38, 11, 8);
  }
  limb(5, -27, P.armF, 26, 8, C(L.skin), len => {
    if (f.weapon === 'blade') { ctx.fillStyle = C('#dfe6ee'); ctx.fillRect(-2, len - 2, 4, 20); }
    if (f.weapon === 'anchor') {
      ctx.fillStyle = C('#8c96a8'); ctx.fillRect(-2, len - 4, 5, 40); ctx.fillRect(-14, len + 30, 29, 6);
      ctx.fillRect(-16, len + 22, 5, 10); ctx.fillRect(12, len + 22, 5, 10); ctx.fillRect(-6, len, 13, 4);
    }
  });
  ctx.restore();
}

function drawBarrel(b) {
  const x = b.x - camX;
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x, b.y, 22, 7, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#8a5a2b'; ctx.fillRect(x - 16, b.y - 44, 32, 44);
  ctx.fillStyle = '#a9743a'; ctx.fillRect(x - 12, b.y - 44, 8, 44);
  ctx.fillStyle = '#3a3a44'; ctx.fillRect(x - 17, b.y - 38, 34, 4); ctx.fillRect(x - 17, b.y - 12, 34, 4);
}

function drawPickup(k) {
  const x = k.x - camX, y = k.y - 10 - Math.abs(Math.sin(k.t * 4)) * 6;
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x, k.y, 12, 4, 0, 0, 7); ctx.fill();
  if (k.type === 'food') {   // thermos of chowder
    ctx.fillStyle = '#e9e4d4'; ctx.fillRect(x - 7, y - 20, 14, 22); ctx.fillStyle = '#d2463a'; ctx.fillRect(x - 7, y - 12, 14, 6);
    ctx.fillStyle = '#888'; ctx.fillRect(x - 5, y - 25, 10, 5);
  } else {
    ctx.fillStyle = '#6fd3ff'; ctx.beginPath(); ctx.moveTo(x, y - 24); ctx.lineTo(x + 10, y - 12); ctx.lineTo(x, y); ctx.lineTo(x - 10, y - 12); ctx.fill();
    ctx.fillStyle = '#c8f1ff'; ctx.fillRect(x - 3, y - 18, 3, 6);
  }
}

function bar(x, y, w, h, ratio, c) {
  ctx.fillStyle = '#000'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = '#4a1c1c'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = c; ctx.fillRect(x, y, w * clamp(ratio, 0, 1), h);
}

function text(str, x, y, size, color, align) {
  ctx.font = `bold ${size}px "Arial Black", Impact, sans-serif`; ctx.textAlign = align || 'left';
  ctx.fillStyle = '#000'; ctx.fillText(str, x + 2, y + 2);
  ctx.fillStyle = color; ctx.fillText(str, x, y);
  ctx.textAlign = 'left';
}

function drawHUD() {
  const p = player;
  text(p.name, 24, 32, 18, '#ffd35a');
  bar(24, 40, 240, 14, p.hp / p.maxHp, '#f2c94c');
  text('×' + Math.max(0, p.lives), 274, 54, 16, '#fff');
  text(String(p.score).padStart(7, '0'), W / 2, 34, 20, '#fff', 'center');
  const boss = enemies.find(e => e.type === 'boss' && !e.dead);
  const tg = boss || (hudTargetT > 0 && hudTarget && !hudTarget.dead ? hudTarget : null);
  if (tg) {
    text(tg.name, W - 24, 32, 16, boss ? '#ff7a6a' : '#fff', 'right');
    const w = boss ? 320 : 180;
    bar(W - 24 - w, 40, w, 12, tg.hp / tg.maxHp, boss ? '#ff5a4a' : '#ff9a5a');
  }
  if (goTimer > 0 && Math.floor(time * 4) % 2) text('GO ▶', W - 40, 120, 40, '#7dff8a', 'right');
  if (bannerT > 0) { ctx.globalAlpha = Math.min(1, bannerT); text(banner, W / 2, 200, 34, '#fff', 'center'); ctx.globalAlpha = 1; }
  if (paused) { ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(0, 0, W, H); text('PAUSED', W / 2, H / 2, 44, '#fff', 'center'); }
}

function overlay(title, sub, color) {
  ctx.fillStyle = 'rgba(8,6,16,.72)'; ctx.fillRect(0, 0, W, H);
  text(title, W / 2, 220, 64, color, 'center');
  text(sub, W / 2, 270, 18, '#fff', 'center');
  if (Math.floor(time * 2) % 2) text('PRESS ENTER', W / 2, 360, 24, '#ffd35a', 'center');
}

function render() {
  ctx.save();
  if (shake > 0 && mode === 'play') ctx.translate(rand(-shake, shake), rand(-shake, shake));
  drawBackground();
  const list = [...barrels, ...pickups.map(k => Object.assign(k, { kind: 'pickup' })), ...enemies, player];
  list.sort((a, b) => a.y - b.y);
  for (const o of list) {
    if (o.kind === 'barrel') drawBarrel(o); else if (o.kind === 'pickup') drawPickup(o); else drawFighter(o);
  }
  for (const q of parts) { ctx.fillStyle = q.c; ctx.fillRect(q.x - camX - q.s / 2, q.y - q.s / 2, q.s, q.s); }
  ctx.restore();

  if (mode === 'title') {
    overlay('SALTLINE BRAWL', 'an original dockside beat ’em up — demo', '#ff7a4a');
    text('MOVE  arrows / WASD     ATTACK  J     JUMP  K     SPECIAL  L', W / 2, 420, 15, '#c9d1e4', 'center');
    text('tap attack ×3 for a combo · attack in the air to jump-kick · special costs health when it lands', W / 2, 446, 13, '#9aa3b8', 'center');
  } else {
    drawHUD();
    if (mode === 'over') overlay('GAME OVER', 'score ' + player.score, '#ff5a4a');
    if (mode === 'win') overlay('PIER CLEARED', 'final score ' + player.score, '#7dff8a');
  }
}

// ───────────────────────── loop ─────────────────────────
let last = performance.now();
function frame(now) {
  const dt = Math.min(.033, (now - last) / 1000); last = now;
  const r = update(dt);
  if (r !== 'hold') for (const k in pressed) pressed[k] = false;   // keep buffered presses through hitstop
  render();
  requestAnimationFrame(frame);
}
reset();
requestAnimationFrame(frame);

// Small inspection/test hook (used for automated playtesting).
window.__brawl = {
  get snapshot() {
    return { mode, camX: Math.round(camX), waveIdx, waveActive: !!wave,
      player: { x: Math.round(player.x), y: Math.round(player.y), hp: player.hp, lives: player.lives, state: player.state, score: player.score },
      enemies: enemies.map(e => ({ type: e.type, hp: e.hp, state: e.state, intent: e.intent, x: Math.round(e.x), dead: e.dead })) };
  },
  step(seconds, input) {   // advance the simulation deterministically-ish without waiting for real time
    for (let t = 0; t < seconds; t += 1 / 60) {
      if (input) input(keys, pressed, { player, enemies });
      const r = update(1 / 60);
      if (r !== 'hold') for (const k in pressed) pressed[k] = false;
    }
    render();
    return this.snapshot;
  },
};
})();
