import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import type { LocalPlaylist, SongResult } from '../../types';
import type { ProviderCollection } from '../../types/onlineMusic';
import PlaylistSelectionDialog from '../shared/PlaylistSelectionDialog';
import TextInputDialog from '../shared/TextInputDialog';
import { getPlaybackSourceRef } from '../../utils/appPlaybackGuards';
import { omni } from '../../services/onlineMusic/omni';
import { selectDisplaySong, usePlaybackStore } from '../../stores/usePlaybackStore';
import { useAddToPlaylistStore } from '../../stores/useAddToPlaylistStore';

// src/components/app/AddToPlaylistHost.tsx
// The playlist picker for the current song, and the "new playlist" prompt behind it.
//
// Lifted out of UnifiedPanel so it is not tied to the player panel being on screen: it answers a
// question about the song, not about the panel, and a command bound to a global shortcut has to be
// able to ask it from anywhere. The star button in the panel now only requests it.
//
// Everything the three sources need to be told apart stays here, in one place, because the answer
// depends on a Navidrome fetch — see the note in useAddToPlaylistStore.

type AddToPlaylistHostProps = {
    isDaylight: boolean;
    localPlaylists: LocalPlaylist[];
    onlinePlaylists: ProviderCollection[];
    onAddCurrentSongToLocalPlaylist: (playlistId: string, song?: SongResult | null) => Promise<void>;
    onCreateCurrentLocalPlaylist: (name: string, song?: SongResult | null) => Promise<void>;
    onAddCurrentSongToOnlinePlaylist: (playlist: ProviderCollection, song?: SongResult | null) => Promise<void>;
    onAddCurrentSongToNavidromePlaylist: (playlistId: string, song?: SongResult | null) => Promise<void>;
    onCreateCurrentNavidromePlaylist: (name: string, song?: SongResult | null) => Promise<void>;
};

type PlaylistEntry = { id: string; name: string; description?: string };

export const AddToPlaylistHost: React.FC<AddToPlaylistHostProps> = ({
    isDaylight,
    localPlaylists,
    onlinePlaylists,
    onAddCurrentSongToLocalPlaylist,
    onCreateCurrentLocalPlaylist,
    onAddCurrentSongToOnlinePlaylist,
    onAddCurrentSongToNavidromePlaylist,
    onCreateCurrentNavidromePlaylist,
}) => {
    const { t } = useTranslation();
    // The song as the listener sees it, so a blend shows the track that is on screen.
    const displaySong = usePlaybackStore(selectDisplaySong);
    const { isOpen, targetSong, close, setAvailability } = useAddToPlaylistStore(useShallow(state => ({
        isOpen: state.isOpen,
        targetSong: state.targetSong,
        close: state.close,
        setAvailability: state.setAvailability,
    })));
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [createSong, setCreateSong] = useState<SongResult | null>(null);
    const currentSong = isCreateOpen ? createSong : isOpen && targetSong ? targetSong : displaySong;
    const songPlaylists = currentSong === displaySong ? onlinePlaylists : currentSong ? omni.getPlaylistsForSong(currentSong) : [];
    const [navidromePlaylists, setNavidromePlaylists] = useState<PlaylistEntry[]>([]);

    const isStage = Boolean(currentSong && (currentSong as any).isStage === true);
    const isNavidrome = Boolean(currentSong && (currentSong as any).isNavidrome === true);
    const isLocal = Boolean(currentSong && !isNavidrome && (((currentSong as any).isLocal === true) || Boolean((currentSong as any).localRef?.songId)));
    const playbackSourceRef = currentSong ? getPlaybackSourceRef(currentSong) : null;
    const isOnline = playbackSourceRef?.kind === 'online';
    const onlineProviderLabel = playbackSourceRef?.kind === 'online'
        ? omni.getProviderLabel(playbackSourceRef.providerId)
        : '';
    const canAddOnlineSong = Boolean(currentSong && isOnline && omni.canAddSongToPlaylist(currentSong));

    const refreshNavidromePlaylists = useCallback(async () => {
        const { getNavidromeConfig, navidromeApi } = await import('../../services/navidromeService');
        const config = getNavidromeConfig();
        if (!config) {
            setNavidromePlaylists([]);
            return;
        }

        const playlists = await navidromeApi.getPlaylists(config);
        setNavidromePlaylists(playlists.map((playlist) => ({
            id: playlist.id,
            name: playlist.name,
            description: `${playlist.songCount} ${t('playlist.tracks')}`,
        })));
    }, [t]);

    useEffect(() => {
        if (!isNavidrome) {
            setNavidromePlaylists([]);
            return;
        }

        void refreshNavidromePlaylists();
    }, [currentSong?.id, isNavidrome, refreshNavidromePlaylists]);

    const availablePlaylists = useMemo<PlaylistEntry[]>(() => {
        if (isLocal) {
            return localPlaylists.map((playlist) => ({
                id: playlist.id,
                name: playlist.name,
                description: `${playlist.songIds.length} ${t('playlist.tracks')}`,
            }));
        }

        if (isOnline) {
            return songPlaylists.map((playlist) => ({
                id: String(playlist.id),
                name: playlist.name,
                description: `${playlist.trackCount || 0} ${t('playlist.tracks')}`,
            }));
        }

        if (isNavidrome) {
            return navidromePlaylists;
        }

        return [];
    }, [isLocal, isOnline, isNavidrome, localPlaylists, navidromePlaylists, songPlaylists, t]);

    const isApplicable = Boolean(currentSong && !isStage && (isLocal || isOnline || isNavidrome));
    // Local and Navidrome can make a playlist on the spot, so having none is not a refusal there.
    const canAdd = (isLocal)
        || (isOnline && canAddOnlineSong && songPlaylists.length > 0)
        || (isNavidrome);
    const disabledReason = isOnline && !canAddOnlineSong
        ? t('status.providerPlaylistMutationUnavailable', { provider: onlineProviderLabel })
        : (!canAdd ? t('localMusic.noPlaylistsFound') : undefined);

    // The track can change under an open dialog — a blend lands, the queue advances — and the new
    // one may have nowhere to go. Closing beats leaving a picker up that cannot pick.
    useEffect(() => {
        if (isOpen && !(isApplicable && canAdd)) {
            close();
        }
    }, [canAdd, close, isApplicable, isOpen]);

    // Published rather than recomputed by each consumer: the star button and the command both need
    // this answer, and only one of them can afford to be the thing that fetches it.
    useEffect(() => {
        setAvailability({ isApplicable, canAdd: isApplicable && canAdd, disabledReason });
    }, [canAdd, disabledReason, isApplicable, setAvailability]);

    return (
        <div className="pointer-events-auto">
            <PlaylistSelectionDialog
                isOpen={isOpen}
                onClose={close}
                isDaylight={isDaylight}
                title={t('localMusic.addToPlaylist')}
                description={currentSong?.name || t('home.playlists') || 'Playlists'}
                playlists={availablePlaylists}
                onSelect={async (playlistId) => {
                    if (isLocal) {
                        await onAddCurrentSongToLocalPlaylist(String(playlistId), currentSong);
                        return;
                    }

                    if (isOnline) {
                        const playlist = songPlaylists.find(item => String(item.id) === String(playlistId));
                        if (!playlist) throw new Error('Selected playlist is unavailable');
                        await onAddCurrentSongToOnlinePlaylist(playlist, currentSong);
                        return;
                    }

                    if (isNavidrome) {
                        await onAddCurrentSongToNavidromePlaylist(String(playlistId), currentSong);
                        await refreshNavidromePlaylists();
                    }
                }}
                onCreate={(isLocal || isNavidrome) ? () => {
                    setCreateSong(currentSong);
                    close();
                    setIsCreateOpen(true);
                } : undefined}
                createLabel={t(isNavidrome ? 'navidrome.createPlaylist' : 'localMusic.createPlaylist')}
            />

            <TextInputDialog
                isOpen={isCreateOpen}
                onClose={() => setIsCreateOpen(false)}
                isDaylight={isDaylight}
                title={t(isNavidrome ? 'navidrome.createPlaylist' : 'localMusic.createPlaylist')}
                description={t('localMusic.enterPlaylistName')}
                placeholder={t('localMusic.enterPlaylistName')}
                confirmLabel={t('options.save')}
                onConfirm={async (name) => {
                    if (isLocal) {
                        await onCreateCurrentLocalPlaylist(name, currentSong);
                        return;
                    }

                    if (isNavidrome) {
                        await onCreateCurrentNavidromePlaylist(name, currentSong);
                        await refreshNavidromePlaylists();
                    }
                }}
            />
        </div>
    );
};

export default AddToPlaylistHost;
