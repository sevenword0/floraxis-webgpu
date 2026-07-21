import { describe, expect, it } from 'vitest';
import { PRESET_BY_ID } from '../data/presets';
import { buildFloralOrganGraph, findOrganNode, generateOrganPlacements } from './floral-organ-graph';

describe('floral organ graph', () => {
  it('preserves the two exact 3-member tepal whorls of tulip', () => {
    const graph = buildFloralOrganGraph(PRESET_BY_ID.get('tulip')!);
    const tepals = findOrganNode(graph, 'tepal')!;
    const placements = generateOrganPlacements(tepals, { layers: 2 });
    expect(placements.map((item) => item.layerCount)).toEqual([3, 3, 3, 3, 3, 3]);
    expect(placements.slice(0, 3).map((item) => item.angle)).toEqual([
      0,
      Math.PI * 2 / 3,
      Math.PI * 4 / 3,
    ]);
    expect(placements[3].angle).toBeCloseTo(Math.PI / 3, 8);
  });

  it('uses a continuous golden-angle sequence for spiral rose petals', () => {
    const graph = buildFloralOrganGraph(PRESET_BY_ID.get('rose')!);
    const petals = findOrganNode(graph, 'petal')!;
    const placements = generateOrganPlacements(petals, { layers: 4 });
    const golden = Math.PI * (3 - Math.sqrt(5));
    expect(placements).toHaveLength(42);
    expect(placements[1].angle - placements[0].angle).toBeCloseTo(golden, 8);
  });

  it('represents composite and papilionaceous heads as nested organ roles', () => {
    const sunflower = buildFloralOrganGraph(PRESET_BY_ID.get('sunflower')!);
    expect(findOrganNode(sunflower, 'ray-floret')?.count).toBe(56);
    expect(findOrganNode(sunflower, 'disc-floret')?.count).toBe(480);

    const wisteria = buildFloralOrganGraph(PRESET_BY_ID.get('wisteria')!);
    expect(findOrganNode(wisteria, 'banner-petal')?.count).toBe(18);
    expect(findOrganNode(wisteria, 'wing-petal')?.count).toBe(36);
    expect(findOrganNode(wisteria, 'keel-petal')?.count).toBe(36);
  });
});
