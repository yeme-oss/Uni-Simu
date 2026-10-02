import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './ui.css';
import { t } from './i18n.js';
import { createWhiteboard3D, RIGHT_BOARD } from './whiteboard/board3d.js';
import { BOARD_WIDTH, BOARD_HEIGHT } from './whiteboard/constants.js';
import { createWhiteboardDemo } from './whiteboard/demo.js';
import { createQuizBoard } from './whiteboard/quizBoard.js';

// --- Scene calibration ------------------------------------------------------
// classroom.glb is an AI-generated single mesh (~1 unit wide), so its boards
// aren't separate objects. Their rectangles were measured by raycasting the
// mesh and are expressed in the classroom's raw local units.
const CLASSROOM_SCALE = 8;            // raw units -> metres (board ends up ~3.3 m wide)
const STAGE_FLOOR_Y = -0.2425;        // raw y of the stage floor
const BOARD = {                       // back-wall board (slides)
  center: new THREE.Vector3(0.0334, -0.0223, -0.3960),
  width: 0.4103,
  height: 0.2355,
  yaw: Math.atan2(0.0315, 0.409),     // back wall is rotated ~4.4° around Y
  standOff: 0.0015,                   // push slide off the wall to avoid z-fighting
};
const TEACHER_HEIGHT = 1.75;          // metres
// Speaker's spot behind the lectern (raw units), facing the microphones. The
// lectern is turned ~15° and its mics point towards +x, so he faces mostly -x.
const TEACHER_SPOT = new THREE.Vector3(0.066, STAGE_FLOOR_Y, 0.006);
const TEACHER_YAW = Math.atan2(-0.967, 0.255);
const TALK_FADE = 0.4;

// --- Renderer / scene -------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x15171c);

scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a66, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(2, 6, 4);
scene.add(sun);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 200);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
// Touch: one finger pans across the board, two fingers pinch to zoom (and pan).
// Mouse keeps OrbitControls' defaults (rotate / pan / wheel zoom).
controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
controls.screenSpacePanning = true;
controls.minDistance = 0.8;
controls.maxDistance = 9;

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// --- Load assets ------------------------------------------------------------
// The loading screen (index.html) shows download progress of the models.
const loadingScreen = {
  stage: document.getElementById('loading-stage'),
  bar: document.getElementById('loading-bar'),
  detail: document.getElementById('loading-detail'),
};
const downloads = new Map(); // url -> { loaded, total (0 = unknown) }
const MB = (bytes) => (bytes / 1e6).toFixed(1);
function trackDownload(url) {
  downloads.set(url, { loaded: 0, total: 0 });
  return (event) => {
    downloads.set(url, { loaded: event.loaded, total: event.lengthComputable ? event.total : 0 });
    const all = [...downloads.values()];
    const loaded = all.reduce((s, d) => s + d.loaded, 0);
    const known = all.every((d) => d.total > 0);
    const total = all.reduce((s, d) => s + d.total, 0);
    loadingScreen.bar.classList.toggle('indeterminate', !known);
    loadingScreen.bar.firstElementChild.style.width = known ? `${(100 * loaded) / total}%` : '';
    loadingScreen.detail.textContent = known ? `${MB(loaded)} / ${MB(total)} MB` : `${MB(loaded)} MB`;
  };
}

loadingScreen.stage.textContent = t('loading.models');
const loader = new GLTFLoader();
const [classroomGltf, teacherGltf] = await Promise.all([
  loader.loadAsync('/classroom.glb', trackDownload('/classroom.glb')),
  loader.loadAsync('/teacher.glb', trackDownload('/teacher.glb')),
]).catch((err) => {
  loadingScreen.stage.textContent = t('loading.error', { error: err.message ?? err });
  loadingScreen.bar.hidden = true;
  document.querySelector('#loading .spinner').hidden = true;
  throw err;
});
loadingScreen.stage.textContent = t('loading.scene');
loadingScreen.bar.classList.add('indeterminate');
loadingScreen.detail.textContent = '';

// Classroom: scaled to metres, stage floor at y = 0.
const classroom = new THREE.Group();
classroom.scale.setScalar(CLASSROOM_SCALE);
classroom.position.y = -STAGE_FLOOR_Y * CLASSROOM_SCALE;
classroom.add(classroomGltf.scene);
scene.add(classroom);

// Slide plane on the back-wall board, parented to the classroom so it lives in raw units.
const boardNormal = new THREE.Vector3(0, 0, 1).applyAxisAngle(THREE.Object3D.DEFAULT_UP, BOARD.yaw);
const slideMaterial = new THREE.MeshBasicMaterial({
  toneMapped: false,
  polygonOffset: true,
  polygonOffsetFactor: -4,
});
const slide = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), slideMaterial);
slide.position.copy(BOARD.center).addScaledVector(boardNormal, BOARD.standOff);
slide.rotation.y = BOARD.yaw;
slide.visible = false;
classroom.add(slide);

// Whiteboard (right wall): diagrams drawn stroke by stroke.
const whiteboard = createWhiteboard3D({ renderer, parent: classroom });

// Left board (back wall): the end-of-demo quiz, drawn on a canvas covering the whole board.
let quizTexture = null;
const quizBoard = createQuizBoard({
  aspect: BOARD.width / BOARD.height,
  onChange: () => {
    quizTexture.needsUpdate = true;
    slide.visible = quizBoard.visible;
  },
});
quizTexture = new THREE.CanvasTexture(quizBoard.canvas);
quizTexture.colorSpace = THREE.SRGBColorSpace;
quizTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
slideMaterial.map = quizTexture;
slide.scale.set(BOARD.width, BOARD.height, 1);

/**
 * Shows an image on the back-wall board, fit inside it keeping its aspect ratio.
 * Accepts any URL (incl. blob:/data: URLs). The board starts blank; this is kept
 * for the pictures that will go there.
 */
const textureLoader = new THREE.TextureLoader();
export async function setSlide(url) {
  const tex = await textureLoader.loadAsync(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const aspect = tex.image.width / tex.image.height;
  const boardAspect = BOARD.width / BOARD.height;
  const w = aspect > boardAspect ? BOARD.width : BOARD.height * aspect;
  slide.scale.set(w, w / aspect, 1);
  slideMaterial.map?.dispose();
  slideMaterial.map = tex;
  slideMaterial.needsUpdate = true;
  slide.visible = true;
}

// Teachers: scaled to TEACHER_HEIGHT, feet on the stage, standing at the lectern.
classroom.updateMatrixWorld(true);
const TEACHER_ORIGIN = classroom.localToWorld(TEACHER_SPOT.clone());

function createTeacher(gltf) {
  const model = gltf.scene;
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  model.scale.setScalar(TEACHER_HEIGHT / (box.max.y - box.min.y));
  model.position.y = -box.min.y * model.scale.y;

  const root = new THREE.Group();
  root.add(model);
  root.position.copy(TEACHER_ORIGIN);
  root.rotation.y = TEACHER_YAW;
  root.visible = false;
  scene.add(root);

  // Speaking = the 'Talking' clip; silent = a still pose taken from its first frame.
  const mixer = new THREE.AnimationMixer(model);
  const talkingClip = THREE.AnimationClip.findByName(gltf.animations, 'Talking') ?? gltf.animations[0];
  if (!talkingClip) return { root, mixer, setSpeaking() {} };
  const idleClip = new THREE.AnimationClip('Idle', -1, talkingClip.tracks.map((track) => {
    const n = track.getValueSize();
    return new track.constructor(track.name, [0], Array.from(track.values.slice(0, n)));
  }));
  const talkAction = mixer.clipAction(talkingClip);
  const idleAction = mixer.clipAction(idleClip).play();

  let speaking = false;
  function setSpeaking(on) {
    if (on === speaking) return;
    speaking = on;
    if (on) {
      // Start each utterance at a random point so gestures don't repeat identically.
      talkAction.reset().play();
      talkAction.time = Math.random() * talkingClip.duration;
      idleAction.crossFadeTo(talkAction, TALK_FADE, false);
    } else {
      idleAction.reset().play();
      talkAction.crossFadeTo(idleAction, TALK_FADE, false);
    }
  }
  return { root, mixer, setSpeaking };
}

const teachers = { male: createTeacher(teacherGltf), female: null };
let activeTeacher = teachers.male;

// Presentation mode: 'male' | 'female' | 'none' (classroom only) | '2d' (flat whiteboard).
const flat = document.getElementById('wb-flat');
const modeSelect = document.getElementById('wb-teacher');
let modeToken = 0;

async function setMode(mode) {
  const token = ++modeToken;
  if (mode === 'female' && !teachers.female) {
    teachers.female = createTeacher(await loader.loadAsync('/teacher_female.glb'));
    if (token !== modeToken) return; // a newer selection superseded this one
  }
  activeTeacher = teachers[mode] ?? null;
  for (const t of Object.values(teachers)) if (t) t.root.visible = t === activeTeacher;

  const is2D = mode === '2d';
  document.body.classList.toggle('mode-2d', is2D); // lets the phone layout rearrange around the flat board
  renderer.domElement.style.display = is2D ? 'none' : 'block'; // index.html's canvas rule beats [hidden]
  flat.hidden = !is2D;
  if (is2D) flat.append(whiteboard.canvas);
  else whiteboard.canvas.remove();

  // The corner button offers the other view.
  view2d.textContent = is2D ? '3D' : '2D';
  view2d.setAttribute('aria-pressed', String(is2D));
  view2d.dataset.i18nTitle = is2D ? 'view.3d.title' : 'view.2d.title';
  view2d.title = t(view2d.dataset.i18nTitle);
}
modeSelect.addEventListener('change', () => setMode(modeSelect.value));

// "2D" corner button: flat, full-screen whiteboard, and back to the previous mode.
const view2d = document.getElementById('wb-view-2d');
const MODE_BEFORE_2D = 'wb-mode-before-2d';
view2d.addEventListener('click', () => {
  if (modeSelect.value === '2d') {
    let previous = null;
    try { previous = localStorage.getItem(MODE_BEFORE_2D); } catch { /* storage unavailable */ }
    modeSelect.value = [...modeSelect.options].some((o) => o.value === previous && previous !== '2d') ? previous : 'male';
  } else {
    try { localStorage.setItem(MODE_BEFORE_2D, modeSelect.value); } catch { /* ignore */ }
    modeSelect.value = '2d';
  }
  modeSelect.dispatchEvent(new Event('change')); // applies the mode and saves the setting
});

// Camera: student seated front-left, seeing the lecturer, the slides (back wall)
// and the whiteboard (right wall) at a readable angle.
const eye = classroom.localToWorld(new THREE.Vector3(-0.16, STAGE_FLOOR_Y, 0.30));
eye.y += 2.1;
camera.position.copy(eye);
controls.target.copy(classroom.localToWorld(new THREE.Vector3(0.2, -0.04, -0.22)));
controls.update();

// --- Phones and small screens -------------------------------------------------
// Same breakpoint as ui.css: portrait phones, and landscape phones (short screens).
const MOBILE = matchMedia('(max-width: 760px), (max-height: 500px)');

// Panning and zooming stay inside the room (walls, floor and ceiling, with a margin).
const roomBox = new THREE.Box3().setFromObject(classroom).expandByScalar(-0.3);
controls.addEventListener('change', () => {
  const before = controls.target.clone();
  controls.target.clamp(roomBox.min, roomBox.max);
  camera.position.add(controls.target.clone().sub(before)); // move the camera with its clamped target
  camera.position.clamp(roomBox.min, roomBox.max);
});

/** Faces the right-wall whiteboard, as close as fits the screen without leaving the room. */
function frameWhiteboard() {
  const center = classroom.localToWorld(RIGHT_BOARD.center.clone());
  const normal = new THREE.Vector3(Math.sin(RIGHT_BOARD.yaw), 0, Math.cos(RIGHT_BOARD.yaw)); // into the room
  const width = RIGHT_BOARD.width * CLASSROOM_SCALE * 1.1;
  const height = RIGHT_BOARD.height * CLASSROOM_SCALE * 1.1;
  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  const fit = Math.max(width / 2 / Math.tan(hfov / 2), height / 2 / Math.tan(vfov / 2));
  camera.position.copy(center).addScaledVector(normal, Math.min(fit, 5.5)); // portrait: pan to see the rest
  controls.target.copy(center);
  controls.update();
}
if (MOBILE.matches) frameWhiteboard();

// Settings drawer (phones): slides in from the left; the scene stays usable around it.
const panelToggle = document.getElementById('panel-toggle');
function setPanelOpen(open) {
  document.body.classList.toggle('panel-open', open);
  panelToggle.setAttribute('aria-expanded', String(open));
  panelToggle.textContent = open ? '✕' : '☰';
  panelToggle.dataset.i18nAriaLabel = open ? 'panel.close' : 'panel.open';
  panelToggle.setAttribute('aria-label', t(panelToggle.dataset.i18nAriaLabel));
}
panelToggle.addEventListener('click', () => setPanelOpen(!document.body.classList.contains('panel-open')));
addEventListener('keydown', (e) => { if (e.key === 'Escape' && MOBILE.matches) setPanelOpen(false); });
renderer.domElement.addEventListener('pointerdown', () => { if (MOBILE.matches) setPanelOpen(false); });
flat.addEventListener('pointerdown', () => { if (MOBILE.matches) setPanelOpen(false); });
document.getElementById('ptt').addEventListener('pointerdown', () => { if (MOBILE.matches) setPanelOpen(false); });
// Starting something from the drawer closes it, so the board is in view.
for (const id of ['wb-play', 'wb-restart', 'wb-resume', 'wb-generate', 'wb-go', 'wb-ask', 'wb-cu-open']) {
  document.getElementById(id).addEventListener('click', () => { if (MOBILE.matches) setPanelOpen(false); });
}
setPanelOpen(false);

const whiteboardDemo = createWhiteboardDemo({ board: whiteboard, quizBoard });

// --- Right-click / long press on the board: "Explain" menu (see demo.js) ------------------
const PORTRAIT_PHONE = matchMedia('(max-width: 760px) and (orientation: portrait)');
const raycaster = new THREE.Raycaster();

/** A client point in the page's own coordinates (the 2D view turns the page on upright phones). */
function pagePoint(clientX, clientY) {
  const turned = document.body.classList.contains('mode-2d') && PORTRAIT_PHONE.matches;
  return turned ? { x: clientY, y: innerWidth - clientX } : { x: clientX, y: clientY };
}

/** 3D view: where the ray through the pointer meets the whiteboard, in board units. */
function boardPointIn3D(clientX, clientY) {
  const r = renderer.domElement.getBoundingClientRect();
  raycaster.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), camera);
  const hit = raycaster.intersectObject(whiteboard.mesh)[0];
  return hit?.uv ? { x: hit.uv.x * BOARD_WIDTH, y: (1 - hit.uv.y) * BOARD_HEIGHT } : null;
}

/** 2D view: the pointer on the flat board (object-fit: contain leaves margins around it). */
function boardPointIn2D(event) {
  const c = whiteboard.canvas;
  const k = Math.min(c.clientWidth / c.width, c.clientHeight / c.height);
  const left = (c.clientWidth - c.width * k) / 2, top = (c.clientHeight - c.height * k) / 2;
  const x = ((event.offsetX - left) / (c.width * k)) * BOARD_WIDTH; // offsetX/Y follow the page's rotation
  const y = ((event.offsetY - top) / (c.height * k)) * BOARD_HEIGHT;
  return x >= 0 && x <= BOARD_WIDTH && y >= 0 && y <= BOARD_HEIGHT ? { x, y } : null;
}

function openBoardMenu(event, point) {
  if (point) whiteboardDemo.openContextMenu(pagePoint(event.clientX, event.clientY), point.x, point.y);
}

// Mouse: right-click. A right-drag pans the 3D view, so it doesn't open the menu.
let rightPress = null;
renderer.domElement.addEventListener('pointerdown', (e) => { if (e.button === 2) rightPress = { x: e.clientX, y: e.clientY }; });
renderer.domElement.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const dragged = rightPress && Math.hypot(e.clientX - rightPress.x, e.clientY - rightPress.y) > 6;
  rightPress = null;
  if (!dragged) openBoardMenu(e, boardPointIn3D(e.clientX, e.clientY));
});
whiteboard.canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  openBoardMenu(e, boardPointIn2D(e));
});

// Touch: a long press (held still; a second finger means a pinch, not a press).
function onLongPress(el, handler) {
  let timer = null, start = null, fingers = 0;
  const cancel = () => { clearTimeout(timer); timer = null; };
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    fingers += 1;
    cancel();
    if (fingers > 1) return;
    start = { x: e.clientX, y: e.clientY };
    timer = setTimeout(() => { timer = null; handler(e); }, 550);
  });
  el.addEventListener('pointermove', (e) => {
    if (timer && e.pointerType === 'touch' && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel();
  });
  const release = (e) => { if (e.pointerType === 'touch') { fingers = Math.max(0, fingers - 1); cancel(); } };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
}
onLongPress(renderer.domElement, (e) => openBoardMenu(e, boardPointIn3D(e.clientX, e.clientY)));
onLongPress(whiteboard.canvas, (e) => openBoardMenu(e, boardPointIn2D(e)));

// --- Quiz on the left board: click (or tap) an option or a page arrow ------------------
/** The quiz canvas pixel under a client point, or null if the pointer isn't on the quiz. */
function quizPointAt(clientX, clientY) {
  if (!slide.visible || !flat.hidden) return null;
  const r = renderer.domElement.getBoundingClientRect();
  raycaster.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), camera);
  const hit = raycaster.intersectObject(slide)[0];
  return hit?.uv ? { x: hit.uv.x * quizBoard.canvas.width, y: (1 - hit.uv.y) * quizBoard.canvas.height } : null;
}
let primaryPress = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button === 0) primaryPress = { x: e.clientX, y: e.clientY, at: performance.now() };
});
renderer.domElement.addEventListener('pointerup', (e) => {
  const press = primaryPress;
  primaryPress = null;
  // A click, not a drag of the view (nor a long press, which opens the "Explain" menu).
  if (!press || Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6 || performance.now() - press.at > 500) return;
  const p = quizPointAt(e.clientX, e.clientY);
  if (p) quizBoard.click(p.x, p.y);
});
// Hovering a question or an answer shows its full text (long ones are shortened on the board).
const quizTip = document.getElementById('quiz-tip');
function showQuizTip(text, e) {
  quizTip.hidden = !text;
  if (!text) return;
  if (quizTip.textContent !== text) quizTip.textContent = text;
  const room = { w: document.body.clientWidth, h: document.body.clientHeight };
  const x = Math.min(e.clientX + 14, room.w - quizTip.offsetWidth - 8);
  const y = e.clientY + 18 + quizTip.offsetHeight > room.h ? e.clientY - quizTip.offsetHeight - 10 : e.clientY + 18;
  quizTip.style.left = `${Math.max(8, x)}px`;
  quizTip.style.top = `${Math.max(8, y)}px`;
}
renderer.domElement.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' || e.buttons) return showQuizTip(null);
  const p = quizPointAt(e.clientX, e.clientY);
  renderer.domElement.style.cursor = p && quizBoard.isClickable(p.x, p.y) ? 'pointer' : '';
  showQuizTip(p && quizBoard.tipAt(p.x, p.y), e);
});
renderer.domElement.addEventListener('pointerleave', () => showQuizTip(null));
addEventListener('wheel', () => showQuizTip(null), { passive: true }); // zooming moves the board under the pointer
await setMode(modeSelect.value);

// --- Loop -------------------------------------------------------------------
const timer = new THREE.Timer();
renderer.setAnimationLoop((time) => {
  timer.update(time);
  const dt = timer.getDelta();
  whiteboardDemo.update(dt);
  const speaking = whiteboardDemo.isSpeaking(dt); // the teacher gestures while their voice is audible
  for (const t of Object.values(teachers)) t?.setSpeaking(t === activeTeacher && speaking);
  activeTeacher?.mixer.update(dt);
  if (flat.hidden) {
    controls.update();
    renderer.render(scene, camera);
  }
});

const loadingOverlay = document.getElementById('loading');
loadingOverlay.classList.add('done'); // fades out, then goes away
setTimeout(() => loadingOverlay.remove(), 500);
window.__ready = true;
