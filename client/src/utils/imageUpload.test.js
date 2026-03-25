import { describe, expect, it } from 'vitest';
import {
  approximate16x9JpegSizeBytes,
  approximateSquareJpegSizeBytes,
  clampAvatarCrop,
  createCenteredAvatarCrop,
  formatApproximateFileSize,
  getAvatarPreviewLayout,
  getRotatedDimensions,
  normalizeQuarterTurnRotation,
} from './imageUpload';

describe('imageUpload helpers', () => {
  it('normalizes quarter-turn rotation values', () => {
    expect(normalizeQuarterTurnRotation(-90)).toBe(270);
    expect(normalizeQuarterTurnRotation(450)).toBe(90);
    expect(normalizeQuarterTurnRotation('180')).toBe(180);
  });

  it('swaps dimensions only for 90/270 degree rotations', () => {
    expect(getRotatedDimensions(1920, 1080, 0)).toEqual({ width: 1920, height: 1080 });
    expect(getRotatedDimensions(1920, 1080, 90)).toEqual({ width: 1080, height: 1920 });
    expect(getRotatedDimensions(1920, 1080, 270)).toEqual({ width: 1080, height: 1920 });
  });

  it('creates and clamps avatar crops within the rotated image bounds', () => {
    expect(createCenteredAvatarCrop(1200, 800, 0)).toEqual({
      rotation: 0,
      cropSize: 800,
      cropX: 200,
      cropY: 0,
    });

    expect(clampAvatarCrop({ rotation: 90, cropX: 9000, cropY: -15, cropSize: 5000 }, 1600, 900)).toEqual({
      rotation: 90,
      cropSize: 900,
      cropX: 0,
      cropY: 0,
    });
  });

  it('builds a stable preview layout for the avatar cropper', () => {
    const layout = getAvatarPreviewLayout({
      width: 1600,
      height: 900,
      crop: { rotation: 90, cropX: 0, cropY: 700, cropSize: 900 },
      viewportSize: 320,
    });

    expect(layout.viewportSize).toBe(320);
    expect(layout.wrapperWidth).toBeCloseTo(320);
    expect(layout.wrapperHeight).toBeCloseTo(568.8889, 3);
    expect(layout.offsetY).toBeCloseTo(-248.8889, 3);
  });

  it('formats approximate upload sizes for admin guidance', () => {
    const approxBytes = approximate16x9JpegSizeBytes(1920);
    const approxSquareBytes = approximateSquareJpegSizeBytes(512);
    expect(approxBytes).toBeGreaterThan(400000);
    expect(approxSquareBytes).toBeGreaterThan(50000);
    expect(formatApproximateFileSize(approxBytes)).toMatch(/KB|MB/);
    expect(formatApproximateFileSize(0)).toBe('0 KB');
  });
});
