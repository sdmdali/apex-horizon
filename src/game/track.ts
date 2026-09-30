import * as THREE from 'three';
import { HALF_WIDTH, TRACK_WIDTH } from './constants';

export const trackControlPoints: THREE.Vector3[] = [
  new THREE.Vector3(0, 0, -320),
  new THREE.Vector3(140, 4, -340),
  new THREE.Vector3(280, 10, -260),
  new THREE.Vector3(340, 16, -120),
  new THREE.Vector3(260, 8, 20),
  new THREE.Vector3(160, 2, 100),
  new THREE.Vector3(220, 12, 240),
  new THREE.Vector3(180, 18, 360),
  new THREE.Vector3(40, 10, 400),
  new THREE.Vector3(-120, 4, 340),
  new THREE.Vector3(-220, 0, 240),
  new THREE.Vector3(-160, 8, 120),
  new THREE.Vector3(-260, 14, -20),
  new THREE.Vector3(-320, 6, -160),
  new THREE.Vector3(-220, 2, -280),
];

export const trackCurve = new THREE.CatmullRomCurve3(trackControlPoints, true, 'centripetal', 0.5);
export const TRACK_LENGTH = trackCurve.getLength();

const upRef = new THREE.Vector3(0, 1, 0);

export interface TrackTransform {
  point: THREE.Vector3;
  tangent: THREE.Vector3;
  normal: THREE.Vector3;
  trueUp: THREE.Vector3;
  worldPos: THREE.Vector3;
}

export function getTrackTransform(s: number, l = 0): TrackTransform {
  const normS = ((s % 1.0) + 1.0) % 1.0;
  const point = trackCurve.getPointAt(normS);
  const tangent = trackCurve.getTangentAt(normS);

  const normal = new THREE.Vector3().crossVectors(tangent, upRef).normalize();
  const trueUp = new THREE.Vector3().crossVectors(normal, tangent).normalize();
  const worldPos = new THREE.Vector3().copy(point).addScaledVector(normal, l);

  return { point, tangent, normal, trueUp, worldPos };
}

// --- EXACT CIRCUIT 2D RADAR DATA ---
const RADAR_SAMPLES = 120;
let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
for (let i = 0; i < RADAR_SAMPLES; i++) {
  const pt = trackCurve.getPointAt(i / RADAR_SAMPLES);
  if (pt.x < minX) minX = pt.x;
  if (pt.x > maxX) maxX = pt.x;
  if (pt.z < minZ) minZ = pt.z;
  if (pt.z > maxZ) maxZ = pt.z;
}

const rangeX = maxX - minX;
const rangeZ = maxZ - minZ;
const maxDim = Math.max(rangeX, rangeZ);
const padding = 12;
const size = 100 - padding * 2;

export function worldToRadar(x: number, z: number): { x: number; y: number } {
  const nx = ((x - minX) / maxDim) * size + padding + (maxDim - rangeX) * 0.5 * (size / maxDim);
  const ny = ((z - minZ) / maxDim) * size + padding + (maxDim - rangeZ) * 0.5 * (size / maxDim);
  return { x: nx, y: ny };
}

// Pre-generated SVG path string for the actual track
const radarPoints: { x: number; y: number }[] = [];
for (let i = 0; i <= RADAR_SAMPLES; i++) {
  const s = (i % RADAR_SAMPLES) / RADAR_SAMPLES;
  const pt = trackCurve.getPointAt(s);
  radarPoints.push(worldToRadar(pt.x, pt.z));
}
export const CIRCUIT_SVG_PATH = radarPoints.reduce(
  (acc, p, idx) => (idx === 0 ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : `${acc} L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`),
  ''
) + ' Z';

// Start line coordinates on radar
const startPt = trackCurve.getPointAt(0);
export const RADAR_START_LINE = worldToRadar(startPt.x, startPt.z);

// --- PROCEDURAL 4-LANED ASPHALT & FIA KERB CANVAS TEXTURE ---
export function createAsphaltTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const texCanvas = document.createElement('canvas');
  texCanvas.width = 1024;
  texCanvas.height = 1024;
  const ctx = texCanvas.getContext('2d')!;

  // 1. Dark authentic FIA asphalt base
  ctx.fillStyle = '#141720';
  ctx.fillRect(0, 0, 1024, 1024);

  // Surface stone noise texture
  const imgData = ctx.getImageData(0, 0, 1024, 1024);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 16;
    data[i] = Math.max(0, Math.min(255, data[i] + noise));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise + 2));
  }
  ctx.putImageData(imgData, 0, 0);

  // 2. Rubber tire racing line wear grooves in each of the 4 driving lanes
  ctx.fillStyle = 'rgba(7, 9, 13, 0.45)';
  ctx.fillRect(140, 0, 75, 1024); // Lane 1 wear
  ctx.fillRect(360, 0, 75, 1024); // Lane 2 wear
  ctx.fillRect(580, 0, 75, 1024); // Lane 3 wear
  ctx.fillRect(800, 0, 75, 1024); // Lane 4 wear

  // 3. Crisp Dashed Lane Dividers separating the 4 driving lanes
  ctx.fillStyle = '#f1f5f9';
  const dashLen = 72;
  const gapLen = 56;
  let y = 0;
  while (y < 1024) {
    ctx.fillRect(282, y, 8, dashLen); // Lane 1-2 divider
    ctx.fillRect(508, y, 8, dashLen); // Lane 2-3 centerline divider
    ctx.fillRect(734, y, 8, dashLen); // Lane 3-4 divider
    y += dashLen + gapLen;
  }

  // 4. White Solid Edge Lines at outer boundaries of Lane 1 and Lane 4
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(56, 0, 12, 1024);  // Left outer edge line
  ctx.fillRect(956, 0, 12, 1024); // Right outer edge line

  // 5. Red & White FIA Racing Kerbs on outer borders with 3D bevel shading
  const kerbBlockH = 64;
  let ky = 0;
  let toggle = false;
  while (ky < 1024) {
    ctx.fillStyle = toggle ? '#dc2626' : '#f8fafc';
    ctx.fillRect(0, ky, 56, kerbBlockH);
    ctx.fillRect(968, ky, 56, kerbBlockH);

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, ky + kerbBlockH - 6, 56, 6);
    ctx.fillRect(968, ky + kerbBlockH - 6, 56, 6);

    ky += kerbBlockH;
    toggle = !toggle;
  }

  const texture = new THREE.CanvasTexture(texCanvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 110);
  try {
    texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  } catch {}
  return texture;
}

// Global reference for gantry lights
let gantryBulbMaterials: THREE.MeshStandardMaterial[][] = [];

export function setStartLights(litCount: number): void {
  for (let c = 0; c < gantryBulbMaterials.length; c++) {
    const isLit = c < litCount;
    for (const mat of gantryBulbMaterials[c]) {
      mat.emissive.setHex(isLit ? 0xff0022 : 0x000000);
      mat.emissiveIntensity = isLit ? 3.0 : 0;
      mat.color.setHex(isLit ? 0xff2233 : 0x220505);
    }
  }
}

// --- BUILD 4-LANED FORMULA 1 CIRCUIT MESH & CONTINUOUS BARRIERS ---
export function buildTrackMesh(scene: THREE.Scene, renderer: THREE.WebGLRenderer): void {
  const roadTexture = createAsphaltTexture(renderer);
  const SEGMENTS = 700;

  // 1. Clean 4-Laned Asphalt Track Surface
  const geom = new THREE.BufferGeometry();
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= SEGMENTS; i++) {
    const s = i / SEGMENTS;
    const { point, normal, trueUp } = getTrackTransform(s, 0);

    const leftPos = new THREE.Vector3().copy(point).addScaledVector(normal, -HALF_WIDTH);
    const rightPos = new THREE.Vector3().copy(point).addScaledVector(normal, HALF_WIDTH);

    positions.push(leftPos.x, leftPos.y, leftPos.z);
    positions.push(rightPos.x, rightPos.y, rightPos.z);

    normals.push(trueUp.x, trueUp.y, trueUp.z);
    normals.push(trueUp.x, trueUp.y, trueUp.z);

    uvs.push(0, s);
    uvs.push(1, s);

    if (i < SEGMENTS) {
      const row1 = i * 2;
      const row2 = (i + 1) * 2;
      indices.push(row1, row1 + 1, row2);
      indices.push(row1 + 1, row2 + 1, row2);
    }
  }

  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);

  const roadMat = new THREE.MeshStandardMaterial({
    map: roadTexture,
    roughness: 0.85,
    metalness: 0.05,
  });

  const roadMesh = new THREE.Mesh(geom, roadMat);
  roadMesh.receiveShadow = true;
  scene.add(roadMesh);

  // 2. Clean Continuous Dual-Armco Steel Safety Barriers at outer edges
  const railMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.85,
    roughness: 0.25,
    side: THREE.DoubleSide,
  });
  const postMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.8,
    roughness: 0.35,
  });

  const buildCleanArmcoBarrier = (offsetDist: number) => {
    const railGeom = new THREE.BufferGeometry();
    const rPositions: number[] = [];
    const rIndices: number[] = [];

    const postGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.4, 6);
    const postStep = 6;
    const postCount = Math.floor(SEGMENTS / postStep) + 1;
    const instancedPosts = new THREE.InstancedMesh(postGeo, postMat, postCount);
    instancedPosts.castShadow = true;

    const dummy = new THREE.Object3D();
    let postIdx = 0;

    for (let i = 0; i <= SEGMENTS; i++) {
      const s = i / SEGMENTS;
      // CRITICAL FIX: use worldPos (offset track edge), NOT point (centerline)!
      const { trueUp, worldPos } = getTrackTransform(s, offsetDist);

      // Steel Armco double-beam ribbon
      const btm = new THREE.Vector3().copy(worldPos).addScaledVector(trueUp, 0.15);
      const top = new THREE.Vector3().copy(worldPos).addScaledVector(trueUp, 1.05);
      rPositions.push(btm.x, btm.y, btm.z);
      rPositions.push(top.x, top.y, top.z);

      if (i < SEGMENTS) {
        const r1 = i * 2;
        const r2 = (i + 1) * 2;
        rIndices.push(r1, r1 + 1, r2);
        rIndices.push(r1 + 1, r2 + 1, r2);
      }

      // Vertical support stanchions placed with InstancedMesh
      if (i % postStep === 0 && postIdx < postCount) {
        dummy.position.copy(worldPos).addScaledVector(trueUp, 0.7);
        dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), trueUp);
        dummy.updateMatrix();
        instancedPosts.setMatrixAt(postIdx++, dummy.matrix);
      }
    }

    instancedPosts.instanceMatrix.needsUpdate = true;
    scene.add(instancedPosts);

    railGeom.setAttribute('position', new THREE.Float32BufferAttribute(rPositions, 3));
    railGeom.setIndex(rIndices);
    railGeom.computeVertexNormals();
    const railMesh = new THREE.Mesh(railGeom, railMat);
    railMesh.castShadow = true;
    scene.add(railMesh);
  };

  // Place continuous barriers flush at outer edges of the 4-lane track
  buildCleanArmcoBarrier(-HALF_WIDTH - 0.25);
  buildCleanArmcoBarrier(HALF_WIDTH + 0.25);

  // 3. Clean Start / Finish Line Decal across all 4 lanes
  const sf = getTrackTransform(0, 0);
  const checkCanvas = document.createElement('canvas');
  checkCanvas.width = 512;
  checkCanvas.height = 128;
  const cCtx = checkCanvas.getContext('2d')!;
  const cols = 16;
  const rows = 4;
  const cw = 512 / cols;
  const ch = 128 / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cCtx.fillStyle = (r + c) % 2 === 0 ? '#ffffff' : '#111111';
      cCtx.fillRect(c * cw, r * ch, cw, ch);
    }
  }
  const checkTex = new THREE.CanvasTexture(checkCanvas);
  const finishMat = new THREE.MeshStandardMaterial({
    map: checkTex,
    roughness: 0.75,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const finishDecal = new THREE.Mesh(
    new THREE.PlaneGeometry(TRACK_WIDTH - 1.0, 2.8),
    finishMat
  );
  // Plane X = across track (normal), Y = along track (tangent), Z = up (trueUp)
  const decalBasis = new THREE.Matrix4().makeBasis(sf.normal, sf.tangent, sf.trueUp);
  finishDecal.quaternion.setFromRotationMatrix(decalBasis);
  finishDecal.position.copy(sf.point).addScaledVector(sf.trueUp, 0.03);
  scene.add(finishDecal);

  // 4. Overhead Start / Finish Digital Gantry (Elevated to 16.5m so camera NEVER clips or hides under)
  const gantryGroup = new THREE.Group();
  gantryGroup.position.copy(sf.point);
  gantryGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), sf.tangent);

  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.85, roughness: 0.3 });
  const pillarGeo = new THREE.CylinderGeometry(0.5, 0.6, 18, 12);
  const leftPillar = new THREE.Mesh(pillarGeo, pillarMat);
  leftPillar.position.set(-HALF_WIDTH - 2.5, 9, 0);
  const rightPillar = new THREE.Mesh(pillarGeo, pillarMat);
  rightPillar.position.set(HALF_WIDTH + 2.5, 9, 0);

  const beamGeo = new THREE.BoxGeometry(TRACK_WIDTH + 6, 2.2, 2.0);
  const beamMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.2 });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.set(0, 16.5, 0);

  const bannerCanvas = document.createElement('canvas');
  bannerCanvas.width = 1024;
  bannerCanvas.height = 256;
  const bCtx = bannerCanvas.getContext('2d')!;
  const bannerGrad = bCtx.createLinearGradient(0, 0, 1024, 0);
  bannerGrad.addColorStop(0, '#0284c7');
  bannerGrad.addColorStop(0.5, '#0ea5e9');
  bannerGrad.addColorStop(1, '#0369a1');
  bCtx.fillStyle = bannerGrad;
  bCtx.fillRect(0, 0, 1024, 256);
  bCtx.fillStyle = '#ffffff';
  bCtx.font = '900 78px sans-serif';
  bCtx.textAlign = 'center';
  bCtx.textBaseline = 'middle';
  bCtx.fillText('APEX FORMULA 1 GRAND PRIX', 512, 128);
  const bannerTex = new THREE.CanvasTexture(bannerCanvas);
  bannerTex.wrapS = THREE.RepeatWrapping;
  bannerTex.repeat.set(-1, 1);
  bannerTex.offset.set(1, 0);

  const bannerMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(TRACK_WIDTH + 2, 2.1),
    new THREE.MeshBasicMaterial({ map: bannerTex })
  );
  // Face oncoming cars at negative Z
  bannerMesh.position.set(0, 16.5, -1.05);
  bannerMesh.rotation.y = Math.PI;

  // 3 Columns of F1 Start Lights facing oncoming cars
  const lightHousingMat = new THREE.MeshStandardMaterial({ color: 0x090d16, metalness: 0.8 });
  gantryBulbMaterials = [];
  const lightCols = [-3.0, 0, 3.0];
  for (let i = 0; i < lightCols.length; i++) {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.8, 0.4), lightHousingMat);
    housing.position.set(lightCols[i], 14.8, -0.8);
    const colBulbs: THREE.MeshStandardMaterial[] = [];
    for (let r = 0; r < 2; r++) {
      const bulbMat = new THREE.MeshStandardMaterial({
        color: 0x220505,
        emissive: 0x000000,
        emissiveIntensity: 0,
      });
      colBulbs.push(bulbMat);
      const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 16), bulbMat);
      bulb.rotation.x = -Math.PI / 2;
      bulb.position.set(0, r === 0 ? 0.4 : -0.4, -0.22);
      housing.add(bulb);
    }
    gantryBulbMaterials.push(colBulbs);
    gantryGroup.add(housing);
  }

  gantryGroup.add(leftPillar, rightPillar, beam, bannerMesh);
  scene.add(gantryGroup);
}

// --- CLEAN SCENIC WORLD & GROUND PLANE ---
export function buildScenicWorld(scene: THREE.Scene): void {
  // Clean lush green grass foundation flat beneath entire circuit (never intersects track!)
  const groundGeo = new THREE.PlaneGeometry(1800, 1800, 36, 36);
  groundGeo.rotateX(-Math.PI / 2);
  const pos = groundGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vz = pos.getZ(i);
    const distFromCenter = Math.sqrt(vx * vx + vz * vz);
    // Distant mountain ranges only appear far beyond track perimeter (> 450m)
    if (distFromCenter > 450) {
      const hill = Math.sin(vx * 0.012) * Math.cos(vz * 0.012) * 45;
      pos.setY(i, -1.0 + Math.max(0, hill));
    } else {
      pos.setY(i, -0.2); // Flat clean green lawn foundation beneath the circuit
    }
  }
  groundGeo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    color: 0x274e27,
    roughness: 0.92,
    metalness: 0.04,
  });
  const terrain = new THREE.Mesh(groundGeo, terrainMat);
  terrain.position.y = -0.05;
  terrain.receiveShadow = true;
  scene.add(terrain);
}

// --- PHOTOREALISTIC BRIGHT DAYLIGHT SKY ENVIRONMENT ---
export function buildSunsetEnvironment(scene: THREE.Scene, renderer: THREE.WebGLRenderer): void {
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 2048;
  skyCanvas.height = 1024;
  const ctx = skyCanvas.getContext('2d')!;

  // 1. Physically-inspired Daylight Sky Gradient
  const grad = ctx.createLinearGradient(0, 0, 0, 1024);
  grad.addColorStop(0.0, '#104ea3');   // Zenith Deep Blue
  grad.addColorStop(0.25, '#1e70c8');  // Upper Stratosphere
  grad.addColorStop(0.55, '#3b92ec');  // Mid Atmospheric Blue
  grad.addColorStop(0.8, '#82bcf7');   // Horizon Azure
  grad.addColorStop(0.92, '#c2e0fc');  // Atmospheric Haze
  grad.addColorStop(0.98, '#e0f2fe');  // Distant Horizon Warm Tint
  grad.addColorStop(1.0, '#f8fafc');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2048, 1024);

  // 2. Natural Sun Glare with Smooth Exponential Falloff (No hard discs)
  const sunX = 1024;
  const sunY = 380;
  const sunGlow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 320);
  sunGlow.addColorStop(0.0, 'rgba(255, 255, 255, 0.95)');
  sunGlow.addColorStop(0.08, 'rgba(255, 250, 220, 0.7)');
  sunGlow.addColorStop(0.25, 'rgba(255, 240, 190, 0.35)');
  sunGlow.addColorStop(0.6, 'rgba(210, 235, 255, 0.12)');
  sunGlow.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = sunGlow;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 320, 0, Math.PI * 2);
  ctx.fill();

  // 3. Subtle Soft Horizontal Cirrus Bands (Seamless across X)
  for (let band = 0; band < 4; band++) {
    const by = 280 + band * 70;
    const bandGrad = ctx.createLinearGradient(0, by - 25, 0, by + 25);
    bandGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
    bandGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.14)');
    bandGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = bandGrad;
    ctx.fillRect(0, by - 25, 2048, 50);
  }

  // 4. Distant Horizon Mountain Silhouette (Soft atmospheric mountain ridge)
  ctx.fillStyle = '#334e68';
  ctx.beginPath();
  ctx.moveTo(0, 1024);
  for (let x = 0; x <= 2048; x += 16) {
    const angle = (x / 2048) * Math.PI * 2;
    const my = 930 + Math.sin(angle * 4) * 22 + Math.cos(angle * 9) * 14;
    ctx.lineTo(x, my);
  }
  ctx.lineTo(2048, 1024);
  ctx.closePath();
  ctx.fill();

  const skyTexture = new THREE.CanvasTexture(skyCanvas);
  skyTexture.mapping = THREE.EquirectangularReflectionMapping;
  skyTexture.colorSpace = THREE.SRGBColorSpace;

  // Set background directly on scene for pristine 360-degree environment
  scene.background = skyTexture;

  // Generate Realistic High Dynamic Range PBR Environment Map
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const envRenderTarget = pmrem.fromEquirectangular(skyTexture);
    scene.environment = envRenderTarget.texture;
    pmrem.dispose();
  } catch (e) {
    console.warn('PMREM environment generation bypassed:', e);
  }
}
