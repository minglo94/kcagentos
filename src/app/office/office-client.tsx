"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { OfficePlan } from "@/lib/office/plan";
import styles from "./office.module.css";

type ListJob = { id: string; goal: string; team: string; status: string; errorCode: string | null };
type Job = ListJob & { plan: OfficePlan | null; planVersion: number; planHash: string | null; approvedVersion: number | null; workerActive: boolean;
  steps: { key: string; status: string; result: string | null }[]; events: { id: number; type: string; createdAt: string }[] };
const labels: Record<string, string> = { PLANNING: "待總管規劃", PENDING_PLAN_APPROVAL: "待批准計劃", QUEUED: "已排隊", RUNNING: "執行中", WAITING_INPUT: "待人工輸入", PAUSED: "已暫停", SUCCEEDED: "已完成", FAILED: "失敗", CANCELLED: "已取消" };
const names: Record<string, string> = { hermes: "Hermes 總管", archie: "Archie 編碼", reviewer: "Reviewer 審查", bob: "Bob 運維", tesla: "Tesla 測試", clerk: "Clerk 資料", andy: "Andy 班務", donna: "Donna 學習", iris: "Iris 支援", wendy: "Wendy 關顧", quinn: "Quinn 問卷", flora: "Flora 發展", carla: "Carla 通訊", ada: "Ada 課程", ethan: "Ethan 試卷" };
const errorLabels: Record<string, string> = { HERMES_NOT_CONFIGURED: "Hermes 本地模型尚未設定。請按接駁指南設定專用 profile。", HERMES_UNAVAILABLE: "Hermes 或本地模型未能回應，請檢查設定。", HERMES_INVALID_PLAN: "模型未能提供有效計劃，請重新規劃。", CODEX_NOT_CONFIGURED: "Codex 唯讀執行器尚未設定。", SERVICE_UNAVAILABLE: "服務或資料庫暫時不可用。", STALE_PLAN: "計劃已更新，請重新檢視後批准。", JOB_NOT_FOUND: "找不到可存取的任務。" };
async function jsonRequest(url: string, body?: unknown) {
  const response = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(errorLabels[result.error] || "操作未完成，請重新載入檢查狀態。");
  return result;
}

export default function OfficeClient() {
  const [jobs, setJobs] = useState<ListJob[]>([]), [selected, setSelected] = useState<string | null>(null), [job, setJob] = useState<Job | null>(null);
  const selectedRef = useRef(selected); selectedRef.current = selected;
  const [goal, setGoal] = useState(""), [team, setTeam] = useState("school"), [error, setError] = useState(""), [busy, setBusy] = useState(false), [evidence, setEvidence] = useState("");
  const refresh = useCallback(async () => {
    const list = await jsonRequest("/api/jobs"); setJobs(list.jobs);
  }, []);
  const detail = useCallback(async (id: string) => { const data = await jsonRequest(`/api/jobs/${id}`); if (selectedRef.current === id) setJob(data); }, []);
  useEffect(() => { setEvidence(""); }, [job?.planVersion]);
  useEffect(() => { void refresh().catch(e => setError(e.message)); const timer = setInterval(() => void refresh().catch(e => setError(e.message)), 10_000); return () => clearInterval(timer); }, [refresh]);
  useEffect(() => {
    setJob(null); setEvidence("");
    if (!selected) return;
    let active = true;
    const load = async () => { try { const data = await jsonRequest(`/api/jobs/${selected}`); if (active) setJob(data); } catch (e) { if (active) setError((e as Error).message); } };
    void load();
    const events = new EventSource(`/api/jobs/${selected}/events`);
    events.onmessage = () => { void load(); void refresh().catch(() => {}); };
    const timer = setInterval(() => void load(), 10_000);
    // EventSource reconnects with Last-Event-ID; do not display network silence as progress.
    return () => { active = false; events.close(); clearInterval(timer); };
  }, [selected, refresh]);
  async function perform(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true); setError("");
    try { await action(); await refresh(); if (selected) await detail(selected); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const complete = job?.steps.filter(s => s.status === "SUCCEEDED").length ?? 0;
  const waiting = job?.steps.find(s => s.status === "WAITING_INPUT");
  const agents = ["hermes", ...(team === "school" ? ["clerk", "andy", "donna", "iris", "wendy", "quinn", "flora", "carla", "ada", "ethan"] : ["archie", "reviewer", "bob", "tesla"])];
  return <main className={styles.page}>
    <header className={styles.header}><div><p className={styles.eyebrow}>KCSS · AGENTOS</p><h1>Hermes 指揮台</h1></div><Link href="/dashboard">校務 Dashboard ↗</Link><span className={styles.badge}>基礎接駁版</span></header>
    <p className={styles.notice}>首版只支援計劃批准、人工步驟及已設定的 Codex 唯讀檢查。校務 Portal、排程與對外發送尚未接通。請勿輸入學生姓名或個案內容。</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.layout}>
      <section className={styles.panel} aria-labelledby="supervisor-title"><p className={styles.eyebrow}>01 · SUPERVISOR</p><h2 id="supervisor-title">跟總管交代目標</h2>
        <form onSubmit={e => { e.preventDefault(); void perform(async () => { const created = await jsonRequest("/api/jobs", { goal, team }); setSelected(created.id); setGoal(""); }); }}>
          <label htmlFor="team">工作團隊</label><select id="team" value={team} onChange={e => setTeam(e.target.value)}><option value="school">學校團隊</option><option value="development">開發團隊</option></select>
          <label htmlFor="goal">工作目標</label><textarea id="goal" value={goal} onChange={e => setGoal(e.target.value)} maxLength={4000} required minLength={3} rows={5} placeholder="例如：規劃每週班主任摘要的驗收步驟" />
          <button disabled={busy || goal.trim().length < 3} type="submit">交給 Hermes 規劃</button>
        </form>
        <div className={styles.message}><strong>Hermes</strong><p>{job?.plan?.summary || (job ? labels[job.status] : "提交目標後，計劃會保存為任務，待你批准才開始執行。")}</p>{job?.errorCode && <p>{errorLabels[job.errorCode] || "執行器未能完成，請檢查交接紀錄及重新規劃。"}</p>}</div>
        <p className={styles.muted}>Worker 必須另外啟動；關閉頁面不影響已保存的任務。</p>
      </section>
      <section className={styles.panel} aria-labelledby="office-title"><p className={styles.eyebrow}>02 · OFFICE & JOBS</p><h2 id="office-title">團隊與任務</h2>
        <div className={styles.office} aria-label="根據真實任務狀態顯示的團隊席位">{agents.map(agent => {
          const status = agent === "hermes" && job?.status === "PLANNING" && job.workerActive ? "RUNNING" : job?.plan?.steps.filter(s => s.agent === agent).map(s => job.steps.find(row => row.key === s.id)?.status).find(s => s === "RUNNING" || s === "WAITING_INPUT") || "IDLE";
          return <div key={agent} className={styles.desk}><span className={`${styles.pixel} ${status === "RUNNING" ? styles.working : ""}`} aria-hidden="true" /><strong>{names[agent]}</strong><small>{status === "RUNNING" ? "執行中" : status === "WAITING_INPUT" ? "待人工" : "待命"}</small></div>;
        })}</div>
        <p className={styles.muted}>席位顯示真實工作狀態；完整 Pixel Agents 動畫橋接待後續整合。</p>
        <div className={styles.joblist}>{jobs.length === 0 && <p>尚未建立任務。</p>}{jobs.map(row => <button key={row.id} className={`${styles.job} ${selected === row.id ? styles.selected : ""}`} onClick={() => { setSelected(row.id); setTeam(row.team); }}><strong>{row.goal}</strong><span>{labels[row.status] || row.status}</span></button>)}</div>
        {job?.plan && <><h3>計劃步驟 · {complete}/{job.plan.steps.length} 已完成</h3><ol className={styles.steps}>{job.plan.steps.map(step => <li key={step.id}><strong>{step.title}</strong><small>{names[step.agent]} · {step.executor === "manual" ? "人工執行" : "Codex 唯讀"} · {labels[job.steps.find(s => s.key === step.id)?.status || "QUEUED"] || "待執行"}</small><p>{step.instructions}</p>{job.steps.find(s => s.key === step.id)?.result && <pre>{job.steps.find(s => s.key === step.id)?.result}</pre>}</li>)}</ol></>}
      </section>
      <section className={styles.panel} aria-labelledby="approval-title"><p className={styles.eyebrow}>03 · APPROVALS</p><h2 id="approval-title">待你決定</h2>
        {!job && <p className={styles.muted}>選擇任務查看計劃與批准。</p>}
        {job && <><p><span className={styles.badge}>{labels[job.status]}</span></p>{job.plan && <><h3>驗收條件</h3><ul>{job.plan.acceptance.map((item, i) => <li key={i}>{item}</li>)}</ul><p className={styles.muted}>計劃版本 {job.planVersion} · 批准只適用於這份內容。</p></>}
          {job.status === "PENDING_PLAN_APPROVAL" && <div className={styles.actions}><button disabled={busy} onClick={() => void perform(() => jsonRequest(`/api/jobs/${job.id}/approvals`, { version: job.planVersion, hash: job.planHash, decision: "approve" }))}>批准計劃</button><button disabled={busy} className={styles.secondary} onClick={() => void perform(() => jsonRequest(`/api/jobs/${job.id}/approvals`, { version: job.planVersion, hash: job.planHash, decision: "reject" }))}>退回計劃</button></div>}
          {waiting && job.status === "WAITING_INPUT" && <form onSubmit={e => { e.preventDefault(); void perform(async () => { await jsonRequest(`/api/jobs/${job.id}/evidence`, { key: waiting.key, evidence, version: job.planVersion, hash: job.planHash }); setEvidence(""); }); }}><label htmlFor="evidence">人工完成證據</label><textarea id="evidence" rows={4} value={evidence} onChange={e => setEvidence(e.target.value)} required minLength={3} maxLength={4000} placeholder="填寫已完成的核對及結果；勿填學生原文" /><button disabled={busy || evidence.trim().length < 3}>保存證據及繼續</button></form>}
          <div className={styles.actions}>{!["SUCCEEDED", "CANCELLED"].includes(job.status) && <button disabled={busy} className={styles.secondary} onClick={() => void perform(() => jsonRequest(`/api/jobs/${job.id}/control`, { action: "cancel" }))}>取消工作</button>}{["RUNNING", "QUEUED", "WAITING_INPUT"].includes(job.status) && <button disabled={busy} className={styles.secondary} onClick={() => void perform(() => jsonRequest(`/api/jobs/${job.id}/control`, { action: "pause" }))}>暫停</button>}{job.status === "PAUSED" && job.approvedVersion === job.planVersion && <button disabled={busy} onClick={() => void perform(() => jsonRequest(`/api/jobs/${job.id}/control`, { action: "resume" }))}>繼續</button>}{["PAUSED", "FAILED", "PENDING_PLAN_APPROVAL"].includes(job.status) && <button disabled={busy} className={styles.secondary} onClick={() => void perform(() => jsonRequest(`/api/jobs/${job.id}/control`, { action: "replan" }))}>重新規劃</button>}</div>
          <h3>事件時間線</h3><ul className={styles.timeline}>{job.events.slice(-15).map(event => <li key={event.id}><time>{new Date(event.createdAt).toLocaleTimeString("zh-HK", { timeZone: "Asia/Hong_Kong" })}</time><span>{event.type}</span></li>)}</ul>
        </>}
      </section>
    </div>
  </main>;
}
