import { assertCapability } from "./task-policy/policy";
import { google } from "googleapis";
import { Readable } from "stream";

function getAuth() {
  assertCapability(undefined, "externalPublish"); // No qualified publication context in this release.
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not set");
  const key = JSON.parse(
    Buffer.from(raw, "base64").toString("utf-8"),
  );
  return new google.auth.JWT({
    email:  key.client_email,
    key:    key.private_key,
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });
}

export function isDriveConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID);
}

// Find or create a folder by name under a parent folder
async function ensureFolder(drive: ReturnType<typeof google.drive>, name: string, parentId: string): Promise<string> {
  const q = `mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and trashed=false`;
  const list = await drive.files.list({ q, fields: "files(id)", spaces: "drive" });
  if (list.data.files?.length) return list.data.files[0].id!;
  const created = await drive.files.create({
    requestBody: {
      name, mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
  });
  return created.data.id!;
}

// Ensure path:  ROOT / docType / YYYY-MM /
export async function ensurePath(docType: string, date: Date): Promise<string> {
  const auth  = getAuth();
  const drive = google.drive({ version: "v3", auth });
  const root  = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID!;
  const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  const typeFolder  = await ensureFolder(drive, docType, root);
  const monthFolder = await ensureFolder(drive, month, typeFolder);
  return monthFolder;
}

export interface DriveUploadResult {
  fileId:      string;
  webViewLink: string;
}

export async function uploadFile(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  folderId: string,
): Promise<DriveUploadResult> {
  const auth  = getAuth();
  const drive = google.drive({ version: "v3", auth });
  const readable = Readable.from(buffer);
  const res = await drive.files.create({
    requestBody: { name: filename, parents: [folderId] },
    media:       { mimeType, body: readable },
    fields:      "id,webViewLink",
  });
  return {
    fileId:      res.data.id!,
    webViewLink: res.data.webViewLink!,
  };
}
