/**
 * Compute histogram bin data from an array of numeric response values.
 *
 * Default heuristic: 20 bins spanning mean ± 5 standard deviations.
 * Overflow bins are always appended at either end for values outside the range.
 *
 * @param {number[]} values - numeric response values
 * @param {object}   [opts]
 * @param {number}   [opts.numBins=20]   - number of bins (excluding overflow)
 * @param {number}   [opts.rangeMin]     - custom lower bound (default: mean − 5σ)
 * @param {number}   [opts.rangeMax]     - custom upper bound (default: mean + 5σ)
 * @returns {{ bins: Array<{label:string, count:number, min:number, max:number}>,
 *             overflowLow: number, overflowHigh: number,
 *             rangeMin: number, rangeMax: number, numBins: number }}
 */
export function computeHistogramData(values, opts = {}) {
  const nums = (values || []).map(Number).filter((v) => !Number.isNaN(v) && Number.isFinite(v));

  if (nums.length === 0) {
    return { bins: [], overflowLow: 0, overflowHigh: 0, rangeMin: 0, rangeMax: 0, numBins: 0 };
  }

  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const variance = nums.reduce((s, v) => s + (v - mean) ** 2, 0) / nums.length;
  const stddev = Math.sqrt(variance);

  const numBins = Math.max(1, Math.round(opts.numBins ?? 20));

  let rangeMin = opts.rangeMin != null ? Number(opts.rangeMin) : mean - 5 * stddev;
  let rangeMax = opts.rangeMax != null ? Number(opts.rangeMax) : mean + 5 * stddev;

  // If all values are the same (stddev === 0) and no custom range, create a single-width range
  if (rangeMin === rangeMax) {
    rangeMin = mean - 0.5;
    rangeMax = mean + 0.5;
  }
  // Ensure rangeMin < rangeMax
  if (rangeMin > rangeMax) {
    [rangeMin, rangeMax] = [rangeMax, rangeMin];
  }
  if (rangeMin === rangeMax) {
    rangeMax = rangeMin + 1;
  }

  const binWidth = (rangeMax - rangeMin) / numBins;

  // Determine decimal places for labels based on bin width
  const decimals = binWidth > 0 ? Math.max(0, Math.min(6, 2 - Math.floor(Math.log10(binWidth)))) : 2;

  const counts = new Array(numBins).fill(0);
  let overflowLow = 0;
  let overflowHigh = 0;

  for (const v of nums) {
    if (v < rangeMin) {
      overflowLow++;
    } else if (v >= rangeMax) {
      // Values exactly at rangeMax go into last bin (not overflow)
      if (v === rangeMax) {
        counts[numBins - 1]++;
      } else {
        overflowHigh++;
      }
    } else {
      let idx = Math.floor((v - rangeMin) / binWidth);
      if (idx >= numBins) idx = numBins - 1;
      if (idx < 0) idx = 0;
      counts[idx]++;
    }
  }

  const bins = [];
  for (let i = 0; i < numBins; i++) {
    const binMin = rangeMin + i * binWidth;
    const binMax = rangeMin + (i + 1) * binWidth;
    const binCenter = (binMin + binMax) / 2;
    bins.push({
      label: binCenter.toFixed(decimals),
      count: counts[i],
      min: Number(binMin.toFixed(decimals + 2)),
      max: Number(binMax.toFixed(decimals + 2)),
    });
  }

  return {
    bins,
    overflowLow,
    overflowHigh,
    rangeMin: Number(rangeMin.toFixed(decimals + 2)),
    rangeMax: Number(rangeMax.toFixed(decimals + 2)),
    numBins,
  };
}
