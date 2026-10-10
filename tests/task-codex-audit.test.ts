import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {inspectWithCodex} from '../src/lib/office/readonly';
import {CodexAdapter} from '../src/lib/office/codex';
import type {ExecutionPolicy} from '../src/lib/task-policy/policy';
import type {RpcEvent} from '../src/lib/office/rpc';
test('Codex journals actual input and partial deltas before a failed turn rejects',async()=>{
 let listener:(e:RpcEvent)=>void=()=>{};let prompt='';const recorded:string[]=[];let input='';
 const adapter={initialize:async()=>{},startThread:async()=> 'thread',subscribe:(fn:typeof listener)=>{listener=fn;return()=>{};},startTurn:async(_id:string,text:string)=>{prompt=text;queueMicrotask(()=>{listener({method:'item/agentMessage/delta',params:{threadId:'thread',delta:'partial output'}});listener({method:'turn/completed',params:{threadId:'thread',turn:{id:'turn',status:'failed'}}});});return{turn:{id:'turn',status:'running'}};},interrupt:async()=>{},dispose:()=>{}};
 const launch=mock.method(CodexAdapter,'launch',()=>adapter as unknown as CodexAdapter);
 process.env.AGENTOS_CODEX_COMMAND='synthetic';process.env.AGENTOS_CODEX_WORKSPACE=process.cwd();process.env.AGENTOS_CODEX_HOME='/synthetic/agentos-codex';
 const policy:ExecutionPolicy={version:1,actorId:'synthetic',classification:'development',sourceIds:[],outputRootId:null};
 try {await assert.rejects(inspectWithCodex('synthetic instructions',new AbortController().signal,policy,{input:async text=>{input=text;},output:async text=>{recorded.push(text);}}),/CODEX_TURN_FAILED/);assert.deepEqual(recorded,['partial output']);assert.equal(input,prompt);assert.match(input,/Read-only inspection/);}
 finally{launch.mock.restore();}
});
