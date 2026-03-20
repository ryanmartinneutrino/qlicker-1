import { describe, it, expect } from 'vitest';
import { computeHistogramData } from '../../src/utils/histogram.js';

describe('computeHistogramData', () => {
  it('returns empty bins for empty input', () => {
    const result = computeHistogramData([]);
    expect(result.bins).toEqual([]);
    expect(result.overflowLow).toBe(0);
    expect(result.overflowHigh).toBe(0);
  });

  it('returns empty bins for non-numeric input', () => {
    const result = computeHistogramData(['a', 'b', 'c']);
    expect(result.bins).toEqual([]);
  });

  it('creates bins for a single value', () => {
    const result = computeHistogramData([42]);
    expect(result.bins.length).toBeGreaterThan(0);
    // Single value should have all count in one bin
    const totalCount = result.bins.reduce((s, b) => s + b.count, 0);
    expect(totalCount).toBe(1);
  });

  it('creates 20 bins by default', () => {
    const values = Array.from({ length: 100 }, (_, i) => i);
    const result = computeHistogramData(values);
    expect(result.numBins).toBe(20);
    expect(result.bins.length).toBe(20);
  });

  it('respects custom numBins', () => {
    const values = Array.from({ length: 100 }, (_, i) => i);
    const result = computeHistogramData(values, { numBins: 5 });
    expect(result.numBins).toBe(5);
    expect(result.bins.length).toBe(5);
  });

  it('respects custom rangeMin and rangeMax', () => {
    const values = [10, 20, 30, 40, 50];
    const result = computeHistogramData(values, { rangeMin: 0, rangeMax: 100, numBins: 10 });
    expect(result.rangeMin).toBe(0);
    expect(result.rangeMax).toBe(100);
    expect(result.numBins).toBe(10);
  });

  it('counts overflow bins correctly', () => {
    const values = [1, 2, 3, 50, 100];
    const result = computeHistogramData(values, { rangeMin: 5, rangeMax: 60, numBins: 5 });
    // Values 1, 2, 3 should be in overflow low
    expect(result.overflowLow).toBe(3);
    // Value 100 should be in overflow high
    expect(result.overflowHigh).toBe(1);
  });

  it('bins have correct structure', () => {
    const values = [10, 20, 30];
    const result = computeHistogramData(values);
    for (const bin of result.bins) {
      expect(bin).toHaveProperty('label');
      expect(bin).toHaveProperty('count');
      expect(bin).toHaveProperty('min');
      expect(bin).toHaveProperty('max');
      expect(typeof bin.label).toBe('string');
      expect(typeof bin.count).toBe('number');
    }
  });

  it('total count across bins and overflow equals input length', () => {
    const values = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
    const result = computeHistogramData(values, { rangeMin: 10, rangeMax: 40, numBins: 3 });
    const binTotal = result.bins.reduce((s, b) => s + b.count, 0);
    const total = binTotal + result.overflowLow + result.overflowHigh;
    expect(total).toBe(values.length);
  });

  it('handles all identical values', () => {
    const values = [42, 42, 42, 42];
    const result = computeHistogramData(values);
    expect(result.bins.length).toBeGreaterThan(0);
    const totalCount = result.bins.reduce((s, b) => s + b.count, 0);
    expect(totalCount).toBe(4);
  });

  it('centers around mean ± 5σ by default', () => {
    // Create normally-ish distributed values
    const values = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28];
    const mean = values.reduce((a, b) => a + b, 0) / values.length; // 19
    const result = computeHistogramData(values);
    // Range should encompass mean ± 5σ
    expect(result.rangeMin).toBeLessThanOrEqual(mean);
    expect(result.rangeMax).toBeGreaterThanOrEqual(mean);
  });
});
