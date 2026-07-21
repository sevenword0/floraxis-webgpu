import { Vector2, type Node, type TextureNode } from 'three/webgpu';
import { convertToTexture, nodeObject } from 'three/tsl';
import DepthOfFieldNode from 'three/addons/tsl/display/DepthOfFieldNode.js';
import type { BokehShape } from './lens-settings';
import { generateBokehKernel } from './lens-settings';

/** Three.js DOF with its Vogel disc remapped to a selectable aperture mask. */
export class ShapedDepthOfFieldNode extends DepthOfFieldNode {
  private readonly apertureShape: BokehShape;
  private readonly apertureBlades: number;
  private readonly apertureRotation: number;

  constructor(
    textureNode: TextureNode,
    viewZNode: Node,
    focusDistanceNode: Node,
    focalLengthNode: Node,
    bokehScaleNode: Node,
    shape: BokehShape,
    blades: number,
    rotationDegrees: number,
  ) {
    super(textureNode, viewZNode, focusDistanceNode, focalLengthNode, bokehScaleNode);
    this.apertureShape = shape;
    this.apertureBlades = blades;
    this.apertureRotation = rotationDegrees;
  }

  _generateKernels(): { points64: Vector2[]; points16: Vector2[] } {
    const kernel = generateBokehKernel(this.apertureShape, this.apertureBlades, this.apertureRotation);
    return {
      points64: kernel.points64.map((point) => new Vector2(point.x, point.y)),
      points16: kernel.points16.map((point) => new Vector2(point.x, point.y)),
    };
  }

  dispose(): void {
    (DepthOfFieldNode.prototype as unknown as { dispose: () => void }).dispose.call(this);
  }
}

export const shapedDepthOfField = (
  node: Node,
  viewZNode: Node,
  focusDistance: Node | number,
  focalRange: Node | number,
  bokehScale: Node | number,
  shape: BokehShape,
  blades: number,
  rotationDegrees: number,
): ShapedDepthOfFieldNode => new ShapedDepthOfFieldNode(
  convertToTexture(node),
  nodeObject(viewZNode),
  nodeObject(focusDistance),
  nodeObject(focalRange),
  nodeObject(bokehScale),
  shape,
  blades,
  rotationDegrees,
);
