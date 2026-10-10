import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { assertCapability, restrictedPolicy } from '../src/lib/task-policy/policy';
import { localModelConfig } from '../src/lib/task-policy/local-model';
import { completeLLM } from '../src/lib/llm';

test('restricted and absent contexts deny external capabilities', () => {
  const policy = restrictedPolicy('staff');
  assert.equal(policy.classification, 'restricted');
  for (const cap of ['cloudInference','onlineSearch','browser','arbitraryHttp','externalPublish','codexReadonly','sourceRead','outputWrite','portalQuery'] as const)
    assert.throws(() => assertCapability(policy, cap), /POLICY_DENIED/);
  assert.throws(() => assertCapability(undefined, 'localInference'), /POLICY_DENIED/);
  assert.doesNotThrow(() => assertCapability(policy, 'localInference'));
});
test('local model requires explicit loopback destination and model, ignoring client overrides', () => {
  assert.throws(() => localModelConfig({}), /LOCAL_MODEL_NOT_CONFIGURED/);
  for (const url of ['https://example.test', 'http://localhost:1234', 'http://127.0.0.1:1234/path', 'http://u:p@127.0.0.1:1234'])
    assert.throws(() => localModelConfig({AGENTOS_LOCAL_MODEL_URL:url,AGENTOS_LOCAL_MODEL:'synthetic'}), /LOCAL_MODEL_NOT_CONFIGURED/);
  assert.equal(localModelConfig({AGENTOS_LOCAL_MODEL_URL:'http://127.0.0.1:1234',AGENTOS_LOCAL_MODEL:'synthetic'}).model, 'synthetic');
});
test('cloud requests and user destination overrides fail before inference', async () => {
  const policy = restrictedPolicy('staff');
  await assert.rejects(completeLLM('claude', [{role:'user',content:'synthetic'}], {policy}), /POLICY_DENIED/);
  await assert.rejects(completeLLM('ollama', [], {policy,baseUrl:'http://127.0.0.1:1'}), /POLICY_DENIED/);
});
test('a local inference redirect is never followed', async () => {
  let destinationHits = 0;
  const server = createServer((req,res) => {
    if(req.url === '/elsewhere') { destinationHits++; res.end('bad'); }
    else { res.writeHead(302,{Location:'/elsewhere'});res.end(); }
  });
  await new Promise<void>(r => server.listen(0,'127.0.0.1',r));
  const oldUrl=process.env.AGENTOS_LOCAL_MODEL_URL, oldModel=process.env.AGENTOS_LOCAL_MODEL;
  process.env.AGENTOS_LOCAL_MODEL_URL=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  process.env.AGENTOS_LOCAL_MODEL='synthetic';
  try { await assert.rejects(completeLLM('ollama', [], {policy:restrictedPolicy('staff')})); assert.equal(destinationHits,0); }
  finally { if(oldUrl===undefined)delete process.env.AGENTOS_LOCAL_MODEL_URL;else process.env.AGENTOS_LOCAL_MODEL_URL=oldUrl;if(oldModel===undefined)delete process.env.AGENTOS_LOCAL_MODEL;else process.env.AGENTOS_LOCAL_MODEL=oldModel;await new Promise<void>(r=>server.close(()=>r())); }
});
test('truncated model streams fail instead of recording an empty success',async()=>{
 const server=createServer((_req,res)=>{res.writeHead(200,{'Content-Type':'text/event-stream'});res.end('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n');});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const oldUrl=process.env.AGENTOS_LOCAL_MODEL_URL,oldModel=process.env.AGENTOS_LOCAL_MODEL;
 process.env.AGENTOS_LOCAL_MODEL_URL=`http://127.0.0.1:${(server.address() as {port:number}).port}`;process.env.AGENTOS_LOCAL_MODEL='synthetic';
 try{await assert.rejects(completeLLM('ollama',[],{policy:restrictedPolicy('staff')}),/LOCAL_MODEL_STREAM_INCOMPLETE/);}
 finally{if(oldUrl===undefined)delete process.env.AGENTOS_LOCAL_MODEL_URL;else process.env.AGENTOS_LOCAL_MODEL_URL=oldUrl;if(oldModel===undefined)delete process.env.AGENTOS_LOCAL_MODEL;else process.env.AGENTOS_LOCAL_MODEL=oldModel;await new Promise<void>(r=>server.close(()=>r()));}
});
