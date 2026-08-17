# Attendance App (QR + Geolocation + Google Sheets)

A mobile-friendly web app (PWA) for office attendance check-in / check-out:

- Employees scan the office QR code and must be physically inside the office geo-fence.
- Attendance rows are written to a Google Sheet via a Google Apps Script web app.
- Admin view shows live status (on site now), a per-person hours-worked report for any date range, CSV export, and a link to the sheet.
- Employees can view their own monthly history (days present, hours, late arrivals).
- Every rejected attempt is logged to an Audit sheet; a daily email digest can be enabled.
- Multi-office: give each location its own QR token + geo-fence.

The app also includes: a first-run walkthrough, a recent-activity list and last-7-days hours chart on the home screen, live distance-from-office while checked in, an offline check-in queue that auto-syncs, vibration + shake feedback on scans, a camera-failure retry card, a check-in success overlay, a "not checked in today" roster view for admins, collapsible admin cards, loading skeletons, and a light/dark theme toggle.

## Files

| File | Purpose |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | The app UI and logic |
| `config.js` | Your Apps Script web app URL (edit me) |
| `manifest.webmanifest`, `sw.js` | PWA install + offline shell |
| `icons/` | App icons |
| `qr-generator.html` | Generates the printable office QR (open it, no server needed) |
| `appsscript/Code.gs` | Google Apps Script backend (paste into your Sheet's script editor) |

## Setup

### 1. Create the Google Sheet backend

1. Go to sheets.google.com and create a new spreadsheet. Name it e.g. `Attendance App`.
2. Open `Extensions > Apps Script`.
3. Delete the default `function myFunction(){}` and paste the whole contents of `appsscript/Code.gs`.
4. Save (Ctrl+S), then in the editor toolbar run the `setup` function once and grant permissions.
   This creates the `Attendance`, `Config`, `Roster`, `Offices` and `Audit` sheets with default values.
5. Back in the spreadsheet, open the **Config** tab and fill in:
   - `appName` - shown in the app
   - `officeName` - shown as the office location (default `Head Office`)
   - `officeLat` / `officeLng` - your office coordinates. Get them by right-clicking your office on Google Maps.
   - `radiusMeters` - allowed distance from that point (e.g. `150`)
   - `qrSecret` - the token the office QR must contain. Generate a random string; it is the gate, keep it private.
   - `adminPin` - PIN for the admin view.
   - `adminEmail` - where the daily digest is sent (leave empty to disable).
   - `rosterMode` - who may check in: `open` (anyone), `domain` (any email under `rosterDomain`), or `roster` (emails listed in the **Roster** sheet).
   - `rosterDomain` - used in `domain` mode, e.g. `company.com`.
   - `minScanIntervalSec` - minimum seconds between one person's scans (default `60`, prevents accidental double-taps).
   - `replayMaxAgeMs` - how old a check-in request may be before it is rejected (default `300000` = 5 min, blocks request replay).
   - `pinMaxAttempts` - wrong admin PIN attempts before lockout (default `5`).
   - `pinLockoutMs` - admin PIN lockout duration (default `900000` = 15 min).
   - `writeQuotaPerEmail` - max attendance writes per email per hour (default `60`, protects against scripted flooding).
   - `writeQuotaTenant` - max attendance writes per tenant per hour (default `600`).
    - `coordReuseBlock` - reject a check-in whose exact coordinates were already reported by a different person that day (`true`/`false`).
    - `maxAccuracyM` - maximum allowed GPS fix error in metres (default `200`, blocks weak/spoofed fixes).
    - `maxMoveKmh` - maximum implied travel speed between your check-ins (default `300` km/h).
    - `retentionDays` - how many days of Attendance rows to keep (default `0` = keep everything; >0 enables purging).
    - `lateAfter` - time (HH:MM) after which a check-in counts as late, e.g. `09:00` (leave empty to disable).

   The **Roster** sheet (created automatically) holds one allowed email per row, used when `rosterMode` is `roster`.

### Adding employees (optional)

For pre-approved staff with consistent names and departments:

1. In the app, open **Admin** and log in with the PIN.
2. Under **Employees**, add each person's name, email and department.
3. They are stored in the **Employees** sheet (`Name`, `Email`, `Department`, `Created`).
4. On check-in, an employee's stored name (if present) overrides whatever they typed in their profile, so the Attendance records stay clean.
5. When `rosterMode` is `roster`, an email is allowed if it is in the **Roster** sheet **or** the **Employees** sheet.

You can also add rows directly in the **Employees** tab of the spreadsheet — the app reads them on the next check-in.

### Multi-office (optional)

Instead of `qrSecret`, you can define any number of offices on the **Offices** sheet
(created automatically). One row per office:

| Name | QR Token | Latitude | Longitude | Radius (m) |
| --- | --- | --- | --- | --- |
| Accra HQ | `ATT-AC-9F2K` | 5.6037168 | -0.1869644 | 150 |
| Kumasi Branch | `ATT-KU-7D1M` | 6.6871 | -1.6219 | 200 |

- As soon as the Offices sheet has at least one row, only those tokens are accepted
  (the legacy `qrSecret` is ignored).
- Print one QR per office using `qr-generator.html` with that office's token.
- The check-in response and Attendance sheet record which office was used.

### 2. Deploy the web app

1. In the Apps Script editor: `Deploy > New deployment`.
2. Type: **Web app**.
   - Description: `attendance`
   - Execute as: **Me**
   - Who has access: **Anyone**
3. Click **Deploy**, then **Authorize access** with your Google account.
4. Copy the **Web app URL** (ends in `/exec`).

### 3. Point the app at it

Open `config.js` and replace `YOUR_SCRIPT_ID` in `API_URL` with your deployed script id, e.g.:

```js
API_URL: 'https://script.google.com/macros/s/AKfycbxxxxxxxxxxx/exec'
```

### 4. Print the office QR

1. Open `qr-generator.html` in any browser.
2. Paste the same `qrSecret` from the Config sheet.
3. Generate, download the PNG, and print it. Post it at the office entrance.

### 5. Host the app

Camera and geolocation **require HTTPS**. Any static host works:

- **GitHub Pages** - push this folder to a repo, enable Pages.
- **Netlify / Vercel** - drag-and-drop the folder.
- Test locally with `npx serve .` (localhost is treated as secure).

## Security & privacy

- **QR tokens never leave the server** - the public `config` endpoint used to return each
  office's QR token plus coordinates, which let anyone forge a check-in for any email. Tokens
  are now server-side only: the server alone validates the token and the geofence, and the app
  only receives office *names* and locations for display. Keep the Config/Offices sheets private.
- **Roster-gated data reads** - once the **Employees** or **Roster** sheet has at least one
  row, the `recent`, `week` and `myattendance` actions only return data for emails listed on
  the roster. A random person who finds the web app URL can no longer read anyone's history;
  denials are logged to the **Audit** sheet as `PRIVACY_DENY`. If no roster is configured yet,
  reads stay open for backwards compatibility until staff are added.
- **Admin access is PIN + one-time-code and audited** - logging in sends a one-time code to
  `adminEmail` (a 6-digit code valid for 10 minutes, max 5 tries) and succeeds only when you
  enter the PIN *and* the emailed code. Successful logins are logged as `ADMIN_OK` / `ADMIN_2FA`,
  bad PINs as `BAD_PIN`, bad codes as `BAD_OTP`. The session is a random server-side token that
  is kept in memory only (never stored on disk) and expires after 30 minutes. PIN lockout after
  `pinMaxAttempts` wrong PINs for `pinLockoutMs`. If no `adminEmail` is configured, the app shows
  a development code on screen - set `adminEmail` for production.
- **Secrets live in Apps Script Script Properties, not the sheet** - `adminPin`, `qrSecret` and
  per-tenant PIN/QR secrets are stored in Script Properties (keyed per tenant), with the sheet
  values only used as a migration fallback. Use the **Attendance** menu:
  **Rotate admin PIN** and **Rotate QR secret** to rotate credentials on demand.
- **Encrypted device storage** - your profile, check-in status and offline queue are encrypted
  at rest in localStorage with AES-GCM (WebCrypto, per-device random key). Only the theme and
  onboarding flag stay plaintext. A device without WebCrypto falls back to plaintext.
- **Spreadsheet-injection defense** - every user-supplied value (names, departments, tenant
  names) is defused with `safeCell_`: a value starting with `=`, `+`, `-` or `@` is prefixed
  with `'` so it can never execute as a formula in your Sheets, control characters are
  stripped, and length is capped.
- **Write quotas** - the Attendance endpoint is rate-limited per email (`writeQuotaPerEmail`,
  default 60/hour) and per tenant (`writeQuotaTenant`, default 600/hour), and tenant creation
  is limited to 10/hour. This stops a scripted flood from burning Apps Script quota or bloating
  your spreadsheet; over-quota attempts are logged (`QUOTA_EMAIL` / `QUOTA_TENANT`).
- **No secret data in URLs** - all requests use POST with a JSON body; tokens and emails are
  never in query strings, and the `no-referrer` policy keeps the sheet URL from leaking.
- **Content Security Policy** - the app ships a CSP that only allows its own scripts plus the
  QR library CDN, which blocks injected scripts / XSS-style data exfiltration.
- **Geofence + replay + coordinate-reuse checks** - the server independently re-verifies the
  office radius, rejects stale timestamps (`replayMaxAgeMs`) and blocks shared-location reuse
  (`coordReuseBlock`), so a QR captured elsewhere or a replayed request is refused.
- **GPS anti-spoofing** - the server rejects fixes weaker than `maxAccuracyM` (default 200 m)
  and any check-in that implies a physically impossible travel speed between two of your
  check-ins (`maxMoveKmh`, default 300 km/h), logging `ACCURACY_LOW` / `IMPLAUSIBLE`.
- **Data-subject rights** - in **My history**, employees can download all of their own
  attendance as CSV (**Download my data**) or permanently erase all of it from the sheet
  (**Erase my data**), both logged (`DATA_ERASED`). Administrators can enforce a retention
  window with `retentionDays` (0 = off) and enable **Enable auto-purge** from the menu
  (daily 02:00 cleanup) or run **Run retention purge now**.
- **Device data** - your name, email and check-in state live only in this browser's local
  storage, encrypted (see above). Clear site data when using a shared device (a reminder shows
  in the profile dialog).

## How it works

1. Employee opens the app, sets name + email once (stored on their device).
2. They tap **Scan QR**, the phone camera reads the office QR.
3. The app gets a high-accuracy GPS fix and computes distance to the office coordinates.
4. Outside the radius -> check-in is blocked. Inside -> the request is sent to Apps Script.
5. Apps Script validates the QR token again, re-computes the distance server-side, then toggles
   Check-in / Check-out for that person's email for today and appends a row to the Attendance sheet.
6. **My history** (home screen) shows the employee their own attendance for the current month.
7. **Admin** (PIN + emailed one-time code) shows live status plus a per-person hours-worked
   report for any date range, with total hours, days present, late arrivals and missing
   check-outs; CSV export downloads the report.
8. Every rejected attempt (bad QR, out of range, spoof, roster deny, bad PIN, ...) is written to the **Audit** sheet.
9. A daily digest email can be sent automatically (see below).

### Attendance sheet columns

`Date`, `Time`, `Name`, `Email`, `Action` (Check-in/Check-out), `Status` (On-site), `Latitude`, `Longitude`, `Distance(m)`, `QR Token`, `Office`

### Audit sheet

`Date`, `Time`, `Email`, `Reason`, `Code`. Codes: `INVALID_QR`, `STALE`, `ROSTER_DENIED`, `NO_LOCATION`,
`OUTSIDE_RANGE`, `SPOOF_REUSE`, `TOO_QUICK`, `ACCURACY_LOW`, `IMPLAUSIBLE`, `QUOTA_EMAIL`,
`QUOTA_TENANT`, `PRIVACY_DENY`, `BAD_PIN`, `BAD_OTP`, `ADMIN_OK`, `ADMIN_2FA`, `DATA_ERASED`.

### Daily digest

1. Set `adminEmail` in the Config sheet.
2. In the spreadsheet, use the **Attendance** menu (App Scripts `onOpen` creates it):
   - **Enable daily digest (17:00)** - schedules a daily 5pm email with who was present and hours.
   - **Send digest now** - sends immediately for the current day.
   - **Rotate admin PIN** / **Rotate QR secret** - rotate credentials (stored in Script Properties).
   - **Enable auto-purge** / **Run retention purge now** - retention cleanup using `retentionDays`.

## Notes & limitations

- The `qrSecret`, office `QR Token`s and `adminPin` live in Apps Script **Script Properties**
  (the sheet copy is only a migration fallback) and are never exposed to the app UI
  (only the web app and the printed QR know them).
- Cross-midnight shifts are counted as two days (open day + next-day check-out); fine for standard office hours.
- Browser geolocation can be spoofed; the accuracy cap, travel-speed check and coord-reuse
  check make that much harder, but this remains a reasonable-enough guard for a small office.
- Apps Script "Anyone" web apps are rate-limited; fine for a small team.
- Change the deployed web app version when you edit `Code.gs` (Deploy > Manage deployments > pencil > New version).
- For accuracy, use an Android device (GPS), enable high-accuracy location, and keep WiFi on.

## Security model

Enforcement lives in the Apps Script backend (client checks are cosmetic):

1. **QR secret gate** - the scanned token must match `qrSecret`. Anyone who doesn't have the office QR is rejected.
2. **Geo-fence** - distance to the office is recomputed server-side; requests outside the radius are rejected.
3. **Roster whitelist** - in `domain`/`roster` mode only allowed emails can check in.
4. **Request freshness** - every request carries a timestamp; anything older than `replayMaxAgeMs` is rejected, so captured requests can't be replayed.
5. **Rapid-scan guard** - one person can't scan twice within `minScanIntervalSec`.
6. **Coord-reuse check** - the exact same coordinates reported by two different people in a day is treated as a spoofed location.
7. **GPS accuracy & travel-speed checks** - fixes weaker than `maxAccuracyM` or that imply a faster
   move than `maxMoveKmh` between your check-ins are rejected.
8. **Admin PIN lockout** - after `pinMaxAttempts` failures, the admin view is locked for `pinLockoutMs`.
9. **Admin 2FA + sessions** - the admin view requires the PIN *and* a one-time code emailed to
   `adminEmail`; success issues a random, memory-only session token valid for 30 minutes.
10. **Write quotas & audit** - attendance is rate-limited per email and per tenant, and every
    success or denial is written to the **Audit** sheet for review.
