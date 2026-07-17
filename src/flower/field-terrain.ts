import * as THREE from 'three/webgpu';
import type { FieldSettings } from '../types';
import {
  generateFieldEnvironmentLayout,
  sampleTerrainHeight,
  sampleWindBend,
  type FieldEnvironmentInstance,
} from './field-environment-layout';

const createTerrainGeometry = (settings: FieldSettings): THREE.BufferGeometry => {
  const rings = 24;
  const segments = 96;
  const radius = settings.radius * 1.04;
  const positions: number[] = [0, sampleTerrainHeight(0, 0, settings.radius, settings.terrainRelief, settings.seed), 0];
  const colors: number[] = [];
  const uvs: number[] = [0.5, 0.5];
  const indices: number[] = [];
  const soil = new THREE.Color('#563f29');
  const loam = new THREE.Color('#84633e');
  const moss = new THREE.Color('#3b5438');

  const pushColor = (x: number, z: number, height: number): void => {
    const mottling = Math.sin(x * 1.71 + z * 0.91 + settings.seed * 0.013) * 0.5 + 0.5;
    const damp = Math.cos(x * 0.53 - z * 0.69 + settings.seed * 0.021) * 0.5 + 0.5;
    const color = soil.clone().lerp(loam, mottling * 0.42 + Math.max(0, height) * 0.9);
    color.lerp(moss, damp * 0.18 * (settings.groundCover ?? 0.82));
    colors.push(color.r, color.g, color.b);
  };
  pushColor(0, 0, positions[1]);

  for (let ring = 1; ring <= rings; ring += 1) {
    const t = ring / rings;
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = segment / segments * Math.PI * 2;
      const radial = radius * t;
      const x = Math.cos(angle) * radial;
      const z = Math.sin(angle) * radial;
      const y = sampleTerrainHeight(x, z, settings.radius, settings.terrainRelief, settings.seed);
      positions.push(x, y, z);
      uvs.push(x / (radius * 2) + 0.5, z / (radius * 2) + 0.5);
      pushColor(x, z, y);
    }
  }

  for (let segment = 0; segment < segments; segment += 1) {
    indices.push(0, 1 + segment, 1 + (segment + 1) % segments);
  }
  for (let ring = 2; ring <= rings; ring += 1) {
    const inner = 1 + (ring - 2) * segments;
    const outer = 1 + (ring - 1) * segments;
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      indices.push(inner + segment, outer + segment, inner + next);
      indices.push(inner + next, outer + segment, outer + next);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
};

const createBladeClumpGeometry = (bladeCount: number, broad = false): THREE.BufferGeometry => {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const rows = broad ? 5 : 4;
  for (let blade = 0; blade < bladeCount; blade += 1) {
    const angle = blade / bladeCount * Math.PI * 2 + (blade % 2) * 0.28;
    const rightX = Math.cos(angle);
    const rightZ = -Math.sin(angle);
    const forwardX = Math.sin(angle);
    const forwardZ = Math.cos(angle);
    const bladeHeight = (broad ? 0.72 : 0.9) + (blade % 3) * 0.11;
    const base = positions.length / 3;
    for (let row = 0; row <= rows; row += 1) {
      const t = row / rows;
      const profile = broad ? Math.sin(Math.PI * Math.pow(t, 0.82)) : Math.pow(1 - t, 0.72);
      const halfWidth = Math.max(0.006, profile * (broad ? 0.21 : 0.09));
      const bend = t * t * (broad ? 0.42 : 0.24) * (0.78 + (blade % 4) * 0.07);
      const centerX = forwardX * bend;
      const centerZ = forwardZ * bend;
      const y = t * bladeHeight;
      positions.push(
        centerX - rightX * halfWidth, y, centerZ - rightZ * halfWidth,
        centerX + rightX * halfWidth, y, centerZ + rightZ * halfWidth,
      );
      uvs.push(0, t, 1, t);
      if (row < rows) {
        const a = base + row * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
};

export class FieldTerrain {
  readonly root = new THREE.Group();

  private readonly settings: FieldSettings;
  private readonly groundCover: FieldEnvironmentInstance[];
  private readonly shrubs: FieldEnvironmentInstance[];
  private readonly rocks: FieldEnvironmentInstance[];
  private readonly disposables = new Set<{ dispose(): void }>();
  private readonly transform = new THREE.Object3D();
  private groundCoverMesh?: THREE.InstancedMesh;
  private shrubMesh?: THREE.InstancedMesh;
  private rockMesh?: THREE.InstancedMesh;

  constructor(settings: FieldSettings, roots: Array<{ x: number; z: number }>) {
    this.settings = { ...settings };
    this.root.name = 'field-terrain-ecology';
    const layout = generateFieldEnvironmentLayout(settings, roots);
    this.groundCover = layout.groundCover;
    this.shrubs = layout.shrubs;
    this.rocks = layout.rocks;
    this.buildSoil();
    this.buildGroundCover();
    this.buildShrubs();
    this.buildRocks();
    this.update(0);
  }

  private track<T extends { dispose(): void }>(value: T): T {
    this.disposables.add(value);
    return value;
  }

  private buildSoil(): void {
    const topMaterial = this.track(new THREE.MeshStandardNodeMaterial({
      vertexColors: true,
      roughness: 0.98,
      metalness: 0,
    }));
    const top = new THREE.Mesh(this.track(createTerrainGeometry(this.settings)), topMaterial);
    top.name = 'mottled-soil-surface';
    top.receiveShadow = true;
    this.root.add(top);

    const skirtMaterial = this.track(new THREE.MeshStandardNodeMaterial({ color: '#2d2118', roughness: 1 }));
    const skirt = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(this.settings.radius * 1.04, this.settings.radius * 1.09, 0.24, 96)),
      skirtMaterial,
    );
    skirt.position.y = -0.17;
    skirt.receiveShadow = true;
    this.root.add(skirt);
  }

  private setInstanceColors(mesh: THREE.InstancedMesh, instances: FieldEnvironmentInstance[], low: string, high: string): void {
    const first = new THREE.Color(low);
    const second = new THREE.Color(high);
    instances.forEach((instance, index) => mesh.setColorAt(index, first.clone().lerp(second, instance.colorMix)));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  private buildGroundCover(): void {
    if (this.groundCover.length === 0) return;
    const material = this.track(new THREE.MeshStandardNodeMaterial({
      color: '#6d8c50',
      roughness: 0.92,
      side: THREE.DoubleSide,
    }));
    this.groundCoverMesh = new THREE.InstancedMesh(
      this.track(createBladeClumpGeometry(3)),
      material,
      this.groundCover.length,
    );
    this.groundCoverMesh.name = 'wind-ground-cover';
    this.groundCoverMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.groundCoverMesh.receiveShadow = true;
    this.groundCoverMesh.frustumCulled = false;
    this.setInstanceColors(this.groundCoverMesh, this.groundCover, '#35633e', '#91a860');
    this.root.add(this.groundCoverMesh);
  }

  private buildShrubs(): void {
    if (this.shrubs.length === 0) return;
    const material = this.track(new THREE.MeshStandardNodeMaterial({
      color: '#648449',
      roughness: 0.88,
      side: THREE.DoubleSide,
    }));
    this.shrubMesh = new THREE.InstancedMesh(
      this.track(createBladeClumpGeometry(9, true)),
      material,
      this.shrubs.length,
    );
    this.shrubMesh.name = 'wind-understory-shrubs';
    this.shrubMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shrubMesh.castShadow = true;
    this.shrubMesh.receiveShadow = true;
    this.shrubMesh.frustumCulled = false;
    this.setInstanceColors(this.shrubMesh, this.shrubs, '#32633c', '#92a45f');
    this.root.add(this.shrubMesh);
  }

  private buildRocks(): void {
    if (this.rocks.length === 0) return;
    const material = this.track(new THREE.MeshStandardNodeMaterial({ color: '#746b5d', roughness: 0.96 }));
    this.rockMesh = new THREE.InstancedMesh(
      this.track(new THREE.DodecahedronGeometry(1, 0)),
      material,
      this.rocks.length,
    );
    this.rockMesh.name = 'small-field-rocks';
    this.rockMesh.castShadow = true;
    this.rockMesh.receiveShadow = true;
    this.rockMesh.frustumCulled = false;
    this.rocks.forEach((rock, index) => {
      this.transform.position.set(rock.x, rock.y + rock.height * 0.42, rock.z);
      this.transform.rotation.set(rock.phase * 0.14, rock.yaw, rock.phase * 0.09);
      this.transform.scale.set(rock.height * rock.scale * 1.25, rock.height * (0.58 + rock.colorMix * 0.35), rock.height * rock.scale);
      this.transform.updateMatrix();
      this.rockMesh!.setMatrixAt(index, this.transform.matrix);
    });
    this.setInstanceColors(this.rockMesh, this.rocks, '#5a5650', '#aa987d');
    this.rockMesh.instanceMatrix.needsUpdate = true;
    this.root.add(this.rockMesh);
  }

  private updateLivingMesh(
    mesh: THREE.InstancedMesh | undefined,
    instances: FieldEnvironmentInstance[],
    time: number,
    bendScale: number,
    widthScale: number,
  ): void {
    if (!mesh) return;
    const turbulence = this.settings.windTurbulence ?? 0.58;
    instances.forEach((instance, index) => {
      const bend = sampleWindBend(time, instance.x, instance.z, instance.phase, this.settings.wind, turbulence);
      const flutter = Math.sin(time * 0.0034 + instance.phase * 1.7) * this.settings.wind * turbulence * 0.035;
      this.transform.position.set(instance.x, instance.y, instance.z);
      this.transform.rotation.set(bend.z * bendScale + flutter, instance.yaw, -bend.x * bendScale + flutter * 0.6, 'YXZ');
      this.transform.scale.set(instance.scale * widthScale, instance.height, instance.scale * widthScale);
      this.transform.updateMatrix();
      mesh.setMatrixAt(index, this.transform.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }

  update(time: number): void {
    this.updateLivingMesh(this.groundCoverMesh, this.groundCover, time, 0.3, 0.18);
    this.updateLivingMesh(this.shrubMesh, this.shrubs, time, 0.18, 0.48);
  }

  dispose(): void {
    this.root.removeFromParent();
    this.disposables.forEach((item) => item.dispose());
    this.disposables.clear();
  }
}
