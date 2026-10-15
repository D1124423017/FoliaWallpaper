import { ChevronDown } from 'lucide-react';
import QuickEffectPicker from '../components/panelTab/QuickEffectPicker';

// src/wallpaper/WallpaperSelect.tsx — reuse Folia's HTML picker without CEF's native select painting.
interface Props {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  isDaylight?: boolean;
}
export function WallpaperSelect({ label, value, options, onChange, isDaylight = false }: Props) {
  return <QuickEffectPicker value={value} options={[...options]} onChange={onChange}
    isDaylight={isDaylight} primaryColor="var(--wallpaper-text)" ariaLabel={label}
    renderTrigger={({ isOpen, toggle, selectedLabel }) => <button type="button" className="wallpaper-select"
      role="combobox" aria-label={label} aria-haspopup="listbox" aria-expanded={isOpen} data-value={value}
      onClick={toggle} onKeyDown={event => {
        const current = options.findIndex(option => option.value === value);
        const next = event.key === 'ArrowDown' ? Math.min(current + 1, options.length - 1)
          : event.key === 'ArrowUp' ? Math.max(current - 1, 0)
          : event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : -1;
        if (next >= 0 && options[next]) { event.preventDefault(); onChange(options[next].value); }
      }}><span>{selectedLabel}</span><ChevronDown size={14} /></button>} />;
}
