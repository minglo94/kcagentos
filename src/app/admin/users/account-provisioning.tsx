"use client";
import { useState } from "react";
type Staff = { id: string; name: string; email: string };
export default function AccountProvisioning({ users, onChange }: { users: Staff[]; onChange: () => void }) {
  const [target, setTarget] = useState(""), [name, setName] = useState(""), [email, setEmail] = useState(""), [username, setUsername] = useState(""), [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function action(kind: "create" | "reset" | "link" | "unlink" | "unlock-local" | "unlock-ad") {
    if (kind !== "create" && !target) { setMessage("請先選擇用戶。"); return; }
    if ((kind === "reset" || kind === "unlink") && !window.confirm("這項操作會使該用戶目前的登入失效。繼續？")) return;
    setBusy(true); setMessage("");
    try {
      const root = `/api/admin/users/${target}`;
      const path = kind === "create" ? "/api/admin/users" : ["link", "unlink"].includes(kind) ? root + "/directory" : root + "/credentials";
      const method = kind === "unlink" ? "DELETE" : ["create", "unlock-local", "unlock-ad"].includes(kind) ? "POST" : "PUT";
      const body = kind === "create" ? { name, email, username, password, role: "TEACHER" } : kind === "reset" ? { username, password } : kind === "link" ? { username } : kind.startsWith("unlock") ? { username, provider: kind === "unlock-ad" ? "school-ad" : "local" } : undefined;
      const response = await fetch(path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      setMessage(response.ok ? "已保存。" : response.status === 409 ? "帳號或 AD 身份已被使用。" : response.status === 503 ? "服務未設定或暫時無法使用。" : "無法保存，請檢查輸入及權限。");
      if (response.ok) { setPassword(""); onChange(); }
    } catch { setMessage("暫時無法連線，請稍後再試。"); }
    finally { setBusy(false); setPassword(""); }
  }
  const field = { padding: 9, border: "1px solid var(--border)", borderRadius: 4, background: "var(--card)", color: "var(--ink)" };
  return <details style={{ background: "var(--card)", padding: 20, marginBottom: 20, border: "1px solid var(--border)", borderRadius: 5 }}>
    <summary style={{ cursor: "pointer", fontWeight: 600 }}>建立及管理登入帳號</summary>
    <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
      <label>現有用戶<select aria-label="現有用戶" value={target} onChange={event => setTarget(event.target.value)} style={{ ...field, marginLeft: 12 }}><option value="">選擇用戶</option>{users.map(user => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}</select></label>
      <label>新用戶姓名<input aria-label="新用戶姓名" value={name} maxLength={100} onChange={event => setName(event.target.value)} style={field} /></label>
      <label>聯絡電郵<input aria-label="聯絡電郵" type="email" value={email} onChange={event => setEmail(event.target.value)} style={field} /></label>
      <label>登入帳號<input aria-label="登入帳號" value={username} autoComplete="off" maxLength={64} onChange={event => setUsername(event.target.value)} style={field} /></label>
      <label>新密碼<input aria-label="新密碼" type="password" value={password} autoComplete="new-password" minLength={12} maxLength={128} onChange={event => setPassword(event.target.value)} style={field} /></label>
      <p style={{ fontSize: 12, color: "var(--ink3)" }}>新帳號預設為老師。AD 連結會在學校目錄核實身份；此處毋須輸入 AD 密碼。</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{([ ["create", "建立本地帳號"], ["reset", "設定／重設本地密碼"], ["link", "連結學校 AD"], ["unlink", "移除 AD 連結"], ["unlock-local", "解除本地登入限制"], ["unlock-ad", "解除 AD 登入限制"] ] as const).map(([kind, label]) => <button type="button" key={kind} disabled={busy} onClick={() => action(kind)} style={field}>{label}</button>)}</div>
      {message && <p role="status">{message}</p>}
    </div>
  </details>;
}
