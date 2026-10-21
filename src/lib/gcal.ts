import { assertCapability } from "./task-policy/policy";
import { google } from "googleapis";
import { periodToDateRange } from "@/lib/schedule";

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not set");
  const key = JSON.parse(Buffer.from(raw, "base64").toString("utf-8"));
  return new google.auth.JWT({
    email:  key.client_email,
    key:    key.private_key,
    scopes: ["https://www.googleapis.com/auth/calendar.events"],
  });
}

export function isCalendarConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_CALENDAR_ID);
}

export interface SubstitutionEventInput {
  date:           string;   // YYYY-MM-DD
  periods:        number[];
  classCode:      string;
  subject:        string;
  requesterName:  string;
  reason:         string;
  candidateName:  string;
  candidateEmail: string | null;
}

export async function createSubstitutionEvent(input: SubstitutionEventInput): Promise<string | null> {
  assertCapability(undefined, "externalPublish"); // No qualified publication context in this release.
  if (!isCalendarConfigured()) return null;

  const auth = getAuth();
  const cal  = google.calendar({ version: "v3", auth });

  // Span all consecutive periods: earliest start → latest end
  const ranges = input.periods
    .map((p) => periodToDateRange(input.date, p))
    .filter(Boolean) as { start: Date; end: Date }[];
  if (!ranges.length) return null;

  const start = new Date(Math.min(...ranges.map((r) => r.start.getTime())));
  const end   = new Date(Math.max(...ranges.map((r) => r.end.getTime())));

  const periodsStr = input.periods.map((p) => `第${p}節`).join("、");

  const attendees = input.candidateEmail
    ? [{ email: input.candidateEmail, displayName: input.candidateName }]
    : [];

  const event = await cal.events.insert({
    calendarId:  process.env.GOOGLE_CALENDAR_ID!,
    requestBody: {
      summary:     `代課：${input.classCode} ${input.subject}`,
      description: `代替 ${input.requesterName} 老師（${input.reason}）\n節次：${periodsStr}`,
      start: { dateTime: start.toISOString(), timeZone: "Asia/Hong_Kong" },
      end:   { dateTime: end.toISOString(),   timeZone: "Asia/Hong_Kong" },
      attendees,
      colorId: "6", // Tangerine — visually distinct
    },
  });

  return event.data.id ?? null;
}
