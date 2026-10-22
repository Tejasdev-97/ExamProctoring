/**
 * ExamProctor.ai — useScreenMonitoring Hook
 *
 * Provides reactive access to the ScreenMonitoringEngine for ExamSessionPage.
 * Cleanly subscribes to engine state and guarantees idempotent cleanup on unmount.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { ScreenMonitoringEngine, SCREEN_MONITOR_STATES } from './screenMonitoringEngine.js';
import { snapshotRepo } from '../../storage/repositories';

export function useScreenMonitoring({ attemptId, consented = true, enabled = true }) {
  const engineRef = useRef(null);
  const [engineState, setEngineState] = useState(() => (
    typeof window !== 'undefined' && window.electronAPI
      ? (consented ? SCREEN_MONITOR_STATES.READY : SCREEN_MONITOR_STATES.AWAITING_CONSENT)
      : SCREEN_MONITOR_STATES.DISABLED
  ));
  const [activeWarning, setActiveWarning] = useState(null);
  const [episodeCount, setEpisodeCount] = useState(0);

  // Initialize or reconfigure engine when attemptId changes
  useEffect(() => {
    if (!attemptId || !enabled) {
      if (engineRef.current) {
        engineRef.current.stop();
        engineRef.current = null;
      }
      return undefined;
    }

    const engine = new ScreenMonitoringEngine({
      attemptId,
      consented,
      electronAPI: typeof window !== 'undefined' ? window.electronAPI : null,
      snapshotRepo,
    });
    engineRef.current = engine;

    const unsubscribe = engine.subscribe(({ state, activeWarning: warn, episodeCount: count }) => {
      setEngineState(state);
      setActiveWarning(warn);
      setEpisodeCount(count);
    });

    return () => {
      unsubscribe();
      engine.stop();
      engineRef.current = null;
    };
  }, [attemptId, enabled]);

  // Keep consent synchronized if updated
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setConsent(consented);
    }
  }, [consented]);

  const onFocusLost = useCallback((payload) => {
    engineRef.current?.handleFocusLoss(payload);
  }, []);

  const onFocusRestored = useCallback(() => {
    engineRef.current?.handleFocusRestored();
  }, []);

  const onPageHidden = useCallback((payload) => {
    engineRef.current?.handlePageHidden(payload);
  }, []);

  const dismissWarning = useCallback(() => {
    engineRef.current?.dismissWarning();
    setActiveWarning(null);
  }, []);

  const stopScreenMonitoring = useCallback(() => {
    engineRef.current?.stop();
  }, []);

  return {
    state: engineState,
    activeWarning,
    episodeCount,
    onFocusLost,
    onFocusRestored,
    onPageHidden,
    dismissWarning,
    stopScreenMonitoring,
  };
}
