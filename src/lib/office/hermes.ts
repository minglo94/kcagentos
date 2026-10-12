import { spawn } from "node:child_process";
import path from "node:path";
import { planSchema, type OfficePlan } from "./plan";

export function planWithHermes(goal: string, team: string, signal: AbortSignal): Promise<OfficePlan> {
  const python = process.env.HERMES_PYTHON;
  const source = process.env.HERMES_SOURCE_DIR;
  const profile = process.env.AGENTOS_HERMES_HOME;
  if (!python || !source || !profile) return Promise.reject(new Error("HERMES_NOT_CONFIGURED"));
  return new Promise((resolve, reject) => {
    const child = spawn(python, [path.resolve("scripts/hermes_planner.py")], {
      shell: false, windowsHide: true, cwd: source, stdio: "pipe",
      env: { NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP,
        USERPROFILE: profile, HOME: profile, APPDATA: profile, LOCALAPPDATA: profile,
        HERMES_HOME: profile, PYTHONPATH: source, PYTHONIOENCODING: "utf-8", PYTHONUNBUFFERED: "1" },
    });
    let output = "", settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal.removeEventListener("abort", abort);
      if (error) { child.kill(); reject(error); }
      else {
        try { resolve(planSchema.parse(JSON.parse(output))); }
        catch { reject(new Error("HERMES_INVALID_PLAN")); }
      }
    };
    const abort = () => finish(new Error("JOB_INTERRUPTED"));
    const timer = setTimeout(() => finish(new Error("HERMES_TIMEOUT")), 120_000);
    signal.addEventListener("abort", abort, { once: true });
    child.stderr.resume(); // Never persist model stderr or private environment details.
    child.stdout.on("data", (buffer: Buffer) => {
      output += buffer.toString("utf-8");
      if (Buffer.byteLength(output) > 128_000) finish(new Error("HERMES_OUTPUT_TOO_LARGE"));
    });
    child.on("error", () => finish(new Error("HERMES_START_FAILED")));
    child.stdin.on("error", () => finish(new Error("HERMES_INPUT_FAILED")));
    child.on("close", code => finish(code === 0 ? undefined : new Error("HERMES_UNAVAILABLE")));
    if (signal.aborted) { abort(); return; }
    child.stdin.end(JSON.stringify({ goal, team }));
  });
}
