import * as THREE from 'three/webgpu';

const EPSILON = 1e-10;

/** Writes a unit vector whose azimuth is measured around +Y and elevation above XZ. */
export const setLeafGrowthDirection = (
  azimuth: number,
  elevation: number,
  out: THREE.Vector3,
): THREE.Vector3 => {
  const horizontal = Math.cos(elevation);
  return out.set(
    Math.sin(azimuth) * horizontal,
    Math.sin(elevation),
    Math.cos(azimuth) * horizontal,
  ).normalize();
};

/**
 * Allocation-free frame builder for a leaf and its petiole. Simple blades grow
 * along local +Z; peltate blades receive the petiole through local +Y.
 */
export class LeafAttachmentFrame {
  private readonly forward = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly matrix = new THREE.Matrix4();
  private readonly rollQuaternion = new THREE.Quaternion();
  private readonly localForward = new THREE.Vector3(0, 0, 1);
  private readonly localNormal = new THREE.Vector3(0, 1, 0);

  setBladeQuaternion(
    petioleBase: Readonly<THREE.Vector3>,
    petioleTip: Readonly<THREE.Vector3>,
    normalHint: Readonly<THREE.Vector3>,
    roll: number,
    out: THREE.Quaternion,
  ): THREE.Quaternion {
    this.forward.copy(petioleTip).sub(petioleBase);
    if (this.forward.lengthSq() < EPSILON) this.forward.copy(this.localForward);
    else this.forward.normalize();

    this.normal.copy(normalHint).addScaledVector(this.forward, -this.normal.dot(this.forward));
    if (this.normal.lengthSq() < EPSILON) {
      this.normal.set(1, 0, 0).addScaledVector(this.forward, -this.forward.x);
    }
    this.normal.normalize();
    this.right.crossVectors(this.normal, this.forward).normalize();
    this.normal.crossVectors(this.forward, this.right).normalize();
    this.matrix.makeBasis(this.right, this.normal, this.forward);
    out.setFromRotationMatrix(this.matrix);
    if (Math.abs(roll) > EPSILON) {
      this.rollQuaternion.setFromAxisAngle(this.localForward, roll);
      out.multiply(this.rollQuaternion);
    }
    return out.normalize();
  }

  setPeltateQuaternion(
    petioleBase: Readonly<THREE.Vector3>,
    petioleTip: Readonly<THREE.Vector3>,
    azimuth: number,
    roll: number,
    out: THREE.Quaternion,
  ): THREE.Quaternion {
    this.normal.copy(petioleTip).sub(petioleBase);
    if (this.normal.lengthSq() < EPSILON) this.normal.copy(this.localNormal);
    else this.normal.normalize();

    this.forward.set(Math.sin(azimuth), 0, Math.cos(azimuth));
    this.forward.addScaledVector(this.normal, -this.forward.dot(this.normal));
    if (this.forward.lengthSq() < EPSILON) {
      this.forward.set(0, 0, 1).addScaledVector(this.normal, -this.normal.z);
    }
    if (this.forward.lengthSq() < EPSILON) {
      this.forward.set(1, 0, 0).addScaledVector(this.normal, -this.normal.x);
    }
    this.forward.normalize();
    this.right.crossVectors(this.normal, this.forward).normalize();
    this.forward.crossVectors(this.right, this.normal).normalize();
    this.matrix.makeBasis(this.right, this.normal, this.forward);
    out.setFromRotationMatrix(this.matrix);
    if (Math.abs(roll) > EPSILON) {
      this.rollQuaternion.setFromAxisAngle(this.localNormal, roll);
      out.multiply(this.rollQuaternion);
    }
    return out.normalize();
  }
}
