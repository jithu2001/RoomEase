/**
 * Kicks off the daily automatic backup shortly after the app becomes usable.
 *
 * Renders nothing. Deliberately delayed and fire-and-forget: a backup must
 * never make the first screen feel slow, and a backup failure must never
 * interrupt staff who are checking a guest in.
 */

import { useEffect } from 'react';
import { useServices } from '../context/ServicesContext';

const START_DELAY_MS = 2500;

export function AutoBackupRunner() {
  const { autoBackup, reloadHotel } = useServices();

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void autoBackup.runIfDue().then(async (result) => {
        if (cancelled) return;
        // Refresh so the dashboard's "last backup" line reflects the new file.
        if (result.status === 'written') await reloadHotel();
      });
    }, START_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [autoBackup, reloadHotel]);

  return null;
}
