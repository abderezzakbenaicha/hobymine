import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { VideoAllowance } from '../types';

export interface CallAllowance {
  plan: 'free' | 'plus';
  callsUsed: number;
  callsLimit: number;
  secondsUsed: number;
  secondsLimit: number;
  remainingCalls: number;
  remainingSeconds: number;
  canCall: boolean;
}

/**
 * The daily call budget and the one-time free video minute of the signed in
 * member. Free members can call and always receive calls, but they are limited
 * to a few calls and talk minutes per day, plus one free minute of video.
 * Plus members are not limited.
 */
export function useCallAllowance(): {
  allowance: CallAllowance | null;
  videoAllowance: VideoAllowance | null;
  refresh: () => Promise<void>;
} {
  const [allowance, setAllowance] = useState<CallAllowance | null>(null);
  const [videoAllowance, setVideoAllowance] = useState<VideoAllowance | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const data = await api.get<{
        allowance: CallAllowance;
        videoAllowance?: VideoAllowance;
      }>('/api/calls/allowance');
      setAllowance(data.allowance);
      if (data.videoAllowance) setVideoAllowance(data.videoAllowance);
    } catch {
      // The allowance is informational — calls still work without it.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { allowance, videoAllowance, refresh };
}
