// Mineradio's original preset IDs are stable; excluded third-party effects keep their unused IDs.
export const MINERADIO_PRESETS = [
  { value: '0', label: 'Emily 封面粒子' }, { value: '1', label: '滾筒' },
  { value: '2', label: '星球' }, { value: '3', label: '虛空（安靜背景）' },
  { value: '4', label: '唱片' }, { value: '5', label: '星河' },
  { value: '6', label: '安魂' }, { value: '9', label: '月蝕聖環' },
  { value: '10', label: '雨幕霓虹' }, { value: '11', label: '折光蝶群' },
  { value: '12', label: '深海綻放' },
] as const;
export function mineradioPreset(value: unknown) {
  return MINERADIO_PRESETS.some(preset => preset.value === value) ? String(value) : '0';
}
