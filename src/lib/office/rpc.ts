import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";

export type RpcEvent = { method: string; params?: unknown };
export type ServerRequestHandler = (event: RpcEvent) => Promise<unknown>;
export interface RpcTransport {
  request<T = unknown>(method: string, params?: unknown, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<T>;
  notify(method: string, params?: unknown): void;
  subscribe(listener: (event: RpcEvent) => void): () => void;
  dispose(): void;
}

/** Newline-delimited JSON RPC. Never expose child stderr or remote error messages. */
export class StdioRpcTransport implements RpcTransport {
  private sequence = 0;
  private closed = false;
  private pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; cleanup(): void }>();
  private listeners = new Set<(event: RpcEvent) => void>();
  private child: ChildProcessWithoutNullStreams;
  private lines: ReturnType<typeof createInterface>;

  constructor(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv; onRequest?: ServerRequestHandler; timeoutMs?: number } = {}) {
    this.defaultTimeout = options.timeoutMs ?? 30_000;
    this.child = spawn(command, args, { cwd: options.cwd, env: options.env, shell: false, windowsHide: true, stdio: "pipe" });
    this.lines = createInterface({ input: this.child.stdout, crlfDelay: Infinity });
    this.child.stderr.resume();
    this.child.stdin.on("error", () => this.fail("RPC input closed"));
    this.child.on("error", () => this.fail("RPC process could not start"));
    this.child.on("close", () => this.fail("RPC process closed"));
    this.lines.on("line", (line) => { void this.receive(line, options.onRequest); });
  }
  private defaultTimeout: number;
  private write(message: unknown) {
    if (this.closed) throw new Error("RPC transport closed");
    this.child.stdin.write(JSON.stringify(message) + "\n");
  }
  request<T = unknown>(method: string, params?: unknown, options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<T> {
    if (this.closed) return Promise.reject(new Error("RPC transport closed"));
    if (options.signal?.aborted) return Promise.reject(new Error("RPC request cancelled"));
    const id = ++this.sequence;
    return new Promise<T>((resolve, reject) => {
      const finishError = (message: string) => {
        const entry = this.pending.get(id);
        if (!entry) return;
        this.pending.delete(id); entry.cleanup(); reject(new Error(message));
      };
      const abort = () => finishError("RPC request cancelled");
      const timer = setTimeout(() => finishError("RPC request timed out"), options.timeoutMs ?? this.defaultTimeout);
      const cleanup = () => { clearTimeout(timer); options.signal?.removeEventListener("abort", abort); };
      this.pending.set(id, { resolve: value => resolve(value as T), reject, cleanup });
      options.signal?.addEventListener("abort", abort, { once: true });
      try { this.write({ id, method, params }); } catch { finishError("RPC request could not be sent"); }
    });
  }
  notify(method: string, params?: unknown) { this.write({ method, params }); }
  subscribe(listener: (event: RpcEvent) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private async receive(line: string, handler?: ServerRequestHandler) {
    let message: Record<string, unknown>;
    try { message = JSON.parse(line); } catch { this.fail("Invalid RPC response"); return; }
    if (!message || typeof message !== "object" || Array.isArray(message)) { this.fail("Invalid RPC response"); return; }
    if (typeof message.method === "string") {
      const event = { method: message.method, params: message.params };
      if (typeof message.id === "number" || typeof message.id === "string") {
        try {
          const result = handler ? await handler(event) : undefined;
          if (!this.closed) this.write(result === undefined
            ? { id: message.id, error: { code: -32601, message: "Request not supported" } }
            : { id: message.id, result });
        } catch { if (!this.closed) this.write({ id: message.id, error: { code: -32603, message: "Request denied" } }); }
      } else {
        this.listeners.forEach(listener => { try { listener(event); } catch { /* Subscribers cannot break transport. */ } });
      }
      return;
    }
    if (typeof message.id !== "number") return;
    const entry = this.pending.get(message.id);
    if (!entry) return;
    this.pending.delete(message.id); entry.cleanup();
    if ("error" in message) entry.reject(new Error("RPC server rejected request"));
    else if ("result" in message) entry.resolve(message.result);
    else entry.reject(new Error("Invalid RPC response"));
  }
  private fail(reason: string) {
    if (this.closed) return;
    this.closed = true;
    this.pending.forEach(entry => { entry.cleanup(); entry.reject(new Error(reason)); });
    this.pending.clear(); this.listeners.clear(); this.lines.close();
    this.child.kill();
  }
  dispose() { this.fail("RPC transport disposed"); }
}
