import { useTranslation } from 'react-i18next';
import { usePlayerExperienceStore, type PlayerExperienceMode, type PlayerExperienceProfile } from '../../stores/usePlayerExperienceStore';
import './experienceSelector.css';
import { getIntegrationActions } from '../../integration/hostActions';

// src/components/integration/ExperienceSelector.tsx — one presentation picker for the stage and settings.
export interface ExperienceSelectorProps {
    embedded?: boolean;
    revealed?: boolean;
    disabled?: boolean;
    isDaylight?: boolean;
}
const MODES: PlayerExperienceMode[] = ['folia', 'mineradio', 'custom'];
export default function ExperienceSelector({ embedded = false, revealed = true, disabled = false, isDaylight = false }: ExperienceSelectorProps) {
    const { t } = useTranslation();
    const mode = usePlayerExperienceStore(state => state.mode);
    const customProfile = usePlayerExperienceStore(state => state.customProfile);
    const setMode = usePlayerExperienceStore(state => state.setMode);
    const setCustomProfile = usePlayerExperienceStore(state => state.setCustomProfile);
    if (!embedded) return <label className="titlebar-experience" data-revealed={revealed} data-disabled={disabled} data-daylight={isDaylight}>
        <select data-testid="titlebar-experience-select" aria-label={t('playerExperience.title')}
            title={t('playerExperience.title')} value={mode} disabled={disabled} tabIndex={revealed && !disabled ? 0 : -1}
            onChange={event => {
                setMode(event.target.value as PlayerExperienceMode);
                getIntegrationActions().navigateToPlayer();
            }}>
            {MODES.map(value => <option key={value} value={value}>{t(`playerExperience.${value}`)}</option>)}
        </select>
    </label>;
    return <section className="experience-selector experience-selector-embedded" data-testid="experience-selector" aria-label={t('playerExperience.title')}>
        <div className="experience-selector-content">
            <strong>{t('playerExperience.title')} · {t('playerExperience.custom')}</strong>
            {!window.electron && <div className="experience-mode-buttons" role="group" aria-label={t('playerExperience.title')}>
                {MODES.map(value => <button key={value} aria-pressed={mode === value} data-testid={`experience-${value}`} onClick={() => setMode(value)}>{t(`playerExperience.${value}`)}</button>)}
            </div>}
            <div className="experience-profile-fields">
                {(['controls', 'lyrics', 'background'] as const).map(field => <label key={field}>
                    <span>{t(`playerExperience.${field}`)}</span>
                    <select aria-label={t(`playerExperience.${field}`)} value={customProfile[field]} onChange={event => setCustomProfile({ [field]: event.target.value } as Partial<PlayerExperienceProfile>)}>
                        <option value="folia">Folia</option><option value="mineradio">Mineradio</option>
                        {field === 'lyrics' && <option value="off">{t('playerExperience.off')}</option>}
                    </select>
                </label>)}
            </div>
            <p>{t('playerExperience.switchHint')}</p>
        </div>
    </section>;
}
