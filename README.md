# Hotel Customer Manager

An **offline-first** hotel customer/check-in manager for Android, built with
**React + Vite + TypeScript + Capacitor + SQLite**.

Everything — customer records, room configuration and ID proof photos — is
stored **on the device**. There is no cloud service, no backend, no analytics
and no account. The app works with the phone in aeroplane mode.

| | |
|---|---|
| **Platform** | Android (Capacitor), plus a browser dev mode |
| **Database** | SQLite via `@capacitor-community/sqlite` (private app storage) |
| **ID photos** | Compressed JPEGs in `Directory.Data/hotel-data/…` (paths only in SQLite) |
| **Backups** | Local `.zip` archives you copy off the device yourself |
| **Network use** | None |

See [CHANGELOG.md](CHANGELOG.md) for what changed in the production release.

---

## Contents

1. [Prerequisites](#1-prerequisites)
2. [Installation](#2-installation)
3. [Development](#3-development)
4. [Running in the browser](#4-running-in-the-browser)
5. [Running on Android](#5-running-on-android)
6. [Building an APK](#6-building-an-apk) · [Production release checklist](#production-release-checklist)
7. [Installing the APK on a phone](#7-installing-the-apk-on-a-phone)
8. [Database and storage architecture](#8-database-and-storage-architecture)
9. [Backup and restore](#9-backup-and-restore)
10. [Troubleshooting](#10-troubleshooting)
11. [Feature reference](#11-feature-reference)
12. [Testing](#12-testing)
13. [Project structure](#13-project-structure)

---

## 1. Prerequisites

### Required for everything

| Tool | Version | Notes |
|---|---|---|
| **Node.js** | 20 LTS or newer | <https://nodejs.org> — the Windows `.msi` installer is fine. Check with `node -v`. |
| **VS Code** | any recent | Optional but recommended. |

### Required only to build the Android app

| Tool | Version | Notes |
|---|---|---|
| **JDK** | **21** | Required — Capacitor 7.1 plugins declare a Java 21 toolchain and the build fails on JDK 17. Get Temurin 21 from <https://adoptium.net>, or reuse the JDK bundled with Android Studio (see note). |
| **Android SDK** | platform 35 + build-tools 35 | Android Studio is **not** required — command-line tools are enough. |

The app targets Android 15 (API 35) and requires **Android 8.0 (API 26)** or newer.

Android Studio is only needed if you prefer a GUI. All commands in this README
work with the command-line tools alone.

> **If Android Studio is already installed**, it ships a JDK 21 you can point at
> instead of installing another one — e.g. `D:\Android\Android Studio\jbr`.

Gradle must **run on** JDK 21, not merely be able to find one: the Capacitor
plugins compile with `source/target 21`, and a Gradle daemon on JDK 17 fails with
`error: invalid source release: 21`. Setting only
`org.gradle.java.installations.paths` is *not* enough.

**You do not have to configure this.** The `npm run android:*` scripts go through
`scripts/android.mjs`, which finds a suitable toolchain at build time and passes it
to Gradle:

1. `JAVA_HOME`, if it points at JDK 21 or newer
2. the JDK bundled with Android Studio (`<studio>/jbr`)
3. common JDK install locations

It resolves the Android SDK the same way (`ANDROID_HOME`, then
`android/local.properties`, then common locations) and fails with an explicit
message listing everything it checked. Nothing machine-specific is committed.

Verified on this machine with the SDK at `D:\Android\Sdk` and Android Studio's
JDK 21.0.8 — with `JAVA_HOME` deliberately unset.

#### Installing the Android SDK command-line tools (Windows, no Android Studio)

1. Download **"Command line tools only"** for Windows from
   <https://developer.android.com/studio#command-tools> (a ~130 MB zip).
2. Create the folder `C:\Android\Sdk\cmdline-tools` and extract the zip into it,
   then **rename** the extracted `cmdline-tools` folder to `latest`. You should end
   up with:

   ```text
   C:\Android\Sdk\cmdline-tools\latest\bin\sdkmanager.bat
   ```

3. Set the environment variables (PowerShell, run once — then reopen your terminal):

   ```powershell
   [Environment]::SetEnvironmentVariable('ANDROID_HOME', 'C:\Android\Sdk', 'User')
   [Environment]::SetEnvironmentVariable('ANDROID_SDK_ROOT', 'C:\Android\Sdk', 'User')
   ```

   Also make sure `JAVA_HOME` points at a **JDK 21** folder:

   ```powershell
   # Temurin 21…
   [Environment]::SetEnvironmentVariable('JAVA_HOME', 'C:\Program Files\Eclipse Adoptium\jdk-21', 'User')
   # …or the JDK that comes with Android Studio
   [Environment]::SetEnvironmentVariable('JAVA_HOME', 'D:\Android\Android Studio\jbr', 'User')
   ```

4. Install the SDK packages this project needs and accept the licences:

   ```powershell
   cd C:\Android\Sdk\cmdline-tools\latest\bin
   .\sdkmanager.bat --install "platform-tools" "platforms;android-35" "build-tools;35.0.0"
   .\sdkmanager.bat --licenses
   ```

5. Add `platform-tools` to your `PATH` so `adb` works from anywhere:

   ```powershell
   [Environment]::SetEnvironmentVariable(
     'PATH', $env:PATH + ';C:\Android\Sdk\platform-tools', 'User')
   ```

The Gradle wrapper in `android/` downloads Gradle itself on the first build, so
you do not need to install Gradle.

---

## 2. Installation

```powershell
cd d:\Trinity
npm install
```

That's it — no environment file, no API keys, nothing to configure.

`npm install` pulls exactly these runtime dependencies:

- `react`, `react-dom`, `react-router-dom` — UI
- `@capacitor/core`, `@capacitor/android`, `@capacitor/app` — native shell
- `@capacitor-community/sqlite` — local SQLite database
- `@capacitor/camera` — ID photo capture
- `@capacitor/filesystem` — local image + backup storage
- `fflate` — ZIP creation/reading for backups
- `jeep-sqlite` — SQLite in the browser, used **only** by `npm run dev`

---

## 3. Development

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload (browser) |
| `npm run build` | Type-check (`tsc -b`) then build to `dist/` |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Tests in watch mode |
| `npm run cap:sync` | Build the web app and copy it into the Android project |
| `npm run android:run` | Build, sync and launch on a connected device |
| `npm run android:apk` | Build, sync and produce a **debug** APK |
| `npm run android:release` | Build, sync and produce the **signed release** APK |
| `npm run lint` | ESLint over `src/` and `tests/` |
| `npm run typecheck` | `tsc -b` with no emit |
| `npm run verify` | typecheck + lint + tests — run this before any release |
| `npm run release` | `verify`, then build the signed release APK |
| `npm run android:clean` | Gradle clean (use when a build behaves oddly) |

Always run `npm run build` (or `npm run cap:sync`) after changing web code —
Capacitor ships the contents of `dist/`, not your source files.

---

## 4. Running in the browser

```powershell
npm run dev
```

Open <http://localhost:5173>. Use your browser's device toolbar (F12 → toggle
device toolbar) to see the mobile layout.

What works in the browser:

- The full UI, validation, search, dashboard and room logic
- SQLite, through `jeep-sqlite` + IndexedDB (`predev` copies `sql-wasm.wasm`
  into `public/assets/` automatically)
- ID photos: the **Take Photo** and **Choose Photo** buttons open the normal file
  picker, and compression runs exactly as it does on the phone

What differs from the phone:

- Photo files are stored in IndexedDB instead of the app's private folder, and
  are inlined as `data:` URLs for display
- Backups are written to the same IndexedDB-backed virtual filesystem, so
  "Export Backup" reports a `file:///…` style path that only exists in the browser
- The native camera app is not used

Browser data lives in that origin's IndexedDB — clearing site data clears the
dev database. It is completely separate from the device database.

**`npm run preview` cannot open a database.** The browser SQLite fallback
(`jeep-sqlite` + `sql-wasm.wasm`, ~960 KB) is compiled out of production builds
via `VITE_WEB_SQLITE` in `.env.production`, because the Android app talks to
native SQLite and shipping it would only bloat the APK. Use `npm run dev` for
browser work.

---

## 5. Running on Android

1. **Enable USB debugging on the phone**
   - Settings → About phone → tap **Build number** seven times ("You are now a
     developer").
   - Settings → System → Developer options → enable **USB debugging**.
   - Connect the phone by USB, choose **File transfer / MTP** if prompted, and
     accept the *Allow USB debugging?* dialog on the phone.

2. **Confirm the phone is visible**

   ```powershell
   adb devices
   ```

   You should see your device with the state `device` (not `unauthorized`).

3. **Build, sync and run**

   ```powershell
   npm run android:run
   ```

   Capacitor asks which target to use if more than one is connected.

To iterate quickly: change code → `npm run cap:sync` → re-run. (Live reload
against a dev server is deliberately not configured, because the shipped app must
never depend on a server being reachable.)

---

## 6. Building an APK

### Debug APK (easiest — installs on any phone)

```powershell
npm run android:apk
```

Output:

```text
android\app\build\outputs\apk\debug\app-debug.apk
```

Debug APKs are signed with the auto-generated debug key. That is fine for a
single hotel installing the app themselves.

### Signed release APK (what you ship)

```powershell
npm run release
```

That runs `verify` (typecheck + lint + 243 tests) and then builds:

```text
android\app\build\outputs\apk\release\app-release.apk
```

The release build differs from debug in four ways that matter:

| | Debug | Release |
|---|---|---|
| Signing | auto-generated debug key | your `hotel-release.keystore` |
| Java shrinking | off | **R8 enabled** with Capacitor keep rules |
| Resource shrinking | off | on |
| Inspectable via `adb run-as` / Chrome DevTools | yes | **no** |

#### Signing keys

Signing is already configured. `android/keystore.properties` (git-ignored) holds
the credentials and points at `android/hotel-release.keystore`:

```properties
storeFile=hotel-release.keystore
storePassword=…
keyAlias=hotelmanager
keyPassword=…
```

The key is RSA 4096 and valid for 30 years.

> ### Back up the keystore now
>
> Copy **`android/hotel-release.keystore`** and **`android/keystore.properties`**
> somewhere safe and offline (password manager, encrypted USB stick).
>
> Android identifies an app by its signing key. Lose these files and you can
> never again publish an update that installs *over* the copy running at the
> hotel — the only way forward would be uninstalling it, which **deletes all
> customer data on that phone**. Neither file is in git, by design.

If `android/keystore.properties` is missing, the project still builds; the
release APK is simply unsigned and Gradle prints a warning. To create a fresh
key:

```powershell
& "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -v `
  -keystore android\hotel-release.keystore -alias hotelmanager `
  -keyalg RSA -keysize 4096 -validity 10950 -storetype PKCS12
```

#### APK size

The debug APK is ~28 MB; the signed release is far smaller because of two
deliberate choices:

- **ABI filter** (`android/app/build.gradle`): the SQLite plugin ships a ~5 MB
  `libsqlcipher.so` for each of four ABIs. Only `armeabi-v7a` and `arm64-v8a`
  are kept, since every real Android phone is ARM. **Add `x86_64` back if you
  need to run on an emulator.**
- **R8 + resource shrinking**, which removes unused framework and AndroidX code.

#### R8 and Capacitor

Capacitor resolves plugins and their `@PluginMethod` entry points *by name*,
from JavaScript, so R8 cannot see those call sites.
`android/app/proguard-rules.pro` keeps the whole bridge, every `Plugin`
subclass, all annotated methods, `@JavascriptInterface` members, and the
SQLCipher/JNI classes. Line numbers are preserved too — with no crash-reporting
service, a readable stack trace from a staff member's phone is the only
diagnostic available.

**If you add a plugin or native class, re-test the release build**, not just
debug: a missing keep rule compiles cleanly and only fails when JS calls it.

### Production release checklist

1. `npm run verify` — typecheck, lint, all 243 tests green.
2. Bump `versionCode` (integer, must increase) and `versionName` in
   `android/app/build.gradle`.
3. `npm run android:release`.
4. Confirm the APK timestamp is newer than the build you started — a *failed*
   Gradle run leaves the previous APK in place.
5. Install on a spare device and run the manual test pass below, **including
   camera capture**, which no automated test covers.
6. Export a backup from the old phone before upgrading a device in service.
7. Verify the keystore backup still exists somewhere off this machine.

### If Gradle cannot find the SDK

Create `android\local.properties` with your SDK path (forward slashes or escaped
backslashes):

```properties
sdk.dir=C:/Android/Sdk
```

---

## 7. Installing the APK on a phone

**Over USB:**

```powershell
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
```

`-r` reinstalls over an existing copy and keeps the app's data.

Debug and release builds are signed with **different keys**, so switching between
them fails with `INSTALL_FAILED_UPDATE_INCOMPATIBLE` and needs
`adb uninstall com.trinity.hotelmanager` first — which **erases that phone's
data**. Export a backup before doing it, and once the hotel is live, only ever
install release builds over release builds.

**By copying the file:** transfer the `.apk` to the phone (USB, SD card,
Bluetooth), open it with the phone's file manager and allow *Install unknown
apps* for that file manager when prompted.

**First launch:** Android asks for camera permission the first time you tap
**Take Photo**. Photo-library access is requested the first time you tap
**Choose Photo**. Nothing else is requested — the app never asks for location,
contacts, microphone, SMS or call permissions.

---

## 8. Database and storage architecture

### Layers

```text
React screens (src/pages)
        │  never touch SQL or the filesystem
        ▼
Services (src/services)      ← business rules: check-in, check-out, backup
        ▼
Repositories (src/database/repositories)   ← all SQL lives here
        ▼
SqlDriver  (src/database/driver.ts)
        ├── CapacitorSqlDriver  → native SQLite (Android) / jeep-sqlite (browser)
        └── SqlJsDriver         → sql.js, used by the test suite
```

The `SqlDriver` seam is why the tests exercise the *real* SQL — migrations,
indexes and queries all run against genuine SQLite in Node.

### Tables (`src/database/migrations.ts`)

```sql
customers(
  id, customer_code UNIQUE, name, address, phone, room_number,
  number_of_persons, id_front_path, id_back_path,
  id_front_thumb_path, id_back_thumb_path,
  check_in_date, check_out_date, status, created_at, updated_at,
  amount_minor)

booking_guests(
  id, customer_id REFERENCES customers(id) ON DELETE CASCADE,
  name, phone,
  id_front_path, id_back_path, id_front_thumb_path, id_back_thumb_path,
  created_at, updated_at)

rooms(id, room_number UNIQUE, created_at)

settings(key PRIMARY KEY, value)
```

Indexes: `status`, `room_number`, `customer_code`, `check_out_date`, `name`,
the composite `(status, check_in_date DESC, id DESC)` and
`(check_in_date DESC, id DESC)` that keep the list queries sort-free, and
`(phone, check_in_date DESC)` for the returning-guest lookup — plus a
**partial unique index**:

```sql
CREATE UNIQUE INDEX idx_customers_active_room
  ON customers (room_number) WHERE status = 'CHECKED_IN';
```

That index is the last line of defence against double-booking a room: even if a
bug slipped past the service checks, SQLite itself refuses the insert.

Migrations are tracked with SQLite's own `PRAGMA user_version` and applied on
every app start. They are append-only — add a new migration rather than editing
a released one.

`amount_minor` holds money as an **integer number of paise**, never a float:
this is a record of what a guest paid. `src/utils/money.ts` does the parsing and
formatting, and `CURRENCY_SYMBOL` there is the single place to change currency.
Null means "not recorded", which is deliberately different from zero.

`booking_guests` holds the *other* people sharing a room. A booking is still
one `customers` row describing the primary guest, so a booking with no
companions recorded behaves exactly as it did before the table existed.
Everything except the name is nullable, because a companion's phone and ID proof
are often not collected. `ON DELETE CASCADE` (with `PRAGMA foreign_keys` on
every connection) means deleting a booking removes its companions, and their
photos live inside the booking's own folder so one recursive delete cleans up.

`created_at` and `check_in_date` are separate on purpose: the first is when the
row was written, the second is when the guest actually arrived, which staff can
set for an arrival recorded after the fact.

**Each migration is a list of single statements, never one SQL script**, and seed
rows are inserted with bound parameters. That is a hard rule, not a preference:
`@capacitor-community/sqlite` splits a script itself (`UtilsSQLite
.getStatementsArray`, splitting on the literal `";\n"`) and Android's
`execSQL()` then runs only the *first* statement of whatever it receives — so a
script can silently lose statements while the plugin reports success. This bit
for real during development: the room seed shipped 3 of its 8 rooms on device
while every unit test passed, because sql.js happily executes whole scripts.

Two guards now hold that rule in place: `SqlDriver.execute()` rejects anything
containing a second statement (`tests/migrationSql.test.ts`), and the seed test
asserts `sqlite_sequence` matches the row count, which is what exposed the
silently-rejected inserts.

### Timestamps

Stored as ISO 8601 with the **device's local time and offset**, e.g.
`2026-08-18T10:35:00.000+05:30`, and displayed as `18 Aug 2026, 10:35 AM`.
Because the stored value is local time, "today's check-ins" is a cheap indexed
prefix comparison (`substr(check_in_date,1,10) = '2026-08-18'`) that never drifts
across UTC midnight.

### Files

```text
Directory.Data/                  (app-private, no permission needed, not in
  hotel-data/                     Android cloud backup)
    customers/
      CUS-000001/
        id-front.jpg             ~800x600, JPEG q50–60, 50–150 KB
        id-front-thumb.jpg       240 px preview used by the detail screen
        id-back.jpg
        id-back-thumb.jpg
        guests/
          7/                     one folder per additional guest
            id-front.jpg
            id-back.jpg

Directory.External/              (reachable over USB / a file manager)
  backups/
    hotel-backup-2026-08-18-1035.zip
```

SQLite stores **paths only** — never base64 image data. Images are re-encoded
through a canvas, which also strips EXIF/GPS metadata from ID photographs.

Deleting a customer removes the database row first, then the whole
`customers/<CODE>/` folder, so a filesystem hiccup can never leave a record
pointing at deleted photos. Missing files are treated as normal, not as errors.

### Security posture

- Data lives in the app's private sandbox; no other app can read it
- `android:allowBackup="false"` + `data_extraction_rules.xml` keep ID photos out
  of Google's cloud backup and device-transfer flows
- `network_security_config.xml` denies cleartext traffic to everything except the
  loopback origin Capacitor serves the bundled app from
- No customer names, phone numbers or image paths are ever logged
- Optional app PIN (Settings → App Lock). Only a salted SHA-256 digest is stored,
  and the app re-locks whenever it goes to the background
- The PIN is deliberately **excluded** from backups, so restoring an archive onto
  a new device can never lock you out
- **While a PIN is set, screenshots, screen recording and the recent-apps
  snapshot are blocked** (`FLAG_SECURE`, via the small `ScreenGuard` native
  plugin). This is why `adb screencap` returns a blank image on a PIN-protected
  install — that is the feature working
- Release builds are not debuggable: `adb run-as` cannot read the database and
  Chrome DevTools cannot attach, so plugging the phone into a computer does not
  expose customer data
- On start-up the app runs `PRAGMA quick_check`. A damaged database file stops
  the app with restore instructions instead of quietly reading corrupt records

---

## 9. Backup and restore

Because there is no cloud, the export file is the only copy of the data other
than the phone itself.

### Automatic daily backup

**On by default.** A few seconds after the app opens, once per calendar day, it
writes a full archive (data + ID photos) to
`Android/data/com.trinity.hotelmanager/files/backups/auto/` and keeps the
**7 most recent**. Older automatic archives are pruned; manual exports are never
touched.

It is deliberately unobtrusive:

- runs in the background, never blocking the first screen
- skips entirely while there are no customer records, so a fresh install does not
  accumulate empty archives
- a failure (full storage, unwritable folder) is logged and **never** interrupts
  staff or blocks start-up; the day is not marked done, so the next launch retries
- toggle it under Settings → Data → *Automatic daily backup*

An automatic archive **does not count as** a backup for the dashboard reminder.
That is deliberate: it lives on the same phone as the data it protects, so the
reminder keeps asking you to export one and copy it somewhere else.

If the ID photos ever grow too large to hold in memory, the automatic backup
falls back to a data-only archive (records without photos) rather than failing
silently every day.

This protects against the most likely real-world loss — nobody remembering to
export — but **not** against a lost, stolen or broken phone, because the archives
are on that same phone. Copy a `.zip` off the device regularly.

### Export

Settings → **Export Backup (with ID photos)** writes:

```text
hotel-backup-2026-08-18-1035.zip
  manifest.json     format, version, schema version, counts, timestamp
  data.json         customers, rooms, settings (PIN excluded)
  images/CUS-000001/id-front.jpg …
```

The screen shows the exact file path afterwards. **Copy that file off the phone**
— a backup that only exists on the device it protects is not a backup.

Where to find it on the phone: `Android/data/com.trinity.hotelmanager/files/backups/`.

**Export data only (no photos)** produces a much smaller archive with the same
`data.json`; use it if you keep the photos by copying the `hotel-data` folder.

The dashboard shows a reminder when the last export is more than seven days old
(or has never happened).

### Restore

Settings → **Restore Backup** → pick a `.zip`. The archive is validated *before*
you are asked to confirm, and the confirmation shows what is inside it:

```text
Warning: restoring this backup will replace the current hotel data on this device.
Backup from 18 Aug 2026, 10:35 AM — 42 customers, 8 rooms, 168 photos.
Continue?
```

Restore is intentionally defensive:

| Situation | Behaviour |
|---|---|
| Not a zip / empty / truncated | Rejected with a clear message; nothing changes |
| Zip without a hotel manifest | Rejected — "not created by this app" |
| Backup from a newer app version | Rejected — asks you to update the app first |
| Damaged `data.json` | Rejected before the database is touched |
| One damaged customer record | That record is skipped, the rest restore, and you get a warning listing what was skipped |
| Two active guests in one room | The later one is marked checked out, with a warning |
| A room referenced by a booking is missing from `rooms` | The room is recreated so availability stays correct |
| A photo fails to write | Restore completes; the missing photo is reported as a warning and the app shows "Photo missing" instead of crashing |
| An archive entry tries to escape the customer folder | Skipped and reported |

The database swap happens inside a single transaction: if it fails, your
existing data is left untouched.

### Clear all data

Settings → **Clear All Data** deletes every customer record, every ID photo and
the room list. It requires typing `DELETE` to confirm. Hotel information and the
app PIN are kept.

---

## 10. Troubleshooting

| Symptom | Fix |
|---|---|
| `SDK location not found` during a Gradle build | Set `ANDROID_HOME`, or create `android\local.properties` with `sdk.dir=C:/Android/Sdk` |
| `Cannot find a Java installation … {languageVersion=21}` | No JDK 21 is visible to Gradle. Set `JAVA_HOME` to a JDK 21, or `org.gradle.java.home` in `android/gradle.properties` |
| `error: invalid source release: 21` | Gradle is *running* on JDK 17 even though a 21 exists. Fix `org.gradle.java.home` / `JAVA_HOME` — a toolchain path alone will not do it |
| A build fails but installing still ships old behaviour | A failed Gradle run leaves the previous `app-debug.apk` in place. Delete `android\app\build\outputs\apk\debug\app-debug.apk` before rebuilding, and check the APK timestamp before `adb install` |
| `adb screencap` produces a blank/black image | Expected on a PIN-protected install: `FLAG_SECURE` blocks screen capture. Remove the PIN temporarily to take screenshots |
| `adb run-as` says "package not debuggable" | Expected on a release build. Use a debug build for database inspection |
| A plugin call fails only in the release build | A missing R8 keep rule. Add it to `android/app/proguard-rules.pro` and rebuild |
| `pm list packages` fails with `Shell does not have permission to access user NNN` | The phone's foreground user is a secondary one (Samsung Secure Folder, work profile). Add `--user 0`, e.g. `adb shell pm path --user 0 com.trinity.hotelmanager`. Without it the command errors instead of returning an empty list, which looks like "not installed" |
| `adb devices` shows `unauthorized` | Unlock the phone and accept the *Allow USB debugging* prompt; try `adb kill-server` then `adb devices` |
| `adb devices` shows nothing | Try another USB cable/port, set the USB mode to *File transfer*, and install your phone maker's USB driver |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | A different build signed with another key is installed. `adb uninstall com.trinity.hotelmanager` first (this deletes its data — export a backup!) |
| App opens to a blank screen | You changed web code without re-syncing. Run `npm run cap:sync` and reinstall |
| "The local database could not be opened" | Usually a stale install. Reinstall the APK; if it persists, run `adb logcat | findstr Capacitor` while launching |
| Camera button does nothing / permission error | Android Settings → Apps → Hotel Manager → Permissions → allow **Camera**. If you tapped "Deny twice", Android blocks the prompt permanently and it must be enabled there |
| "Photo missing on this device" in a record | The image file was removed (device reset, manual deletion, or restored from a data-only backup). Edit the customer and capture the ID photo again |
| Browser dev mode: "database could not be opened" | Run `npm run dev` (not bare `vite`) so `sql-wasm.wasm` is copied into `public/assets/` |
| Room you need is not selectable | It has an active guest. Check that guest out, or pick another room |
| Gradle download is very slow the first time | Expected — the wrapper fetches Gradle once, then caches it in `%USERPROFILE%\.gradle` |

To inspect what is actually stored on a connected phone (debug builds only):

```powershell
cmd /c "adb exec-out run-as com.trinity.hotelmanager cat databases/hotelmanagerSQLite.db > device.db"
node scripts/inspect-db.mjs device.db
```

That prints the schema version, rooms, settings keys, customer count and indexes.
Use `cmd /c` for the redirect — PowerShell's `>` is text-mode and corrupts the
binary file. The dump can include customer names, so only run it on your own
device and delete `device.db` afterwards.

To watch native logs while the app runs:

```powershell
adb logcat -s Capacitor:V Capacitor/Plugin:V chromium:E
```

WebView inspection is switched **off** in `capacitor.config.ts`
(`webContentsDebuggingEnabled: false`) so ID photos cannot be read out of a
connected device. If you need it while developing, set it to `true`, run
`npm run cap:sync`, reinstall, and open `chrome://inspect` in desktop Chrome —
then set it back to `false` before handing the app over.

---

## 11. Feature reference

**Dashboard** — currently staying, available rooms, today's check-ins and
check-outs, total active guests, who is in which room, and the backup reminder.

**New Check-In** — name, full address, phone, number of persons, room picker
showing free/busy rooms, both ID photos, an optional amount, and an editable
check-in time that defaults to now. The customer code (`CUS-000001`) is generated
automatically.

**Returning guests** — type a phone number (or name) at the top of the check-in
screen and tap the match: the name, address and phone are filled in and the ID
photos from that guest's previous stay are **copied** into the new booking. Only
the room, number of persons, time and amount need entering.

Matches are grouped by phone number, so a guest with six visits appears once,
showing their latest details and a stay count. Each booking keeps its **own copy**
of the photos, so deleting an old stay never strips the ID proof from a later one,
and correcting a name on one booking never rewrites history. A badge warns when a
previous stay's photos are missing from the device, in which case fresh photos are
required.

**ID photos** — Take Photo (camera) or Choose Photo (gallery) for each side, with
a preview, the compressed size, and retake/reselect. Each image is resized to
about 800×600, converted to JPEG at 50–60% quality, and stepped down further if
it is still over 150 KB. Two photos normally total a few hundred KB.

**Customers** — search by name, phone, room or customer code (wildcards are
treated as literal text), filters for All / Staying / Checked Out, newest first,
and paged loading.

**Customer details** — every field, both ID photos as thumbnails that open full
screen, nights stayed, the other guests on the booking, and Edit / Check Out /
Delete.

**Additional guests (optional)** — when a room is booked for more than one
person, the booking page shows an *Other Guests* card: "1 of 3 recorded" and an
**Add Guest** button. Each companion needs only a name; their phone and both ID
photos are optional, because a family sharing a room often has one ID between
them.

A booking never holds more companions than it was booked for (3 persons = 2
companions), and lowering the person count below the companions already recorded
is refused with an explanation rather than stranding them. Removing a companion
deletes their photos; deleting the booking removes all of them.

**Searching finds companions too** — typing a companion's name in Customers
returns the booking they stayed on, which is the main reason to record the
details at all. Each booking still appears once, even when the term matches both
the primary guest and a companion.

**Check-out** — confirmation dialog, sets `status = CHECKED_OUT` and
`check_out_date`, keeps the record for history, frees the room.

**Correcting times** — the check-out button is often pressed long after the guest
actually left, so both timestamps are editable from Edit: the check-in time
always, and the check-out time once the guest is checked out. A check-out can
never be saved before its check-in, and neither can be more than a day in the
future. Corrections move the booking in the dashboard's daily counts, which is
the point.

**Edit** — all fields plus either ID photo. The original check-in timestamp and
`created_at` are never changed; `updated_at` is. Moving a guest to another room
re-checks availability. Replacing a photo overwrites the same file, so no
orphans accumulate.

**Delete** — confirmation dialog, then the row and every associated image file.

**Rooms** — add and remove rooms, and a live board of available vs occupied with
the current guest's name. A room with a guest in it cannot be removed. A fresh
install starts with 101–105 and 201–203, all editable.

**Guest report (PDF)** — Dashboard → *Guest report*, pick a date, and get a
printable register of **everyone whose stay covered that day** — arrivals,
departures and continuing stays, ordered by room. Each entry carries the name,
address, phone, room, number of persons, check-in/check-out times and the ID
photos, plus any additional guests with their own details and ID photos.

**Payment amounts are never printed.** That is enforced in code rather than by
convention: `stripPaymentInfo` copies an explicit whitelist of fields, so a
column added to `customers` in future is excluded by default instead of leaking
into a document you hand to someone.

The PDF is produced by **Android's own print framework**, not a JavaScript PDF
library. That choice is deliberate for cheap hardware:

- the system paginates and renders, so a report with a dozen ID photos never has
  to be assembled inside the WebView heap
- no Unicode font has to be embedded, so a guest name in any script prints
  correctly with the device's own fonts
- the text stays selectable and searchable in the output
- the same dialog can send the register straight to a real printer

The preview on screen *is* the document — the print framework renders that same
DOM, so the two cannot drift apart. Load scales with bookings on the chosen date,
not with total history, so it stays flat as the database grows.

**Settings** — hotel name/address/phone, rooms shortcut, app PIN (which also
blocks screenshots while set), automatic daily backup toggle, backup export (with
or without photos), restore, and clear all data.

---

## 12. Testing

```powershell
npm test
```

243 tests over the business logic, all against real SQLite (sql.js) and an
in-memory file store:

| Area | Covered |
|---|---|
| Customer creation | code generation, device timestamps, paths-not-blobs in SQLite |
| Validation | every required field, phone digit rules, whole-number persons, room labels, PIN |
| Customer codes | formatting, parsing, sequencing past six digits, unsafe codes |
| Room availability | free/occupied board, keep-current-room while editing, room removal guard |
| Duplicate room prevention | service check **and** the partial unique index |
| Check-out | timestamp, record retention, room release, double check-out refused |
| Editing | check-in time preserved, room moves, in-place photo replacement |
| Search | name/phone/room/code, case-insensitivity, LIKE wildcards as literals, filters, paging, sorting |
| Image compression | resize geometry (landscape/portrait/wide/small), format validation, base64 round-trips |
| Deletion | row + files removed, missing files tolerated, other customers untouched |
| Backup creation | manifest, counts, PIN excluded, data-only mode, missing-file warnings |
| Backup restoration | full round-trip, replace-not-merge, corrupt/foreign/truncated/newer archives, damaged records, double-booked rooms, path-traversal entries |
| Migrations | fresh install, idempotency, table/column/index shape |
| Migration safety | every migration entry is a single statement, survives the Android plugin's splitter, embeds no literal values; `execute()` rejects scripts |
| Seeding | all 8 default rooms and every default setting land, and `sqlite_sequence` matches the row count (catches silently-rejected inserts) |
| Hotel settings | defaults, trimming, required name |
| App PIN | enable/verify/reject, digest never contains the PIN, removal requires the current PIN |
| Clear all data | customers + photos + rooms removed, hotel identity and PIN kept, app still usable afterwards |
| Automatic backup | on by default, missing setting treated as on, skips an empty database, once per calendar day, retention keeps 7, manual exports never pruned, archives are restorable, storage failure cannot break start-up |
| Returning guests | lookup by full/partial phone and by name, grouped one-per-phone with a stay count, latest details win, missing-photo detection, minimum search length |
| Photo reuse | copied into the new booking, byte-identical, a retake overrides the copy, deleting the old stay leaves the new photos intact, a missing source photo fails cleanly with nothing half-written |
| Editable times | explicit check-in (incl. yesterday), rejects far-future and malformed values, check-out correction after the fact, check-out never before check-in, refused while still staying, dashboard counts follow the corrected day |
| Amount | optional, exact paise, zero distinct from not-recorded, nonsense rejected before any write, add/clear later, survives a backup round trip |
| Additional guests | name-only records, optional phone/photos, front-without-back, ordering, capacity bounded by person count, person count cannot strand recorded guests, edit/retake/clear, removal cleans up photos, booking deletion cascades rows *and* files |
| Guest search | a companion's name finds the booking, no duplicate rows when both match, no cross-booking bleed |
| Guest backup | guests and their photos round-trip, a photo-less guest does not gain a phantom path, a guest whose booking was dropped is skipped with a warning, pre-migration archives with no guests still restore |
| Guest report | the date window is inclusive at both ends (arrival day, departure day, continuing stays, excludes the day before and the day after), register ordered by room, arrival/departure flags, booked headcount, hotel letterhead, companions with and without ID, empty day, malformed date |
| Report privacy | the amount is absent from the report object *and* from its serialised form even when one was collected; `stripPaymentInfo` is proved to drop an unknown future column rather than pass it through |
| Money handling | parsing rupees/paise/separators/symbol, rejecting nonsense and implausible values, no float drift, formatting and round-trip through the edit field |
| Performance at scale | 5,000 records: both list queries verified against SQLite's own `EXPLAIN QUERY PLAN` to use covering indexes with **no temporary B-tree sort**, plus wall-clock bounds on paging, search and the dashboard |

### Manual test pass (on the phone)

```text
Open app → New Check-In → fill details → ID Front photo → ID Back photo
  → confirm both compress to ~50–150 KB → pick an available room → Save
  → customer appears in Customers → open the customer → view both ID images
  → Check Out → room shows as available on Rooms and the Dashboard
```

Also worth checking once on the device: deny camera permission and confirm the
message is helpful; export a backup and confirm the file exists at the path
shown; restore it on a second device; turn on aeroplane mode and repeat the whole
flow (nothing should change).

**On the release build specifically**, re-test camera capture and photo picking.
R8 keep rules are the one thing unit tests cannot cover, and a missing rule shows
up only when JavaScript calls into that plugin at runtime.

---

## 13. Project structure

```text
src/
├── components/            reusable UI: nav shell, fields, dialogs, toasts,
│                          ID photo picker/viewer, PIN lock, error boundary
├── context/               ServicesContext — screens get services from here
├── hooks/                 useAsyncData
├── database/
│   ├── driver.ts          the SqlDriver interface (the only SQL seam)
│   ├── capacitorDriver.ts native SQLite / jeep-sqlite implementation
│   ├── database.ts        open + migrate once, wipe helper
│   ├── migrations.ts      versioned schema, seed rooms and settings
│   └── repositories/      customerRepository, roomRepository, settingsRepository
├── services/
│   ├── container.ts       wires repositories + services together
│   ├── customerService.ts check-in, edit, check-out, delete, dashboard
│   ├── roomService.ts     availability rules
│   ├── imageService.ts    capture + store ID photos
│   ├── backupService.ts   zip export / defensive restore
│   ├── settingsService.ts hotel info + PIN
│   └── fileStore.ts       FileStore interface, Capacitor + in-memory impls
├── pages/
│   ├── Dashboard/  CheckIn/  Customers/  CustomerDetails/  Rooms/  Settings/
├── utils/
│   ├── imageCompression.ts  resize/compress/validate
│   ├── date.ts              ISO storage + friendly display
│   ├── validation.ts        pure form rules
│   ├── customerCode.ts      CUS-000001 generation
│   ├── base64.ts            binary helpers
│   └── errors.ts            AppError + safe logging
├── App.tsx                boot, PIN lock, routes
└── main.tsx               entry point

tests/                     vitest suite + sql.js driver and fixtures
android/                   Capacitor Android project
scripts/copy-sql-wasm.mjs  browser-mode SQLite asset copy (dev only)
scripts/inspect-db.mjs     dump a database pulled off a device (see below)
scripts/android.mjs        resolves JDK 21 + SDK, then runs a Gradle task
scripts/gen-icon.mjs       regenerates the launcher/splash vector drawable
eslint.config.js           lint rules (exhaustive-deps and no-console are errors)
```

Notable additions in `src/`:

```text
services/guestService.ts        additional guests on a booking
services/reportService.ts       day report assembly (no payment fields)
services/pdfPrinter.ts          bridge to Android's print framework
services/autoBackupService.ts   daily archive + 7-file retention
services/screenGuard.ts         FLAG_SECURE bridge (blocks screenshots)
components/AutoBackupRunner.tsx schedules the daily backup after boot
```

Android-side additions:

```text
android/app/src/main/java/.../ScreenGuardPlugin.java   FLAG_SECURE plugin
android/app/src/main/java/.../PdfPrinterPlugin.java    WebView -> PDF printing
android/app/src/main/res/drawable/ic_hotel_mark.xml    app icon + splash mark
android/app/src/main/res/drawable/splash_screen.xml    brand cold-start splash
android/app/proguard-rules.pro                         R8 keep rules
android/keystore.properties                            signing secrets (ignored)
```

### Extending later

The original design predicted that individual guest records would be wanted
later and kept the `customers` row as the booking record so nothing would need
restructuring. That held: migration 5 added `booking_guests` without touching a
single existing column, query or screen that did not need it.

The same shape supports further extensions — per-guest check-out, or promoting a
recorded companion into a returning guest for a future booking — by adding
columns or a lookup, not by reshaping bookings.
