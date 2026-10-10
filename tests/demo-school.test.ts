import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('one-command school demo uses disposable local fixtures and completes audited work',()=>{
 const env={...process.env};delete env.DATABASE_URL;
 const run=spawnSync(process.execPath,['--import','tsx','tests/demo-school-cli.ts'],{cwd:process.cwd(),env,encoding:'utf8',timeout:120000});
 assert.equal(run.status,0,run.stderr);
 const report=JSON.parse(run.stdout.trim());
 assert.equal(report.mode,'synthetic');assert.equal(report.model,'loopback-fake');
 assert.equal(report.jobStatus,'SUCCEEDED');assert.equal(report.portalStatus,'DELIVERY_UNKNOWN');
 assert.equal(report.portalDelivered,false);assert.equal(report.modelCalls,1);
 assert.ok(report.auditExecutors.includes('local-model'));
 assert.ok(report.auditExecutors.includes('file-read'));
 assert.ok(report.auditExecutors.includes('file-write'));
 assert.ok(report.auditExecutors.includes('manual.evidence'));
 assert.equal(report.deniedCapabilities,true);
 assert.equal(report.verifiedInputs,report.auditExecutors.length);
 assert.equal(report.verifiedOutputs,report.auditExecutors.length);
 assert.ok(report.adminAuditReads>=report.verifiedInputs+report.verifiedOutputs);
 assert.equal(report.portalAuditActions,4);
});
