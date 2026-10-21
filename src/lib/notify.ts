import { assertCapability } from "./task-policy/policy";
// n8n webhook client — WhatsApp 推送
// 環境變數：N8N_WEBHOOK_URL（n8n workflow webhook）、N8N_WEBHOOK_SECRET（雙向驗證）

export interface NotifyPayload {
  title:      string;
  content:    string;
  recipients: string[];
  requestId?: string;
}

export function isNotifyConfigured(): boolean {
  return Boolean(process.env.N8N_WEBHOOK_URL);
}

export async function sendWhatsApp(payload: NotifyPayload): Promise<{ ok: boolean; error?: string }> {
  assertCapability(undefined, "externalPublish"); // No qualified publication context in this release.
  const url = process.env.N8N_WEBHOOK_URL;
  if (!url) return { ok: false, error: "伺服器未設定 N8N_WEBHOOK_URL" };

  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: {
        "Content-Type":     "application/json",
        "x-webhook-secret": process.env.N8N_WEBHOOK_SECRET ?? "",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { ok: false, error: `n8n 回應 ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
