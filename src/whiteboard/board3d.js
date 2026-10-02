// The whiteboard surface in the 3D scene: an offscreen canvas shown through a
// CanvasTexture on a plane laid over the right-wall board of classroom.glb.
import * as THREE from 'three';
import { BOARD_WIDTH, BOARD_HEIGHT, FONT_FAMILY } from './constants.js';

// Right-wall board, measured by raycasting classroom.glb (raw classroom units).
export const RIGHT_BOARD = {
  center: new THREE.Vector3(0.3851, -0.021, -0.0685),
  width: 0.4043,
  height: 0.226,
  yaw: -(Math.PI / 2 - Math.atan(0.0336)), // faces into the room; the wall is turned ~1.9°
  standOff: 0.0015,
};

const CANVAS_WIDTH = 2048;

/**
 * Creates the board mesh (parented to `parent`, e.g. the classroom group) and
 * its canvas. Call markDirty() after drawing: it uploads the texture on the
 * next render; `uploads` counts those uploads.
 */
export function createWhiteboard3D({ renderer, parent, rect = RIGHT_BOARD }) {
  const canvas = Object.assign(document.createElement('canvas'), {
    width: CANVAS_WIDTH,
    height: Math.round((CANVAS_WIDTH * BOARD_HEIGHT) / BOARD_WIDTH),
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.8,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -4,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(rect.width, rect.height), material);
  const normal = new THREE.Vector3(0, 0, 1).applyAxisAngle(THREE.Object3D.DEFAULT_UP, rect.yaw);
  mesh.position.copy(rect.center).addScaledVector(normal, rect.standOff);
  mesh.rotation.y = rect.yaw;
  parent.add(mesh);

  let uploads = 0;
  return {
    canvas,
    texture,
    mesh,
    get uploads() { return uploads; },
    markDirty() {
      texture.needsUpdate = true;
      uploads++;
    },
    /** Resolves once the marker font can be drawn on the canvas. */
    loadFont: () => document.fonts.load(`40px "${FONT_FAMILY}"`),
  };
}
