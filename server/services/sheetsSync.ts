import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { getAllContactsForSync, upsertSheetsSync, getSheetsSync, createContact, updateContact } from "../db";
import type { Contact, InsertContact } from "../../drizzle/schema";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

const SHEET_HEADERS = [
  "ID", "First Name", "Last Name", "Full Name", "Email", "Email Status",
  "Email Confidence", "Title", "Company", "Industry", "Company Size",
  "Website", "LinkedIn URL", "Location", "Stage", "Notes", "Created At",
];

export function getOAuth2Client(): OAuth2Client {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function getAuthUrl(): string {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
}

export async function exchangeCodeForTokens(code: string) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  await upsertSheetsSync({
    accessToken: tokens.access_token ?? undefined,
    refreshToken: tokens.refresh_token ?? undefined,
    tokenExpiry: tokens.expiry_date ?? undefined,
    syncStatus: "idle",
  });

  return tokens;
}

async function getAuthenticatedClient(): Promise<OAuth2Client | null> {
  const syncConfig = await getSheetsSync();
  if (!syncConfig?.accessToken) return null;

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: syncConfig.accessToken,
    refresh_token: syncConfig.refreshToken,
    expiry_date: syncConfig.tokenExpiry,
  });

  // Auto-refresh if needed
  oauth2Client.on("tokens", async (tokens) => {
    await upsertSheetsSync({
      accessToken: tokens.access_token ?? undefined,
      tokenExpiry: tokens.expiry_date ?? undefined,
    });
  });

  return oauth2Client;
}

function contactToRow(c: Contact): string[] {
  return [
    String(c.id),
    c.firstName ?? "",
    c.lastName ?? "",
    c.fullName ?? "",
    c.email ?? "",
    c.emailStatus ?? "unknown",
    c.emailConfidence != null ? String(Math.round(c.emailConfidence * 100)) + "%" : "",
    c.title ?? "",
    c.company ?? "",
    c.industry ?? "",
    c.companySize ?? "",
    c.companyWebsite ?? "",
    c.linkedinUrl ?? "",
    c.location ?? "",
    c.stage ?? "new",
    c.notes ?? "",
    c.createdAt ? new Date(c.createdAt).toISOString().split("T")[0] : "",
  ];
}

export async function pushToSheets(spreadsheetId?: string): Promise<{ rowsWritten: number; spreadsheetId: string }> {
  const auth = await getAuthenticatedClient();
  if (!auth) throw new Error("Google Sheets not authenticated");

  const sheets = google.sheets({ version: "v4", auth });
  const syncConfig = await getSheetsSync();
  const targetId = spreadsheetId ?? syncConfig?.spreadsheetId;

  let sheetId: string;

  if (!targetId) {
    // Create new spreadsheet
    const createResp = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: "Behberg Outreach — Contacts" },
        sheets: [{ properties: { title: "Contacts" } }],
      },
    });
    sheetId = createResp.data.spreadsheetId!;
    await upsertSheetsSync({
      spreadsheetId: sheetId,
      spreadsheetName: "Behberg Outreach — Contacts",
      sheetName: "Contacts",
    });
  } else {
    sheetId = targetId;
  }

  const allContacts = await getAllContactsForSync();
  const rows = [SHEET_HEADERS, ...allContacts.map(contactToRow)];

  // Clear and rewrite
  await sheets.spreadsheets.values.clear({
    spreadsheetId: sheetId,
    range: "Contacts!A:Z",
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: "Contacts!A1",
    valueInputOption: "RAW",
    requestBody: { values: rows },
  });

  await upsertSheetsSync({
    lastSyncAt: new Date(),
    lastSyncDirection: "push",
    syncStatus: "idle",
    spreadsheetId: sheetId,
  });

  return { rowsWritten: allContacts.length, spreadsheetId: sheetId };
}

export async function pullFromSheets(): Promise<{ imported: number; updated: number }> {
  const auth = await getAuthenticatedClient();
  if (!auth) throw new Error("Google Sheets not authenticated");

  const syncConfig = await getSheetsSync();
  if (!syncConfig?.spreadsheetId) throw new Error("No spreadsheet configured");

  const sheets = google.sheets({ version: "v4", auth });
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: syncConfig.spreadsheetId,
    range: "Contacts!A:Q",
  });

  const rows = resp.data.values ?? [];
  if (rows.length < 2) return { imported: 0, updated: 0 };

  const headers = rows[0].map((h: string) => h.toLowerCase().trim());
  let imported = 0;
  let updated = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const get = (col: string) => row[headers.indexOf(col)] ?? "";

    const idStr = get("id");
    const contact: InsertContact = {
      firstName: get("first name") || undefined,
      lastName: get("last name") || undefined,
      fullName: get("full name") || undefined,
      email: get("email") || undefined,
      title: get("title") || undefined,
      company: get("company") || undefined,
      industry: get("industry") || undefined,
      companySize: get("company size") || undefined,
      companyWebsite: get("website") || undefined,
      linkedinUrl: get("linkedin url") || undefined,
      location: get("location") || undefined,
      notes: get("notes") || undefined,
      stage: (get("stage") as any) || "new",
      source: "sheets_import",
    };

    if (idStr && !isNaN(parseInt(idStr))) {
      await updateContact(parseInt(idStr), contact);
      updated++;
    } else if (contact.email || contact.fullName) {
      await createContact(contact);
      imported++;
    }
  }

  await upsertSheetsSync({
    lastSyncAt: new Date(),
    lastSyncDirection: "pull",
    syncStatus: "idle",
  });

  return { imported, updated };
}
