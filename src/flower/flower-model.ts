import * as THREE from 'three/webgpu';
import { color, float } from 'three/tsl';
import { resolveBotanicalArchitecture } from '../data/botanical-architecture';
import { evaluateHeadGrowth, evaluateReproductiveReveal, resolveGrowthProfile } from '../growth-model';
import { resolveNaturalSurfaceOptics } from '../render/physical-lighting';
import type { Bloomable, BloomGrowthProfile, FlowerPreset } from '../types';
import { remapBloom, seededRandom, smoothstep } from '../utils';
import { createPetalGeometry, createPetalMaterial, resolvePetalThickness } from './petal-geometry';
import { computeFloralAttachment, computePetalClearance } from './petal-layout';
import { evaluatePetalUnfurl } from './petal-unfurl';
import { evaluateRoseCentreCoilMorphWeights, evaluateRoseVortex, usesRoseVortex } from './rose-vortex';
import { createLeafGeometry } from './leaf-geometry';
import { LeafAttachmentFrame, setLeafGrowthDirection } from './leaf-attachment';
import {
  generateInflorescencePetalSpecs,
  type InflorescencePetalSpec,
} from './inflorescence-layout';
import { displayStemRadius } from './stem-proportions';
import { resolveBotanicalCurvature } from './botanical-curvature';

interface PetalUnfurlMotion {
  layer: number;
  wave: number;
  contactGuard: number;
}

interface RoseVortexMotion {
  layer: number;
  phase: number;
  strength: number;
  centreCoilMorphOffset: number;
}

interface PetalMotion {
  hinge: THREE.Group;
  mesh: THREE.Mesh;
  delay: number;
  openAngle: number;
  closedAngle: number;
  closedRoll: number;
  roll: number;
  sweep: number;
  phase: number;
  growth: number;
  span: number;
  unfurl?: PetalUnfurlMotion;
  vortex?: RoseVortexMotion;
}

interface ClearancedPetalMotion extends PetalMotion {
  radialBase: number;
  baseLift: number;
  laneDepth: number;
  laneLift: number;
  openDrift: number;
}

interface SepalMotion extends PetalMotion {
  radialBase: number;
  baseLift: number;
  openDrift: number;
  drop: number;
}

interface DiscFloret {
  radius: number;
  angle: number;
  size: number;
  delay: number;
}

interface InflorescencePetalMotion {
  frame: THREE.Group;
  radial: THREE.Group;
  hinge: THREE.Group;
  mesh: THREE.Mesh;
  spec: InflorescencePetalSpec;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const DEG = Math.PI / 180;
const WISTERIA_HANGER_LENGTH = 0.62;

const makeStandardMaterial = (parameters: ConstructorParameters<typeof THREE.MeshStandardNodeMaterial>[0]) =>
  new THREE.MeshStandardNodeMaterial(parameters);

export class FlowerModel implements Bloomable {
  readonly root = new THREE.Group();
  readonly petalCount: number;

  private readonly preset: FlowerPreset;
  private readonly growth: BloomGrowthProfile;
  private readonly head = new THREE.Group();
  private readonly floralBase = new THREE.Group();
  private readonly attachmentLayout: ReturnType<typeof computeFloralAttachment>;
  private readonly petals: ClearancedPetalMotion[] = [];
  private readonly sepals: SepalMotion[] = [];
  private readonly disposables = new Set<{ dispose(): void }>();
  private readonly revealGroups: THREE.Object3D[] = [];
  private readonly stamenGroup = new THREE.Group();
  private readonly discFlorets: DiscFloret[] = [];
  private readonly inflorescencePetals: InflorescencePetalMotion[] = [];
  private discMesh?: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly stemCurve: THREE.CubicBezierCurve3;
  private readonly stemTip = new THREE.Vector3();
  private readonly leafAttachmentFrame = new LeafAttachmentFrame();
  private readonly worldUp = new THREE.Vector3(0, 1, 0);
  private lastProgress = -1;
  private readonly headBaseTilt: number;
  private readonly headBaseYaw: number;

  constructor(preset: FlowerPreset) {
    this.preset = preset;
    this.growth = resolveGrowthProfile(preset);
    const architecture = resolveBotanicalArchitecture(preset);
    const curvature = resolveBotanicalCurvature(architecture.stemHabit, architecture.leafShape);
    const curveSeed = [...preset.id].reduce((sum, character, index) => sum + character.charCodeAt(0) * (index + 3), 0);
    const curveAzimuth = curveSeed * 0.173;
    const curveBend = preset.morphology.stemHeight * curvature.stemBendRatio;
    const curveX = Math.sin(curveAzimuth);
    const curveZ = Math.cos(curveAzimuth);
    this.stemTip.set(
      curveX * curveBend * 0.72,
      preset.morphology.stemHeight,
      curveZ * curveBend * 0.72,
    );
    this.stemCurve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(curveX * curveBend * 0.08, preset.morphology.stemHeight * 0.31, curveZ * curveBend * 0.08),
      new THREE.Vector3(curveX * curveBend, preset.morphology.stemHeight * 0.72, curveZ * curveBend),
      this.stemTip.clone(),
    );
    this.headBaseTilt = architecture.headTiltDeg * DEG;
    this.headBaseYaw = (architecture.headAzimuthDeg ?? 0) * DEG;
    this.attachmentLayout = computeFloralAttachment({
      headRadius: preset.morphology.headRadius,
      petalCount: preset.morphology.petalCount,
      layers: preset.morphology.layers,
      petalWidth: preset.morphology.petalWidth,
      petalThickness: resolvePetalThickness(preset.morphology.petalLength),
      radialSpread: this.growth.radialSpread,
      sepalLength: preset.morphology.sepalLength,
      stemRadius: displayStemRadius(preset.morphology.stemRadius),
      sunflower: preset.kind === 'sunflower',
    });
    this.petalCount = preset.morphology.petalCount + (preset.kind === 'sunflower' ? preset.morphology.discCount : 0);
    this.root.name = `flower-${preset.id}`;
    this.buildStem();
    this.head.position.set(
      this.stemTip.x + (preset.kind === 'wisteria' ? WISTERIA_HANGER_LENGTH : 0),
      this.stemTip.y,
      this.stemTip.z,
    );
    this.head.rotation.set(this.headBaseTilt, this.headBaseYaw, 0, 'YXZ');
    this.head.scale.setScalar(preset.morphology.flowerScale);
    this.root.add(this.head);
    this.buildFloralAttachment();
    if (preset.kind === 'sunflower') this.buildSunflower();
    else if (preset.kind === 'hydrangea' || preset.kind === 'wisteria') this.buildCompoundInflorescence();
    else this.buildRadialFlower();
    this.update(0, 0);
  }

  private track<T extends { dispose(): void }>(value: T): T {
    this.disposables.add(value);
    return value;
  }

  private buildStem(): void {
    const m = this.preset.morphology;
    const architecture = resolveBotanicalArchitecture(this.preset);
    const stemRadius = displayStemRadius(m.stemRadius);
    const stemMaterial = this.track(makeStandardMaterial({ color: this.preset.colors.stem, roughness: 0.86 }));
    const stemGeometry = this.track(new THREE.TubeGeometry(this.stemCurve, 24, stemRadius * 0.86, 10, false));
    const stem = new THREE.Mesh(stemGeometry, stemMaterial);
    stem.castShadow = true;
    stem.receiveShadow = true;
    this.root.add(stem);

    const segmentGeometry = this.track(new THREE.CylinderGeometry(1, 1, 1, 8, 2));
    segmentGeometry.translate(0, 0.5, 0);
    const placeSegment = (
      mesh: THREE.Mesh,
      start: THREE.Vector3,
      end: THREE.Vector3,
      radius: number,
    ): void => {
      const direction = end.clone().sub(start);
      const length = Math.max(0.001, direction.length());
      mesh.position.copy(start);
      mesh.quaternion.setFromUnitVectors(this.worldUp, direction.normalize());
      mesh.scale.set(radius, length, radius);
    };

    const branchCount = Math.min(8, Math.max(0, architecture.branchCount));
    const branchLength = m.stemHeight * (architecture.stemHabit === 'woody-branch' ? 0.32 : architecture.stemHabit === 'shrub' ? 0.22 : 0.13);
    const branchSegments = Array.from({ length: branchCount }, (_, index) => {
      const ratio = 0.28 + (index + 1) / (architecture.branchCount + 1) * 0.48;
      const angle = index * GOLDEN_ANGLE + 0.7;
      const inclination = architecture.branchAngleDeg * DEG;
      const start = this.stemCurve.getPointAt(ratio);
      const end = start.clone().add(new THREE.Vector3(
        Math.sin(angle) * Math.sin(inclination) * branchLength,
        Math.cos(inclination) * branchLength,
        Math.cos(angle) * Math.sin(inclination) * branchLength,
      ));
      const branch = new THREE.Mesh(segmentGeometry, stemMaterial);
      branch.name = `branch-${index}`;
      placeSegment(branch, start, end, stemRadius * 0.46);
      branch.castShadow = true;
      branch.receiveShadow = true;
      this.root.add(branch);
      return { angle, start, end };
    });

    const leafRoughness = 0.74;
    const leafMaterial = this.track(new THREE.MeshSSSNodeMaterial({
      color: this.preset.colors.stem,
      roughness: leafRoughness,
      metalness: 0,
      ...resolveNaturalSurfaceOptics(leafRoughness, 0.58, 0.55),
      side: THREE.DoubleSide,
    }));
    leafMaterial.thicknessColorNode = color('#9ccf80');
    leafMaterial.thicknessAttenuationNode = float(0.38);
    leafMaterial.thicknessScaleNode = float(6);

    const leafGeometry = this.track(createLeafGeometry(architecture.leafShape));
    const leafCount = Math.min(10, Math.max(0, architecture.leafCount));
    const climbingVine = architecture.stemHabit === 'climbing-vine';
    const leafLength = THREE.MathUtils.clamp(architecture.leafLengthCm / (climbingVine ? 45 : 18), 0.28, 2.2);
    const leafWidth = THREE.MathUtils.clamp(architecture.leafWidthCm / (climbingVine ? 28 : 14), 0.16, 2.1);
    Array.from({ length: leafCount }, (_, index) => {
      const opposite = architecture.leafArrangement === 'opposite';
      const nodeIndex = opposite ? Math.floor(index / 2) : index;
      const nodeCount = opposite ? Math.ceil(leafCount / 2) : leafCount;
      const fraction = nodeIndex / Math.max(1, nodeCount - 1);
      const basal = architecture.leafArrangement === 'basal';
      const clustered = architecture.leafArrangement === 'clustered';
      const separate = architecture.leafArrangement === 'separate-petiole';
      const y = basal
        ? m.stemHeight * (0.05 + fraction * 0.12)
        : separate ? m.stemHeight * (0.34 + fraction * 0.2)
          : clustered ? m.stemHeight * (0.6 + fraction * 0.25)
            : m.stemHeight * (0.2 + fraction * 0.58);
      let angle = opposite
        ? nodeIndex * GOLDEN_ANGLE + (index % 2) * Math.PI + 0.7
        : index * GOLDEN_ANGLE + 0.7;
      const petioleBase = new THREE.Vector3();
      const petioleTip = new THREE.Vector3();
      const branchSegment = clustered && branchSegments.length > 0
        ? branchSegments[index % branchSegments.length]
        : undefined;
      if (branchSegment) {
        angle = branchSegment.angle;
        petioleBase.copy(branchSegment.end);
      } else if (!separate) {
        this.stemCurve.getPointAt(THREE.MathUtils.clamp(y / m.stemHeight, 0, 1), petioleBase);
      }

      const tilt = separate ? 0.03 : basal ? -1.02 : clustered ? -0.62 : architecture.leafArrangement === 'whorled' ? -0.48 : -0.58;
      if (separate) {
        petioleTip.set(Math.sin(angle) * m.stemHeight * 0.18, y, Math.cos(angle) * m.stemHeight * 0.18);
      } else {
        const petioleLength = THREE.MathUtils.clamp(leafWidth * 0.32, 0.055, 0.34);
        setLeafGrowthDirection(angle, -tilt, petioleTip);
        petioleTip.multiplyScalar(petioleLength).add(petioleBase);
      }

      const petiole = new THREE.Mesh(segmentGeometry, stemMaterial);
      petiole.name = `leaf-petiole-${index}`;
      placeSegment(petiole, petioleBase, petioleTip, stemRadius * 0.22);
      petiole.castShadow = true;
      petiole.receiveShadow = true;
      this.root.add(petiole);

      const mesh = new THREE.Mesh(leafGeometry, leafMaterial);
      mesh.name = `leaf-blade-${index}`;
      mesh.position.copy(petioleTip);
      const roll = Math.sin(index * 2.1) * 0.12;
      if (architecture.leafShape === 'peltate-orbicular') {
        this.leafAttachmentFrame.setPeltateQuaternion(petioleBase, petioleTip, angle, roll, mesh.quaternion);
      } else {
        this.leafAttachmentFrame.setBladeQuaternion(petioleBase, petioleTip, this.worldUp, roll, mesh.quaternion);
      }
      mesh.scale.set(leafWidth, 1, leafLength);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);
    });
    if (this.preset.kind === 'wisteria') {
      const hangerLength = WISTERIA_HANGER_LENGTH;
      const hangerGeometry = this.track(new THREE.CylinderGeometry(stemRadius * 0.48, stemRadius * 0.62, hangerLength, 10, 2));
      const hanger = new THREE.Mesh(hangerGeometry, stemMaterial);
      hanger.position.set(this.stemTip.x + hangerLength * 0.5, this.stemTip.y, this.stemTip.z);
      hanger.rotation.z = -Math.PI * 0.5;
      hanger.castShadow = true;
      this.root.add(hanger);
    }
  }

  private buildFloralAttachment(): void {
    const { morphology: m, colors } = this.preset;
    const { baseRadius, baseDepth, collarHeight } = this.attachmentLayout;
    const stemRadius = displayStemRadius(m.stemRadius);
    const receptacleMaterial = this.track(makeStandardMaterial({ color: colors.stem, roughness: 0.88 }));
    const collarMaterial = this.track(makeStandardMaterial({ color: new THREE.Color(colors.stem).multiplyScalar(0.72), roughness: 0.94 }));

    const receptacleGeometry = this.track(new THREE.SphereGeometry(1, 32, 14));
    const receptacle = new THREE.Mesh(receptacleGeometry, receptacleMaterial);
    receptacle.name = 'floral-receptacle';
    receptacle.scale.set(baseRadius, baseDepth, baseRadius);
    receptacle.position.y = -baseDepth * 0.62;
    receptacle.castShadow = true;
    receptacle.receiveShadow = true;

    const collarGeometry = this.track(new THREE.CylinderGeometry(
      Math.max(stemRadius * 1.05, baseRadius * 0.38),
      stemRadius * 0.92,
      collarHeight,
      24,
      3,
    ));
    const collar = new THREE.Mesh(collarGeometry, collarMaterial);
    collar.name = 'floral-collar';
    collar.position.y = -collarHeight * 0.54;
    collar.castShadow = true;
    collar.receiveShadow = true;

    this.floralBase.add(collar, receptacle);
    if (this.preset.kind !== 'sunflower') {
      const seatHeight = Math.max(0.018, baseDepth * 0.22);
      const seatGeometry = this.track(new THREE.CylinderGeometry(
        baseRadius * 0.78,
        baseRadius * 0.98,
        seatHeight,
        32,
        2,
      ));
      const seatMaterial = this.track(makeStandardMaterial({ color: colors.base, roughness: Math.min(0.9, m.roughness + 0.08) }));
      const petalSeat = new THREE.Mesh(seatGeometry, seatMaterial);
      petalSeat.name = 'petal-attachment-seat';
      petalSeat.position.y = baseDepth * 0.26;
      petalSeat.castShadow = true;
      petalSeat.receiveShadow = true;
      this.floralBase.add(petalSeat);
    }
    this.head.add(this.floralBase);
  }

  private buildRadialFlower(): void {
    const { morphology: m, colors } = this.preset;
    const material = this.track(createPetalMaterial(colors, m));
    const layerCounts = this.distributePetals(m.petalCount, m.layers);
    const usesUnfurl = m.budCurl > 0.01;
    const usesVortex = usesRoseVortex(this.preset);

    for (let layer = 0; layer < m.layers; layer += 1) {
      const count = layerCounts[layer];
      const inner = layer / Math.max(1, m.layers - 1);
      const scale = 1 - inner * m.layerScale;
      const petalLength = m.petalLength * scale;
      const petalWidth = m.petalWidth * (1 - inner * m.layerScale * 0.62);
      const petalThickness = resolvePetalThickness(petalLength);
      const petalGrowth = this.preset.id === 'lotus'
        ? { ...this.growth, closedPetalLength: Math.max(0.42, this.growth.closedPetalLength - inner * 0.08) }
        : this.growth;
      const geometry = this.track(createPetalGeometry({
        length: petalLength,
        width: petalWidth,
        shape: m.petalShape,
        taper: m.taper,
        notch: m.notch,
        waviness: m.waviness,
        cup: m.cup * (1 + inner * 0.22),
        curl: m.curl * (1 - inner * 0.28),
        fold: m.fold * (1 + inner * 0.16),
        seed: layer + this.preset.id.length,
        thickness: petalThickness,
        growth: petalGrowth,
        unfurl: usesUnfurl ? {
          budCurl: m.budCurl * (0.84 + inner * 0.32),
          wave: m.unfurl,
          innerCoil: m.innerCoil,
          layer: inner,
          sideCoil: usesVortex ? 1 : 0,
          sideCoilDirection: 1,
          sideCoilCounterCurve: 0.18,
        } : undefined,
        colors,
      }));

      for (let index = 0; index < count; index += 1) {
        const clearance = computePetalClearance({
          width: petalWidth,
          count,
          index,
          layer,
          layers: m.layers,
          headRadius: m.headRadius,
          thickness: petalThickness,
        });
        const angle = index / count * Math.PI * 2 + layer * (0.55 + m.spiral) * GOLDEN_ANGLE;
        const radial = new THREE.Group();
        radial.rotation.y = angle;
        const hinge = new THREE.Group();
        hinge.position.set(0, clearance.layerLift + clearance.laneLift * 0.38, clearance.radialBase + clearance.laneDepth);
        radial.add(hinge);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const closedRoll = clearance.weaveYaw;
        const roll = (Math.sin(index * 8.13 + layer) * m.twist) * DEG + clearance.weaveYaw;
        mesh.rotation.y = closedRoll;
        hinge.add(mesh);
        this.head.add(radial);
        const layerDelay = inner * m.stagger * (usesUnfurl ? 0.92 : 0.72);
        const individualDelay = (index % 3) * 0.006 + Math.sin(index * 11.7) * 0.008;
        const innerClosure = usesUnfurl
          ? THREE.MathUtils.lerp(0.28, 0.7, m.innerCoil)
          : this.preset.id === 'rose'
            ? 0.42
            : this.preset.id === 'lotus'
              ? 0.26
              : 0.13;
        this.petals.push({
          hinge,
          mesh,
          delay: Math.max(0, this.growth.openingStart + layerDelay + individualDelay),
          openAngle: m.openAngle * (1 - inner * innerClosure),
          closedAngle: m.closedAngle + inner * 2,
          closedRoll,
          roll,
          sweep: (Math.sin(index * 2.41 + layer) * m.twist * 0.2) * DEG,
          phase: index * 0.73 + layer,
          growth: scale,
          span: Math.max(0.18, this.growth.openingSpan - layerDelay * 0.72),
          unfurl: usesUnfurl ? {
            layer: inner,
            wave: m.unfurl,
            contactGuard: petalThickness * 1.8 + petalWidth * 0.01,
          } : undefined,
          vortex: usesVortex ? {
            layer: inner,
            phase: index / count,
            strength: m.innerCoil,
            centreCoilMorphOffset: Number(geometry.userData.centreCoilMorphOffset),
          } : undefined,
          radialBase: clearance.radialBase,
          baseLift: clearance.layerLift,
          laneDepth: clearance.laneDepth,
          laneLift: clearance.laneLift,
          openDrift: clearance.openDrift,
        });
      }
    }

    this.buildSepals();
    this.buildReproductiveCenter();
  }

  private buildCompoundInflorescence(): void {
    const { morphology: m, colors, kind } = this.preset;
    if (kind !== 'hydrangea' && kind !== 'wisteria') return;
    const material = this.track(createPetalMaterial(colors, m));
    const geometry = this.track(createPetalGeometry({
      length: m.petalLength,
      width: m.petalWidth,
      shape: m.petalShape,
      taper: m.taper,
      notch: m.notch,
      waviness: m.waviness,
      cup: m.cup,
      curl: m.curl,
      fold: m.fold,
      seed: this.preset.id.length * 31,
      thickness: resolvePetalThickness(m.petalLength),
      growth: this.growth,
      colors,
    }));
    const specs = generateInflorescencePetalSpecs(kind, m.petalCount);
    const localForward = new THREE.Vector3(0, 0, 1);
    const outward = new THREE.Vector3();

    for (const spec of specs) {
      const frame = new THREE.Group();
      frame.position.set(spec.originX, spec.originY, spec.originZ);
      outward.set(spec.normalX, spec.normalY, spec.normalZ).normalize();
      frame.quaternion.setFromUnitVectors(localForward, outward);
      const radial = new THREE.Group();
      radial.rotation.z = spec.angle;
      const hinge = new THREE.Group();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.scale.setScalar(spec.scale);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      hinge.add(mesh);
      radial.add(hinge);
      frame.add(radial);
      this.head.add(frame);
      this.inflorescencePetals.push({ frame, radial, hinge, mesh, spec });
    }

    if (kind === 'hydrangea') {
      const coreMaterial = this.track(makeStandardMaterial({ color: '#355c48', roughness: 0.92 }));
      const core = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.32, 28, 18)), coreMaterial);
      core.scale.set(1, 0.82, 1);
      core.position.y = 0.05;
      core.castShadow = true;
      this.head.add(core);
    } else {
      const axisMaterial = this.track(makeStandardMaterial({ color: colors.stem, roughness: 0.9 }));
      const axisGeometry = this.track(new THREE.CylinderGeometry(0.018, 0.028, 1.34, 8, 4));
      const axis = new THREE.Mesh(axisGeometry, axisMaterial);
      axis.position.y = -0.62;
      axis.castShadow = true;
      this.head.add(axis);
    }

    const floretCount = new Set(specs.map((spec) => spec.floretIndex)).size;
    const centreGeometry = this.track(new THREE.SphereGeometry(kind === 'hydrangea' ? 0.035 : 0.028, 8, 6));
    const centreMaterial = this.track(makeStandardMaterial({ color: colors.center, roughness: 0.78 }));
    const centres = new THREE.InstancedMesh(centreGeometry, centreMaterial, floretCount);
    centres.castShadow = true;
    for (let floret = 0; floret < floretCount; floret += 1) {
      const spec = specs.find((item) => item.floretIndex === floret)!;
      this.dummy.position.set(
        spec.originX + spec.normalX * 0.018,
        spec.originY + spec.normalY * 0.018,
        spec.originZ + spec.normalZ * 0.018,
      );
      this.dummy.scale.setScalar(spec.role === 'fertile' ? 0.72 : 1);
      this.dummy.updateMatrix();
      centres.setMatrixAt(floret, this.dummy.matrix);
    }
    this.head.add(centres);
  }

  private buildSunflower(): void {
    const { morphology: m, colors } = this.preset;
    const discGeometry = this.track(new THREE.CylinderGeometry(m.headRadius, m.headRadius * 0.88, 0.18, 72));
    const discMaterial = this.track(new THREE.MeshStandardNodeMaterial({ color: colors.center, roughness: 0.92 }));
    const disc = new THREE.Mesh(discGeometry, discMaterial);
    disc.position.y = 0.04;
    disc.castShadow = true;
    disc.receiveShadow = true;
    this.head.add(disc);

    const rayMaterial = this.track(createPetalMaterial(colors, m));
    const rayThickness = resolvePetalThickness(m.petalLength);
    const rayGeometry = this.track(createPetalGeometry({
      length: m.petalLength,
      width: m.petalWidth,
      shape: m.petalShape,
      taper: m.taper,
      notch: 0,
      waviness: m.waviness,
      cup: m.cup,
      curl: m.curl,
      fold: m.fold,
      seed: 93,
      thickness: rayThickness,
      growth: this.growth,
      colors,
    }));
    for (let index = 0; index < m.petalCount; index += 1) {
      const clearance = computePetalClearance({
        width: m.petalWidth,
        count: m.petalCount,
        index,
        layer: 0,
        layers: 1,
        headRadius: m.headRadius,
        thickness: rayThickness,
      });
      const radialBase = Math.max(m.headRadius * 0.88, clearance.radialBase);
      const angle = index / m.petalCount * Math.PI * 2;
      const radial = new THREE.Group();
      radial.rotation.y = angle;
      const hinge = new THREE.Group();
      hinge.position.set(0, 0.1 + clearance.laneLift * 0.38, radialBase + clearance.laneDepth);
      const mesh = new THREE.Mesh(rayGeometry, rayMaterial);
      mesh.castShadow = true;
      const closedRoll = clearance.weaveYaw;
      const roll = Math.sin(index * 3.1) * m.twist * DEG + clearance.weaveYaw;
      mesh.rotation.y = closedRoll;
      hinge.add(mesh);
      radial.add(hinge);
      this.head.add(radial);
      this.petals.push({
        hinge,
        mesh,
        delay: this.growth.openingStart + (index % 4) * 0.008,
        openAngle: m.openAngle + Math.sin(index * 1.7) * 4,
        closedAngle: m.closedAngle,
        closedRoll,
        roll,
        sweep: Math.sin(index * 2.3) * m.twist * 0.18 * DEG,
        phase: index * 0.58,
        growth: 1,
        span: this.growth.openingSpan,
        radialBase,
        baseLift: 0.1,
        laneDepth: clearance.laneDepth,
        laneLift: clearance.laneLift,
        openDrift: clearance.openDrift * 0.55,
      });
    }

    const floretGeometry = this.track(new THREE.ConeGeometry(0.026, 0.078, 6));
    floretGeometry.translate(0, 0.039, 0);
    const floretMaterial = this.track(new THREE.MeshStandardNodeMaterial({ color: colors.pollen, roughness: 0.9 }));
    this.discMesh = new THREE.InstancedMesh(floretGeometry, floretMaterial, m.discCount);
    this.discMesh.castShadow = true;
    const random = seededRandom(7429);
    const innerColor = new THREE.Color(colors.center);
    const pollenColor = new THREE.Color(colors.pollen);
    for (let i = 0; i < m.discCount; i += 1) {
      const normalized = Math.sqrt((i + 0.5) / m.discCount);
      const radius = normalized * m.headRadius * 0.89;
      const angle = i * GOLDEN_ANGLE;
      const size = 0.72 + random() * 0.46;
      const delay = 0.34 + (1 - normalized) * 0.42 + random() * 0.025;
      this.discFlorets.push({ radius, angle, size, delay });
      this.discMesh.setColorAt(i, innerColor.clone().lerp(pollenColor, smoothstep(0.35, 1, normalized) * 0.48));
    }
    this.discMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.head.add(this.discMesh);
    this.buildSepals();
  }

  private buildSepals(): void {
    const { morphology: m, colors } = this.preset;
    if (m.sepalCount <= 0) return;
    const placement = this.attachmentLayout;
    const sepalColors = { ...colors, base: colors.stem, tip: '#72925b', reverse: '#294a35' };
    const material = this.track(createPetalMaterial(sepalColors, { roughness: 0.85, sssStrength: 0.3 }));
    const geometry = this.track(createPetalGeometry({
      length: m.sepalLength,
      width: Math.max(0.16, m.petalWidth * 0.34),
      shape: 'lance',
      taper: 0.78,
      notch: 0,
      waviness: 0.025,
      cup: 0.12,
      curl: 0.12,
      fold: 0.28,
      seed: 117,
      growth: {
        closedPetalLength: 0.96,
        closedPetalWidth: 0.82,
        basalEpinasty: 0.08,
        marginGrowth: 0.06,
      },
      colors: sepalColors,
    }));
    const isSunflower = this.preset.kind === 'sunflower';
    // Start below the bud with a positive, downward hinge angle. The previous
    // negative angle raised the sepal tip into the closed corolla.
    const openAngle = isSunflower ? 138 : this.preset.id === 'lotus' ? 118 : 128;
    const delay = Math.max(0.015, this.growth.openingStart - (isSunflower ? 0.08 : 0.1));
    const span = Math.min(0.62, Math.max(0.3, this.growth.openingSpan * (isSunflower ? 0.9 : 0.72)));
    for (let index = 0; index < m.sepalCount; index += 1) {
      const radial = new THREE.Group();
      radial.rotation.y = index / m.sepalCount * Math.PI * 2 + GOLDEN_ANGLE * 0.2;
      const hinge = new THREE.Group();
      hinge.position.set(0, placement.sepalBaseLift, placement.sepalRadius);
      const closedRoll = (index % 2 === 0 ? -1 : 1) * 1.5 * DEG;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.rotation.y = closedRoll;
      hinge.add(mesh);
      radial.add(hinge);
      this.head.add(radial);
      this.sepals.push({
        hinge,
        mesh,
        delay,
        openAngle,
        closedAngle: placement.sepalClosedAngleDeg,
        closedRoll,
        roll: (index % 2 === 0 ? -1 : 1) * (isSunflower ? 5 : 3) * DEG,
        sweep: Math.sin(index * 1.93) * (isSunflower ? 4 : 2.5) * DEG,
        phase: index,
        growth: 1,
        span,
        radialBase: placement.sepalRadius,
        baseLift: placement.sepalBaseLift,
        openDrift: placement.sepalOpenDrift,
        drop: placement.sepalDrop,
      });
    }
  }

  private buildReproductiveCenter(): void {
    const { morphology: m, colors } = this.preset;
    const filamentGeometry = this.track(new THREE.CylinderGeometry(0.008, 0.014, Math.max(0.05, m.stamenLength), 6));
    filamentGeometry.translate(0, m.stamenLength * 0.5, 0);
    const antherGeometry = this.track(new THREE.SphereGeometry(Math.max(0.024, m.stamenLength * 0.055), 8, 6));
    antherGeometry.scale(1.55, 0.58, 0.82);
    const filamentMaterial = this.track(makeStandardMaterial({ color: colors.tip, roughness: 0.72 }));
    const antherMaterial = this.track(makeStandardMaterial({ color: colors.pollen, roughness: 0.78 }));
    const filaments = new THREE.InstancedMesh(filamentGeometry, filamentMaterial, m.stamens);
    const anthers = new THREE.InstancedMesh(antherGeometry, antherMaterial, m.stamens);
    const random = seededRandom(this.preset.id.length * 947);
    for (let index = 0; index < m.stamens; index += 1) {
      const t = (index + 0.5) / Math.max(1, m.stamens);
      const radius = m.headRadius * (0.34 + t * 0.5);
      const angle = index * GOLDEN_ANGLE;
      const lengthScale = 0.78 + random() * 0.35;
      this.dummy.position.set(Math.sin(angle) * radius, 0.03, Math.cos(angle) * radius);
      this.dummy.rotation.set((0.12 + t * 0.32) * Math.cos(angle), angle, (0.12 + t * 0.32) * -Math.sin(angle));
      this.dummy.scale.set(1, lengthScale, 1);
      this.dummy.updateMatrix();
      filaments.setMatrixAt(index, this.dummy.matrix);
      const tip = this.dummy.localToWorld(new THREE.Vector3(0, m.stamenLength, 0));
      this.dummy.position.copy(tip);
      this.dummy.rotation.set(0, angle, Math.PI * 0.5);
      this.dummy.scale.setScalar(lengthScale);
      this.dummy.updateMatrix();
      anthers.setMatrixAt(index, this.dummy.matrix);
    }
    filaments.castShadow = true;
    anthers.castShadow = true;
    this.stamenGroup.add(filaments, anthers);
    this.head.add(this.stamenGroup);
    this.revealGroups.push(this.stamenGroup);

    const centerMaterial = this.track(makeStandardMaterial({ color: colors.center, roughness: 0.66 }));
    if (this.preset.id === 'lotus') {
      const receptacle = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.22, 0.12, 0.3, 32)), centerMaterial);
      receptacle.position.y = 0.18;
      receptacle.castShadow = true;
      this.head.add(receptacle);
      const dotGeometry = this.track(new THREE.SphereGeometry(0.022, 7, 5));
      const dotMaterial = this.track(makeStandardMaterial({ color: '#72552b', roughness: 0.9 }));
      const dots = new THREE.InstancedMesh(dotGeometry, dotMaterial, 18);
      for (let i = 0; i < 18; i += 1) {
        const r = Math.sqrt((i + 0.5) / 18) * 0.17;
        const a = i * GOLDEN_ANGLE;
        this.dummy.position.set(Math.sin(a) * r, 0.34, Math.cos(a) * r);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.setScalar(1);
        this.dummy.updateMatrix();
        dots.setMatrixAt(i, this.dummy.matrix);
      }
      this.head.add(dots);
      this.revealGroups.push(receptacle, dots);
    } else {
      const ovary = new THREE.Mesh(this.track(new THREE.SphereGeometry(m.headRadius * 0.24, 20, 12)), centerMaterial);
      ovary.scale.y = 0.72;
      ovary.position.y = 0.08;
      ovary.castShadow = true;
      const styleHeight = this.preset.id === 'lily' ? m.stamenLength * 1.08 : m.stamenLength * 0.55;
      const style = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.018, 0.026, styleHeight, 8)), centerMaterial);
      style.position.y = 0.12 + styleHeight * 0.5;
      const stigma = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.052, 10, 7)), centerMaterial);
      stigma.scale.set(1.35, 0.42, 1.35);
      stigma.position.y = 0.12 + styleHeight;
      this.head.add(ovary, style, stigma);
      this.revealGroups.push(ovary, style, stigma);
    }
  }

  private distributePetals(total: number, layers: number): number[] {
    const counts = Array.from({ length: layers }, () => Math.floor(total / layers));
    for (let i = 0; i < total % layers; i += 1) counts[i] += 1;
    return counts;
  }

  update(progress: number, time: number): void {
    const m = this.preset.morphology;
    const subtleTime = time * 0.001;
    const headGrowth = evaluateHeadGrowth(this.growth, progress);
    this.head.scale.setScalar(m.flowerScale * headGrowth);
    const attachmentSwell = smoothstep(0, this.growth.swellingEnd, progress);
    const attachmentRelease = smoothstep(
      this.growth.openingStart,
      Math.min(1, this.growth.openingStart + this.growth.openingSpan * 0.72),
      progress,
    );
    const attachmentRadius = THREE.MathUtils.lerp(0.84, 1, attachmentSwell);
    this.floralBase.scale.set(
      attachmentRadius,
      THREE.MathUtils.lerp(0.9, 1.04, attachmentSwell),
      attachmentRadius,
    );
    this.floralBase.position.y = THREE.MathUtils.lerp(-this.attachmentLayout.baseDepth * 0.08, 0, attachmentRelease);
    this.floralBase.rotation.y = Math.sin(subtleTime * 0.22) * 0.006 * attachmentRelease;
    for (const petal of this.petals) {
      const local = remapBloom(progress, petal.delay, petal.span);
      const unfurl = petal.unfurl ? evaluatePetalUnfurl(local, petal.unfurl.layer, petal.unfurl.wave) : undefined;
      const vortex = petal.vortex
        ? evaluateRoseVortex(local, petal.vortex.layer, petal.vortex.phase, petal.vortex.strength)
        : undefined;
      const deployment = unfurl?.deployment ?? local;
      const angle = THREE.MathUtils.lerp(petal.closedAngle, petal.openAngle, deployment);
      const livingMotion = Math.sin(subtleTime * 0.52 + petal.phase) * 0.7 * smoothstep(0.78, 1, progress);
      petal.hinge.rotation.x = (angle + livingMotion) * DEG;
      const articulation = unfurl ? unfurl.unfurl * 0.72 + unfurl.reflex * 0.28 : local;
      petal.hinge.rotation.z = petal.sweep * articulation + (vortex?.tangentialSweep ?? 0);
      petal.mesh.rotation.y = THREE.MathUtils.lerp(petal.closedRoll, petal.roll, articulation)
        + (vortex?.swirlYaw ?? 0);
      const clearance = smoothstep(0.12, 0.88, deployment);
      const contactSeparation = unfurl?.contactSeparation ?? 0;
      const laneDepth = petal.laneDepth * (1 + contactSeparation * 0.45);
      const contactGuard = (petal.unfurl?.contactGuard ?? 0) * contactSeparation;
      petal.hinge.position.z = petal.radialBase
        + laneDepth
        + petal.openDrift * this.growth.radialSpread * clearance
        + contactGuard
        - (vortex?.radialTuck ?? 0);
      petal.hinge.position.y = petal.baseLift
        + petal.laneLift * THREE.MathUtils.lerp(0.38, 1 + contactSeparation * 0.26, clearance)
        + (vortex?.lift ?? 0);
      if (unfurl) {
        const influences = petal.mesh.morphTargetInfluences!;
        influences[0] = unfurl.weights[0];
        influences[1] = unfurl.weights[1];
        influences[2] = unfurl.weights[2];
        if (petal.vortex) {
          const coilWeights = evaluateRoseCentreCoilMorphWeights(unfurl.weights, vortex?.sideCoil ?? 0);
          for (let pose = 0; pose < coilWeights.length; pose += 1) {
            influences[petal.vortex.centreCoilMorphOffset + pose] = coilWeights[pose];
          }
        }
      } else {
        petal.mesh.morphTargetInfluences![0] = local;
      }
      petal.mesh.scale.setScalar(1);
    }
    for (const petal of this.inflorescencePetals) {
      const local = remapBloom(progress, petal.spec.delay, petal.spec.span);
      const deployment = smoothstep(0.02, 0.96, local);
      const clusterSpread = THREE.MathUtils.lerp(0.62, 1, smoothstep(0, this.growth.swellingEnd, progress));
      petal.frame.position.set(
        petal.spec.originX * clusterSpread,
        petal.spec.originY * clusterSpread,
        petal.spec.originZ * clusterSpread,
      );
      petal.hinge.rotation.x = THREE.MathUtils.lerp(-1.12, 0.04, deployment);
      petal.hinge.rotation.y = Math.sin(subtleTime * 0.47 + petal.spec.phase) * 0.025 * smoothstep(0.72, 1, progress);
      petal.radial.rotation.z = petal.spec.angle + Math.sin(subtleTime * 0.31 + petal.spec.phase) * 0.01;
      petal.mesh.scale.setScalar(petal.spec.scale * THREE.MathUtils.lerp(0.74, 1, deployment));
      petal.mesh.morphTargetInfluences![0] = local;
    }
    for (const sepal of this.sepals) {
      const local = remapBloom(progress, sepal.delay, sepal.span);
      const release = smoothstep(0.08, 0.92, local);
      const livingMotion = Math.sin(subtleTime * 0.42 + sepal.phase) * 0.35 * DEG * smoothstep(0.7, 1, progress);
      sepal.hinge.rotation.x = THREE.MathUtils.lerp(sepal.closedAngle, sepal.openAngle, local) * DEG + livingMotion;
      sepal.hinge.rotation.z = sepal.sweep * local;
      sepal.mesh.rotation.y = THREE.MathUtils.lerp(sepal.closedRoll, sepal.roll, local);
      sepal.hinge.position.z = sepal.radialBase + sepal.openDrift * release;
      sepal.hinge.position.y = sepal.baseLift - sepal.drop * release;
      sepal.mesh.morphTargetInfluences![0] = local;
    }
    const reveal = evaluateReproductiveReveal(this.growth, progress);
    this.stamenGroup.scale.setScalar(Math.max(0.03, reveal));
    this.stamenGroup.position.y = THREE.MathUtils.lerp(-0.08, 0, reveal);
    for (const object of this.revealGroups) object.visible = progress > this.growth.reproductiveReveal - 0.04;

    if (this.discMesh && (Math.abs(progress - this.lastProgress) > 0.001 || progress === 0 || progress === 1)) {
      this.discFlorets.forEach((floret, index) => {
        const local = remapBloom(progress, floret.delay, 0.24);
        this.dummy.position.set(Math.sin(floret.angle) * floret.radius, 0.14, Math.cos(floret.angle) * floret.radius);
        this.dummy.rotation.set(0, -floret.angle, 0);
        const scale = floret.size * THREE.MathUtils.lerp(0.08, 1, local);
        this.dummy.scale.set(scale, scale, scale);
        this.dummy.updateMatrix();
        this.discMesh!.setMatrixAt(index, this.dummy.matrix);
      });
      this.discMesh.instanceMatrix.needsUpdate = true;
    }
    this.head.rotation.x = this.headBaseTilt + Math.cos(subtleTime * 0.12) * 0.006;
    this.head.rotation.y = this.headBaseYaw + Math.sin(subtleTime * 0.14) * 0.012;
    this.head.position.set(
      this.stemTip.x + (this.preset.kind === 'wisteria' ? WISTERIA_HANGER_LENGTH : 0),
      this.stemTip.y + Math.sin(subtleTime * 0.36) * 0.006,
      this.stemTip.z,
    );
    this.lastProgress = progress;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.disposables.forEach((item) => item.dispose());
    this.disposables.clear();
  }
}
