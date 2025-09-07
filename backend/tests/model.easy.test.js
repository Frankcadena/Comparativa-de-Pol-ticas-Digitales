const { buildComparisonWithWeights, toRadarDataset, toBarDataset } = require('../src/model');

describe('modelo (prueba simple)', () => {
  const rows = [
    { country: 'Chile',    year: 2023, access_internet_pct: 94.5, fixed_broadband_subs_per100: 23, broadband_speed_mbps: 24 },
    { country: 'Colombia', year: 2023, access_internet_pct: 77.3, fixed_broadband_subs_per100: 17, broadband_speed_mbps: 17 },
  ];

  test('score en rango [0,1] y ranking correcto', () => {
    const { comparison, weights } = buildComparisonWithWeights(rows);
    expect(weights.access + weights.infra + weights.capacity).toBeCloseTo(1, 5);
    for (const c of comparison) {
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(1);
    }
    expect(comparison[0].country).toBe('Chile');
    expect(comparison[0].score).toBeGreaterThan(comparison[1].score);
  });

  test('datasets básicos para charts', () => {
    const { comparison } = buildComparisonWithWeights(rows);
    const radar = toRadarDataset(comparison);
    const bars = toBarDataset(comparison);
    expect(radar.labels).toHaveLength(3);
    expect(radar.datasets[0].data).toHaveLength(3);
    expect(bars.labels).toEqual(['Chile', 'Colombia']);
  });
});
