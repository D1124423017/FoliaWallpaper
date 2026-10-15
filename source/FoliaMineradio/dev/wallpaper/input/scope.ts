// dev/wallpaper/input/scope.ts — validate the menu lease and map only wheel data within it.
export interface WheelMenuRegion { x: number; y: number; width: number; height: number; screenX: number; screenY: number; scale: number; at: number }
interface DesktopScreen { x: number; y: number; width: number; height: number }
export function readWheelMenuRegion(value: unknown, now: number): WheelMenuRegion | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (!['x', 'y', 'width', 'height', 'screenX', 'screenY', 'scale'].every(key => typeof data[key] === 'number' && Number.isFinite(data[key]))) return null;
  const region = data as unknown as WheelMenuRegion;
  if (region.width <= 0 || region.width > 500 || region.height <= 0 || region.height > 2160
    || region.scale < .5 || region.scale > 4 || Math.abs(region.screenX) > 32768 || Math.abs(region.screenY) > 32768) return null;
  return { ...region, at: now };
}
// CEF may retain an off-screen host-window origin after a monitor is disconnected.
// Resolve only an unambiguous, matching physical display; never broaden the capture area.
export function resolveWheelMenuRegion(value: unknown, screens: unknown, now: number): WheelMenuRegion | null {
  const menu = readWheelMenuRegion(value, now);
  if (!menu || !Array.isArray(screens) || !screens.length || screens.length > 16) return null;
  const viewport = value as { viewportWidth?: number; viewportHeight?: number;
    availX?: number; availY?: number; availWidth?: number; availHeight?: number };
  if (!Number.isFinite(viewport.viewportWidth) || !Number.isFinite(viewport.viewportHeight)
    || viewport.viewportWidth! <= 0 || viewport.viewportHeight! <= 0) return null;
  const valid = screens.filter((screen): screen is DesktopScreen => !!screen && typeof screen === 'object'
    && ['x', 'y', 'width', 'height'].every(key => typeof screen[key] === 'number' && Number.isFinite(screen[key]))
    && Math.abs(screen.x) <= 32768 && Math.abs(screen.y) <= 32768
    && screen.width > 0 && screen.width <= 16384 && screen.height > 0 && screen.height <= 16384);
  if (valid.length !== screens.length) return null;
  const matches = valid.filter(screen => Math.abs(screen.width - viewport.viewportWidth! * menu.scale) <= 2
    && Math.abs(screen.height - viewport.viewportHeight! * menu.scale) <= 2);
  // Screen's work area identifies the visible display even when the CEF host sits off-screen.
  // Containment accounts for taskbars on any edge without treating their inset as the monitor origin.
  const areaKeys = ['availX', 'availY', 'availWidth', 'availHeight'] as const;
  if (areaKeys.some(key => viewport[key] !== undefined)) {
    if (!areaKeys.every(key => Number.isFinite(viewport[key])) || viewport.availWidth! <= 0 || viewport.availHeight! <= 0) return null;
    const left = viewport.availX! * menu.scale, top = viewport.availY! * menu.scale;
    const right = left + viewport.availWidth! * menu.scale, bottom = top + viewport.availHeight! * menu.scale;
    const visible = matches.filter(screen => left >= screen.x - 2 && top >= screen.y - 2
      && right <= screen.x + screen.width + 2 && bottom <= screen.y + screen.height + 2);
    return visible.length === 1 ? { ...menu, screenX: visible[0].x / menu.scale, screenY: visible[0].y / menu.scale } : null;
  }
  const exact = matches.filter(screen => Math.abs(screen.x / menu.scale - menu.screenX) <= 2
    && Math.abs(screen.y / menu.scale - menu.screenY) <= 2);
  const display = exact.length === 1 ? exact[0] : matches.length === 1 ? matches[0] : null;
  return display ? { ...menu, screenX: display.x / menu.scale, screenY: display.y / menu.scale } : null;
}
export function mapDesktopWheel(value: unknown, region: WheelMenuRegion | null, now: number) {
  if (!region || now - region.at > 1200 || !value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (!['x', 'y', 'delta'].every(key => typeof data[key] === 'number' && Number.isFinite(data[key]))) return null;
  const x = (data.x as number) / region.scale - region.screenX, y = (data.y as number) / region.scale - region.screenY;
  if (x < region.x || x >= region.x + region.width || y < region.y || y >= region.y + region.height || Math.abs(data.delta as number) > 12000) return null;
  return { x, y, deltaX: 0, deltaY: -(data.delta as number) / 120 * 100 };
}
