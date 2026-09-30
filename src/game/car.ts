import * as THREE from 'three';
import { getTrackTransform } from './track';

export interface CarVisualMesh {
  root: THREE.Group;
  chassis: THREE.Group;
  wheels: THREE.Group[];
  frontWheels: THREE.Group[];
  wheelHubs: THREE.Group[];
  taillightMat: THREE.MeshStandardMaterial;
  bodyMat: THREE.MeshPhysicalMaterial;
  exhaustFlames: THREE.Mesh[];
  brakeRotorMats: THREE.MeshStandardMaterial[];
  rainLight: THREE.Mesh;
  isPlayer: boolean;
}

export function buildProceduralCar(bodyHexColor: number, isPlayer = false): CarVisualMesh {
  const carGroup = new THREE.Group();
  const chassis = new THREE.Group();
  carGroup.add(chassis);

  // 1. High-Gloss Metallic & Clearcoat Car Paint
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: bodyHexColor,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
    roughness: 0.16,
    metalness: 0.82,
    envMapIntensity: 2.2,
  });

  const carbonMat = new THREE.MeshStandardMaterial({
    color: 0x111317,
    roughness: 0.4,
    metalness: 0.7,
  });

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x060c18,
    roughness: 0.05,
    metalness: 0.95,
    clearcoat: 1.0,
    transparent: true,
    opacity: 0.85,
  });

  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    metalness: 0.98,
    roughness: 0.08,
  });

  const interiorMat = new THREE.MeshStandardMaterial({
    color: 0x141820,
    roughness: 0.85,
  });

  // 2. Sculpted Main Monocoque Body
  const mainBodyGeo = new THREE.BoxGeometry(1.9, 0.48, 4.4);
  const mainBody = new THREE.Mesh(mainBodyGeo, bodyMat);
  mainBody.position.y = 0.5;
  mainBody.castShadow = true;
  chassis.add(mainBody);

  // Racing Stripes over Hood & Roof
  const stripeGeo = new THREE.BoxGeometry(0.38, 0.49, 4.41);
  const stripeMat = new THREE.MeshStandardMaterial({
    color: isPlayer ? 0xffffff : 0x111111,
    roughness: 0.3,
  });
  const stripe = new THREE.Mesh(stripeGeo, stripeMat);
  stripe.position.y = 0.5;
  chassis.add(stripe);

  // 3. Widebody Flared Wheel Fenders (Flared to enclose racing tires)
  const frontFenderGeo = new THREE.BoxGeometry(2.36, 0.48, 1.25);
  const frontFenders = new THREE.Mesh(frontFenderGeo, bodyMat);
  frontFenders.position.set(0, 0.5, -1.4);
  frontFenders.castShadow = true;

  const rearFenderGeo = new THREE.BoxGeometry(2.42, 0.54, 1.35);
  const rearFenders = new THREE.Mesh(rearFenderGeo, bodyMat);
  rearFenders.position.set(0, 0.53, 1.35);
  rearFenders.castShadow = true;
  chassis.add(frontFenders, rearFenders);

  // Front Fender Cooling Extractor Louvers
  for (let s = -1; s <= 1; s += 2) {
    for (let lv = 0; lv < 3; lv++) {
      const louver = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.08), carbonMat);
      louver.position.set(s * 0.95, 0.74, -1.25 - lv * 0.14);
      louver.rotation.x = 0.3;
      chassis.add(louver);
    }
  }

  // 4. Aggressive Front Fascia, Splitter & Canards
  const noseGeo = new THREE.BoxGeometry(1.85, 0.32, 1.1);
  const nose = new THREE.Mesh(noseGeo, bodyMat);
  nose.position.set(0, 0.4, -2.3);
  nose.castShadow = true;

  // Front Carbon Splitter with Endplate Winglets
  const splitterGeo = new THREE.BoxGeometry(2.28, 0.08, 0.95);
  const splitter = new THREE.Mesh(splitterGeo, carbonMat);
  splitter.position.set(0, 0.22, -2.5);

  const canardLeft = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.38), carbonMat);
  canardLeft.position.set(-1.08, 0.42, -2.35);
  canardLeft.rotation.z = 0.3;

  const canardRight = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.38), carbonMat);
  canardRight.position.set(1.08, 0.42, -2.35);
  canardRight.rotation.z = -0.3;

  // Center Radiator Hex Intake Mesh
  const grilleGeo = new THREE.PlaneGeometry(1.2, 0.22);
  const grilleMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
  const grille = new THREE.Mesh(grilleGeo, grilleMat);
  grille.position.set(0, 0.35, -2.86);
  grille.rotation.y = Math.PI; // Face forward towards -Z

  chassis.add(nose, splitter, canardLeft, canardRight, grille);

  // Hood Heat Extractor Air Ducts
  const ductL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.6), carbonMat);
  ductL.position.set(-0.45, 0.62, -1.8);
  ductL.rotation.x = -0.2;
  const ductR = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.6), carbonMat);
  ductR.position.set(0.45, 0.62, -1.8);
  ductR.rotation.x = -0.2;
  chassis.add(ductL, ductR);

  // 5. Cockpit Cabin, Tinted Glass & Detailed Interior
  const cabinGeo = new THREE.BoxGeometry(1.4, 0.56, 1.9);
  const cabin = new THREE.Mesh(cabinGeo, glassMat);
  cabin.position.set(0, 0.94, 0.15);
  cabin.castShadow = true;

  // Interior Bucket Seats with Racing Harness Belts
  const seatGeo = new THREE.BoxGeometry(0.42, 0.52, 0.4);
  const seatL = new THREE.Mesh(seatGeo, interiorMat);
  seatL.position.set(-0.35, 0.8, 0.15);
  const seatR = new THREE.Mesh(seatGeo, interiorMat);
  seatR.position.set(0.35, 0.8, 0.15);

  const harnessMat = new THREE.MeshStandardMaterial({ color: 0xef4444 });
  const harnessL1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.04), harnessMat);
  harnessL1.position.set(-0.4, 0.82, 0.12);
  const harnessL2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.04), harnessMat);
  harnessL2.position.set(-0.3, 0.82, 0.12);

  // Sports Racing Steering Wheel
  const wheelTorus = new THREE.TorusGeometry(0.12, 0.025, 8, 16);
  const wheelInterior = new THREE.Mesh(wheelTorus, carbonMat);
  wheelInterior.position.set(-0.35, 0.88, -0.25);
  wheelInterior.rotation.x = -0.4;

  // Glowing Digital Cockpit Dash Display Screen
  const dashMat = new THREE.MeshStandardMaterial({
    color: 0x00f0ff,
    emissive: 0x00f0ff,
    emissiveIntensity: 3.0,
  });
  const dashScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.09), dashMat);
  dashScreen.position.set(-0.35, 0.88, -0.32);
  dashScreen.rotation.x = 0.3;

  // Tubular Roll Cage Frame visible through cabin
  const cageMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.9, roughness: 0.2 });
  const cageBar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.2, 8), cageMat);
  cageBar.rotation.z = Math.PI / 2;
  cageBar.position.set(0, 1.05, 0.4);

  chassis.add(cabin, seatL, seatR, harnessL1, harnessL2, wheelInterior, dashScreen, cageBar);

  // Aerodynamic Side Mirrors with Chrome Reflective Glass
  for (let s = -1; s <= 1; s += 2) {
    const mirrorStem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 8), carbonMat);
    mirrorStem.position.set(s * 0.82, 0.85, -0.55);
    mirrorStem.rotation.z = s * -0.6;

    const mirrorHousing = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.12), bodyMat);
    mirrorHousing.position.set(s * 0.95, 0.9, -0.55);

    const mirrorGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.06), chromeMat);
    mirrorGlass.position.set(s * 0.95, 0.9, -0.49);
    mirrorGlass.rotation.y = s * -0.1;

    chassis.add(mirrorStem, mirrorHousing, mirrorGlass);
  }

  // Roof Air Intake Scoop & Shark Fin
  const roofScoopGeo = new THREE.BoxGeometry(0.35, 0.16, 0.8);
  const roofScoop = new THREE.Mesh(roofScoopGeo, carbonMat);
  roofScoop.position.set(0, 1.25, 0.2);

  const sharkFinGeo = new THREE.BoxGeometry(0.06, 0.35, 1.2);
  const sharkFin = new THREE.Mesh(sharkFinGeo, carbonMat);
  sharkFin.position.set(0, 1.35, 0.7);

  chassis.add(roofScoop, sharkFin);

  // 6. Side Air Intake Pods (Engine sidecoolers)
  const podGeo = new THREE.BoxGeometry(0.24, 0.4, 0.9);
  const podL = new THREE.Mesh(podGeo, carbonMat);
  podL.position.set(-1.05, 0.52, 0.4);
  const podR = new THREE.Mesh(podGeo, carbonMat);
  podR.position.set(1.05, 0.52, 0.4);
  chassis.add(podL, podR);

  // 7. V10 Engine Bay with Heat Shielding & Deck Louvers
  const engineCoverGeo = new THREE.BoxGeometry(0.9, 0.1, 1.1);
  const engineCoverMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    metalness: 0.95,
    roughness: 0.2,
  });
  const engineCover = new THREE.Mesh(engineCoverGeo, engineCoverMat);
  engineCover.position.set(0, 0.72, 1.2);

  for (let lIdx = 0; lIdx < 4; lIdx++) {
    const louver = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.03, 0.12), carbonMat);
    louver.position.set(0, 0.88 - lIdx * 0.06, 1.25 + lIdx * 0.22);
    louver.rotation.x = -0.3;
    chassis.add(louver);
  }
  chassis.add(engineCover);

  // 8. Dual Swan-Neck GT3 Rear Wing
  const wingGeo = new THREE.BoxGeometry(2.35, 0.08, 0.55);
  const wing = new THREE.Mesh(wingGeo, carbonMat);
  wing.position.set(0, 1.34, 2.15);
  wing.castShadow = true;

  // Wing Side Endplates
  const epL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.36, 0.65), carbonMat);
  epL.position.set(-1.18, 1.34, 2.15);
  const epR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.36, 0.65), carbonMat);
  epR.position.set(1.18, 1.34, 2.15);

  // Swan-Neck Upright Pylons
  const pylonL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.58, 0.25), carbonMat);
  pylonL.position.set(-0.6, 1.06, 2.1);
  pylonL.rotation.x = 0.2;

  const pylonR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.58, 0.25), carbonMat);
  pylonR.position.set(0.6, 1.06, 2.1);
  pylonR.rotation.x = 0.2;

  chassis.add(wing, epL, epR, pylonL, pylonR);

  // 9. Rear Carbon Diffuser with Vertical Aero Fins
  const diffuserGeo = new THREE.BoxGeometry(1.9, 0.15, 0.8);
  const diffuser = new THREE.Mesh(diffuserGeo, carbonMat);
  diffuser.position.set(0, 0.26, 2.1);

  for (let f = -3; f <= 3; f += 2) {
    const finMesh = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.82), carbonMat);
    finMesh.position.set(f * 0.26, 0.26, 2.1);
    chassis.add(finMesh);
  }
  chassis.add(diffuser);

  // F1-Style Center Flashing Rain Safety Light
  const rainLightMat = new THREE.MeshStandardMaterial({
    color: 0x440000,
    emissive: 0xff0022,
    emissiveIntensity: 2.8,
  });
  const rainLight = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.08), rainLightMat);
  rainLight.position.set(0, 0.32, 2.52);
  chassis.add(rainLight);

  // Dual Titanium Quad Exhaust Tips with Blue Tempering & Dynamic Nitro Flames
  const exhaustMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    metalness: 0.95,
    roughness: 0.15,
    emissive: 0x0284c7,
    emissiveIntensity: 1.0,
  });
  const exL = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.28, 12), exhaustMat);
  exL.rotation.x = Math.PI / 2;
  exL.position.set(-0.35, 0.38, 2.25);

  const exR = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.28, 12), exhaustMat);
  exR.rotation.x = Math.PI / 2;
  exR.position.set(0.35, 0.38, 2.25);
  chassis.add(exL, exR);

  // Dynamic Animated Nitro Exhaust Flame Meshes
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x00d8ff,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const flameGeo = new THREE.ConeGeometry(0.08, 0.45, 8);
  flameGeo.rotateX(Math.PI / 2);

  const flameL = new THREE.Mesh(flameGeo, flameMat.clone());
  flameL.position.set(-0.35, 0.38, 2.52);
  flameL.visible = false;

  const flameR = new THREE.Mesh(flameGeo, flameMat.clone());
  flameR.position.set(0.35, 0.38, 2.52);
  flameR.visible = false;
  chassis.add(flameL, flameR);

  // 10. Quad LED Headlights & DRL Eyebrows
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x67e8f9,
    emissiveIntensity: 3.2,
  });

  const hlL = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.12), headlightMat);
  hlL.position.set(-0.7, 0.48, -2.82);
  hlL.rotation.y = 0.15;

  const hlR = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.12), headlightMat);
  hlR.position.set(0.7, 0.48, -2.82);
  hlR.rotation.y = -0.15;
  chassis.add(hlL, hlR);

  // Full-Width LED Taillight Bar
  const taillightMat = new THREE.MeshStandardMaterial({
    color: 0x220000,
    emissive: 0xff1122,
    emissiveIntensity: 2.5,
  });
  const tl = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.1, 0.1), taillightMat);
  tl.position.set(0, 0.6, 2.22);
  chassis.add(tl);

  // 11. High-Detail 10-Spoke Concave Forged Alloy Wheels with Cross-Drilled Rotors & Brembo Calipers
  const tireRubberMat = new THREE.MeshStandardMaterial({ color: 0x141619, roughness: 0.85 });
  const caliperMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3, metalness: 0.3 });

  // Sleek racing tire profile tucked cleanly within widebody wheel wells
  const tireGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.28, 20);
  tireGeo.rotateZ(Math.PI / 2);

  const rimRimGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.29, 16);
  rimRimGeo.rotateZ(Math.PI / 2);

  const rotorGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.05, 16);
  rotorGeo.rotateZ(Math.PI / 2);

  const caliperGeo = new THREE.BoxGeometry(0.1, 0.18, 0.22);
  const brakeRotorMats: THREE.MeshStandardMaterial[] = [];
  const wheelHubs: THREE.Group[] = [];

  function createDetailedWheel(): THREE.Group {
    const wGroup = new THREE.Group();
    const hubGroup = new THREE.Group();

    // Rubber Tire with tread profile
    const tire = new THREE.Mesh(tireGeo, tireRubberMat);
    tire.castShadow = true;

    // Alloy Outer Concave Rim Ring
    const rim = new THREE.Mesh(rimRimGeo, chromeMat);

    // 10-Spoke BBS Style Concave Alloy Core
    const spokeGroup = new THREE.Group();
    for (let s = 0; s < 10; s++) {
      const angle = (s / 10) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.28, 0.05), chromeMat);
      spoke.position.set(0, Math.sin(angle) * 0.14, Math.cos(angle) * 0.14);
      spoke.rotation.x = -angle;
      spokeGroup.add(spoke);
    }

    // Center-Lock Wheel Nut (Red anodized)
    const nutMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.9 });
    const centerNut = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.36, 12), nutMat);
    centerNut.rotateZ(Math.PI / 2);
    spokeGroup.add(centerNut);

    // Cross-Drilled Ceramic Brake Rotor
    const rotorMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.88,
      roughness: 0.28,
      emissive: 0x000000,
      emissiveIntensity: 0,
    });
    brakeRotorMats.push(rotorMat);
    const rotor = new THREE.Mesh(rotorGeo, rotorMat);

    hubGroup.add(tire, rim, spokeGroup, rotor);
    wheelHubs.push(hubGroup);

    // Sports Brembo Brake Caliper (stationary on upright, doesn't spin)
    const caliper = new THREE.Mesh(caliperGeo, caliperMat);
    caliper.position.set(0, 0.16, 0);

    wGroup.add(hubGroup, caliper);
    return wGroup;
  }

  // Tucked perfectly inside the widebody fenders with -Z forward
  const flWheel = createDetailedWheel();
  flWheel.position.set(-1.02, 0.44, -1.4);

  const frWheel = createDetailedWheel();
  frWheel.position.set(1.02, 0.44, -1.4);

  const rlWheel = createDetailedWheel();
  rlWheel.position.set(-1.05, 0.44, 1.35);

  const rrWheel = createDetailedWheel();
  rrWheel.position.set(1.05, 0.44, 1.35);

  // Attached to chassis so wheels stay firmly within wheel wells during race
  chassis.add(flWheel, frWheel, rlWheel, rrWheel);

  return {
    root: carGroup,
    chassis,
    wheels: [flWheel, frWheel, rlWheel, rrWheel],
    frontWheels: [flWheel, frWheel],
    wheelHubs,
    taillightMat,
    bodyMat,
    exhaustFlames: [flameL, flameR],
    brakeRotorMats,
    rainLight,
    isPlayer,
  };
}

// Particle System for Realistic Tire Smoke
export class TireSmokeSystem {
  private particles: THREE.Mesh[] = [];
  private poolIndex = 0;
  private maxParticles = 200;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.SphereGeometry(0.35, 6, 6);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xd8d8d8,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });

    for (let i = 0; i < this.maxParticles; i++) {
      const mesh = new THREE.Mesh(geo, mat.clone());
      mesh.visible = false;
      scene.add(mesh);
      this.particles.push(mesh);
    }
  }

  public emit(pos: THREE.Vector3, vel: THREE.Vector3): void {
    const p = this.particles[this.poolIndex];
    this.poolIndex = (this.poolIndex + 1) % this.maxParticles;

    p.position.copy(pos);
    p.position.y += 0.2;
    p.scale.set(0.6, 0.6, 0.6);
    (p.material as THREE.MeshBasicMaterial).opacity = 0.55;
    p.visible = true;
    p.userData = {
      velocity: vel.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2 + 1, (Math.random() - 0.5) * 2)),
      life: 0.65,
      maxLife: 0.65,
    };
  }

  public update(dt: number): void {
    for (const p of this.particles) {
      if (!p.visible) continue;
      const data = p.userData as { velocity: THREE.Vector3; life: number; maxLife: number };
      data.life -= dt;
      if (data.life <= 0) {
        p.visible = false;
        continue;
      }

      p.position.addScaledVector(data.velocity, dt);
      const progress = 1 - data.life / data.maxLife;
      const scale = 0.6 + progress * 2.4;
      p.scale.set(scale, scale, scale);
      (p.material as THREE.MeshBasicMaterial).opacity = (1 - progress) * 0.45;
    }
  }
}

export class CarAgent {
  public id: string;
  public name: string;
  public isPlayer: boolean;
  public meshData: CarVisualMesh;

  // Spline Coordinates
  public s: number;
  public l: number;
  public speed = 0;
  public vL = 0;

  // Steering Physics States
  public steerAngle = 0;
  public targetSteerAngle = 0;

  // Weight Transfer Visual Angles & Dynamic Body Sway
  public pitch = 0;
  public roll = 0;
  public yawDrift = 0;
  public bodySwayX = 0; // Lateral chassis deflection (suspension compression & centrifugal sway)

  // Race Progress
  public lapsCompleted = -1;
  public lastS: number;
  public totalDistance: number;
  public finished = false;
  public finishTime = 0;

  // AI Behavior
  public aiTargetSpeed: number;
  public aiTargetL: number;
  public aiSteerTimer = 0;

  // State for dynamic visual effects
  public isBraking = false;
  public isGas = false;
  private brakeHeat = 0;
  private rainLightTimer = 0;
  private smokeAccumulator = 0;

  constructor(id: string, name: string, color: number, isPlayer: boolean, initialS: number, initialL: number, scene: THREE.Scene) {
    this.id = id;
    this.name = name;
    this.isPlayer = isPlayer;
    this.meshData = buildProceduralCar(color, isPlayer);
    scene.add(this.meshData.root);

    this.s = initialS;
    this.l = initialL;
    this.lastS = initialS;
    this.lapsCompleted = -1;
    this.totalDistance = -1 + initialS;

    this.aiTargetSpeed = 46 + Math.random() * 8;
    this.aiTargetL = initialL;
  }

  public setPaintColor(hex: number): void {
    this.meshData.bodyMat.color.setHex(hex);
  }

  public updateVisuals(dt: number, smokeSystem?: TireSmokeSystem): void {
    const safeS = isNaN(this.s) ? 0 : this.s;
    const safeL = isNaN(this.l) ? 0 : this.l;
    const { worldPos, tangent, normal, trueUp } = getTrackTransform(safeS, safeL);

    // Exact orthonormal vehicle basis:
    // Car model coordinates: -Z is Front/Nose, +Z is Rear/Taillights, +X is Right, +Y is Up
    // World coordinates along track: tangent is Forward, normal is Right, trueUp is Up
    const xRight = normal.clone().normalize();
    const yUp = trueUp.clone().normalize();
    const zRear = tangent.clone().normalize().negate(); // +Z points backward (-tangent), so -Z points forward (+tangent)

    const rotMatrix = new THREE.Matrix4().makeBasis(xRight, yUp, zRear);
    this.meshData.root.quaternion.setFromRotationMatrix(rotMatrix);
    this.meshData.root.position.copy(worldPos);

    // Front Wheel Steering Angle (turning right steers wheels towards +X)
    for (let i = 0; i < this.meshData.frontWheels.length; i++) {
      this.meshData.frontWheels[i].rotation.y = -this.steerAngle;
    }

    // Wheel roll rotation based on forward speed: rolling forward in -Z requires -X rotation
    const validSpeed = isNaN(this.speed) ? 0 : this.speed;
    const wheelRotSpeed = (validSpeed / 0.44) * dt;
    for (let i = 0; i < this.meshData.wheelHubs.length; i++) {
      this.meshData.wheelHubs[i].rotation.x -= wheelRotSpeed;
    }

    // Chassis Weight Transfer (Roll, Pitch, Yaw & Subtle Suspension Shift)
    this.meshData.chassis.position.x = isNaN(this.bodySwayX) ? 0 : this.bodySwayX;
    this.meshData.chassis.rotation.x = isNaN(this.pitch) ? 0 : this.pitch;
    this.meshData.chassis.rotation.z = isNaN(this.roll) ? 0 : this.roll;
    this.meshData.chassis.rotation.y = isNaN(this.yawDrift) ? 0 : this.yawDrift;

    // 1. Dynamic Glowing Brake Rotors on Heavy Deceleration
    if (this.isBraking && Math.abs(this.speed) > 18) {
      this.brakeHeat = Math.min(1.0, this.brakeHeat + dt * 2.5);
    } else {
      this.brakeHeat = Math.max(0, this.brakeHeat - dt * 1.2);
    }

    if (this.meshData.brakeRotorMats) {
      for (const rMat of this.meshData.brakeRotorMats) {
        if (this.brakeHeat > 0.05) {
          rMat.emissive.setHex(0xff3300);
          rMat.emissiveIntensity = this.brakeHeat * 3.5;
        } else {
          rMat.emissiveIntensity = 0;
        }
      }
    }

    // 2. Dynamic Animated Nitro Exhaust Flames (Spits flame on high revs and gear changes)
    if (this.meshData.exhaustFlames) {
      const showFlames = this.isGas && Math.abs(this.speed) > 34 && Math.random() > 0.35;
      for (const flame of this.meshData.exhaustFlames) {
        flame.visible = showFlames;
        if (showFlames) {
          const flameScale = 0.8 + Math.random() * 0.9;
          flame.scale.set(flameScale, flameScale, flameScale * 1.5);
        }
      }
    }

    // 3. F1-Style Center Flashing Rain Safety Light
    if (this.meshData.rainLight) {
      this.rainLightTimer += dt;
      this.meshData.rainLight.visible = (this.rainLightTimer % 0.3) < 0.15;
    }

    // 4. Emit tire smoke with time accumulator (~30 particles/s per rear wheel)
    const isSmoking = smokeSystem && (
      (this.isPlayer && (Math.abs(this.yawDrift) > 0.12 || Math.abs(this.vL) > 12) && Math.abs(this.speed) > 15) ||
      (!this.isPlayer && Math.abs(this.vL) > 8 && Math.abs(this.speed) > 15)
    );

    if (isSmoking && smokeSystem) {
      this.smokeAccumulator += dt;
      const smokeInterval = 1 / 30;
      while (this.smokeAccumulator >= smokeInterval) {
        this.smokeAccumulator -= smokeInterval;
        const rearLeftPos = this.meshData.root.localToWorld(new THREE.Vector3(-1.05, 0.2, 1.35));
        const rearRightPos = this.meshData.root.localToWorld(new THREE.Vector3(1.05, 0.2, 1.35));
        smokeSystem.emit(rearLeftPos, new THREE.Vector3(0, 0.5, 0));
        smokeSystem.emit(rearRightPos, new THREE.Vector3(0, 0.5, 0));
      }
    } else {
      this.smokeAccumulator = 0;
    }
  }
}
