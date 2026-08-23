/**
 * Makes the initialised services and the hotel settings available to screens.
 * Screens never import the database directly.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { setScreenGuard } from '../services/screenGuard';
import type { Services } from '../services/container';
import type { HotelSettings } from '../types';

export interface AppContextValue extends Services {
  hotel: HotelSettings;
  reloadHotel: () => Promise<void>;
  /** Bumped after a restore / clear so open screens refetch. */
  dataVersion: number;
  invalidateData: () => void;
}

const ServicesContext = createContext<AppContextValue | null>(null);

export function ServicesProvider({
  services,
  initialSettings,
  children,
}: {
  services: Services;
  initialSettings: HotelSettings;
  children: ReactNode;
}) {
  const [hotel, setHotel] = useState(initialSettings);
  const [dataVersion, setDataVersion] = useState(0);

  const reloadHotel = useCallback(async () => {
    setHotel(await services.settings.get());
  }, [services]);

  const invalidateData = useCallback(() => setDataVersion((v) => v + 1), []);

  // ID photos are sensitive: while a PIN is set, block screenshots, screen
  // recording and the recent-apps snapshot.
  useEffect(() => {
    void setScreenGuard(Boolean(hotel.pin_hash));
  }, [hotel.pin_hash]);

  const value = useMemo<AppContextValue>(
    () => ({ ...services, hotel, reloadHotel, dataVersion, invalidateData }),
    [services, hotel, reloadHotel, dataVersion, invalidateData],
  );

  return <ServicesContext.Provider value={value}>{children}</ServicesContext.Provider>;
}

export function useServices(): AppContextValue {
  const value = useContext(ServicesContext);
  if (!value) throw new Error('useServices must be used inside <ServicesProvider>');
  return value;
}
