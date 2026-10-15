import { describe, expect, it, vi } from 'vitest';
import type { FilterSystem, RenderSurface, Texture } from 'pixi.js';
import { createBloomFilter } from '@/components/visualizer/lumiere/light/bloomFilter';

// test/unit/visualizer/lumiere/lumiereBloomBounds.test.ts — empty lyric groups must not enter an empty bloom pyramid.
const texture = (width: number, height: number, resolution: number) => ({
  frame: { width, height }, source: { width, height, resolution, pixelWidth: Math.max(1, width * resolution), pixelHeight: Math.max(1, height * resolution) },
}) as Texture;
const setup = () => {
  class Filter {
    resources: Record<string, unknown>;
    blendMode = 'normal';
    constructor(options: { resources?: Record<string, unknown> }) { this.resources = options.resources ?? {}; }
    destroy() {}
  }
  class UniformGroup {
    uniforms: Record<string, Float32Array>;
    constructor(values: Record<string, { value: Float32Array }>) {
      this.uniforms = Object.fromEntries(Object.entries(values).map(([key, item]) => [key, item.value]));
    }
    update() {}
  }
  const pool = { getOptimalTexture: vi.fn(texture), returnTexture: vi.fn() };
  const pixi = { Filter, UniformGroup, GlProgram: { from: vi.fn() }, Texture: { EMPTY: texture(1, 1, 1) },
    TexturePool: pool, RendererType: { BOTH: 3 } } as unknown as typeof import('pixi.js');
  const filter = createBloomFilter(pixi, { strength: 2, threshold: .5, knee: .1, levels: 2, spread: 1, padding: 0, tint: [1, 1, 1] });
  const applyFilter = vi.fn();
  return { filter, pool, applyFilter, manager: { applyFilter } as unknown as FilterSystem };
};
describe('Lumiere bloom at lyric visibility boundaries', () => {
  it.each([[0, 0, 1], [100, 1, 1], [100, 10, .25]])('passes through a %sx%s input at resolution %s', (width, height, resolution) => {
    const { filter, pool, manager, applyFilter } = setup();
    const input = texture(width, height, resolution);
    const output = {} as RenderSurface;
    expect(() => filter.apply(manager, input, output, true)).not.toThrow();
    expect(pool.getOptimalTexture).not.toHaveBeenCalled();
    expect(applyFilter).toHaveBeenCalledTimes(1);
    expect(applyFilter.mock.calls[0].slice(1)).toEqual([input, output, true]);
  });
  it('retains the full downsample / upsample chain for visible lyric groups', () => {
    const { filter, pool, manager, applyFilter } = setup();
    filter.apply(manager, texture(32, 16, 1), {} as RenderSurface, true);
    expect(pool.getOptimalTexture).toHaveBeenCalledTimes(3);
    expect(pool.returnTexture).toHaveBeenCalledTimes(3);
    expect(applyFilter).toHaveBeenCalledTimes(4);
  });
});
