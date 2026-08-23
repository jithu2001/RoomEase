/** Hotel information, rooms shortcut, app lock, backup and reset. */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Screen } from '../../components/Layout';
import { TextAreaField, TextField } from '../../components/Field';
import { useConfirm } from '../../components/ConfirmProvider';
import { useToast } from '../../components/ToastProvider';
import { useServices } from '../../context/ServicesContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { wipeAllTables } from '../../database/database';
import { CUSTOMERS_ROOT } from '../../services/fileStore';
import { LATEST_VERSION } from '../../database/migrations';
import { BackupSettings } from './BackupSettings';
import { PinSettings } from './PinSettings';

export function Settings() {
  const { customers, rooms, settings, files, db, hotel, reloadHotel, invalidateData, dataVersion } =
    useServices();
  const confirm = useConfirm();
  const toast = useToast();

  const [name, setName] = useState(hotel.hotel_name);
  const [address, setAddress] = useState(hotel.hotel_address);
  const [phone, setPhone] = useState(hotel.hotel_phone);
  const [savingInfo, setSavingInfo] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    setName(hotel.hotel_name);
    setAddress(hotel.hotel_address);
    setPhone(hotel.hotel_phone);
  }, [hotel]);

  const counts = useAsyncData(
    async () => ({
      customers: (await customers.search({ limit: 1 })).total,
      rooms: (await rooms.list()).length,
    }),
    [customers, rooms, dataVersion],
    'settingsCounts',
  );

  const saveInfo = async () => {
    setSavingInfo(true);
    try {
      await settings.saveHotelInfo({
        hotel_name: name,
        hotel_address: address,
        hotel_phone: phone,
      });
      await reloadHotel();
      toast.success('Hotel information saved');
    } catch (e) {
      toast.error(e);
    } finally {
      setSavingInfo(false);
    }
  };

  const clearAllData = async () => {
    const ok = await confirm({
      title: 'Clear all data?',
      message: (
        <>
          <p className="mb0">
            This permanently deletes <strong>every customer record, every ID photo and the room
            list</strong> from this device. Your hotel name and app PIN are kept.
          </p>
          <p className="mt mb0">
            There is no cloud copy — export a backup first if you might need this data again.
          </p>
        </>
      ),
      confirmLabel: 'Clear everything',
      danger: true,
      requirePhrase: 'DELETE',
    });
    if (!ok) return;

    setClearing(true);
    try {
      await wipeAllTables(db);
      await files.removeDir(CUSTOMERS_ROOT);
      invalidateData();
      await reloadHotel();
      counts.reload();
      toast.success('All customer data cleared');
    } catch (e) {
      toast.error(e);
    } finally {
      setClearing(false);
    }
  };

  return (
    <Screen title="Settings">
      <div className="section-title">Hotel Information</div>
      <div className="card">
        <TextField
          id="hotel-name"
          label="Hotel name"
          required
          value={name}
          maxLength={80}
          onChange={setName}
        />
        <TextAreaField
          id="hotel-address"
          label="Address"
          value={address}
          rows={2}
          maxLength={250}
          onChange={setAddress}
        />
        <TextField
          id="hotel-phone"
          label="Phone number"
          type="tel"
          inputMode="tel"
          value={phone}
          maxLength={20}
          onChange={setPhone}
        />
        <button type="button" className="btn block" onClick={saveInfo} disabled={savingInfo}>
          {savingInfo ? 'Saving…' : 'Save Hotel Information'}
        </button>
      </div>

      <div className="section-title">Rooms</div>
      <Link className="card row" to="/rooms" style={{ marginBottom: '0.75rem' }}>
        <span className="grow">
          <span className="primary-line">Manage rooms</span>
          <span className="meta">
            {counts.data ? `${counts.data.rooms} rooms configured` : 'Add, remove and view status'}
          </span>
        </span>
        <span className="chev" aria-hidden="true">
          ›
        </span>
      </Link>

      <PinSettings />

      <BackupSettings />

      <div className="section-title">Danger Zone</div>
      <div className="card">
        <p className="small muted">
          {counts.data
            ? `${counts.data.customers} customer records and their ID photos are stored on this device.`
            : 'Customer records and ID photos are stored on this device.'}
        </p>
        <button
          type="button"
          className="btn danger block"
          onClick={clearAllData}
          disabled={clearing}
        >
          {clearing ? 'Clearing…' : 'Clear All Data'}
        </button>
      </div>

      <div className="section-title">About</div>
      <div className="card">
        <dl>
          <div className="detail-row">
            <dt>App version</dt>
            <dd>{__APP_VERSION__}</dd>
          </div>
          <div className="detail-row">
            <dt>Storage</dt>
            <dd>On-device SQLite + private file storage</dd>
          </div>
          <div className="detail-row">
            <dt>Database version</dt>
            <dd>v{LATEST_VERSION}</dd>
          </div>
          <div className="detail-row">
            <dt>Network</dt>
            <dd>Works fully offline — no cloud, no accounts</dd>
          </div>
        </dl>
      </div>
    </Screen>
  );
}
