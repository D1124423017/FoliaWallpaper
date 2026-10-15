import { describe, it, expect } from 'vitest';
import { readWheelMenuRegion, resolveWheelMenuRegion, mapDesktopWheel } from '../../../dev/wallpaper/input/scope';

// test/unit/wallpaper/desktopWheel.test.ts — enforce the relay's geometry, lifetime and coordinate scope.
const menu = { x: 1500, y: 110, width: 380, height: 860, screenX: 0, screenY: 0, scale: 1 };
describe('desktop wheel input scope', () => {
  it('validates the menu rectangle and rejects an excessive capture area', () => {
    expect(readWheelMenuRegion(menu, 1000)?.at).toBe(1000);
    expect(readWheelMenuRegion({ ...menu, width: 1920 }, 1000)).toBeNull();
    expect(readWheelMenuRegion({ ...menu, width: NaN }, 1000)).toBeNull();
    expect(readWheelMenuRegion({ ...menu, scale: 0 }, 1000)).toBeNull();
  });
  it('uses normal Windows wheel direction and pixel deltas', () => {
    expect(mapDesktopWheel({ x: 1600, y: 400, delta: -120 }, readWheelMenuRegion(menu, 1000), 1100))
      .toEqual({ x: 1600, y: 400, deltaX: 0, deltaY: 100 });
    expect(mapDesktopWheel({ x: 1600, y: 400, delta: 60 }, readWheelMenuRegion(menu, 1000), 1100)?.deltaY).toBe(-50);
  });
  it('ignores closed, expired and out-of-menu input', () => {
    const region = readWheelMenuRegion(menu, 1000);
    expect(mapDesktopWheel({ x: 1600, y: 400, delta: -120 }, null, 1100)).toBeNull();
    expect(mapDesktopWheel({ x: 1600, y: 400, delta: -120 }, region, 2201)).toBeNull();
    for (const point of [{ x: 1499, y: 400 }, { x: 1880, y: 400 }, { x: 1600, y: 109 }, { x: 1600, y: 970 }])
      expect(mapDesktopWheel({ ...point, delta: -120 }, region, 1100)).toBeNull();
  });
  it('maps physical pixels and monitor offsets into CEF coordinates', () => {
    const region = readWheelMenuRegion({ ...menu, screenX: -1920, screenY: 100, scale: 2 }, 1000);
    expect(mapDesktopWheel({ x: -640, y: 1000, delta: -120 }, region, 1100)).toEqual({ x: 1600, y: 400, deltaX: 0, deltaY: 100 });
  });
  it('rejects invalid or unbounded event data', () => {
    const region = readWheelMenuRegion(menu, 1000);
    for (const delta of [Infinity, NaN, '120', 50000]) expect(mapDesktopWheel({ x: 1600, y: 400, delta }, region, 1100)).toBeNull();
  });
  it('corrects a stale CEF origin to the sole matching physical display', () => {
    const snapshot = { ...menu, screenX: -1920, viewportWidth: 1920, viewportHeight: 1080 };
    const region = resolveWheelMenuRegion(snapshot, [{ x: 0, y: 0, width: 1920, height: 1080 }], 1000);
    expect(region?.screenX).toBe(0);
    expect(mapDesktopWheel({ x: 1600, y: 400, delta: -120 }, region, 1100)?.x).toBe(1600);
  });
  it('does not guess among identical monitors or accept invalid display geometry', () => {
    const snapshot = { ...menu, screenX: -1920, viewportWidth: 1920, viewportHeight: 1080 };
    expect(resolveWheelMenuRegion(snapshot, [{ x: 0, y: 0, width: 1920, height: 1080 },
      { x: 1920, y: 0, width: 1920, height: 1080 }], 1000)).toBeNull();
    expect(resolveWheelMenuRegion(snapshot, [{ x: 0, y: 0, width: 2560, height: 1440 }], 1000)).toBeNull();
    expect(resolveWheelMenuRegion(snapshot, [{ x: NaN, y: 0, width: 1920, height: 1080 }], 1000)).toBeNull();
    expect(resolveWheelMenuRegion(snapshot, null, 1000)).toBeNull();
  });
  it('preserves a verified second-monitor origin and handles scaled physical displays', () => {
    const snapshot = { ...menu, screenX: -1920, viewportWidth: 1920, viewportHeight: 1080 };
    expect(resolveWheelMenuRegion(snapshot, [{ x: -1920, y: 0, width: 1920, height: 1080 },
      { x: 0, y: 0, width: 1920, height: 1080 }], 1000)?.screenX).toBe(-1920);
    const scaled = resolveWheelMenuRegion({ ...snapshot, scale: 2 }, [{ x: 200, y: 100, width: 3840, height: 2160 }], 1000);
    expect(scaled?.screenX).toBe(100);
    expect(mapDesktopWheel({ x: 3400, y: 900, delta: -120 }, scaled, 1100)).toEqual({ x: 1600, y: 400, deltaX: 0, deltaY: 100 });
  });
  it('uses the visible work area instead of an off-screen CEF origin with two reported displays', () => {
    const snapshot = { ...menu, screenX: -1920, viewportWidth: 1920, viewportHeight: 1080,
      availX: 0, availY: 0, availWidth: 1920, availHeight: 1040 };
    const screens = [{ x: -1920, y: 0, width: 1920, height: 1080 }, { x: 0, y: 0, width: 1920, height: 1080 }];
    const region = resolveWheelMenuRegion(snapshot, screens, 1000);
    expect(region?.screenX).toBe(0);
    expect(mapDesktopWheel({ x: 1600, y: 400, delta: -120 }, region, 1100)?.x).toBe(1600);
  });
  it('does not confuse a top or left taskbar inset with the monitor origin', () => {
    const snapshot = { ...menu, screenX: -1920, viewportWidth: 1920, viewportHeight: 1080 };
    const screens = [{ x: 0, y: 0, width: 1920, height: 1080 }];
    expect(resolveWheelMenuRegion({ ...snapshot, availX: 48, availY: 0, availWidth: 1872, availHeight: 1080 }, screens, 1000)?.screenX).toBe(0);
    expect(resolveWheelMenuRegion({ ...snapshot, availX: 0, availY: 48, availWidth: 1920, availHeight: 1032 }, screens, 1000)?.screenY).toBe(0);
    expect(resolveWheelMenuRegion({ ...snapshot, availX: 4000, availY: 0, availWidth: 1920, availHeight: 1040 }, screens, 1000)).toBeNull();
  });
});
