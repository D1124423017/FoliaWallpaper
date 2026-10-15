import React, { lazy, Suspense } from 'react';
import { useStreamingPlayerStore } from '../../stores/useStreamingPlayerStore';

// src/components/streaming/StreamingPlayerHost.tsx — avoids loading remote frames while the panel is closed.
const StreamingPlayerPanel = lazy(() => import('./StreamingPlayerPanel'));
export default function StreamingPlayerHost() {
    const isOpen = useStreamingPlayerStore(state => state.isOpen);
    return isOpen ? <Suspense fallback={null}><StreamingPlayerPanel /></Suspense> : null;
}
