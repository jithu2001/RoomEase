# Hotel Manager (RoomEase)

An **offline-first** hotel customer/check-in manager for Android, built with
**Flutter + Dart + SQLite**, using **Material Design 3**.

Everything — customer records, room configuration and ID proof photos — is
stored **on the device**. There is no cloud service, no backend, no analytics
and no account. The app works with the phone in aeroplane mode.

| | |
|---|---|
| **Platform** | Android (native Flutter engine) |
| **UI** | Material 3 (`ColorScheme.fromSeed`), light + dark |
| **Database** | SQLite via `sqflite` (private app storage) |
| **ID photos** | Compressed JPEGs under the app's private storage (paths only in SQLite) |
| **Backups** | Local `.zip` archives you export/restore yourself |
| **Network use** | None |

See [CHANGELOG.md](CHANGELOG.md) for release history, including the Flutter migration.

> **Migration note:** this app was originally built with React + Vite +
> Capacitor (see git history before the Flutter migration commit). It has
> been fully rewritten in Flutter/Dart; no React, Node, or Capacitor code
> remains in this repository. The on-device SQLite schema, file layout, and
> backup `.zip` format are unchanged, so a backup exported by the old app
> restores cleanly here.

---

## Contents

1. [Prerequisites](#1-prerequisites)
2. [Getting started](#2-getting-started)
3. [Running on a device](#3-running-on-a-device)
4. [Building a release APK](#4-building-a-release-apk)
5. [Architecture](#5-architecture)
6. [Database and storage](#6-database-and-storage)
7. [Backup and restore](#7-backup-and-restore)
8. [Security](#8-security)
9. [Feature reference](#9-feature-reference)
10. [Testing](#10-testing)
11. [Project structure](#11-project-structure)

---

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| **Flutter SDK** | 3.47+ (stable channel) | <https://docs.flutter.dev/get-started/install> |
| **Android SDK** | platform 36, build-tools matching | Installed automatically by Android Studio, or via `sdkmanager` |
| **JDK** | 17 | Required by the Android Gradle plugin |

Run `flutter doctor` and resolve anything it flags before continuing.

The app targets **Android 8.0 (API 26)** and newer, matching the previous
release's device support.

## 2. Getting started

```bash
flutter pub get
flutter analyze
flutter test
```

## 3. Running on a device

Connect an Android device (USB debugging enabled) or start an emulator, then:

```bash
flutter devices        # confirm it's detected
flutter run             # debug build with hot reload
```

## 4. Building a release APK

```bash
flutter build apk --release
```

To sign a release build, create `android/keystore.properties` (git-ignored,
machine-local — never commit it) alongside a copy of your keystore:

```properties
storeFile=/absolute/path/to/your.keystore
storePassword=...
keyAlias=...
keyPassword=...
```

`android/app/build.gradle.kts` picks this up automatically; without it,
release builds fall back to the debug signing key so `flutter run --release`
still works out of the box.

## 5. Architecture

Layering mirrors a typical Flutter app, split by responsibility rather than
by screen:

```
lib/
  models/       Plain Dart domain types (Customer, BookingGuest, Room, ...)
  utils/        Pure functions: dates, money, customer codes, validation,
                image compression, app errors — no Flutter/platform imports
  database/     SqlDriver (a thin, testable wrapper over sqflite), the
                append-only migration list, and one repository per table
  services/     Business logic: CustomerService, GuestService, RoomService,
                SettingsService, BackupService, AutoBackupService,
                ReportService, ImageService, ScreenGuardService
  state/        AppState — the single ChangeNotifier exposing Services,
                the current hotel settings, and a dataVersion counter
                screens use to know when to refetch after a restore
  theme/        The Material 3 ColorScheme + a StatusColors ThemeExtension
                for success/warning tones M3 doesn't define on its own
  widgets/      Shared UI: the app shell/bottom nav, ID photo capture and
                viewing, the room picker, confirm dialogs, toasts, etc.
  pages/        One folder per screen, grouped like the original app's
                page structure (check_in, customers, customer_details,
                dashboard, guests, reports, rooms, settings)
  pdf/          Builds the guest-report PDF from ReportService's data
  router.dart   go_router route table
  app.dart      Boot sequence, PIN-lock gating, auto-backup scheduling
```

`Services` is a plain composition root (`services/services.dart`) built once
at startup — no framework magic, just constructor injection — and handed to
the widget tree through a single `AppState` provider. This is the direct
equivalent of the original app's `container.ts` + `ServicesContext.tsx`.

Repositories talk to a `SqlDriver`, a thin wrapper around `sqflite`'s
`Database`/`Transaction` that centralises error handling and makes a
`transaction()` join an already-open transaction rather than nest — the same
shape as the original TypeScript `SqlDriver` interface. Tests swap in
`sqflite_common_ffi` for a real, in-memory SQLite instance with no device or
emulator required.

## 6. Database and storage

- **SQLite** (`sqflite`), private app storage, schema versioned via
  `PRAGMA user_version` with an append-only migration list
  (`lib/database/migrations.dart`) — the same 5-migration history as the
  original app, so the schema is identical.
- A **partial unique index** (`WHERE status = 'CHECKED_IN'`) enforces one
  active guest per room at the database level.
- **Timestamps** are stored as local-offset ISO 8601 strings
  (`2026-08-18T10:35:00.000+05:30`), never bare UTC — this keeps
  `substr(ts, 1, 10)` a correct local calendar day for every report/dashboard
  query, and never drifts across the UTC midnight boundary.
- **Money** is stored as integer minor units (paise), never a float.
- **ID photos** are written as files (never DB blobs) under the app's
  private storage, resized to at most 800×600, adaptively JPEG-compressed
  toward 150KB, with a separate ~240×240 thumbnail. Re-encoding strips all
  EXIF/GPS metadata as a privacy side effect.
- Returning-guest lookup picks a deterministic "latest stay per phone number"
  via a correlated `NOT EXISTS` query rather than a window function, so it
  stays correct on the older SQLite builds some Android 8/9 devices still
  ship (window functions need SQLite 3.25+, which not every device has).

## 7. Backup and restore

Settings → Data. A backup is a `.zip` containing `manifest.json`,
`data.json` and (optionally) `images/…`. The app PIN is **never** included.
Restore is defensive: invalid records are skipped with a warning rather than
aborting, two active bookings that somehow claim the same room get
deduplicated, image paths are rebuilt from the customer code (portable across
devices), and zip entries are validated against a strict path pattern before
being written (no path traversal). An automatic daily backup runs in the
background, keeping the last 7 archives in a separate `auto/` folder that
manual exports never touch.

## 8. Security

- No `allowBackup`/cloud device-transfer of app data (`data_extraction_rules.xml`).
- An optional app PIN is stored only as a salted SHA-256 digest, excluded
  from every backup.
- While a PIN is configured, `FLAG_SECURE` (toggled via a small Kotlin
  platform channel, `MainActivity.kt`) blocks screenshots, screen recording,
  and hides app content from the Android recent-apps thumbnail.
- The app re-locks whenever it goes to the background.
- A guest report PDF never includes payment amounts — `ReportService`
  builds a whitelisted DTO that structurally cannot carry `amountMinor`.

## 9. Feature reference

- **Dashboard** — currently staying, available rooms, today's check-ins and
  check-outs, who is in which room, and a backup reminder after 7 days.
- **New Check-In** — name, address, phone, persons, a visual room picker
  (occupied rooms shown but disabled), both ID photos, an optional amount,
  and an editable check-in time. The customer code (`CUS-000001`) is
  generated automatically.
- **Returning guests** — search by phone or name on the check-in screen;
  selecting a match reuses their details and copies their ID photos into the
  new booking (each booking keeps its own copy, so later edits/deletes never
  affect earlier stays).
- **Customers** — search by name, phone, room, code, or a companion's name;
  filter by All/Staying/Checked Out; paged loading.
- **Customer details** — every field, full-screen ID photo viewing, nights
  stayed, companions, and Edit / Check Out / Delete.
- **Additional guests (optional)** — a booking for more than one person can
  record companions (name required, phone/ID optional), bounded by the
  booked person count.
- **Rooms** — add/remove rooms; occupied rooms show their guest and link
  into a pre-filtered customer search.
- **Guest report** — a printable/shareable PDF register for any date,
  generated on-device with the `pdf` package, previewed in-app via
  `printing`'s `PdfPreview`.
- **Settings** — hotel info, app PIN, backup/restore, automatic backup
  toggle, and a "Clear All Data" danger action that keeps hotel identity and
  the PIN.

## 10. Testing

```bash
flutter test
```

79 tests cover the data and service layer: money parsing/formatting,
customer code generation, form validation, local-offset date handling, image
compression geometry, database migrations and constraints, the full
check-in/edit/check-out lifecycle including room-conflict handling, backup
export/restore round-trips (including PIN exclusion and corrupt-archive
handling), and PIN hashing. Database-backed tests run against real SQLite via
`sqflite_common_ffi` — no device or emulator required.

## 11. Project structure

```
android/            Native Android project (Gradle, manifest, the
                     FLAG_SECURE platform channel in MainActivity.kt)
assets/icon/         Launcher icon source PNGs (see tool/gen_icon_test.dart)
lib/                 App source — see Architecture above
test/                Unit/widget tests, plus test/helpers for an in-memory
                     SQLite database and an in-memory FileStore double
tool/                gen_icon_test.dart regenerates the launcher icon source
web/                 Web platform scaffold (optional secondary target)
pubspec.yaml         Dependencies and app metadata
```
