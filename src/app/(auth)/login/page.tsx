"use client";
import { getProviders, signIn, type ClientSafeProvider } from "next-auth/react";
import { useEffect, useState } from "react";
export default function LoginPage() {
  const [providers, setProviders] = useState<Record<string, ClientSafeProvider> | null>(null);
  const [provider, setProvider] = useState("local"), [username, setUsername] = useState(""), [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { getProviders().then(value => {
    setProviders(value ?? {});
    setProvider(value?.local ? "local" : value?.["school-ad"] ? "school-ad" : "");
  }).catch(() => { setProviders({}); setError("登入服務暫時無法使用。"); }); }, []);
  const credentials = Object.values(providers ?? {}).filter(item => item.type === "credentials");
  async function login(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await signIn(provider, { username, password, redirect: false, callbackUrl: "/office" });
      if (!result?.ok || result.error) setError("登入失敗，請檢查帳號及密碼，或聯絡管理員。");
      else window.location.assign("/office");
    } catch { setError("登入服務暫時無法使用，請稍後再試。"); }
    finally { setPassword(""); setBusy(false); }
  }
  const field: React.CSSProperties = { width: "100%", border: "1px solid var(--border)", borderRadius: 4, padding: "10px 12px", background: "var(--bg)", color: "var(--ink)", marginTop: 5 };
  const button: React.CSSProperties = { width: "100%", padding: 12, border: 0, borderRadius: 4, color: "white", background: "var(--primary)", cursor: "pointer" };
  return <main className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)", fontFamily: "var(--sans)" }}>
    <section style={{ width: "100%", maxWidth: 430, padding: 28 }}>
      <h1 style={{ fontFamily: "var(--serif)", color: "var(--ink)", fontSize: 26 }}>基智 Agent OS</h1>
      <p style={{ color: "var(--ink2)" }}>教師智能工作台</p>
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, padding: 24, marginTop: 24 }}>
        {error && <p role="alert" style={{ color: "var(--seal)" }}>{error}</p>}
        {!providers && <p>載入登入方式…</p>}
        {providers && !Object.keys(providers).length && <p>登入尚未設定，請聯絡管理員。</p>}
        {!!credentials.length && <form onSubmit={login} style={{ display: "grid", gap: 16 }}>
          <label htmlFor="login-method">登入方式<select id="login-method" value={provider} onChange={event => { setProvider(event.target.value); setPassword(""); setError(""); }} style={field}>{credentials.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label htmlFor="login-username">帳號<input id="login-username" autoComplete="username" required maxLength={64} value={username} onChange={event => setUsername(event.target.value)} style={field} /></label>
          <label htmlFor="login-password">密碼<input id="login-password" type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={event => setPassword(event.target.value)} style={field} /></label>
          <button type="submit" disabled={busy} style={{ ...button, opacity: busy ? .6 : 1 }}>{busy ? "登入中…" : "登入"}</button>
          <p style={{ fontSize: 12, color: "var(--ink3)", margin: 0 }}>帳號由管理員建立。學校 AD 密碼不會保存在 AgentOS。</p>
        </form>}
        {providers?.google && <button onClick={() => signIn("google", { callbackUrl: "/office" })} style={{ ...button, marginTop: credentials.length ? 16 : 0 }}>以學校 Google 帳號登入</button>}
      </div>
    </section>
  </main>;
}
