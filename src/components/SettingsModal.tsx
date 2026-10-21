"use client";


export interface EngineSettings {
  engine:  "claude" | "ollama" | "lmstudio";
  baseUrl: string;
  model:   string;
}

export const DEFAULT_ENGINE_SETTINGS: EngineSettings = {engine:"ollama",baseUrl:"",model:""};
export function loadEngineSettings(): EngineSettings { return DEFAULT_ENGINE_SETTINGS; }
export function saveEngineSettings(_s: EngineSettings) { void _s; localStorage.removeItem("kc-engine-settings"); }
interface SettingsModalProps { settings:EngineSettings; onSave:(s:EngineSettings)=>void; onClose:()=>void; }
export default function SettingsModal({onSave,onClose}:SettingsModalProps) {
 return <div role="dialog" aria-modal="true" aria-label="模型設定" style={{position:"fixed",inset:0,background:"#0009",display:"grid",placeItems:"center",zIndex:100}}><section style={{background:"var(--bg-card, white)",padding:24,maxWidth:500}}><h2>本地模型</h2><p>模型與連線由管理員設定。學生資料處理不允許雲端模型、網上搜尋或自訂連線。</p><p>目前只開放合成資料驗證，請勿輸入真實學生資料。</p><button onClick={()=>{onSave(DEFAULT_ENGINE_SETTINGS);onClose();}}>知道了</button></section></div>;
}
