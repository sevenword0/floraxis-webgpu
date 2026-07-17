import * as THREE from 'three/webgpu';
import { color, float } from 'three/tsl';
import { resolveBotanicalArchitecture } from '../data/botanical-architecture';
import { evaluateHeadGrowth, evaluateReproductiveReveal, resolveGrowthProfile } from '../growth-model';
import type { Bloomable, BloomGrowthProfile, FlowerPreset } from '../types';
import { remapBloom, seededRandom, smoothstep } from '../utils';
import { createPetalGeometry, createPetalMaterial, resolvePetalThickness } from './petal-geometry';
import { computeFloralAttachment, computePetalClearance } from './petal-layout';
import { evaluatePetalUnfurl } from './petal-unfurl';
import { createLeafGeometry } from './leaf-geometry';

interface PetalUnfurlMotion {
  layer: number;
  wave: number;
  contactGuard: number;
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

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const DEG = Math.PI / 180;

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
  private discMesh?: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private lastProgress = -1;
  private readonly headBaseTilt: number;
  private readonly headBaseYaw: number;

  constructor(preset: FlowerPreset) {
    this.preset = preset;
    this.growth = resolveGrowthProfile(preset);
    const architecture = resolveBotanicalArchitecture(preset);
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
      stemRadius: preset.morphology.stemRadius,
      sunflower: preset.kind === 'sunflower',
    });
    this.petalCount = preset.morphology.petalCount + (preset.kind === 'sunflower' ? preset.morphology.discCount : 0);
    this.root.name = `flower-${preset.id}`;
    this.buildStem();
    this.head.position.y = preset.morphology.stemHeight;
    this.head.rotation.set(this.headBaseTilt, this.headBaseYaw, 0, 'YXZ');
    this.head.scale.setScalar(preset.morphology.flowerScale);
    this.root.add(this.head);
    this.buildFloralAttachment();
    if (preset.kind === 'sunflower') this.buildSunflower();
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
    const stemMaterial = this.track(makeStandardMaterial({ color: this.preset.colors.stem, roughness: 0.86 }));
    const stemGeometry = this.track(new THREE.CylinderGeometry(m.stemRadius * 0.74, m.stemRadius, m.stemHeight, 14, 5));
    const stem = new THREE.Mesh(stemGeometry, stemMaterial);
    stem.position.y = m.stemHeight * 0.5;
    stem.castShadow = true;
    stem.receiveShadow = true;
    this.root.add(stem);

    const leafMaterial = this.track(new THREE.MeshSSSNodeMaterial({ color: this.preset.colors.stem, roughness: 0.8, side: THREE.DoubleSide }));
    leafMaterial.thicknessColorNode = color('#9ccf80');
    leafMaterial.thicknessAttenuationNode = float(0.38);
    leafMaterial.thicknessScaleNode = float(6);

    const leafGeometry = this.track(createLeafGeometry(architecture.leafShape));
    const leafCount = Math.min(10, Math.max(0, architecture.leafCount));
    const leafLength = THREE.MathUtils.clamp(architecture.leafLengthCm / 18, 0.28, 2.2);
    const leafWidth = THREE.MathUtils.clamp(architecture.leafWidthCm / 14, 0.16, 2.1);
    Array.from({ length: leafCount }, (_, index) => {
      const fraction = index / Math.max(1, leafCount - 1);
      const basal = architecture.leafArrangement === 'basal';
      const clustered = architecture.leafArrangement === 'clustered';
      const separate = architecture.leafArrangement === 'separate-petiole';
      const y = basal
        ? m.stemHeight * (0.05 + fraction * 0.12)
        : separate ? m.stemHeight * (0.34 + fraction * 0.2)
          : clustered ? m.stemHeight * (0.6 + fraction * 0.25)
            : m.stemHeight * (0.2 + fraction * 0.58);
      const angle = index * GOLDEN_ANGLE + 0.7;
      const radial = new THREE.Group();
      radial.position.y = y;
      radial.rotation.y = angle;
      radial.rotation.x = separate ? 0.03 : basal ? -1.02 : clustered ? -0.62 : architecture.leafArrangement === 'whorled' ? -0.48 : -0.58;
      radial.rotation.z = Math.sin(index * 2.1) * 0.12;
      if (separate) radial.position.set(Math.sin(angle) * m.stemHeight * 0.18, y, Math.cos(angle) * m.stemHeight * 0.18);
      const mesh = new THREE.Mesh(leafGeometry, leafMaterial);
      mesh.scale.set(leafWidth, 1, leafLength);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      radial.add(mesh);
      this.root.add(radial);
    });

    if (architecture.branchCount > 0) {
      const branchLength = m.stemHeight * (architecture.stemHabit === 'woody-branch' ? 0.32 : architecture.stemHabit === 'shrub' ? 0.22 : 0.13);
      for (let index = 0; index < Math.min(8, architecture.branchCount); index += 1) {
        const branchGeometry = this.track(new THREE.CylinderGeometry(m.stemRadius * 0.34, m.stemRadius * 0.52, branchLength, 8, 2));
        branchGeometry.translate(0, branchLength * 0.5, 0);
        const branch = new THREE.Mesh(branchGeometry, stemMaterial);
        branch.position.y = m.stemHeight * (0.28 + (index + 1) / (architecture.branchCount + 1) * 0.48);
        branch.rotation.y = index * GOLDEN_ANGLE;
        branch.rotation.z = architecture.branchAngleDeg * DEG;
        branch.castShadow = true;
        this.root.add(branch);
      }
    }
  }

  private buildFloralAttachment(): void {
    const { morphology: m, colors } = this.preset;
    const { baseRadius, baseDepth, collarHeight } = this.attachmentLayout;
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
      Math.max(m.stemRadius * 1.05, baseRadius * 0.38),
      m.stemRadius * 0.92,
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
    // Reflex the calyx far enough below the corolla that a front-facing sepal
    // cannot project back through the open petal cup at oblique camera angles.
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
        closedAngle: isSunflower ? -8 : -12,
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
      const deployment = unfurl?.deployment ?? local;
      const angle = THREE.MathUtils.lerp(petal.closedAngle, petal.openAngle, deployment);
      const livingMotion = Math.sin(subtleTime * 0.52 + petal.phase) * 0.7 * smoothstep(0.78, 1, progress);
      petal.hinge.rotation.x = (angle + livingMotion) * DEG;
      const articulation = unfurl ? unfurl.unfurl * 0.72 + unfurl.reflex * 0.28 : local;
      petal.hinge.rotation.z = petal.sweep * articulation;
      petal.mesh.rotation.y = THREE.MathUtils.lerp(petal.closedRoll, petal.roll, articulation);
      const clearance = smoothstep(0.12, 0.88, deployment);
      const contactSeparation = unfurl?.contactSeparation ?? 0;
      const laneDepth = petal.laneDepth * (1 + contactSeparation * 0.45);
      const contactGuard = (petal.unfurl?.contactGuard ?? 0) * contactSeparation;
      petal.hinge.position.z = petal.radialBase
        + laneDepth
        + petal.openDrift * this.growth.radialSpread * clearance
        + contactGuard;
      petal.hinge.position.y = petal.baseLift
        + petal.laneLift * THREE.MathUtils.lerp(0.38, 1 + contactSeparation * 0.26, clearance);
      if (unfurl) {
        petal.mesh.morphTargetInfluences![0] = unfurl.weights[0];
        petal.mesh.morphTargetInfluences![1] = unfurl.weights[1];
        petal.mesh.morphTargetInfluences![2] = unfurl.weights[2];
      } else {
        petal.mesh.morphTargetInfluences![0] = local;
      }
      petal.mesh.scale.setScalar(1);
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
    this.head.position.y = m.stemHeight + Math.sin(subtleTime * 0.36) * 0.006;
    this.lastProgress = progress;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.disposables.forEach((item) => item.dispose());
    this.disposables.clear();
  }
}
