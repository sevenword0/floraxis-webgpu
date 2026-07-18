import * as THREE from 'three/webgpu';
import type { Bloomable } from '../types';
import type { RendererDiagnosticView } from '../render/bloom-renderer';

export type LightingTestMode = 'materials' | 'shadows' | 'temporal';

export interface LightingTestDescription {
  kicker: string;
  title: string;
  description: string;
  checks: readonly string[];
}

export const LIGHTING_TEST_DESCRIPTIONS: Record<LightingTestMode, LightingTestDescription> = {
  materials: {
    kicker: '01 · MATERIAL ENERGY',
    title: '거칠기·금속성 기준구',
    description: '위쪽은 유전체, 아래쪽은 금속입니다. 왼쪽에서 오른쪽으로 거칠기가 0.05 → 1.0으로 증가합니다.',
    checks: [
      'SSR을 켜면 아래 금속구의 선명한 반사만 우선 강화됩니다.',
      '회색 카드와 흰 카드의 밝기가 노출 변화 없이 구분됩니다.',
      '블룸은 고휘도 발광 바에만 제한적으로 나타납니다.',
    ],
  },
  shadows: {
    kicker: '02 · CASCADED SHADOW',
    title: 'CSM 경계·미세 형상 장면',
    description: '카메라에서 멀어지는 얇은 잎과 기둥으로 2단 CSM의 해상도 전환, 접촉 그림자, 누락을 확인합니다.',
    checks: [
      '근거리 잎과 기둥 아래에 접촉 그림자가 이어집니다.',
      '거리 띠를 지날 때 눈에 띄는 캐스케이드 경계선이 없어야 합니다.',
      'Reduced 단계에서도 얇은 형상의 그림자가 과도하게 사라지지 않아야 합니다.',
    ],
  },
  temporal: {
    kicker: '03 · TEMPORAL STABILITY',
    title: 'TRAA·SSGI 이력 안정성',
    description: '회전 날개와 왕복 금속구가 고대비 배경을 가로지릅니다. 움직임 벡터와 시간 누적의 잔상 여부를 봅니다.',
    checks: [
      '회전 날개의 뒤쪽에 긴 검은 잔상이 남지 않아야 합니다.',
      '움직이는 금속구의 반사가 프레임 사이에서 폭발적으로 번쩍이지 않아야 합니다.',
      '카메라 자동 회전 중 얇은 모서리가 안정적으로 유지되어야 합니다.',
    ],
  },
};

const TEST_VIEWS: Record<LightingTestMode, RendererDiagnosticView> = {
  materials: {
    cameraPosition: [7.4, 4.25, 8.6],
    target: [0, 1.35, -0.15],
    minDistance: 4,
    maxDistance: 18,
    maxPolarAngle: Math.PI * 0.49,
    shadowHorizontal: 7,
    shadowVertical: 7,
  },
  shadows: {
    cameraPosition: [7.8, 5.4, 10.8],
    target: [0, 1.15, -3.3],
    minDistance: 5,
    maxDistance: 28,
    maxPolarAngle: Math.PI * 0.49,
    shadowHorizontal: 9,
    shadowVertical: 10,
  },
  temporal: {
    cameraPosition: [6.8, 3.65, 8.2],
    target: [0, 1.45, -0.3],
    minDistance: 4,
    maxDistance: 20,
    maxPolarAngle: Math.PI * 0.49,
    shadowHorizontal: 7,
    shadowVertical: 8,
  },
};

export const getLightingTestView = (mode: LightingTestMode): RendererDiagnosticView => TEST_VIEWS[mode];

export class LightingReferenceScene implements Bloomable {
  readonly root = new THREE.Group();
  readonly petalCount = 0;

  private readonly materialsGroup = new THREE.Group();
  private readonly shadowsGroup = new THREE.Group();
  private readonly temporalGroup = new THREE.Group();
  private readonly disposables = new Set<{ dispose(): void }>();
  private readonly shadowRotor = new THREE.Group();
  private readonly temporalRotor = new THREE.Group();
  private temporalSphere?: THREE.Mesh;
  private temporalPanel?: THREE.Mesh;
  private motionEnabled = true;

  constructor() {
    this.root.name = 'Floraxis lighting reference scene';
    this.materialsGroup.name = 'Material energy reference';
    this.shadowsGroup.name = 'Cascaded shadow reference';
    this.temporalGroup.name = 'Temporal stability reference';
    this.root.add(this.createGround(), this.materialsGroup, this.shadowsGroup, this.temporalGroup);
    this.buildMaterialReference();
    this.buildShadowReference();
    this.buildTemporalReference();
    this.setMode('materials');
  }

  setMode(mode: LightingTestMode): void {
    this.materialsGroup.visible = mode === 'materials';
    this.shadowsGroup.visible = mode === 'shadows';
    this.temporalGroup.visible = mode === 'temporal';
  }

  setMotionEnabled(enabled: boolean): void {
    this.motionEnabled = enabled;
  }

  update(_progress: number, time: number): void {
    if (!this.motionEnabled) return;
    const seconds = time * 0.001;
    this.shadowRotor.rotation.y = seconds * 0.72;
    this.shadowRotor.rotation.z = Math.sin(seconds * 0.42) * 0.16;
    this.temporalRotor.rotation.z = seconds * 1.75;
    this.temporalRotor.rotation.y = Math.sin(seconds * 0.57) * 0.22;
    if (this.temporalSphere) {
      this.temporalSphere.position.x = Math.sin(seconds * 1.08) * 2.65;
      this.temporalSphere.position.y = 1.05 + Math.sin(seconds * 2.16) * 0.24;
      this.temporalSphere.rotation.y = seconds * 0.8;
    }
    if (this.temporalPanel) {
      this.temporalPanel.rotation.y = Math.sin(seconds * 0.9) * 0.88;
      this.temporalPanel.rotation.x = Math.cos(seconds * 0.51) * 0.12;
    }
  }

  dispose(): void {
    this.root.removeFromParent();
    this.disposables.forEach((item) => item.dispose());
    this.disposables.clear();
  }

  private track<T extends { dispose(): void }>(item: T): T {
    this.disposables.add(item);
    return item;
  }

  private createGround(): THREE.Mesh {
    const material = this.track(new THREE.MeshPhysicalNodeMaterial({
      color: 0x2f3835,
      metalness: 0.08,
      roughness: 0.72,
      clearcoat: 0.18,
      clearcoatRoughness: 0.55,
    }));
    const ground = new THREE.Mesh(this.track(new THREE.PlaneGeometry(24, 24)), material);
    ground.rotation.x = -Math.PI * 0.5;
    ground.position.set(0, -0.012, -2.2);
    ground.receiveShadow = true;
    return ground;
  }

  private buildMaterialReference(): void {
    const wall = new THREE.Mesh(
      this.track(new THREE.BoxGeometry(8.4, 3.7, 0.08)),
      this.track(new THREE.MeshStandardNodeMaterial({ color: 0x767676, metalness: 0, roughness: 0.82 })),
    );
    wall.position.set(0, 1.82, -2.45);
    wall.receiveShadow = true;
    this.materialsGroup.add(wall);

    const sphereGeometry = this.track(new THREE.SphereGeometry(0.48, 64, 40));
    const roughnessLevels = [0.05, 0.25, 0.5, 0.75, 1];
    const xPositions = [-2.8, -1.4, 0, 1.4, 2.8];
    roughnessLevels.forEach((roughness, index) => {
      const dielectric = new THREE.Mesh(
        sphereGeometry,
        this.track(new THREE.MeshPhysicalNodeMaterial({
          color: 0xb9c0bd,
          metalness: 0,
          roughness,
          clearcoat: 0.08,
        })),
      );
      dielectric.position.set(xPositions[index], 1.75, -0.48);
      dielectric.castShadow = true;
      dielectric.receiveShadow = true;

      const metal = new THREE.Mesh(
        sphereGeometry,
        this.track(new THREE.MeshStandardNodeMaterial({
          color: 0xd4d9d7,
          metalness: 1,
          roughness,
        })),
      );
      metal.position.set(xPositions[index], 0.62, 0.54);
      metal.castShadow = true;
      metal.receiveShadow = true;
      this.materialsGroup.add(dielectric, metal);
    });

    const cardGeometry = this.track(new THREE.BoxGeometry(0.92, 0.42, 0.055));
    const cardColors = [0x1e1e1e, 0x767676, 0xd9d9d9, 0xa33a32, 0x38654c, 0x345a86];
    cardColors.forEach((color, index) => {
      const card = new THREE.Mesh(
        cardGeometry,
        this.track(new THREE.MeshStandardNodeMaterial({ color, metalness: 0, roughness: 0.86 })),
      );
      card.position.set(-2.62 + index * 1.05, 3.12, -2.34);
      card.castShadow = true;
      this.materialsGroup.add(card);
    });

    const emissiveMaterial = this.track(new THREE.MeshStandardNodeMaterial({
      color: 0xffd7a0,
      emissive: 0xffbd68,
      emissiveIntensity: 7,
      roughness: 0.42,
    }));
    const emissiveBar = new THREE.Mesh(this.track(new THREE.BoxGeometry(4.8, 0.055, 0.07)), emissiveMaterial);
    emissiveBar.position.set(0, 2.68, -2.33);
    this.materialsGroup.add(emissiveBar);
  }

  private buildShadowReference(): void {
    const markerGeometry = this.track(new THREE.BoxGeometry(6.8, 0.018, 0.055));
    const markerMaterial = this.track(new THREE.MeshStandardNodeMaterial({ color: 0xbec9c4, roughness: 0.9 }));
    [-0.8, -3.3, -5.8, -8.3].forEach((z) => {
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.position.set(0, 0.012, z);
      marker.receiveShadow = true;
      this.shadowsGroup.add(marker);
    });

    const postGeometry = this.track(new THREE.BoxGeometry(0.12, 1, 0.12));
    const postMaterial = this.track(new THREE.MeshStandardNodeMaterial({ color: 0x8ea299, roughness: 0.68 }));
    const posts = new THREE.InstancedMesh(postGeometry, postMaterial, 56);
    const dummy = new THREE.Object3D();
    for (let index = 0; index < 56; index += 1) {
      const column = index % 14;
      const row = Math.floor(index / 14);
      const height = 0.55 + ((index * 7) % 11) * 0.075;
      dummy.position.set(-3.25 + column * 0.5, height * 0.5, -0.65 - row * 2.35);
      dummy.rotation.y = (index % 3 - 1) * 0.08;
      dummy.scale.set(1, height, 1);
      dummy.updateMatrix();
      posts.setMatrixAt(index, dummy.matrix);
    }
    posts.castShadow = true;
    posts.receiveShadow = true;
    this.shadowsGroup.add(posts);

    const leafGeometry = this.track(new THREE.PlaneGeometry(0.34, 0.78, 1, 2));
    const leafMaterial = this.track(new THREE.MeshPhysicalNodeMaterial({
      color: 0x5d8e6d,
      metalness: 0,
      roughness: 0.64,
      side: THREE.DoubleSide,
    }));
    const leaves = new THREE.InstancedMesh(leafGeometry, leafMaterial, 112);
    for (let index = 0; index < 112; index += 1) {
      const column = index % 16;
      const row = Math.floor(index / 16);
      dummy.position.set(-3.45 + column * 0.46, 0.72 + (index % 5) * 0.16, -0.25 - row * 1.3);
      dummy.rotation.set(
        (index % 4 - 1.5) * 0.12,
        index * 1.71,
        (index % 7 - 3) * 0.08,
      );
      dummy.scale.setScalar(0.72 + (index % 6) * 0.055);
      dummy.updateMatrix();
      leaves.setMatrixAt(index, dummy.matrix);
    }
    leaves.castShadow = true;
    leaves.receiveShadow = true;
    this.shadowsGroup.add(leaves);

    const rotorPole = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(0.08, 0.1, 2.7, 16)),
      this.track(new THREE.MeshStandardNodeMaterial({ color: 0x3f4a47, metalness: 0.55, roughness: 0.38 })),
    );
    rotorPole.position.y = 1.35;
    rotorPole.castShadow = true;
    this.shadowRotor.position.set(0, 0, -4.55);
    this.shadowRotor.add(rotorPole);
    const rotorBladeGeometry = this.track(new THREE.BoxGeometry(2.9, 0.055, 0.38));
    const rotorBladeMaterial = this.track(new THREE.MeshStandardNodeMaterial({ color: 0xd3dad6, metalness: 0.1, roughness: 0.6 }));
    for (let index = 0; index < 2; index += 1) {
      const blade = new THREE.Mesh(rotorBladeGeometry, rotorBladeMaterial);
      blade.position.y = 2.54;
      blade.rotation.y = index * Math.PI * 0.5;
      blade.castShadow = true;
      this.shadowRotor.add(blade);
    }
    this.shadowsGroup.add(this.shadowRotor);
  }

  private buildTemporalReference(): void {
    const backdrop = new THREE.Mesh(
      this.track(new THREE.BoxGeometry(7.8, 3.5, 0.08)),
      this.track(new THREE.MeshStandardNodeMaterial({ color: 0x151b1a, roughness: 0.84 })),
    );
    backdrop.position.set(0, 1.7, -2.65);
    backdrop.receiveShadow = true;
    this.temporalGroup.add(backdrop);

    const stripeGeometry = this.track(new THREE.BoxGeometry(0.18, 2.75, 0.06));
    const stripeMaterial = this.track(new THREE.MeshStandardNodeMaterial({
      color: 0xd9e0dc,
      emissive: 0x9eb8ac,
      emissiveIntensity: 1.4,
      roughness: 0.72,
    }));
    for (let index = 0; index < 17; index += 1) {
      const stripe = new THREE.Mesh(stripeGeometry, stripeMaterial);
      stripe.position.set(-3.2 + index * 0.4, 1.72, -2.57);
      stripe.castShadow = true;
      this.temporalGroup.add(stripe);
    }

    const hub = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(0.3, 0.3, 0.34, 32)),
      this.track(new THREE.MeshStandardNodeMaterial({ color: 0xaab4b0, metalness: 0.88, roughness: 0.2 })),
    );
    hub.rotation.x = Math.PI * 0.5;
    hub.castShadow = true;
    this.temporalRotor.position.set(0, 1.72, -0.55);
    this.temporalRotor.add(hub);
    const bladeGeometry = this.track(new THREE.BoxGeometry(2.45, 0.13, 0.1));
    const bladeMaterial = this.track(new THREE.MeshStandardNodeMaterial({ color: 0x101414, metalness: 0.24, roughness: 0.36 }));
    for (let index = 0; index < 3; index += 1) {
      const arm = new THREE.Group();
      arm.rotation.z = index * Math.PI * 2 / 3;
      const blade = new THREE.Mesh(bladeGeometry, bladeMaterial);
      blade.position.x = 1.04;
      blade.castShadow = true;
      arm.add(blade);
      this.temporalRotor.add(arm);
    }
    this.temporalGroup.add(this.temporalRotor);

    this.temporalSphere = new THREE.Mesh(
      this.track(new THREE.SphereGeometry(0.48, 56, 36)),
      this.track(new THREE.MeshStandardNodeMaterial({ color: 0xcdd4d1, metalness: 1, roughness: 0.12 })),
    );
    this.temporalSphere.position.set(0, 1.05, 1.2);
    this.temporalSphere.castShadow = true;
    this.temporalSphere.receiveShadow = true;
    this.temporalGroup.add(this.temporalSphere);

    this.temporalPanel = new THREE.Mesh(
      this.track(new THREE.BoxGeometry(1.25, 1.8, 0.08)),
      this.track(new THREE.MeshPhysicalNodeMaterial({
        color: 0xe46574,
        metalness: 0.08,
        roughness: 0.24,
        clearcoat: 1,
        clearcoatRoughness: 0.12,
      })),
    );
    this.temporalPanel.position.set(2.65, 1.2, 0.15);
    this.temporalPanel.castShadow = true;
    this.temporalPanel.receiveShadow = true;
    this.temporalGroup.add(this.temporalPanel);
  }
}
