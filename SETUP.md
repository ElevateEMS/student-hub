# Ride Along Portal — Setup Guide

Good news — the three spreadsheets this depends on are already created and
sitting in your Google Drive, styled to match your brand colors:
- **Agreement Submissions Template**: https://docs.google.com/spreadsheets/d/1XnwwTvSy70x6EnK9lWd4Bsh2fFVGtjC57um9W6Pjoko/edit
- **Clinical Tracking Template**: https://docs.google.com/spreadsheets/d/1VgO7_XQgSCNAgNFFd4vHb0yTbSaRjRWX_zDYv3YgaAk/edit
- **Ride Along Config v2**: https://docs.google.com/spreadsheets/d/1aVOTRwVrCYhHoymJNSMxhTHK4dJCfuU41_ec_Lx-ZDM/edit

Their IDs are already filled into `Code.gs` below. This is a rebuilt version of
an earlier structure — if you have older files named "Cohort Template",
"Cohort Template (Styled)", "Ride Along Config (Styled)", or unlabeled
versions of "Agreement Submissions Template" / "Clinical Tracking Template"
(without "v2" in the title) from before, those are no longer used and safe
to trash.

## How this works

The site only ever asks students to pick a season — Spring, Summer, or Fall.
No year, ever. Behind the scenes, the backend combines that season with the
actual calendar year at the moment of submission to build a cohort key like
`Spring 2027` (read from the server's clock, so it can't be spoofed).

The first time any student submits under a given key, the script:
1. Creates a Drive folder named **"Ride Alongs - Spring 2027"**
2. Inside it, creates two separate spreadsheets by copying your templates:
   - **"Spring 2027 Ride Along Agreement Submissions"** — staff-only, has
     every field from the Agreement form, plus a `Shipped` checkbox column
   - **"Spring 2027 Clinical Tracking"** — built from Ride Along Request
     submissions, with a link to each student's document folder and a
     `Confirmed` checkbox. When checked, that row automatically grays out
     (conditional formatting, no extra clicking needed). This one can be
     shared with your clinical sites — see `CLINICAL_SITE_EMAILS` below.
3. Remembers all of this in the Config sheet

Every submission after that reuses the same folder and sheets — no new files
get created, no manual archiving is ever needed.

**Each student also gets their own subfolder** inside that cohort folder,
named **"[Student Name] Clinical Site Docs"** — holding their signed
agreement, HIPAA form, CPR card, and signature image, all in one place. If a
student submits both forms, everything lands in that same one folder.

---

## 1. Deploy the Apps Script backend

1. Go to [script.google.com](https://script.google.com) → **New Project**
   (or open your existing project if you're updating from an earlier version).
2. Select all the existing code, delete it, paste in the full contents of
   `Code.gs` (included in this bundle). The template and config IDs are
   already filled in.
3. `STAFF_EMAILS` is already set to your real address and your husband's — no placeholder left to fill in.
4. **Optional:** if you want the Clinical Tracking sheet to auto-share with a
   clinical site contact, add their email to `CLINICAL_SITE_EMAILS`, e.g.:
   ```js
   const CLINICAL_SITE_EMAILS = ["contact@lifecaretransports.com"];
   ```
   They'll get **view-only** access automatically the moment each new
   cohort's sheet is created. Leave it as `[]` to skip this and share
   manually instead.
5. Save (Ctrl+S / Cmd+S).
6. If this is a brand new project: **Deploy → New deployment** → type
   **Web app** → Execute as **Me** → Who has access **Anyone** → **Deploy**,
   then authorize the permissions it asks for (Sheets, Drive, Gmail) and
   copy the **Web app URL**.
   If you're updating an *existing* deployment: saving is enough, no new
   deployment needed — Apps Script always runs your latest saved code.

## 2. Connect the website to the backend

Open `index.html`, find this line near the top of the `<script>` section:

```js
const APPS_SCRIPT_URL = "...";
```

Make sure it has your Web App URL from Step 1. (If you're updating an
existing setup, this is likely already filled in — no change needed.)

## 3. Host it

Push this whole folder (`index.html`, `logo.png`, and the `forms/` folder)
to your GitHub Pages repo. The relative links to the PDFs and logo work as
long as the folder structure stays intact.

## 4. Test before sending it to students

- Submit a test Ride Along Agreement. Confirm:
  - A new folder appeared in **My Drive → Elevate EMS - Ride Along Cohort
    Sheets → Ride Alongs - [season/year]**
  - Inside it, a new **"[cohort] Ride Along Agreement Submissions"** sheet
    with your test row
  - A **"[Your Test Name] Clinical Site Docs"** folder with your signature
    image in it
  - You got the staff email
- Submit a test Ride Along Request under the *same* season. Confirm it
  reused the same cohort folder (no duplicate), landed in the
  **"Clinical Tracking"** sheet, and your uploaded files appear in that same
  student folder alongside the signature.
- In the Clinical Tracking sheet, manually check the `Confirmed` box on your
  test row and confirm the row grays out automatically.

---

### Uploading shirt addresses to Pirate Ship
Pirate Ship accepts CSV, XLS, XLSX, or ODS uploads directly, as long as each
part of the address is in its own column with a header — which is exactly
how the Agreement Submissions sheet is structured (Full Name, Street Address,
Apt/Unit, City, State, ZIP are all separate columns). To ship shirts for a
given cohort:
1. Open that cohort's **"[cohort] Ride Along Agreement Submissions"** sheet.
2. Filter the `Shipped` column to unchecked rows only (**Data → Create a
   filter**). This matters because Google Sheets' Download always exports
   every row — filtering first is what keeps you from re-shipping someone.
3. **File → Download → Comma Separated Values (.csv)** (or .xlsx).
4. In Pirate Ship, drag that file into the upload area on the Ship page.
5. The first time, you'll map each column (Full Name → Name, Street Address
   → Address Line 1, Apt/Unit → Address Line 2, etc.) — Pirate Ship
   remembers this mapping for next time based on the column headers.
6. Back in the sheet, check the `Shipped` box for everyone in that batch.

### If you ever need to find a specific cohort's files
Open **Ride Along Config v2 → Cohorts** tab — every season+year that's ever
had a submission is listed there with direct links to its folder and both
sheets, in the order it was first created. Or just search Drive for "Ride
Alongs - " plus the season/year you're after.
