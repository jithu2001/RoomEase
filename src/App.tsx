/**
 * App bootstrap and routing.
 *
 * Startup order: open SQLite + run migrations → read hotel settings → show the
 * PIN lock if one is configured → render the routes. Everything after this
 * point is fully offline.
 */

import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { AutoBackupRunner } from './components/AutoBackupRunner';
import { ConfirmProvider } from './components/ConfirmProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FullScreenLoading } from './components/Feedback';
import { PinLock } from './components/PinLock';
import { ToastProvider } from './components/ToastProvider';
import { ServicesProvider } from './context/ServicesContext';
import { initServices, type Services } from './services/container';
import { toUserMessage } from './utils/errors';
import { CheckIn } from './pages/CheckIn/CheckIn';
import { Customers } from './pages/Customers/Customers';
import { CustomerDetails } from './pages/CustomerDetails/CustomerDetails';
import { EditCustomer } from './pages/CustomerDetails/EditCustomer';
import { Dashboard } from './pages/Dashboard/Dashboard';
import { GuestForm } from './pages/Guests/GuestForm';
import { Reports } from './pages/Reports/Reports';
import { Rooms } from './pages/Rooms/Rooms';
import { Settings } from './pages/Settings/Settings';
import type { HotelSettings } from './types';

interface BootState {
  services: Services;
  hotel: HotelSettings;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/customers" element={<Customers />} />
      <Route path="/customers/:id" element={<CustomerDetails />} />
      <Route path="/customers/:id/edit" element={<EditCustomer />} />
      <Route path="/customers/:id/guests/new" element={<GuestForm />} />
      <Route path="/customers/:id/guests/:guestId/edit" element={<GuestForm />} />
      <Route path="/check-in" element={<CheckIn />} />
      <Route path="/reports" element={<Reports />} />
      <Route path="/rooms" element={<Rooms />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  const [boot, setBoot] = useState<BootState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const services = await initServices();
        const hotel = await services.settings.get();
        if (cancelled) return;
        setBoot({ services, hotel });
        setLocked(Boolean(hotel.pin_hash));
      } catch (e) {
        if (!cancelled) setError(toUserMessage(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // Re-lock when the app goes to the background, so ID photos are not left
  // on screen in the recents view.
  useEffect(() => {
    const services = boot?.services;
    if (!services || !Capacitor.isNativePlatform()) return;
    const listener = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) return;
      // Read the current setting rather than the boot snapshot, so a PIN added
      // during this session takes effect immediately.
      void services.settings.isPinEnabled().then((enabled) => {
        if (enabled) setLocked(true);
      });
    });
    return () => {
      void listener.then((handle) => handle.remove());
    };
  }, [boot?.services]);

  const unlock = useCallback(() => setLocked(false), []);

  if (error) {
    return (
      <div className="center-screen">
        <div style={{ fontSize: '2.2rem' }} aria-hidden="true">
          ⚠️
        </div>
        <h2>The app could not start</h2>
        <p className="muted small">{error}</p>
        <button type="button" className="btn" onClick={() => {
          setError(null);
          setAttempt((a) => a + 1);
        }}>
          Try again
        </button>
      </div>
    );
  }

  if (!boot) return <FullScreenLoading label="Opening local database…" />;

  return (
    <ErrorBoundary>
      <ServicesProvider services={boot.services} initialSettings={boot.hotel}>
        <ToastProvider>
          <ConfirmProvider>
            {locked ? (
              <PinLock onUnlock={unlock} />
            ) : (
              <>
                <AutoBackupRunner />
                <BrowserRouter>
                  <AppRoutes />
                </BrowserRouter>
              </>
            )}
          </ConfirmProvider>
        </ToastProvider>
      </ServicesProvider>
    </ErrorBoundary>
  );
}
