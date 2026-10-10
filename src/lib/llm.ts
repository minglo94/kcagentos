import { assertCapability, type ExecutionPolicy } from "./task-policy/policy";
import { localModelConfig } from "./task-policy/local-model";

export type Engine = "claude" | "ollama" | "lmstudio";

export interface LLMMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LLMOptions {
  policy?: ExecutionPolicy;
  signal?: AbortSignal;
  system?: string;
  model?: string;
  maxTokens?: number;
  stream?: boolean;
  baseUrl?: string; // 本地引擎自訂 URL（覆蓋環境變數）
}



export async function* streamLLM(
  engine: Engine,
  messages: LLMMessage[],
  opts: LLMOptions = {},
): AsyncGenerator<string> {
  const { system, maxTokens = 4096 } = opts;

  assertCapability(opts.policy, engine === "claude" ? "cloudInference" : "localInference");
  if (opts.baseUrl || opts.model || !["ollama", "lmstudio"].includes(engine)) throw new Error("POLICY_DENIED");
  const config = localModelConfig();
  {
    const baseUrl = config.url;

    const apiMessages = system
      ? [{ role: "system", content: system }, ...messages]
      : messages;

    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      redirect: "error",
      signal: opts.signal ? AbortSignal.any([opts.signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        messages: apiMessages,
        stream: true,
        max_tokens: maxTokens,
      }),
    });

    if (!res.ok || !res.body)
      throw new Error("LOCAL_MODEL_UNAVAILABLE");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "", completed = false;
    try { while (true) {
      const { done, value } = await reader.read();
      if (done) { if (!completed) throw new Error("LOCAL_MODEL_STREAM_INCOMPLETE"); break; }
      buf += decoder.decode(value, { stream: true });
      if (Buffer.byteLength(buf) > 1024 * 1024) throw new Error("LOCAL_MODEL_STREAM_INVALID");
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (line === "data: [DONE]") { completed = true; return; }
        if (!line.startsWith("data: ")) continue;
        try {
          const json = JSON.parse(line.slice(6));
          const text = json.choices?.[0]?.delta?.content ?? "";
          if (text) yield text;
        } catch { throw new Error("LOCAL_MODEL_STREAM_INVALID"); }
      }
    } } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
}

export async function completeLLM(
  engine: Engine,
  messages: LLMMessage[],
  opts: LLMOptions = {},
): Promise<string> {
  let result = "";
  for await (const chunk of streamLLM(engine, messages, opts)) {
    result += chunk;
  }
  return result;
}
