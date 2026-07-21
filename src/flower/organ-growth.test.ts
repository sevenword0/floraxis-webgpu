import { describe, expect, it } from 'vitest';
import { PRESET_BY_ID } from '../data/presets';
import { buildFloralOrganGraph } from './floral-organ-graph';
import { evaluateOrganGrowth, findOrganGrowth, resolveOrganGrowthSchedule } from './organ-growth';

describe('organ-specific phenology schedule', () => {
  it('orders protective, perianth, and reproductive organs independently', () => {
    const preset = PRESET_BY_ID.get('rose')!;
    const schedule = resolveOrganGrowthSchedule(preset, buildFloralOrganGraph(preset));
    const sepals = findOrganGrowth(schedule, 'sepals');
    const petals = findOrganGrowth(schedule, 'perianth');
    const stamens = findOrganGrowth(schedule, 'stamens');
    expect(sepals.start).toBeLessThan(petals.start);
    expect(stamens.start).toBeGreaterThan(petals.start);
    expect(petals.rankDelay).toBeGreaterThan(0.3);
  });

  it('delays later-initiated organs while retaining bounded growth state', () => {
    const preset = PRESET_BY_ID.get('rose')!;
    const entry = findOrganGrowth(
      resolveOrganGrowthSchedule(preset, buildFloralOrganGraph(preset)),
      'perianth',
    );
    const outer = evaluateOrganGrowth(entry, 0.5, 0);
    const inner = evaluateOrganGrowth(entry, 0.5, 1);
    expect(outer.deployment).toBeGreaterThan(inner.deployment);
    expect(inner.elongation).toBeGreaterThanOrEqual(entry.initialScale);
    expect(outer.maturity).toBeLessThanOrEqual(1);
  });
});
