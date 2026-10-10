import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
const root=mkdtempSync(join(tmpdir(),"agentos-task-fixture-"));
process.env.AGENTOS_AUDIT_ROOT=root;
process.env.AGENTOS_TASK_DATA_MODE="synthetic";
process.env.AGENTOS_CODEX_WORKSPACE=process.cwd();
process.on("exit",()=>rmSync(root,{recursive:true,force:true}));
