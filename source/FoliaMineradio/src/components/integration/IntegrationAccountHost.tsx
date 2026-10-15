import { useEffect, useState } from 'react';
import type { Theme } from '../../types';
import type { LibraryAccountController } from '../../library/core/contracts/account';
import LibraryAccountHost from '../../library/app/LibraryAccountHost';
import { createLibraryAccountLayer } from '../../library/app/libraryAccountLayer';
import { useLibraryAccountProviders, useLibraryAccountSelector } from '../../library/core/bindings/useLibraryAccount';
import { resolveLogoutEligibility } from '../../library/core/model/accountRules';

// Reuse the original account controller and login surface; the iframe receives no credentials.
export default function IntegrationAccountHost({ account, theme, isOpen, onClose }: {
  account: LibraryAccountController; theme: Theme; isOpen: boolean; onClose: () => void;
}) {
  const [layer] = useState(createLibraryAccountLayer);
  const { providers, activeProviderId } = useLibraryAccountProviders(account);
  const hasSession = useLibraryAccountSelector(account, state => Boolean(state.login || state.pendingSwitch));
  const logoutState = useLibraryAccountSelector(account, state => state.logout);
  const [accountMessage, setAccountMessage] = useState('');
  const logout = async (providerId: typeof activeProviderId) => {
    setAccountMessage('');
    const result = await account.logout(providerId);
    setAccountMessage(result.status === 'logged-out' ? '已登出此音樂來源。'
      : result.status === 'busy' ? '正在處理登出，請稍候。'
        : result.status === 'rejected' ? '請先將此平台選為目前來源，再登出。' : '登出失敗，請稍後再試。');
  };
  useEffect(() => {
    if (!isOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    addEventListener('keydown', close);
    return () => removeEventListener('keydown', close);
  }, [isOpen, onClose]);
  return <>
    {isOpen && <div data-testid="integration-accounts" role="dialog" aria-modal="true" aria-label="音樂來源與帳號"
      style={{ position: 'absolute', inset: 0, zIndex: 1400, background: '#0008', display: 'grid', placeItems: 'center' }}>
      <section style={{ width: 'min(540px, calc(100% - 32px))', maxHeight: '80vh', overflowY: 'auto',
        color: '#fff', background: '#19202ff5', border: '1px solid #ffffff30', borderRadius: 22, padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 20 }}>音樂來源與帳號</h2><button type="button" onClick={onClose} aria-label="關閉帳號選單">✕</button>
        </div>
        <p style={{ fontSize: 13, opacity: .7, margin: '12px 0' }}>兩套介面共用 Folia 的帳號、收藏與歌單。</p>
        {accountMessage && <p role="status" style={{ fontSize: 13, margin: '12px 0' }}>{accountMessage}</p>}
        {providers.map(provider => <div key={provider.providerId} style={{ padding: '14px 0', borderTop: '1px solid #ffffff15' }}>
          <strong>{provider.displayName}</strong><span style={{ marginLeft: 10, fontSize: 12, opacity: .7 }}>
            {provider.providerId === activeProviderId ? '目前來源 · ' : ''}{provider.status === 'authenticated' ? '已登入' : provider.requiresAccount === false ? '免登入' : '未登入'}
          </span>
          <div style={{ display: 'flex', gap: 12, marginTop: 9, fontSize: 13 }}>
            <button type="button" disabled={!provider.availability.configured} onClick={() => { onClose(); void account.selectProvider(provider.providerId); }}>選擇來源</button>
            {provider.requiresAccount !== false && <button type="button" disabled={!provider.availability.configured} onClick={() => { onClose(); void account.startLogin(provider.providerId); }}>登入／重新登入</button>}
            {provider.status === 'authenticated' && <button type="button"
              disabled={logoutState.status === 'pending' || !resolveLogoutEligibility(provider, activeProviderId).allowed}
              title={provider.providerId !== activeProviderId ? '請先選擇此來源，再登出' : undefined}
              onClick={() => void logout(provider.providerId)}>{logoutState.status === 'pending' && logoutState.providerId === provider.providerId ? '正在登出…' : '登出'}</button>}
          </div>
          {!provider.availability.configured && <p style={{ fontSize: 12, opacity: .65, marginTop: 6 }}>請先在 Folia 設定中配置此來源。</p>}
        </div>)}
      </section>
    </div>}
    <div style={{ position: 'absolute', inset: 0, zIndex: 1500, pointerEvents: hasSession ? 'auto' : 'none' }}>
      <LibraryAccountHost account={account} layer={layer} theme={theme} isInteractive />
    </div>
  </>;
}
