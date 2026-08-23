# Changelog

## 1.3.0 — printable guest report

### Guest report (PDF)
- New **Guest report** screen, reachable from the Dashboard: pick a date and get
  a printable register of everyone whose stay covered that day — arrivals,
  departures and continuing stays — ordered by room like a register should be.
- Each entry shows name, address, phone, room, number of persons, check-in and
  check-out, and the ID photos. Additional guests appear underneath their booking
  with their own phone and ID photos.
- **Payment amounts are never printed**, enforced by a whitelist copy
  (`stripPaymentInfo`) rather than by remembering to exclude a field. A column
  added to `customers` later is therefore excluded by default. Two tests hold
  this: one checks a real amount never reaches the serialised report, the other
  feeds in a pretend future `card_last_four` column and proves it is dropped.

### Why the PDF is produced natively
Rendering is done by Android's print framework against the app's own DOM rather
than by a JavaScript PDF library, which matters on budget phones:

- the system paginates page by page, so a report with a dozen ID photos never has
  to be assembled in the WebView heap, and photos load through the existing
  bridge URLs instead of being inflated into base64
- no embedded Unicode font, so guest names in any script print with device fonts
  (jsPDF/pdf-lib built-in fonts are Latin-only)
- output text stays selectable and searchable
- the same dialog can send the register to a real printer

The on-screen preview *is* the printed document, so the two cannot drift apart.
Cost scales with bookings on the chosen date, not total history.

### Other
- No schema change: the report is read-only, so updating to this version cannot
  affect existing data.
- New `PdfPrinterPlugin` (native) plus `@media print` rules that strip the app
  navigation and keep a guest's details and ID photos on one page.
- Companions for a whole report are fetched in one query rather than one per
  booking.
- Verified at 5,000 bookings: a day report stays well inside its time budget even
  though "staying on this date" cannot use an index.
- Tests: 217 → **243**.

## 1.2.0 — optional details for everyone sharing a room

### Additional guests
- When a room is booked for more than one person, the booking page now has an
  **Other Guests** card showing "1 of 3 recorded" and an Add Guest button.
  Recording companions is entirely optional: a booking with none behaves exactly
  as it did before.
- Each companion needs only a **name**. Phone and both ID photos are optional,
  because a family sharing one room often has a single ID between them. A front
  photo without a back one is fine.
- Details are captured **after** check-in rather than inside it, so the common
  single-guest check-in stays as fast as it was. Saving a check-in lands on the
  booking page, where the extra guests can be added straight away or later that
  evening.
- A booking never holds more companions than it was booked for (3 persons = 2
  companions). Lowering the person count below the companions already recorded is
  refused with an explanation instead of stranding them.
- Removing a companion deletes their photos. Deleting a booking removes its
  companions via `ON DELETE CASCADE` and their photos with the booking's folder.

### Search
- Typing a companion's name in Customers now finds the booking they stayed on —
  the main reason to record the details. Each booking still appears once even
  when the term matches both the primary guest and a companion.
- Verified at 5,000 bookings with 400 companions: the added subquery is served by
  `idx_booking_guests_customer` and search stays well inside its time budget.

### Backup
- Archives now carry `guests` plus their photos under
  `images/<CODE>/guests/<id>/`. A companion recorded without a photo does **not**
  gain a path to a file that does not exist, a companion whose booking failed
  validation is skipped with a warning rather than aborting the restore on a
  foreign key, and archives written before this version (with no `guests` key at
  all) still restore cleanly.

### Other
- Migration 5 adds `booking_guests` with indexes on `customer_id` and `name`.
  It touched no existing column, query or screen that did not need it — the
  booking-as-`customers`-row design predicted in v0.9 held up.
- `IdPhotoField` can now render as optional, so companion photos show no
  required marker.
- Tests: 190 → **217**.

## 1.1.0 — returning guests, editable times, booking amount

### Returning guests
- The check-in screen can now look a guest up by phone number (or name) and
  reuse their saved details, so a repeat visitor's information is never taken
  twice. Only the room, number of persons, time and amount need entering.
- Matches are grouped by phone number and show the guest's most recent details
  plus a stay count, so six visits appear as one entry.
- The previous stay's ID photos are **copied** into the new booking rather than
  shared. Each booking owns its photos, so deleting an old stay can never strip
  the ID proof from a later one. A retake during check-in overrides the copy, and
  a missing source photo fails cleanly with nothing half-written.
- Schema note: bookings stay denormalised (one self-contained row per stay)
  rather than splitting into guest + stay tables. Correcting a name on one
  booking therefore never rewrites history, at the cost of ~200 KB of duplicated
  photos per repeat stay.

### Editable check-in and check-out times
- The check-in time defaults to now but can be set for an arrival recorded after
  the fact. `created_at` still records when the row was actually written, so the
  two are now distinct values.
- The check-out time can be corrected from Edit once a guest is checked out —
  the button is usually pressed well after they left.
- Guards: a check-out can never precede its check-in, neither timestamp may be
  more than a day in the future, and a check-out time cannot be set on a guest
  who is still staying.

### Optional booking amount
- New optional amount on check-in, shown on the customer detail screen and
  editable later.
- Stored as an **integer number of paise**, never a float, so no rounding drift
  can creep into a record of what a guest paid. Null means "not recorded", which
  is distinct from zero. Currency lives in one constant in `src/utils/money.ts`.

### Fixed
- The returning-guest lookup first used SQLite's `MAX()` bare-column rule, which
  picks an **arbitrary** row when several share the maximum — so two stays
  recorded in the same minute could return the wrong one. Replaced with an
  explicit `ROW_NUMBER() OVER (PARTITION BY phone ORDER BY check_in_date DESC,
  id DESC)`, which is deterministic. Caught by the new tests.
- Removed a latent time-boundary flake in the edit test, which relied on "now"
  landing in the same minute twice.

### Other
- Migration 4 adds `amount_minor` and `(phone, check_in_date DESC)`, replacing
  the single-column phone index.
- Tests: 143 → **190**.

## 1.0.0 — production release

First release intended for use at the hotel. Signed, minified, and verified on a
physical device (Samsung SM-G781B, Android 15).

### Build and distribution
- Signed release APK (RSA 4096 key, `android/hotel-release.keystore`); signing
  credentials live in the git-ignored `android/keystore.properties`.
- R8 code shrinking and resource shrinking enabled, with Capacitor keep rules in
  `android/app/proguard-rules.pro` covering the bridge, every plugin, all
  `@PluginMethod`/`@JavascriptInterface` members and the SQLCipher JNI classes.
- APK reduced from **28.1 MB to 11.1 MB**: dropped the x86/x86_64 copies of
  `libsqlcipher.so` (ARM-only `abiFilters`), removed the ~960 KB browser SQLite
  fallback from the shipped bundle, and shrank dex from 14.5 MB to 2.4 MB.
- `minSdkVersion` raised from 23 to 26 (Android 8.0).
- `npm run android:*` now resolve a JDK 21 and the Android SDK at build time via
  `scripts/android.mjs`, so nothing machine-specific is committed.
- Added `npm run verify` (typecheck + lint + tests) and `npm run release`.
- Removed the inert `google-services` block from the Capacitor template; this app
  uses no Google or cloud services.

### App identity
- Real launcher icon: an adaptive icon (plus Android 13+ themed/monochrome
  variant) drawn from a generated vector, replacing the Capacitor placeholder.
- Brand-coloured cold-start splash and status bar, replacing the white flash and
  the template's ten `splash.png` variants.

### Data safety
- **Automatic daily backup, on by default.** Writes a full archive once per
  calendar day to `files/backups/auto/` and keeps the 7 most recent. Runs in the
  background, skips an empty database, never prunes manual exports, and can never
  break start-up.
- An automatic archive records its own timestamp (`last_auto_backup_at`) and
  deliberately does **not** satisfy the dashboard's backup reminder: it sits on
  the same phone as the data it protects, so the reminder keeps asking for a copy
  to be taken off the device.
- If the ID photos ever outgrow what the WebView can hold in memory, the
  automatic backup degrades to a data-only archive rather than failing every day.
- Start-up integrity check (`PRAGMA quick_check`): a damaged database stops the
  app with restore instructions instead of silently reading corrupt records.

### Performance
- Added composite indexes `(status, check_in_date DESC, id DESC)` and
  `(check_in_date DESC, id DESC)`. The status-filtered customer list previously
  built a temporary B-tree to sort every matching row on each page load; both list
  queries now run off covering indexes with no sort. Verified with
  `EXPLAIN QUERY PLAN` against 5,000 records.

### Security
- Screenshots, screen recording and the recent-apps snapshot are blocked while an
  app PIN is set (`FLAG_SECURE`, via the new `ScreenGuard` native plugin).
- Release builds are not debuggable, so `adb run-as` and Chrome DevTools cannot
  read customer data off a connected phone.

### Code quality
- ESLint added with `react-hooks/exhaustive-deps` and `no-console` as errors. It
  caught a stale-closure hazard in the ID photo loader, now fixed with `useMemo`.
- Unhandled promise rejections and window errors are logged (message only, never
  customer data).
- Tests: 118 → **143**, adding automatic-backup behaviour and a 5,000-record
  performance suite that asserts query plans rather than only wall-clock time.

## 0.9.0 — first working build

- Offline check-in/check-out, room management, search, dashboard, ID photo
  capture with compression, manual backup/restore, optional PIN.
- Fixed a device-only defect where migrations ran as one multi-statement script:
  the Android SQLite plugin splits scripts itself and `execSQL` runs only the
  first statement, so the room seed silently shipped 3 of its 8 rooms. Migrations
  are now lists of single statements with parameterised seeds, guarded by tests.
