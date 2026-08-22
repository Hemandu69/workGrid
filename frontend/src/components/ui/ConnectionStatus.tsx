'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRealtime } from '../../lib/realtime-context';

/**
 * Subtle global indicator surfacing RealtimeContext's existing isConnected
 * boolean — invisible while connected, a small non-alarming banner while
 * disconnected/reconnecting, and a brief "Connected" confirmation right
 * after recovery. Existing page content is never hidden or replaced.
 */
export function ConnectionStatus() {
  const realtime = useRealtime();
  const isConnected = realtime?.isConnected ?? true;
  const [showReconnected, setShowReconnected] = useState(false);
  const [wasDisconnected, setWasDisconnected] = useState(false);
  // The socket starts "not yet connected" before its very first connect —
  // that initial transition to isConnected=true is not a recovery and must
  // never trigger the "Connected" confirmation banner, only a genuine
  // lost-then-restored cycle should.
  const hasConnectedOnceRef = useRef(false);

  useEffect(() => {
    if (!isConnected) {
      if (hasConnectedOnceRef.current) setWasDisconnected(true);
      setShowReconnected(false);
      return;
    }
    hasConnectedOnceRef.current = true;
    if (wasDisconnected) {
      setShowReconnected(true);
      setWasDisconnected(false);
      const timer = setTimeout(() => setShowReconnected(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isConnected, wasDisconnected]);

  if (!isConnected) {
    return (
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium rounded shadow-xs">
        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
        Connection lost — reconnecting...
      </div>
    );
  }

  if (showReconnected) {
    return (
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium rounded shadow-xs">
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
        Connected
      </div>
    );
  }

  return null;
}
