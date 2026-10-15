import { useStatusMessageStore } from '../../stores/useStatusMessageStore';
import { usePlayerExperienceStore } from '../../stores/usePlayerExperienceStore';

// Keep provider failures and loading states visible when the original Folia panel is hidden.
export default function IntegrationStatusMessage() {
  const controls = usePlayerExperienceStore(state => state.profile.controls);
  const message = useStatusMessageStore(state => state.message);
  if (controls !== 'mineradio' || !message?.text) return null;
  return <div role={message.type === 'error' ? 'alert' : 'status'} data-testid="integration-status-message"
    style={{ position: 'absolute', top: 90, left: 16, right: 16, zIndex: 1300, width: 'fit-content',
      maxWidth: 'calc(100% - 32px)', padding: '10px 14px', color: '#fafafa', fontSize: 13,
      background: message.type === 'error' ? '#542c32ed' : '#19242fed', border: '1px solid #ffffff25', borderRadius: 10 }}>
    {message.text}
  </div>;
}
