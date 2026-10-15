import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { usePlayerExperienceStore, type PlayerExperienceMode, type PlayerExperienceProfile } from '../../stores/usePlayerExperienceStore';
import './experienceSelector.css';
import { getIntegrationActions } from '../../integration/hostActions';

// src/components/integration/ExperienceSelector.tsx — one presentation picker for the stage and settings.
export interface ExperienceSelectorProps { embedded?: boolean; }
const MODES: PlayerExperienceMode[] = ['folia', 'mineradio', 'custom'];
export default function ExperienceSelector({ embedded = false }: ExperienceSelectorProps) {
    const { t } = useTranslation();
    const mode = usePlayerExperienceStore(state => state.mode);
    const customProfile = usePlayerExperienceStore(state => state.customProfile);
    const setMode = usePlayerExperienceStore(state => state.setMode);
    const setCustomProfile = usePlayerExperienceStore(state => state.setCustomProfile);
    const [open, setOpen] = useState(false);
    const expanded = embedded || open;
    return <section className={`experience-selector${embedded ? ' experience-selector-embedded' : ''}`} data-testid="experience-selector" aria-label={t('playerExperience.title')}>
        {!embedded && <button className="experience-selector-trigger" aria-expanded={open} onClick={() => setOpen(value => !value)}>
            <SlidersHorizontal size={16} /><span>{t(`playerExperience.${mode}`)}</span><ChevronDown size={14} />
        </button>}
        {expanded && <div className="experience-selector-content">
            <strong>{t('playerExperience.title')}</strong>
            <div className="experience-mode-buttons" role="group" aria-label={t('playerExperience.title')}>
                {MODES.map(value => <button key={value} aria-pressed={mode === value} data-testid={`experience-${value}`} onClick={() => {
                    setMode(value);
                    if (!embedded) getIntegrationActions().navigateToPlayer();
                }}>{t(`playerExperience.${value}`)}</button>)}
            </div>
            {mode === 'custom' && <div className="experience-profile-fields">
                {(['controls', 'lyrics', 'background'] as const).map(field => <label key={field}>
                    <span>{t(`playerExperience.${field}`)}</span>
                    <select aria-label={t(`playerExperience.${field}`)} value={customProfile[field]} onChange={event => setCustomProfile({ [field]: event.target.value } as Partial<PlayerExperienceProfile>)}>
                        <option value="folia">Folia</option><option value="mineradio">Mineradio</option>
                        {field === 'lyrics' && <option value="off">{t('playerExperience.off')}</option>}
                    </select>
                </label>)}
            </div>}
            <p>{t('playerExperience.switchHint')}</p>
        </div>}
    </section>;
}
