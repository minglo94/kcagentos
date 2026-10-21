import test from 'node:test';
import assert from 'node:assert/strict';
import {sendWhatsApp} from '../src/lib/notify';
import {ensurePath,uploadFile} from '../src/lib/gdrive';
import {createSubstitutionEvent} from '../src/lib/gcal';
import {requireSyntheticExecution} from '../src/lib/task-policy/policy';
test('legacy outbound helpers refuse missing policy even if connector credentials are configured',async()=>{
 await assert.rejects(sendWhatsApp({title:'synthetic',content:'synthetic',recipients:[]}),/POLICY_DENIED/);
 await assert.rejects(ensurePath('synthetic',new Date()),/POLICY_DENIED/);
 await assert.rejects(uploadFile(Buffer.from('synthetic'),'fixture.txt','text/plain','fixture'),/POLICY_DENIED/);
 await assert.rejects(createSubstitutionEvent({date:'2026-10-10',periods:[],classCode:'synthetic',subject:'synthetic',requesterName:'synthetic',reason:'synthetic',candidateName:'synthetic',candidateEmail:null}),/POLICY_DENIED/);
});
test('real student mode cannot be enabled by a flag',()=>{
 const old=process.env.AGENTOS_TASK_DATA_MODE;
 for(const mode of ['','student','live']){process.env.AGENTOS_TASK_DATA_MODE=mode;assert.throws(()=>requireSyntheticExecution(),/SCHOOL_EXECUTION_NOT_READY/);}
 if(old===undefined)delete process.env.AGENTOS_TASK_DATA_MODE;else process.env.AGENTOS_TASK_DATA_MODE=old;
});
