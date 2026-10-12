import { CodexAdapter } from "./codex";

export async function inspectWithCodex(instructions: string, signal: AbortSignal): Promise<string> {
  const command = process.env.AGENTOS_CODEX_COMMAND;
  const cwd = process.env.AGENTOS_CODEX_WORKSPACE;
  const codexHome = process.env.AGENTOS_CODEX_HOME;
  if (!command || !cwd || !codexHome) throw new Error("CODEX_NOT_CONFIGURED");
  const adapter = CodexAdapter.launch({ command, cwd, codexHome });
  let threadId: string | undefined, turnId: string | undefined;
  try {
    await adapter.initialize();
    if (signal.aborted) throw new Error("JOB_INTERRUPTED");
    threadId = await adapter.startThread(cwd);
    return await new Promise<string>((resolve, reject) => {
      let answer = "", done = false;
      const finish = (error?: Error) => {
        if (done) return;
        done = true; clearTimeout(timer); unsubscribe(); signal.removeEventListener("abort", abort);
        if (error) reject(error); else resolve(answer);
      };
      const abort = () => {
        if (threadId && turnId) void adapter.interrupt(threadId, turnId).catch(() => {});
        finish(new Error("JOB_INTERRUPTED"));
      };
      const unsubscribe = adapter.subscribe(event => {
        const params = event.params as { threadId?: string; delta?: string; turn?: { id: string; status: string } } | undefined;
        if (!params || params.threadId !== threadId) return;
        if (event.method === "item/agentMessage/delta") {
          answer += params.delta ?? "";
          if (answer.length > 20_000) abort();
        }
        if (event.method === "turn/completed") finish(params.turn?.status === "completed" ? undefined : new Error("CODEX_TURN_FAILED"));
      });
      const timer = setTimeout(abort, 180_000);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) { abort(); return; }
      void adapter.startTurn(threadId!, `Read-only inspection. Do not edit files, request elevated permissions, push, deploy, or contact external services. Return findings and verification limitations.\n\n${instructions}`, signal)
        .then(result => { turnId = result.turn.id; if (signal.aborted) abort(); })
        .catch(() => finish(new Error("CODEX_TURN_FAILED")));
    });
  } finally { adapter.dispose(); }
}
