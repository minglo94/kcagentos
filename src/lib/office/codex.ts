import { StdioRpcTransport, type RpcEvent, type RpcTransport } from "./rpc";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { homedir } from "node:os";

export type CodexApproval = (request: RpcEvent) => Promise<"accept" | "decline">;

export function isolatedCodexEnvironment(codexHome: string | undefined, cwd: string): NodeJS.ProcessEnv {
  if (!codexHome || !isAbsolute(codexHome) || basename(codexHome) !== "agentos-codex") {
    throw new Error("A dedicated absolute agentos-codex home is required");
  }
  if (!existsSync(codexHome) || lstatSync(codexHome).isSymbolicLink() || basename(realpathSync(codexHome)) !== "agentos-codex") {
    throw new Error("Codex home must be an existing dedicated directory");
  }
  const config = join(codexHome, "config.toml");
  if (existsSync(config) && (lstatSync(config).isSymbolicLink() || readFileSync(config, "utf8").split(/\r?\n/).some(line => line.trim() && !line.trim().startsWith("#")))) {
    throw new Error("Dedicated Codex configuration must be absent or empty");
  }
  for (const entry of ["plugins", "skills", "hooks", "AGENTS.md"]) {
    if (existsSync(join(codexHome, entry))) throw new Error("Dedicated Codex home contains unsupported customization");
  }
  // Project configuration is discovered upward by Codex; reject it before starting.
  // User-level configuration is replaced by CODEX_HOME and HOME below.
  let directory = resolve(cwd);
  while (directory !== resolve(homedir())) {
    if (existsSync(join(directory, ".codex", "config.toml"))) throw new Error("Project Codex configuration is not allowed");
    const parent = dirname(directory); if (parent === directory) break; directory = parent;
  }
  const env: NodeJS.ProcessEnv = { NODE_ENV: "production", CODEX_HOME: codexHome, HOME: codexHome, USERPROFILE: codexHome };
  for (const key of ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "TMPDIR"]) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  return env;
}

/** Permissions are denied unless the host explicitly supplies approval. */
export async function handleCodexRequest(request: RpcEvent, approve?: CodexApproval): Promise<unknown> {
  if (request.method === "item/commandExecution/requestApproval" || request.method === "item/fileChange/requestApproval") {
    let decision: "accept" | "decline" = "decline";
    if (approve) { try { decision = await approve(request) === "accept" ? "accept" : "decline"; } catch { /* Fail closed. */ } }
    return { decision };
  }
  // Do not grant permission expansion, credentials, dynamic tools, or user answers implicitly.
  return undefined;
}

export class CodexAdapter {
  constructor(private transport: RpcTransport) {}
  static launch(options: { command: string; cwd: string; codexHome: string; approve?: CodexApproval }) {
    const env = isolatedCodexEnvironment(options.codexHome, options.cwd);
    const args = ["app-server", "--strict-config", "-c", 'cli_auth_credentials_store="file"', "-c", 'web_search="disabled"', "-c", 'shell_environment_policy.inherit="none"', "--enable", "skip_host_skill_discovery"];
    for (const feature of ["apps", "plugins", "remote_plugin", "browser_use", "browser_use_external", "multi_agent", "multi_agent_v2", "skill_mcp_dependency_install"]) args.push("--disable", feature);
    return new CodexAdapter(new StdioRpcTransport(options.command, args, {
      cwd: options.cwd, env, onRequest: event => handleCodexRequest(event, options.approve),
    }));
  }
  async initialize() {
    const result = await this.transport.request("initialize", { clientInfo: { name: "kcagentos", title: "KC AgentOS", version: "0.1.0" } });
    this.transport.notify("initialized");
    return result;
  }
  async startThread(cwd: string) {
    const result = await this.transport.request<{ thread: { id: string } }>("thread/start", {
      cwd, sandbox: "read-only", approvalPolicy: "on-request", approvalsReviewer: "user",
    });
    return result.thread.id;
  }
  startTurn(threadId: string, prompt: string, signal?: AbortSignal) {
    return this.transport.request<{ turn: { id: string; status: string } }>("turn/start", {
      threadId, input: [{ type: "text", text: prompt, text_elements: [] }],
      sandboxPolicy: { type: "readOnly", networkAccess: false }, approvalPolicy: "on-request", approvalsReviewer: "user",
    }, { signal });
  }
  interrupt(threadId: string, turnId: string) { return this.transport.request("turn/interrupt", { threadId, turnId }); }
  subscribe(listener: (event: RpcEvent) => void) { return this.transport.subscribe(listener); }
  dispose() { this.transport.dispose(); }
}
