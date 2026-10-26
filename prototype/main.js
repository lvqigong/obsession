import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.163.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.163.0/examples/jsm/loaders/GLTFLoader.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game-canvas');
const ui = { title: $('title-screen'), ending: $('ending-screen'), skip: $('skip-finale'), chapter: $('chapter-label'), objective: $('objective'), subtitle: $('subtitle'), hint: $('hint'), status: $('item-status'), clue: $('clue-status'), light: $('status-dot'), flash: $('flash-overlay'), inspect: $('inspect-panel'), inspectTitle: $('inspect-title'), inspectText: $('inspect-text') };
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x06090d);
scene.fog = new THREE.Fog(0x0a1018, 23, 55);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, .06, 90);
camera.position.set(0, 1.67, 0);
const player = new THREE.Group(); player.add(camera); scene.add(player);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.35;

const state = { started: false, complete: false, stage: 0, time: 0, stageTime: 0, yaw: 0, pitch: 0, locked: false, drag: false, lastPointer: null, light: true, held: false, inspected: false, drawer: false, photo: false, phone: false, radio: false, bedDoor: false, frontDoor: false, porch: false, finale: false, finaleTime: 0, finalePhase: 0, finalePhaseTime: 0, finaleHoldTime: 0, finaleHolding: false, finaleLastE: 0, screamed: false, inspect: false, roomLight: true, hallPower: false, cabinet: false, fuseFound: false, mirror: false, routeMap: false, inspectRotation: 0, nikkiSeen: false, nikkiQuestioned: false };
const keys = new Set(); const clock = new THREE.Clock();
let subtitleTimer; let audioCtx; let master; let droneGain; let rainSource; let rainGain;
let nikkiHideTimer; let motifTimers = [];
const objects = {}; const interactions = []; const obstacles = [];
const boxHome = new THREE.Vector3(2.78, 1.05, .55);
const stages = [
  ['01 / 卧室 · BEAR', '拿起愿望盒，检查抽屉、手机和收音机中的两条线索。'],
  ['02 / 走廊', '探索盥洗间、检查镜面，再接通走廊灯电源。'],
  ['03 / 门廊', '看向车灯，再返回卧室。'],
  ['04 / 回到卧室', '把 One Wish Willow 盒放回床头柜。'],
  ['05 / 愿望解除', '演出进行中'],
];

const mat = (color, roughness = .82, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const mats = { wall: mat(0x67635d), hall: mat(0x4a4543), wood: mat(0x352821), trim: mat(0x8b8275), floor: mat(0x43372f), black: mat(0x12161b), fabric: mat(0x6c6870), skin: mat(0xb39b8e), hair: mat(0x15191e), metal: mat(0xb19b7d, .35, .7) };
// Deterministic canvas maps add grain, paint wear and surface relief without asset downloads.
function surfaceTexture(kind, base, repeats = [1, 1]) {
  const c = document.createElement('canvas'); c.width = c.height = 512; const ctx = c.getContext('2d');
  const color = new THREE.Color(base); ctx.fillStyle = `#${color.getHexString()}`; ctx.fillRect(0, 0, 512, 512);
  let seed = 19447; const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let i = 0; i < 10000; i++) {
    const x = rand() * 512; const y = rand() * 512; const alpha = .025 + rand() * .08; ctx.fillStyle = rand() > .48 ? `rgba(8,7,5,${alpha})` : `rgba(255,249,225,${alpha * .6})`;
    if (kind === 'wood') ctx.fillRect(x, y, 2 + rand() * 3, 22 + rand() * 110); else if (kind === 'fabric') ctx.fillRect(x, y, 1, 3 + rand() * 12); else ctx.fillRect(x, y, 1 + rand() * 3, 1 + rand() * 4);
  }
  if (kind === 'wood') {
    for (let i = 0; i < 5; i++) { ctx.strokeStyle = 'rgba(10,7,4,.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(i * 102.4, 0); ctx.lineTo(i * 102.4, 512); ctx.stroke(); }
    for (let i = 0; i < 8; i++) { ctx.fillStyle = 'rgba(12,7,3,.13)'; ctx.beginPath(); ctx.ellipse(rand() * 512, rand() * 512, 6, 20 + rand() * 16, 0, 0, Math.PI * 2); ctx.fill(); }
  }
  if (kind === 'tile') {
    for (let i = 0; i <= 4; i++) { ctx.fillStyle = '#162d2e'; ctx.fillRect(i * 128 - 2, 0, 4, 512); ctx.fillRect(0, i * 128 - 2, 512, 4); }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeats); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t;
}
function textured(material, kind, color, repeat, bump = .025) {
  material.color.set(0xffffff); material.map = surfaceTexture(kind, color, repeat); material.bumpMap = material.map; material.bumpScale = bump; material.needsUpdate = true;
}
textured(mats.wall, 'plaster', 0x72726b, [3, 2], .018); textured(mats.hall, 'plaster', 0x5d605b, [2, 2], .02);
textured(mats.floor, 'wood', 0x685243, [2, 2], .018); textured(mats.wood, 'wood', 0x44372d, [1, 1], .014); textured(mats.fabric, 'fabric', 0x706a66, [3, 3], .012);
const tileMaterial = mat(0x3e7c77, .27, .02); textured(tileMaterial, 'tile', 0x538f87, [2, 1], .012);
function box(parent, size, pos, material, rot = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material); mesh.position.set(...pos); mesh.rotation.set(...rot); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function cylinder(parent, r1, r2, height, pos, material, rot = [0, 0, 0], segments = 10) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, height, segments), material); mesh.position.set(...pos); mesh.rotation.set(...rot); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function textTexture(text, width = 512, height = 256, color = '#eee6d6', bg = '#292d2e') {
  const c = document.createElement('canvas'); c.width = width; c.height = height;
  const ctx = c.getContext('2d'); ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height); ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const lines = text.split('\n'); ctx.font = `${Math.floor(height / (lines.length * 2.4))}px Georgia, serif`;
  lines.forEach((line, i) => ctx.fillText(line, width / 2, height * ((i + .6) / (lines.length + .2))));
  const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}
function sign(text, width, height, pos, rot, color = '#e3d2b4', bg = '#2a2825') {
  const material = new THREE.MeshStandardMaterial({ map: textTexture(text, 512, 256, color, bg), roughness: .9 });
  return box(scene, [width, height, .03], pos, material, rot);
}
function obstacle(x, z, w, d) { obstacles.push({ x, z, w, d }); }
function interact(id, pos, range, prompt, action) { interactions.push({ id, pos: new THREE.Vector3(...pos), range, prompt, action }); }
function showSubtitle(text, seconds = 4.8) { ui.subtitle.textContent = text; ui.subtitle.classList.add('visible'); clearTimeout(subtitleTimer); subtitleTimer = setTimeout(() => ui.subtitle.classList.remove('visible'), seconds * 1000); }
function updateQuest() {
  ui.chapter.textContent = stages[state.stage][0];
  let objective = stages[state.stage][1];
  const clueCount = Number(state.photo) + Number(state.phone) + Number(state.radio) + Number(state.mirror);
  if (state.stage === 0 && !state.held) objective = '先拿起床头柜上的 One Wish Willow 盒。';
  if (state.stage === 0 && state.held && clueCount < 2) objective = `盒子已拿起。检查卧室线索（${clueCount} / 2）。`;
  if (state.stage === 0 && state.held && clueCount >= 2) objective = '两条线索已确认。打开卧室门，进入走廊。';
  if (state.stage === 1 && !state.cabinet) objective = '回头检查卧室左侧的镜面，确认走廊里的反光线索。';
  else if (state.stage === 1 && state.cabinet && !state.nikkiQuestioned) objective = '走到走廊尽头，回应妮基的质问。';
  else if (state.stage === 1 && state.cabinet && !state.fuseFound) objective = '找到墙上的老式开关，接通走廊灯。';
  if (state.stage === 1 && state.fuseFound) objective = '电源接通。走到前门，按 E 打开。';
  ui.objective.textContent = objective;
  ui.status.textContent = state.held ? '携带：One Wish Willow  ·  I 检查' : '双手：空';
  ui.clue.textContent = `线索 ${clueCount} / 4 · 抽屉${state.drawer ? '开' : '关'} · 卧室灯${state.roomLight ? '亮' : '灭'} · 卧室门${state.bedDoor ? '开' : '关'} · 前门${state.frontDoor ? '开' : '关'}`;
}
function setStage(stage) { if (stage === state.stage) return; state.stage = stage; state.stageTime = 0; updateQuest(); pulse(86 + stage * 11, .45, .035); }
function inspect(title, text) {
  state.inspect = true; ui.inspectTitle.textContent = title; ui.inspectText.textContent = text; ui.inspect.classList.remove('is-hidden'); keys.clear();
  if (document.pointerLockElement) document.exitPointerLock?.();
}
function closeInspect() { state.inspect = false; ui.inspect.classList.add('is-hidden'); updateQuest(); }

function buildBedroom() {
  box(scene, [9.4, .22, 8.4], [0, -.12, 0], mats.floor);
  for (let i = 0; i < 15; i++) box(scene, [.012, .005, 8.2], [-4.5 + i * .63, .002, 0], mat(0x29241f));
  box(scene, [9.4, 4.1, .2], [0, 2.05, 4.2], mats.wall);
  box(scene, [.2, 4.1, 8.4], [-4.7, 2.05, 0], mats.wall);
  box(scene, [.2, 4.1, 8.4], [4.7, 2.05, 0], mats.wall);
  box(scene, [3.8, 4.1, .2], [-2.8, 2.05, -4.1], mats.wall);
  box(scene, [3.8, 4.1, .2], [2.8, 2.05, -4.1], mats.wall);
  box(scene, [1.8, .8, .2], [0, 3.7, -4.1], mats.wall);
  box(scene, [9.4, .18, 8.4], [0, 4.1, 0], mat(0x393d3f));
  for (const x of [-4.55, 4.55]) box(scene, [.08, .14, 8.3], [x, .13, 0], mats.trim);
  box(scene, [9.1, .14, .08], [0, .13, 4.05], mats.trim);
  const bed = new THREE.Group(); bed.position.set(-2.4, 0, .75); objects.fallbackBed = bed;
  box(bed, [3.0, .48, 2.05], [0, .42, 0], mats.wood); box(bed, [3.0, .28, 2], [0, .77, 0], mat(0xb2a799));
  box(bed, [3.15, 1.7, .18], [0, 1.0, -1.07], mats.wood); box(bed, [2.85, .14, 1.18], [0, .98, .36], mat(0x6d5e5e));
  for (const x of [-.78, .62]) box(bed, [1.05, .18, .55], [x, 1.0, -.64], mat(0xa7a79d)); scene.add(bed); obstacle(-2.4, .75, 3.0, 2.05);
  const nightstand = new THREE.Group(); nightstand.position.set(2.78, 0, .55);
  box(nightstand, [1.25, 1.0, .95], [0, .5, 0], mats.wood);
  box(nightstand, [1.32, .1, 1.02], [0, 1.01, 0], mat(0x5a4030));
  objects.drawer = box(nightstand, [1.05, .26, .06], [0, .72, .5], mat(0x614a3e));
  objects.drawerHandle = box(objects.drawer, [.22, .05, .07], [0, 0, .05], mats.metal);
  scene.add(nightstand); obstacle(2.78, .55, 1.25, .95);
  objects.drawerPhoto = box(scene, [.55, .03, .38], [2.78, .79, 1.03], mat(0xd0c7af)); objects.drawerPhoto.visible = false;
  const desk = new THREE.Group(); desk.position.set(-2.9, 0, -2.65);
  box(desk, [2.35, .12, 1.0], [0, .94, 0], mats.wood); for (const x of [-.95, .95]) box(desk, [.14, .9, .65], [x, .45, 0], mats.wood); scene.add(desk); obstacle(-2.9, -2.65, 2.35, 1);
  objects.phone = box(scene, [.28, .05, .5], [-2.3, 1.04, -2.55], mat(0x10171c, .32, .1));
  box(scene, [.22, .015, .37], [-2.3, 1.075, -2.55], new THREE.MeshStandardMaterial({ color: 0x719caa, emissive: 0x204b64, emissiveIntensity: 1.0 }));
  objects.radio = box(scene, [.75, .42, .36], [-3.45, 1.22, -2.65], mat(0x35302b));
  cylinder(scene, .08, .08, .035, [-3.18, 1.22, -2.44], mats.metal, [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 7; i++) box(scene, [.026, .23, .015], [-3.62 + i * .045, 1.22, -2.46], mat(0x8d8376));
  const frame = new THREE.Group(); frame.position.set(3.8, 1.85, 4.03);
  box(frame, [1.15, .85, .08], [0, 0, 0], mats.wood); box(frame, [.94, .65, .02], [0, 0, -.06], mat(0x50636e));
  for (const x of [-.2, .2]) { const head = new THREE.Mesh(new THREE.CircleGeometry(.1, 12), mat(0xd3b6a0)); head.position.set(x, .12, -.08); head.rotation.y = Math.PI; frame.add(head); box(frame, [.18, .28, .02], [x, -.13, -.09], mat(0x292d35)); }
  scene.add(frame);
  box(scene, [2.3, 1.65, .1], [-1.7, 2.45, 4.03], mats.wood);
  box(scene, [2.05, 1.4, .03], [-1.7, 2.45, 3.95], new THREE.MeshStandardMaterial({ color: 0x172c3d, emissive: 0x102e45, emissiveIntensity: .55 }));
  box(scene, [.08, 1.4, .03], [-1.7, 2.45, 3.9], mats.trim);
  for (const x of [-3.1, -.3]) { const curtain = box(scene, [.48, 2.3, .1], [x, 2.0, 3.82], mat(0x48505a)); curtain.rotation.z = x < -1 ? .03 : -.03; }
  const lamp = new THREE.PointLight(0xffca8e, 3.3, 10, 2); lamp.position.set(3.1, 2.5, -1.55); lamp.castShadow = true; scene.add(lamp); objects.bedLamp = lamp;
  cylinder(scene, .05, .08, 1.6, [3.1, 1.25, -1.55], mats.metal);
  cylinder(scene, .28, .45, .5, [3.1, 2.25, -1.55], mat(0xb19471));
  objects.lampBulb = new THREE.Mesh(new THREE.SphereGeometry(.11, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffd7a1, emissive: 0xffb46d, emissiveIntensity: 2.1 })); objects.lampBulb.position.set(3.1, 2.18, -1.55); scene.add(objects.lampBulb);
  interact('lamp', [3.1, 1.25, -1.55], 1.7, () => `E ${state.roomLight ? '关闭' : '打开'}床头灯`, () => { state.roomLight = !state.roomLight; objects.bedLamp.intensity = state.roomLight ? 3.3 : .08; objects.lampBulb.material.emissiveIntensity = state.roomLight ? 2.1 : .08; pulse(state.roomLight ? 370 : 160, .14, .025, 'triangle'); showSubtitle(state.roomLight ? '床头灯重新亮起。暖色反射压住了窗外的冷光。' : '床头灯熄灭，只剩手电和窗外的蓝色反光。', 3.4); updateQuest(); });
  const mirror = new THREE.Group(); mirror.position.set(-3.95, 1.55, -3.0);
  box(mirror, [1.18, 1.8, .08], [0, 0, 0], mats.wood); box(mirror, [.98, 1.58, .02], [0, 0, -.06], new THREE.MeshStandardMaterial({ color: 0x17282d, metalness: .78, roughness: .16, emissive: 0x071215, emissiveIntensity: .35 }));
  box(mirror, [.06, 1.42, .02], [0, 0, -.08], new THREE.MeshBasicMaterial({ color: 0x9fc0bf, transparent: true, opacity: .16 })); scene.add(mirror);
  sign('BEDROOM', .82, .2, [1.65, 2.3, -3.98], [0, 0, 0]);
  objects.bedDoor = makeDoor([-0.9, 0, -4.0], [1.8, 3.2, .14], 1, mats.wood);
  interact('wishbox', [2.78, 1.05, .55], 2.25, () => state.held ? (state.stage === 3 ? 'E 放回 One Wish Willow 盒 · 继续结尾' : 'E 放下盒子') : 'E 拿起 One Wish Willow 盒', takeOrPlaceBox);
  interact('drawer', [2.78, .75, 1.08], 1.65, () => state.drawer ? 'E 关闭抽屉 · 照片已查看' : 'E 打开床头抽屉 / 查看照片', toggleDrawer);
  interact('phone', [-2.3, 1.1, -2.3], 1.7, () => 'E 查看手机留言', () => { state.phone = true; pulse(640, .12, .02); inspect('手机 · 未接来电', '屏幕上只有重复的时间和一通未接来电。\n\n屏幕文字：门外的车还在。别把愿望盒留在这里。\n\n这段文字是原型原创线索，不是电影台词。'); });
  interact('radio', [-3.45, 1.3, -2.4], 1.8, () => 'E 调整收音机 / 收听线索', () => { state.radio = true; musicMotif(); inspect('收音机 · 断续信号', '一段断续的原创低频声铺满房间，随后在电流声里出现一个名字：Nikki。\n\n音乐槽：Forever (licensed placeholder)\n当前音轨：原创 drone；未嵌入商业录音。'); });
  interact('photo', [3.75, 1.8, 3.65], 1.8, () => 'E 查看墙上的照片', () => { state.photo = true; inspect('照片 · 门廊', '一张没有清晰五官的合影。两个人站在同一片门廊灯下。\n\n照片边缘磨损，玻璃映出你身后的卧室门。'); });
  interact('mirror', [-3.75, 1.4, -3.0], 1.6, () => 'E 查看卧室镜面', () => { state.mirror = true; state.cabinet = true; inspect('镜面 · 水痕', '镜面里没有给出清晰的脸，只映出卧室门和一小段走廊。\n\n水汽痕迹像有人用手指写过一个箭头，指向前门。'); updateQuest(); });
  interact('beddoor', [0, 1.5, -3.65], 2.1, () => `E ${state.bedDoor ? '关闭' : '打开'}卧室门`, () => { state.bedDoor = !state.bedDoor; objects.bedDoor.userData.targetAngle = state.bedDoor ? -1.58 : 0; pulse(state.bedDoor ? 120 : 96, .15, .04, 'triangle'); showSubtitle(state.bedDoor ? '卧室门开了。走廊尽头传来雨声。' : '卧室门关上了。', 3); updateQuest(); });
}

function makeDoor(pos, dimensions, direction, material) {
  const pivot = new THREE.Group(); pivot.position.set(...pos); scene.add(pivot);
  const panel = box(pivot, dimensions, [dimensions[0] / 2, dimensions[1] / 2, 0], material);
  const handle = box(pivot, [.08, .08, .15], [dimensions[0] - .18, 1.45, .12], mats.metal);
  pivot.userData.angle = 0; pivot.userData.targetAngle = 0; pivot.userData.direction = direction; pivot.userData.panel = panel; pivot.userData.handle = handle; return pivot;
}

function buildHallAndPorch() {
  box(scene, [4.8, .2, 9.1], [0, -.12, -8.6], mats.floor);
  for (const x of [-2.4, 2.4]) box(scene, [.2, 3.7, 9.1], [x, 1.85, -8.6], mats.hall);
  box(scene, [4.8, .18, 9.1], [0, 3.7, -8.6], mat(0x2a2c30));
  box(scene, [1.45, 3.7, .2], [-1.67, 1.85, -13.05], mats.hall); box(scene, [1.45, 3.7, .2], [1.67, 1.85, -13.05], mats.hall);
  box(scene, [1.85, .4, .2], [0, 3.5, -13.05], mats.hall);
  box(scene, [1.6, .01, 7.5], [0, .005, -8.5], mat(0x4a3032));
  objects.frontDoor = makeDoor([-.92, 0, -12.94], [1.84, 3.25, .16], -1, mat(0x4c3630));
  sign('FRONT DOOR', 1.0, .23, [0, 3.2, -12.8], [0, 0, 0]);
  const hallLight = new THREE.PointLight(0xd3a47e, .18, 9, 2); hallLight.position.set(0, 2.9, -9.2); scene.add(hallLight); objects.hallLight = hallLight;
  const switchPlate = box(scene, [.26, .46, .06], [2.08, 1.48, -9.45], mats.trim); const switchToggle = box(scene, [.08, .14, .05], [2.08, 1.49, -9.41], mats.metal); objects.switchToggle = switchToggle;
  interact('hallSwitch', [2.0, 1.4, -9.15], 1.55, () => state.fuseFound ? `E ${state.hallPower ? '关闭' : '打开'}走廊灯` : 'E 拨动老式电源开关', () => {
    if (!state.cabinet) { showSubtitle('开关上贴着一张镜面反光的便签。先检查盥洗间。', 3); return; }
    if (!state.nikkiQuestioned) { showSubtitle(state.nikkiSeen ? '先回应走廊尽头的妮基，再拨动开关。' : '走廊尽头还没有回应。先听清妮基的声音。', 3); return; }
    state.fuseFound = true; state.hallPower = !state.hallPower; objects.hallLight.intensity = state.hallPower ? 1.45 : .12; objects.switchToggle.position.x = state.hallPower ? 2.13 : 2.03; pulse(state.hallPower ? 220 : 120, .16, .035, 'square'); showSubtitle(state.hallPower ? '走廊灯通电。房子里的门框都显出暖色边缘。' : '走廊灯被关掉了。', 3); updateQuest();
  });
  interact('nikkiQuestion', [0, 1.2, -10.45], 1.8, () => state.nikkiQuestioned ? '妮基已经离开' : 'E 回应妮基', () => {
    if (state.stage !== 1 || !state.nikkiSeen || state.nikkiQuestioned) return;
    state.nikkiQuestioned = true; showSubtitle('妮基：你打开它了吗？\nBear 没有回答。她看了一眼卧室门，转身走向前门。', 5.5); pulse(218, .22, .035, 'triangle'); updateQuest();
    clearTimeout(nikkiHideTimer);
    nikkiHideTimer = setTimeout(() => { nikkiHideTimer = undefined; if (!state.finale && !state.complete) { objects.nikki.visible = false; if (objects.nikkiRemote) objects.nikkiRemote.visible = false; } }, 5200);
  });
  box(scene, [8.8, .25, 5.9], [0, -.12, -16.0], mat(0x514942));
  box(scene, [8.8, .15, 5.9], [0, 3.7, -16.0], mat(0x383b40));
  for (const x of [-4.15, 4.15]) { box(scene, [.18, 3.8, .18], [x, 1.8, -18.6], mats.trim); box(scene, [.12, .12, 5.1], [x, 1.0, -16], mats.trim); }
  const porchLight = new THREE.PointLight(0xd9b188, 2.0, 12, 2); porchLight.position.set(0, 2.75, -14.2); scene.add(porchLight);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), mat(0x111a21, .22)); ground.rotation.x = -Math.PI / 2; ground.position.set(0, -.24, -20); ground.receiveShadow = true; scene.add(ground);
  const car = new THREE.Group(); car.position.set(1.8, .15, -23.4); scene.add(car); objects.car = car;
  box(car, [3.9, .7, 1.9], [0, .6, 0], mat(0x2c363c, .38, .4)); box(car, [2.1, .65, 1.65], [0, 1.21, 0], mat(0x17242f, .22, .3));
  for (const x of [-1.25, 1.25]) for (const z of [-.8, .8]) cylinder(car, .33, .33, .15, [x, .35, z], mats.black, [Math.PI / 2, 0, 0]);
  objects.carLights = [];
  for (const x of [-1.35, 1.35]) {
    box(car, [.48, .24, .035], [x, .7, 1.0], new THREE.MeshStandardMaterial({ color: 0xffe2b1, emissive: 0xffd294, emissiveIntensity: 2 }));
    const light = new THREE.SpotLight(0xffd6a0, 0, 26, .36, .5, 1); light.position.set(x, .7, 1.1); const target = new THREE.Object3D(); target.position.set(x * .5, 1, 12); car.add(light, target); light.target = target; objects.carLights.push(light);
  }
  interact('frontdoor', [0, 1.5, -12.5], 2.15, () => `E ${state.frontDoor ? '关闭' : '打开'}前门`, () => { if (!state.fuseFound) { showSubtitle('门锁旁的开关没有反应。先恢复走廊供电。', 3); return; } state.frontDoor = !state.frontDoor; objects.frontDoor.userData.targetAngle = state.frontDoor ? 1.6 : 0; pulse(state.frontDoor ? 105 : 80, .2, .05, 'triangle'); showSubtitle(state.frontDoor ? '前门开了。冷雨落在门廊栏杆上。' : '前门合上了。', 3.4); updateQuest(); });
  interact('car', [.8, 1.2, -17.5], 2.6, () => state.porch ? 'E 再次查看车灯' : 'E 查看门外的车灯', () => { if (state.stage < 1) return; state.porch = true; objects.carLights.forEach(l => l.intensity = 9); setStage(3); showSubtitle('空车。车灯照过你手中的盒子，然后突然熄灭。\n回到卧室。', 5.5); pulse(61, 1.0, .06); });
}

function buildWishBox() {
  const group = new THREE.Group(); group.position.copy(boxHome); scene.add(group); objects.wishBox = group;
  const cardboard = mat(0x625b68, .76); const edge = mat(0xc3b0a2);
  const shape = new THREE.Shape(); shape.moveTo(-.37, -.26); shape.lineTo(.4, -.26); shape.lineTo(0, .36); shape.closePath();
  const base = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: .08, bevelEnabled: false }), cardboard); base.rotation.x = -Math.PI / 2; base.position.y = .025; group.add(base);
  box(group, [.77, .36, .04], [.015, .19, .26], cardboard);
  box(group, [.7, .36, .04], [-.19, .19, -.04], cardboard, [0, -1.02, 0]);
  box(group, [.7, .36, .04], [.2, .19, -.04], cardboard, [0, 1.02, 0]);
  const labelMaterial = new THREE.MeshStandardMaterial({ map: textTexture('ONE WISH\nWILLOW', 512, 256, '#e7dfd4', '#403746'), roughness: .8 });
  box(group, [.58, .28, .012], [.015, .2, .285], labelMaterial);
  const mark = new THREE.Mesh(new THREE.SphereGeometry(.075, 14, 8), new THREE.MeshStandardMaterial({ color: 0xeae9de, roughness: .4 })); mark.scale.set(1.4, .55, .22); mark.position.set(0, .23, .304); group.add(mark);
  const branches = new THREE.Group(); branches.position.y = .28; group.add(branches); objects.branches = branches;
  const branchMaterial = mat(0x777d7a, .52, .05);
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-.27, 0, 0), new THREE.Vector3(-.12, .16, -.02), new THREE.Vector3(.02, .08, -.07), new THREE.Vector3(.19, .28, -.03), new THREE.Vector3(.28, .18, 0)]);
  const stem = new THREE.Mesh(new THREE.TubeGeometry(curve, 22, .027, 6, false), branchMaterial); branches.add(stem);
  const branch = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, .09, -.05), new THREE.Vector3(-.05, .3, -.08), new THREE.Vector3(.07, .4, -.08)]), 14, .023, 6, false), branchMaterial); branches.add(branch);
  group.userData.homeScale = 1; group.userData.baseRotation = 0;
}

function buildPeople() {
  const nikki = new THREE.Group(); nikki.position.set(.4, 0, .4); nikki.visible = false; scene.add(nikki); objects.nikki = nikki;
  const cloth = mat(0x4b4e58, .9); const trouser = mat(0x242a34, .94);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.29, .62, 6, 14), cloth); torso.position.y = 1.18; torso.scale.z = .62; torso.castShadow = true; torso.receiveShadow = true; nikki.add(torso);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(.09, .11, .14, 12), mats.skin); neck.position.y = 1.63; neck.castShadow = true; nikki.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.22, 20, 14), mats.skin); head.scale.set(.96, 1.12, .9); head.position.y = 1.84; head.castShadow = true; nikki.add(head); objects.nikkiHead = head;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(.245, 18, 12, 0, Math.PI * 2, 0, Math.PI * .67), mats.hair); hair.scale.set(1.02, 1.12, .98); hair.position.set(0, 1.92, .015); hair.castShadow = true; nikki.add(hair);
  const fringe = new THREE.Mesh(new THREE.SphereGeometry(.19, 14, 8), mats.hair); fringe.scale.set(1.15, .42, .52); fringe.position.set(0, 1.98, -.16); fringe.castShadow = true; nikki.add(fringe);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x17151a, roughness: .38 });
  for (const x of [-.075, .075]) {
    const eyeFront = new THREE.Mesh(new THREE.SphereGeometry(.022, 8, 6), eyeMat); eyeFront.position.set(x, 1.86, -.205); nikki.add(eyeFront);
    const eyeBack = new THREE.Mesh(new THREE.SphereGeometry(.022, 8, 6), eyeMat); eyeBack.position.set(x, 1.86, .205); nikki.add(eyeBack);
  }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(.045, .009, 6, 12, Math.PI), new THREE.MeshStandardMaterial({ color: 0x44252b, roughness: .5 })); mouth.rotation.x = Math.PI / 2; mouth.position.set(0, 1.73, -.205); nikki.add(mouth);
  const mouthBack = mouth.clone(); mouthBack.position.z = .205; nikki.add(mouthBack);
  objects.nikkiArms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(.085, .48, 5, 10), cloth); arm.position.set(side * .31, 1.12, 0); arm.rotation.z = side * -.08; arm.castShadow = true; nikki.add(arm); objects.nikkiArms.push(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(.09, 12, 8), mats.skin); hand.position.set(side * .31, .77, -.01); hand.castShadow = true; nikki.add(hand);
  }
  for (const side of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CapsuleGeometry(.11, .58, 5, 10), trouser); leg.position.set(side * .14, .42, 0); leg.castShadow = true; nikki.add(leg); }
  const silhouette = new THREE.Group(); silhouette.visible = false; silhouette.position.set(-.45, 0, 0); scene.add(silhouette); objects.silhouette = silhouette;
  const bodyCloth = mat(0x171b21); const body = new THREE.Mesh(new THREE.CapsuleGeometry(.23, 1.1, 4, 7), bodyCloth); body.rotation.z = Math.PI / 2; body.position.y = .19; silhouette.add(body);
  const headShadow = new THREE.Mesh(new THREE.SphereGeometry(.19, 10, 7), bodyCloth); headShadow.position.set(-.84, .16, 0); silhouette.add(headShadow);
  const bodyBlanket = new THREE.Mesh(new THREE.CapsuleGeometry(.34, 1.35, 5, 10), new THREE.MeshStandardMaterial({ color: 0x4a2f32, roughness: .92 }));
  bodyBlanket.rotation.z = Math.PI / 2; bodyBlanket.position.set(-.45, .33, .02); bodyBlanket.scale.y = .42; bodyBlanket.visible = false; scene.add(bodyBlanket); objects.bodyBlanket = bodyBlanket;
  const arms = new THREE.Group(); camera.add(arms); objects.hands = arms;
  for (const side of [-1, 1]) { box(arms, [.13, .3, .21], [side * .31, -.45, -.5], mat(0x2a2f35), [0, 0, side * -.3]); const hand = new THREE.Mesh(new THREE.SphereGeometry(.085, 8, 6), mats.skin); hand.position.set(side * .36, -.26, -.61); hand.scale.y = 1.3; arms.add(hand); }
  nikki.traverse(node => { if (node.isMesh) node.userData.simpleNikkiFallback = true; });
  // A small, deliberately low-detail figure in the hall gives the doorway a readable silhouette.
  const nikkiRemote = nikki.clone(true); nikkiRemote.visible = false; nikkiRemote.position.set(.35, 0, -5.9); nikkiRemote.rotation.y = Math.PI; nikkiRemote.scale.setScalar(.72);
  nikkiRemote.traverse(node => { if (!node.isMesh) return; node.material = node.material.clone(); node.material.color?.offsetHSL(0, 0, -.24); if ('emissiveIntensity' in node.material) node.material.emissiveIntensity = 0; });
  scene.add(nikkiRemote); objects.nikkiRemote = nikkiRemote;
}

function buildAtmosphere() {
  scene.add(new THREE.HemisphereLight(0xa9bfd0, 0x30251f, .9));
  const moon = new THREE.DirectionalLight(0x9fc6e2, 1.05); moon.position.set(-8, 12, 6); moon.castShadow = true; scene.add(moon);
  const target = new THREE.Object3D(); target.position.set(0, 0, -8); camera.add(target);
  const light = new THREE.SpotLight(0xe2f2ed, 12, 18, Math.PI / 6, .58, 1.25); light.position.set(.1, -.2, -.2); light.target = target; light.castShadow = true; light.shadow.mapSize.set(1024, 1024); camera.add(light); objects.flashlight = light;
  const positions = new Float32Array(1100 * 3);
  for (let i = 0; i < 1100; i++) { positions[i * 3] = (Math.random() - .5) * 35; positions[i * 3 + 1] = Math.random() * 15; positions[i * 3 + 2] = -14 - Math.random() * 25; }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const rain = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0x9faab4, transparent: true, opacity: .6, size: .045 })); scene.add(rain); objects.rain = rain;
}

function loadFurnitureAsset() {
  const loader = new GLTFLoader();
  loader.load('./assets/bedroom_furniture.glb', gltf => {
    const furniture = gltf.scene;
    furniture.name = 'BedroomFurniture_HighDetail';
    furniture.position.set(-2.45, 0.02, .65);
    furniture.scale.setScalar(.78);
    furniture.rotation.y = Math.PI;
    furniture.traverse(node => {
      if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; }
    });
    scene.add(furniture);
    objects.furnitureAsset = furniture;
    if (objects.fallbackBed) objects.fallbackBed.visible = false;
    showSubtitle('卧室里的床品和愿望盒细节已载入。', 2.8);
  }, undefined, () => showSubtitle('高细节家具暂不可用，已保留可玩灰盒。', 2.8));
}

function prepareNikkiAsset(model, height = 2.05) {
  model.rotation.y = 0;
  const rawBounds = new THREE.Box3().setFromObject(model);
  const rawSize = rawBounds.getSize(new THREE.Vector3());
  model.scale.setScalar(height / Math.max(rawSize.y, .001));
  const bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.y -= bounds.min.y;
  model.position.z -= center.z;
  model.traverse(node => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    node.material = node.material?.clone?.() || node.material;
  });
  return model;
}

function loadNikkiAsset() {
  const loader = new GLTFLoader();
  loader.load('../assets/characters/Nikki_Proxy_Original.glb', gltf => {
    const source = gltf.scene;
    const remoteSource = source.clone(true);
    const model = prepareNikkiAsset(source);
    model.name = 'Nikki_Proxy_Original_GLTF';
    objects.nikki.traverse(node => { if (node.userData.simpleNikkiFallback) node.visible = false; });
    objects.nikki.add(model);
    objects.nikkiModel = model;

    const remoteModel = prepareNikkiAsset(remoteSource, 2.05);
    remoteModel.name = 'Nikki_Proxy_Original_Remote_GLTF';
    remoteModel.traverse(node => {
      if (!node.isMesh) return;
      node.material = node.material?.clone?.() || node.material;
      node.material.color?.offsetHSL(0, 0, -.28);
    });
    objects.nikkiRemote.traverse(node => { if (node.userData.simpleNikkiFallback) node.visible = false; });
    objects.nikkiRemote.add(remoteModel);
    objects.nikkiRemoteModel = remoteModel;
    if (state.nikkiSeen && (!state.finale || state.finalePhase > 0)) objects.nikki.rotation.y = 0;
    showSubtitle('Nikki 原创角色模型已载入。', 2.8);
  }, undefined, () => showSubtitle('Nikki 角色模型暂不可用，已保留简化轮廓。', 2.8));
}

function initAudio() {
  if (audioCtx) { audioCtx.resume?.(); return; }
  audioCtx = new AudioContext(); master = audioCtx.createGain(); master.gain.value = .28; master.connect(audioCtx.destination);
  droneGain = audioCtx.createGain(); droneGain.gain.value = .07; droneGain.connect(master);
  for (const frequency of [43.65, 65.5, 87.45]) { const o = audioCtx.createOscillator(); o.type = 'sine'; o.frequency.value = frequency; o.connect(droneGain); o.start(); }
  const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate); const data = buffer.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  rainSource = audioCtx.createBufferSource(); rainSource.buffer = buffer; rainSource.loop = true;
  const filter = audioCtx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 1300;
  rainGain = audioCtx.createGain(); rainGain.gain.value = .035; rainSource.connect(filter).connect(rainGain).connect(master); rainSource.start();
}
function pulse(frequency, duration = .3, volume = .04, type = 'sine') {
  if (!audioCtx) return; const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.type = type; o.frequency.value = frequency; g.gain.setValueAtTime(volume, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(.001, audioCtx.currentTime + duration); o.connect(g).connect(master); o.start(); o.stop(audioCtx.currentTime + duration);
}
function musicMotif() {
  motifTimers.forEach(clearTimeout); motifTimers = [];
  [130.81, 164.81, 146.83].forEach((f, i) => {
    const timer = setTimeout(() => { motifTimers = motifTimers.filter(id => id !== timer); pulse(f, 1.6, .045, 'triangle'); }, i * 550);
    motifTimers.push(timer);
  });
}
function scream() {
  if (!audioCtx) return; const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); const t = audioCtx.currentTime; o.type = 'sawtooth';
  o.frequency.setValueAtTime(470, t); o.frequency.exponentialRampToValueAtTime(890, t + .22); o.frequency.exponentialRampToValueAtTime(380, t + 1.7);
  g.gain.setValueAtTime(.001, t); g.gain.exponentialRampToValueAtTime(.10, t + .1); g.gain.exponentialRampToValueAtTime(.001, t + 1.8);
  const filter = audioCtx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 1200; filter.Q.value = .7; o.connect(filter).connect(g).connect(master); o.start(); o.stop(t + 1.9);
}

function setHeldBox(held) {
  state.held = held;
  if (held) { camera.add(objects.wishBox); objects.wishBox.position.set(.42, -.57, -1.1); objects.wishBox.scale.setScalar(.5); objects.wishBox.rotation.set(.08, -.3, 0); }
  else { scene.add(objects.wishBox); objects.wishBox.position.copy(boxHome); objects.wishBox.scale.setScalar(1); objects.wishBox.rotation.set(0, 0, 0); }
}
function takeOrPlaceBox() {
  if (!state.held) {
    setHeldBox(true); state.inspected = true;
    inspect('One Wish Willow · 检查', '一只三面有棱角的盒子。\n盒内是灰色塑料般的扭曲枝条；正面有白色椭圆标记。\n\n你已拿起盒子。关闭此面板后可继续移动，按 I 再次检查。\n按 E 可在床头柜旁把它放下。');
  } else {
    setHeldBox(false);
    if (state.stage === 3) startFinale(); else showSubtitle('盒子放回了床头柜。离开卧室前请带上它。', 3.5);
  }
  updateQuest();
}
function toggleDrawer() {
  state.drawer = !state.drawer; objects.drawer.position.z = state.drawer ? .87 : .5; objects.drawerPhoto.visible = state.drawer;
  pulse(state.drawer ? 144 : 113, .18, .025, 'triangle');
  if (state.drawer) { state.photo = true; inspect('抽屉 · 一张合影', '抽屉里是一张边角卷起的合影。照片上的人脸没有细节。\n\n照片背面：门廊的车灯一直亮到清晨。\n这是一条可用的环境线索。'); }
  updateQuest();
}
function nearestInteraction() {
  let candidate = null; let distance = Infinity;
  const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), state.yaw);
  for (const item of interactions) {
    if (item.id === 'car' && state.stage < 2) continue;
    if (item.id === 'nikkiQuestion' && (state.stage !== 1 || !state.nikkiSeen || state.nikkiQuestioned)) continue;
    const delta = item.pos.clone().sub(player.position); delta.y = 0; const d = delta.length(); const dot = forward.dot(delta.normalize());
    if (d <= item.range && d < distance && (dot > -.2 || d < .9)) { candidate = item; distance = d; }
  }
  return candidate;
}
function isWalkable(x, z) {
  const bedroom = x > -4.38 && x < 4.38 && z > -3.85 && z < 3.82;
  const bedroomPass = Math.abs(x) < .65 && z > -4.38 && z <= -3.85 && state.bedDoor;
  const hall = Math.abs(x) < 2.1 && z <= -4.25 && z > -12.65;
  const frontPass = Math.abs(x) < .65 && z <= -12.65 && z > -13.4 && state.frontDoor;
  const porch = state.frontDoor && Math.abs(x) < 3.9 && z <= -13.3 && z > -18.45;
  if (!(bedroom || bedroomPass || hall || frontPass || porch)) return false;
  return !obstacles.some(o => x > o.x - o.w / 2 - .23 && x < o.x + o.w / 2 + .23 && z > o.z - o.d / 2 - .23 && z < o.z + o.d / 2 + .23);
}
function movePlayer(dt) {
  if (state.inspect || (state.finale && state.finalePhase > 0) || state.complete) return;
  const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
  const right = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
  const length = Math.hypot(forward, right) || 1; const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 3.7 : 2.35) * dt;
  const dx = (Math.cos(state.yaw) * right - Math.sin(state.yaw) * forward) / length * speed;
  const dz = (-Math.sin(state.yaw) * right - Math.cos(state.yaw) * forward) / length * speed;
  const p = player.position; if (isWalkable(p.x + dx, p.z)) p.x += dx; if (isWalkable(p.x, p.z + dz)) p.z += dz;
  objects.hands.position.y = forward || right ? Math.sin(state.time * 8) * .012 : 0;
}
function finaleDistance() {
  if (!objects.nikki) return Infinity;
  const delta = objects.nikki.position.clone().sub(player.position); delta.y = 0; return delta.length();
}
function setFinalePhase(phase) {
  state.finalePhase = phase; state.finalePhaseTime = 0; state.finaleHoldTime = 0; state.finaleHolding = false;
}
function finaleInteract() {
  if (!state.finale) return;
  if (state.finalePhase === 0) {
    if (finaleDistance() > 1.35) { showSubtitle('再靠近妮基。', 2.2); return; }
    setFinalePhase(1); showSubtitle('你伸手扶住妮基。', 2.8); pulse(174, .22, .04, 'triangle'); return;
  }
  if (state.finalePhase === 2) {
    const now = performance.now();
    if (now - state.finaleLastE < 900) { setFinalePhase(3); showSubtitle('你没有移开视线。她终于安静下来。', 3.2); pulse(98, .7, .055, 'sine'); return; }
    state.finaleLastE = now; state.finaleHolding = true; showSubtitle('保持视线。', 1.4);
  }
}
function startFinale() {
  state.finale = true; state.finaleTime = 0; state.finaleLastE = 0; state.screamed = false; setFinalePhase(0); setStage(4); keys.clear();
  ui.ending.classList.add('is-hidden'); ui.skip.classList.remove('is-hidden');
  showSubtitle('灰色枝条自行折下。房间里压住一切的低鸣突然消失。\n地上的人影失去回应，靠近妮基。', 4.5);
  pulse(67, .6, .08, 'triangle'); if (droneGain) droneGain.gain.linearRampToValueAtTime(.001, audioCtx.currentTime + 1.0);
  objects.nikki.visible = true; objects.nikki.position.set(.45, 0, -.15); objects.nikki.rotation.y = objects.nikkiModel ? 0 : Math.PI; objects.silhouette.visible = true; objects.bodyBlanket.visible = true;
  if (objects.nikkiRemote) objects.nikkiRemote.visible = false;
}
function updateStory(dt) {
  if (state.inspect || state.complete) return;
  state.stageTime += dt;
  if (state.stage === 0 && player.position.z < -4.35) {
    const clueCount = Number(state.photo) + Number(state.phone) + Number(state.radio) + Number(state.mirror);
    if (!state.held || clueCount < 2) { player.position.z = -3.6; showSubtitle(!state.held ? '先把床头柜上的 One Wish Willow 盒带上。' : `还需要两条线索（当前 ${clueCount} / 2）。`, 4); }
    else setStage(1);
  }
  if (state.stage === 1 && player.position.z < -13.5 && !state.fuseFound) { player.position.z = -12.8; showSubtitle('走廊灯没有通电。先回头检查卧室镜面，再拨动墙上的老式开关。', 4); }
  if (state.stage === 1 && player.position.z < -13.5 && state.fuseFound) { setStage(2); objects.carLights.forEach(l => l.intensity = 12); showSubtitle('雨幕里只剩车灯。走近门廊边缘，按 E 查看。', 4.5); }
  if (state.stage === 1 && !state.nikkiSeen && state.stageTime > 4.2) {
    state.nikkiSeen = true; objects.nikki.visible = true; objects.nikki.position.set(0, 0, -10.65); objects.nikki.rotation.y = objects.nikkiModel ? 0 : Math.PI;
    showSubtitle('妮基：你打开它了吗？\n她站在走廊尽头，没有靠近。', 4.5);
  }
  if (state.finale) {
    state.finaleTime += dt; state.finalePhaseTime += dt; const t = state.finaleTime;
    const near = finaleDistance() <= 1.35;
    const look = new THREE.Vector3(objects.nikki.position.x, 1.20, objects.nikki.position.z - .04);
    objects.branches.rotation.z = Math.min(1.1, Math.max(0, (t - .7) * 2)); objects.branches.position.y = .28 - Math.min(.18, Math.max(0, (t - 1.0) * .1));
    objects.nikkiHead.rotation.x = .12 + Math.sin(t * 2) * .03;
    if (state.finalePhase === 0) {
      objects.nikki.rotation.y = Math.atan2(player.position.x - objects.nikki.position.x, player.position.z - objects.nikki.position.z);
      ui.hint.textContent = near ? '已靠近妮基 · 按 E 扶住她' : '靠近妮基 · WASD 移动';
    } else {
      const holdTarget = new THREE.Vector3(objects.nikki.position.x, 0, objects.nikki.position.z + 1.15);
      player.position.lerp(holdTarget, 1 - Math.pow(.02, dt));
      camera.lookAt(look); player.rotation.y = 0;
      objects.nikki.rotation.y = objects.nikkiModel ? 0 : Math.PI;
      if (state.finalePhase === 1) {
        ui.hint.textContent = '扶住妮基……';
        objects.nikkiArms.forEach((arm, i) => { arm.rotation.z = (i ? -.22 : .22) * Math.min(1, state.finalePhaseTime * 1.8); });
        if (state.finalePhaseTime > 1.15) { setFinalePhase(2); showSubtitle('她的呼吸停了一拍。按住 E 保持视线，或再次按 E。', 3.4); }
      } else if (state.finalePhase === 2) {
        ui.hint.textContent = state.finaleHolding ? '保持视线……' : '按住 E 保持视线，或再次按 E';
        if (state.finaleHolding) state.finaleHoldTime += dt;
        if (state.finaleHoldTime >= 1.25) { setFinalePhase(3); showSubtitle('你没有移开视线。她终于安静下来。', 3.2); pulse(98, .7, .055, 'sine'); }
      } else {
        ui.hint.textContent = '保持视线……';
        objects.nikki.position.lerp(new THREE.Vector3(.62, 0, .45), .05);
        objects.nikkiArms.forEach((arm, i) => { arm.rotation.z = (i ? -1 : 1) * Math.min(1.0, state.finalePhaseTime * .9); });
      }
    }
    if (t > 1.5 && t < 1.5 + dt * 2) showSubtitle('妮基：我……我在哪里？', 3.5);
    if (t > 4.3 && !state.screamed) { state.screamed = true; scream(); showSubtitle('妮基看见地上的布料轮廓，意识突然回到她身上。\n她崩溃尖叫。', 4); }
    ui.flash.style.opacity = t > 4.3 && t < 4.55 ? '.15' : '0';
    if (state.finalePhase === 3 && state.finalePhaseTime > 2.6) finish();
  }
}
function finish() {
  state.complete = true; state.finale = false; keys.clear(); ui.skip.classList.add('is-hidden'); ui.ending.classList.remove('is-hidden'); if (document.pointerLockElement) document.exitPointerLock?.();
  ui.hint.textContent = '演出结束 · 可重新开始';
}
function skipFinale() {
  if (!state.finale) return;
  state.finaleTime = 9;
  finish();
}
function applyLook(dx, dy) {
  if (state.inspect || state.complete || (state.finale && state.finalePhase > 0)) return;
  state.yaw -= dx * .0022; state.pitch = THREE.MathUtils.clamp(state.pitch - dy * .0022, -1.22, 1.22); player.rotation.y = state.yaw; camera.rotation.order = 'YXZ'; camera.rotation.set(state.pitch, 0, 0);
}
function lock() { try { const promise = canvas.requestPointerLock?.(); promise?.catch?.(() => {}); } catch { /* mouse drag remains available */ } }
function start() { if (state.started) return; state.started = true; ui.title.classList.add('is-hidden'); initAudio(); updateQuest(); lock(); showSubtitle('Bear 的视角。检查卧室里的盒子与线索，再决定要不要打开门。', 5.4); }
function reset() {
  clearTimeout(nikkiHideTimer); nikkiHideTimer = undefined;
  clearTimeout(subtitleTimer); subtitleTimer = undefined;
  motifTimers.forEach(clearTimeout); motifTimers = [];
  ui.subtitle.classList.remove('visible');
  Object.assign(state, { started: false, complete: false, stage: 0, time: 0, stageTime: 0, yaw: 0, pitch: 0, light: true, held: false, inspected: false, drawer: false, photo: false, phone: false, radio: false, bedDoor: false, frontDoor: false, porch: false, finale: false, finaleTime: 0, finalePhase: 0, finalePhaseTime: 0, finaleHoldTime: 0, finaleHolding: false, finaleLastE: 0, screamed: false, inspect: false, roomLight: true, hallPower: false, cabinet: false, fuseFound: false, mirror: false, nikkiSeen: false, nikkiQuestioned: false });
  state.yaw = -0.72;
  player.position.set(0, 0, 2.4); player.rotation.set(0, state.yaw, 0); camera.rotation.set(0, 0, 0); scene.add(objects.wishBox); objects.wishBox.position.copy(boxHome); objects.wishBox.rotation.set(0, 0, 0); objects.wishBox.scale.setScalar(1); objects.branches.rotation.set(0, 0, 0); objects.branches.position.y = .28;
  objects.drawer.position.z = .5; objects.drawerPhoto.visible = false; objects.nikki.visible = false; objects.nikki.rotation.y = 0; objects.silhouette.visible = false; objects.bodyBlanket.visible = false; objects.nikkiArms.forEach(a => a.rotation.z = 0); objects.bedDoor.rotation.y = 0; objects.bedDoor.userData.targetAngle = 0; objects.frontDoor.rotation.y = 0; objects.frontDoor.userData.targetAngle = 0; objects.carLights.forEach(l => l.intensity = 0); objects.flashlight.intensity = 12; objects.bedLamp.intensity = 3.3; objects.lampBulb.material.emissiveIntensity = 2.1; objects.hallLight.intensity = .18; objects.switchToggle.position.x = 2.03;
  ui.title.classList.remove('is-hidden'); ui.ending.classList.add('is-hidden'); ui.skip.classList.add('is-hidden'); ui.inspect.classList.add('is-hidden'); ui.light.classList.remove('off'); ui.flash.style.opacity = '0'; updateQuest();
  if (objects.nikkiRemote) { objects.nikkiRemote.visible = false; objects.nikkiRemote.position.set(.35, 0, -5.9); objects.nikkiRemote.rotation.y = Math.PI; }
  if (droneGain && audioCtx) droneGain.gain.setValueAtTime(.07, audioCtx.currentTime);
}
function quickJump(targetStage) {
  reset(); start();
  if (targetStage === 0) return;
  state.held = true; state.phone = true; state.radio = true; state.photo = true; state.mirror = true; state.cabinet = true; state.fuseFound = true; state.hallPower = true; state.bedDoor = true; state.frontDoor = targetStage >= 2; state.porch = targetStage >= 3;
  objects.bedDoor.userData.targetAngle = -1.58; objects.frontDoor.userData.targetAngle = state.frontDoor ? 1.6 : 0;
  setHeldBox(true);
  if (targetStage === 1) { player.position.set(0, 0, -8.0); setStage(1); }
  if (targetStage === 2) { player.position.set(0, 0, -15.7); setStage(2); objects.car.visible = true; objects.carLights.forEach(l => l.intensity = 12); }
  if (targetStage === 3) { player.position.set(0, 0, -2.6); setStage(3); objects.car.visible = true; }
  if (targetStage === 4) { player.position.set(0, 0, -2.2); setHeldBox(false); startFinale(); }
  updateQuest();
}
function tick() {
  requestAnimationFrame(tick); const dt = Math.min(clock.getDelta(), .05);
  if (state.started) {
    state.time += dt; movePlayer(dt); updateStory(dt);
    if (objects.nikkiRemote) {
      const remoteVisible = !state.finale && state.stage === 1 && state.bedDoor && !state.nikkiQuestioned;
      objects.nikkiRemote.visible = remoteVisible;
      if (remoteVisible) {
        objects.nikkiRemote.rotation.y = Math.PI + Math.sin(state.time * .65) * .035;
        objects.nikkiRemote.position.x = .35 + Math.sin(state.time * .45) * .025;
      }
    }
    const bedAngle = objects.bedDoor.userData.targetAngle ?? (state.bedDoor ? -1.58 : 0); const frontAngle = objects.frontDoor.userData.targetAngle ?? (state.frontDoor ? 1.6 : 0);
    const doorBlend = 1 - Math.pow(.0001, dt);
    objects.bedDoor.rotation.y = THREE.MathUtils.lerp(objects.bedDoor.rotation.y, bedAngle, doorBlend); objects.frontDoor.rotation.y = THREE.MathUtils.lerp(objects.frontDoor.rotation.y, frontAngle, doorBlend);
    if (Math.abs(objects.bedDoor.rotation.y - bedAngle) < .002) objects.bedDoor.rotation.y = bedAngle;
    if (Math.abs(objects.frontDoor.rotation.y - frontAngle) < .002) objects.frontDoor.rotation.y = frontAngle;
    objects.bedDoor.userData.handle.rotation.z = Math.sin((bedAngle - objects.bedDoor.rotation.y) * 4) * .2;
    objects.frontDoor.userData.handle.rotation.z = Math.sin((frontAngle - objects.frontDoor.rotation.y) * 4) * .2;
    const target = nearestInteraction(); if (!state.inspect && !state.finale && !state.complete) ui.hint.textContent = target ? target.prompt() : 'WASD 移动 · 鼠标观察/拖动 · Shift 快走 · F 手电 · E 互动';
    if (rainGain && audioCtx) rainGain.gain.value = player.position.z < -13 ? .12 : .035;
    if (state.porch) objects.carLights.forEach(l => l.intensity = Math.max(0, l.intensity - dt * 2));
    if (state.held) objects.wishBox.rotation.y = -.3 + Math.sin(state.time * .8) * .025;
  }
  const rain = objects.rain.geometry.attributes.position; for (let i = 0; i < rain.count; i++) { const y = rain.getY(i) - dt * 9; rain.setY(i, y < 0 ? 15 : y); } rain.needsUpdate = true;
  renderer.render(scene, camera);
}

addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
addEventListener('keydown', event => {
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyF', 'KeyI', 'Space'].includes(event.code)) event.preventDefault();
  if (!state.started) return;
  keys.add(event.code); if (event.repeat) return;
  if (/^Digit[1-5]$/.test(event.code)) { quickJump(Number(event.code.slice(-1)) - 1); return; }
  if (state.inspect) { if (['KeyE', 'KeyI', 'Escape'].includes(event.code)) closeInspect(); return; }
  if (state.finale && ['Escape', 'Space'].includes(event.code)) { skipFinale(); return; }
  if (state.finale) { if (event.code === 'KeyE') finaleInteract(); return; }
  if (state.complete) return;
  if (event.code === 'KeyF') { state.light = !state.light; objects.flashlight.intensity = state.light ? 8 : 0; ui.light.classList.toggle('off', !state.light); pulse(280, .05, .03, 'square'); }
  if (event.code === 'KeyE') nearestInteraction()?.action();
  if (event.code === 'KeyI' && state.held) inspect('One Wish Willow · 检查', '三面棱角盒、灰色扭曲塑料枝条、白色椭圆标记。\n\n携带中。返回卧室后，在床头柜旁按 E 放回。\n枝条只用于自动叙事演出，不能作为武器或现实操作道具。');
});
addEventListener('keyup', event => { keys.delete(event.code); if (event.code === 'KeyE') state.finaleHolding = false; }); addEventListener('blur', () => { keys.clear(); state.finaleHolding = false; });
document.addEventListener('pointerlockchange', () => { state.locked = document.pointerLockElement === canvas; });
canvas.addEventListener('mousedown', event => { if (event.button !== 0 || state.locked || state.inspect) return; state.drag = true; state.lastPointer = [event.clientX, event.clientY]; });
addEventListener('mouseup', () => { state.drag = false; state.lastPointer = null; });
addEventListener('mousemove', event => { if (state.locked) applyLook(event.movementX, event.movementY); else if (state.drag && state.lastPointer) { applyLook(event.clientX - state.lastPointer[0], event.clientY - state.lastPointer[1]); state.lastPointer = [event.clientX, event.clientY]; } });
canvas.addEventListener('dblclick', () => { if (state.started && !state.inspect && !state.complete) lock(); });
$('start-button').addEventListener('click', start); $('restart-button').addEventListener('click', () => { reset(); start(); }); $('close-inspect').addEventListener('click', closeInspect);
document.querySelectorAll('[data-jump]').forEach(button => button.addEventListener('click', () => quickJump(Number(button.dataset.jump))));
$('skip-finale').addEventListener('click', skipFinale);

buildBedroom(); buildHallAndPorch(); buildWishBox(); buildPeople(); buildAtmosphere(); loadFurnitureAsset(); loadNikkiAsset(); reset(); tick();
