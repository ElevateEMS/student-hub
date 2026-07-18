/**
 * ELEVATE EMS — RIDE ALONG PORTAL BACKEND
 * ----------------------------------------
 * Paste this whole file into a new Apps Script project (script.google.com),
 * fill in the CONFIG section below, then deploy as a Web App.
 * See SETUP.md for the full step-by-step.
 *
 * HOW THIS WORKS:
 * The site only ever asks students for a season (Spring/Summer/Fall) — never
 * a year. This script combines that season with the actual calendar year at
 * the moment of submission to build a "cohort key" like "Spring 2027" (read
 * from the server's clock, so it can't be spoofed).
 *
 * The very first time any student submits under a given key, this script:
 *   1. Creates a Drive folder named "Ride Alongs - Spring 2027"
 *   2. Inside it, creates two separate spreadsheets by copying your templates:
 *      - "Spring 2027 Ride Along Agreement Submissions"
 *      - "Spring 2027 Clinical Tracking" (optionally shared with clinical sites)
 *   3. Remembers all of this in the Config sheet
 * Every submission after that reuses the same folder/sheets. Nothing is ever
 * deleted, and no yearly manual setup is required.
 *
 * Each student also gets their own subfolder inside the cohort folder —
 * "[Student Name] Clinical Site Docs" — holding their uploaded documents
 * (signed agreement, HIPAA, CPR card) and their signature image.
 */

/* =========================================================
   CONFIG — fill these in before deploying
   ========================================================= */

// The Spreadsheet ID of your master "Ride Along Config" sheet.
const MASTER_CONFIG_SHEET_ID = "1aVOTRwVrCYhHoymJNSMxhTHK4dJCfuU41_ec_Lx-ZDM";

// Template file IDs (kept as pure templates — never filled in directly)
const AGREEMENT_TEMPLATE_FILE_ID = "1XnwwTvSy70x6EnK9lWd4Bsh2fFVGtjC57um9W6Pjoko";
const CLINICAL_TEMPLATE_FILE_ID = "1nO2n6_8WoNpRpOP5OZClIckFJ0f2sEQ6rxRqwDkbGLo";

// Where staff notification emails go. Add as many as you want.
const STAFF_EMAILS = ["gbrown@elevateemsacademy.com", "nbrown@elevateemsacademy.com"];

// Clinical site contacts to auto-share the Clinical Tracking sheet with
// (view-only). Leave empty ([]) to not auto-share — you can always share
// manually in Drive instead. Example: ["contact@lifecaretransports.com"]
const CLINICAL_SITE_EMAILS = [];

// Tab name inside MASTER_CONFIG_SHEET_ID that tracks cohort resources.
// Columns (in this order): Cohort Key | Folder ID | Agreement Sheet ID | Clinical Sheet ID | Created
const CONFIG_TAB_NAME = "Cohorts";

// Name of the Drive folder that contains all the "Ride Alongs - X" cohort folders
const ROOT_FOLDER_NAME = "Elevate EMS - Ride Along Submissions";


/* =========================================================
   ENTRY POINTS
   ========================================================= */

function doGet(e) {
  return jsonResponse({ status: "Ride Along Portal backend is running." });
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);

    if (payload.type === "agreement") {
      handleAgreementSubmission(payload);
    } else if (payload.type === "request") {
      handleRideAlongRequest(payload);
    } else {
      throw new Error("Unknown submission type: " + payload.type);
    }

    return jsonResponse({ status: "ok" });
  } catch (err) {
    console.error("doPost error: " + err.message + "\n" + err.stack);
    return jsonResponse({ status: "error", message: err.message });
  }
}


/* =========================================================
   COHORT RESOURCES — folder + two sheets, auto-created per season+year
   ========================================================= */

function getConfigSheet_() {
  return SpreadsheetApp.openById(MASTER_CONFIG_SHEET_ID).getSheetByName(CONFIG_TAB_NAME);
}

// Builds the cohort key from a season name + the CURRENT calendar year
// (computed here, server-side, so it can't be spoofed by the submission).
function buildCohortKey_(season) {
  const year = new Date().getFullYear();
  return season + " " + year;
}

// Formats a date as an Eastern-time string, regardless of the spreadsheet's
// own timezone setting (which defaults to whatever Google assigns and isn't
// necessarily Eastern) or the viewer's browser locale. Automatically shows
// EST or EDT depending on whether daylight saving is in effect for that date.
function easternTimestamp_(date) {
  return Utilities.formatDate(date, "America/New_York", "M/d/yyyy h:mm a zzz");
}

// Returns {folderId, agreementSheetId, clinicalSheetId} for a given season,
// auto-creating everything the first time this season+year is seen.
function getOrCreateCohortResources_(season) {
  const cohortKey = buildCohortKey_(season);
  const configSheet = getConfigSheet_();
  const rows = configSheet.getDataRange().getValues();

  const match = rows.find(r => r[0] === cohortKey);
  if (match) {
    return { folderId: match[1], agreementSheetId: match[2], clinicalSheetId: match[3] };
  }

  // Not found — create the whole cohort folder + both sheets.
  // Find the root cohort folder anywhere in Drive (not just directly under
  // My Drive) — this way it can be moved/reorganized into another folder
  // (e.g. "Master Keys") without the script recreating a duplicate.
  const rootFolder = findRootFolderAnywhere_();
  const cohortFolder = getOrCreateFolder_(rootFolder, "Ride Alongs - " + cohortKey);

  const agreementFile = DriveApp.getFileById(AGREEMENT_TEMPLATE_FILE_ID)
    .makeCopy(cohortKey + " Ride Along Agreement Submissions", cohortFolder);

  const clinicalFile = DriveApp.getFileById(CLINICAL_TEMPLATE_FILE_ID)
    .makeCopy(cohortKey + " Clinical Tracking", cohortFolder);

  if (CLINICAL_SITE_EMAILS && CLINICAL_SITE_EMAILS.length) {
    CLINICAL_SITE_EMAILS.forEach(email => {
      try { clinicalFile.addViewer(email); } catch (err) { /* invalid/duplicate email, skip */ }
    });
  }

  const resources = {
    folderId: cohortFolder.getId(),
    agreementSheetId: agreementFile.getId(),
    clinicalSheetId: clinicalFile.getId()
  };

  configSheet.appendRow([cohortKey, resources.folderId, resources.agreementSheetId, resources.clinicalSheetId, easternTimestamp_(new Date())]);

  return resources;
}


/* =========================================================
   AGREEMENT SUBMISSION (Home page)
   ========================================================= */

function handleAgreementSubmission(payload) {
  console.log("handleAgreementSubmission: start, cohort=" + payload.cohort + ", name=" + payload.fullName);

  const cohortKey = buildCohortKey_(payload.cohort);
  console.log("handleAgreementSubmission: cohortKey=" + cohortKey);

  const resources = getOrCreateCohortResources_(payload.cohort);
  console.log("handleAgreementSubmission: resources=" + JSON.stringify(resources));

  const ss = SpreadsheetApp.openById(resources.agreementSheetId);
  console.log("handleAgreementSubmission: opened spreadsheet, name=" + ss.getName() + ", id=" + ss.getId());
  console.log("handleAgreementSubmission: available tabs=" + ss.getSheets().map(s => s.getName()).join(", "));

  const sheet = ss.getSheetByName("Agreement Submissions");
  console.log("handleAgreementSubmission: sheet lookup result=" + (sheet ? sheet.getName() : "NULL - TAB NOT FOUND"));

  // Signature is emailed as an attachment only — not saved to Drive.
  // (Ride Along Request documents still get saved to the student's folder —
  // see handleRideAlongRequest below.)
  const sigBlob = Utilities.newBlob(
    Utilities.base64Decode(payload.signatureImage.split(",").pop()), // strip "data:image/png;base64," if present
    "image/png",
    payload.fullName + " - Signature.png"
  );
  console.log("handleAgreementSubmission: signature blob built, bytes=" + sigBlob.getBytes().length);

  appendRowSafely_(sheet, [
    easternTimestamp_(new Date(payload.submittedAt)),
    payload.fullName,
    payload.email,
    payload.phone,
    payload.shirtSize,
    payload.street,
    payload.street2,
    payload.city,
    payload.state,
    payload.zip,
    payload.agencyName,
    payload.printedName,
    "", // Signature — sent as an email attachment, not stored in Drive
    false // Shipped — check this box once the shirt has gone out
  ]);
  console.log("handleAgreementSubmission: appendRowSafely_ call completed");

  const bodyLines = [
    "New Ride Along Agreement submitted.",
    "",
    "Cohort: " + cohortKey,
    "Name: " + payload.fullName,
    "Email: " + payload.email,
    "Phone: " + payload.phone,
    "Shirt size: " + payload.shirtSize,
    "Mailing address: " + payload.street + (payload.street2 ? " " + payload.street2 : "") + ", " + payload.city + ", " + payload.state + " " + payload.zip,
    "Ride Along Plan / Agency: " + payload.agencyName,
    "",
    "Signature is attached to this email."
  ];

  MailApp.sendEmail({
    to: STAFF_EMAILS.join(","),
    subject: "Ride Along Agreement - " + payload.fullName,
    body: bodyLines.join("\n"),
    attachments: [sigBlob]
  });
  console.log("handleAgreementSubmission: email sent, function complete");
}


/* =========================================================
   RIDE ALONG REQUEST (Request page)
   ========================================================= */

function handleRideAlongRequest(payload) {
  const cohortKey = buildCohortKey_(payload.cohort);
  const resources = getOrCreateCohortResources_(payload.cohort);
  const cohortFolder = DriveApp.getFolderById(resources.folderId);
  const sheet = SpreadsheetApp.openById(resources.clinicalSheetId).getSheetByName("Clinical Tracking");

  const studentFolder = getOrCreateFolder_(cohortFolder, payload.fullName + " Clinical Site Docs");

  const savedFiles = payload.files.map(f =>
    saveBase64ToFolder_(studentFolder, f.base64, f.mimeType, f.name)
  );

  appendRowSafely_(sheet, [
    easternTimestamp_(new Date(payload.submittedAt)),
    payload.fullName,
    payload.email,
    payload.rideAlongCity,
    payload.requestedDates,
    studentFolder.getUrl(), // link straight to their docs folder, not individual files
    false, // Confirmed — conditional formatting grays out the row when checked
    "" // Notes
  ]);

  // Build email attachments straight from the uploaded files (not just Drive links,
  // so you can forward the email directly to your ambulance company contact)
  const attachments = payload.files.map(f =>
    Utilities.newBlob(Utilities.base64Decode(f.base64), f.mimeType, f.name)
  );

  const hasCpr = payload.files.some(f => f.field === "CPR Card");
  const attachedList = payload.files.map(f => f.field).join(", ");

  const bodyLines = [
    "New Ride Along Request submitted.",
    "",
    "Cohort: " + cohortKey,
    "Name: " + payload.fullName,
    "Email: " + payload.email,
    "City requested: " + payload.rideAlongCity,
    "Requested date(s): " + payload.requestedDates,
    "",
    "Attached: " + attachedList + ".",
    hasCpr ? "" : "⚠ No CPR card uploaded — student was told to send a copy separately once obtained.",
    "Docs folder: " + studentFolder.getUrl()
  ];

  MailApp.sendEmail({
    to: STAFF_EMAILS.join(","),
    subject: "Ride Along Request - " + payload.fullName,
    body: bodyLines.join("\n"),
    attachments: attachments
  });
}


/* =========================================================
   DRIVE HELPERS
   ========================================================= */

function getOrCreateFolder_(parent, name) {
  const existing = parent.getFoldersByName(name);
  if (existing.hasNext()) return existing.next();
  return parent.createFolder(name);
}

// Searches ALL of Drive for a folder with this exact name, regardless of
// where it currently lives (top level, nested inside another folder, moved
// around, etc.) — only falls back to creating a fresh one in My Drive's top
// level if it genuinely can't be found anywhere.
function findRootFolderAnywhere_() {
  const existing = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
  if (existing.hasNext()) return existing.next();
  return DriveApp.getRootFolder().createFolder(ROOT_FOLDER_NAME);
}

function saveBase64ToFolder_(folder, base64, mimeType, filename) {
  const blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType, filename);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file;
}

// Appends a row by explicitly finding the last row with real data in column A
// (the Timestamp column), rather than relying on sheet.appendRow()'s built-in
// "last row" detection — which gets fooled by data validation / formatting
// applied to empty rows further down the sheet, causing rows to land far
// below the visible data instead of right after it.
function appendRowSafely_(sheet, values) {
  const colA = sheet.getRange("A1:A" + sheet.getMaxRows()).getValues();
  let lastDataRow = 0;
  for (let i = 0; i < colA.length; i++) {
    if (colA[i][0] !== "" && colA[i][0] !== null) lastDataRow = i + 1;
  }
  const targetRow = lastDataRow + 1;
  sheet.getRange(targetRow, 1, 1, values.length).setValues([values]);
}


/* =========================================================
   UTIL
   ========================================================= */

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


/* =========================================================
   MANUAL TEST — run this directly from the editor (select it in
   the function dropdown next to the Run button, then click Run).
   Watch the Execution log panel for output. Simulates a real
   Agreement submission without needing the actual website.
   ========================================================= */
function testAgreementSubmission() {
  const fakePayload = {
    type: "agreement",
    cohort: "Spring",
    fullName: "TEST Student " + new Date().getTime(),
    email: "test@example.com",
    phone: "555-555-5555",
    shirtSize: "M",
    street: "123 Test St",
    street2: "",
    city: "Richmond",
    state: "VA",
    zip: "23220",
    agencyName: "Test Agency",
    printedName: "Test Student",
    signatureImage: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    submittedAt: new Date().toISOString()
  };

  console.log("=== TEST START ===");
  try {
    handleAgreementSubmission(fakePayload);
    console.log("=== TEST SUCCEEDED — check the sheet for a row named '" + fakePayload.fullName + "' ===");
  } catch (err) {
    console.log("=== TEST FAILED ===");
    console.log("Error message: " + err.message);
    console.log("Stack: " + err.stack);
  }
}
