// Opt-in qualification of the Zeabur review image against disposable resources only.
import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';

const suffix=randomBytes(6).toString('hex'),network=`agentos_review_net_${suffix}`,volume=`agentos_review_audit_${suffix}`;
const dbName=`agentos_review_db_${suffix}`,webName=`agentos_review_web_${suffix}`;
const dbPassword=randomBytes(24).toString('hex'),sessionSecret=randomBytes(32).toString('hex');
const url='http://127.0.0.1:3201',image='kcagentos:zeabur-review';
const environment={...process.env};
for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete environment[key];
let stage='setup';

function docker(args:string[],optional=false){
 const result=spawnSync('docker',['--host=unix:///var/run/docker.sock',...args],{env:environment,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});
 if(result.status!==0&&!optional){
  const detail=stage==='migration'?(result.stderr+result.stdout).replaceAll(dbPassword,'[redacted]').slice(-1200):'output suppressed';
  throw new Error(`Zeabur container qualification failed at ${stage}: ${detail}`);
 }
 return {ok:result.status===0,output:result.stdout.trim()};
}
const dbUrl=`postgresql://agentos_review:${dbPassword}@${dbName}:5432/agentos_review`;
const reviewEnv=[
 '-e',`DATABASE_URL=${dbUrl}`,'-e',`NEXTAUTH_URL=${url}`,'-e',`NEXTAUTH_SECRET=${sessionSecret}`,
 '-e','AGENTOS_REVIEW_MODE=synthetic','-e','AGENTOS_TASK_DATA_MODE=synthetic',
 '-e','AGENTOS_LOCAL_AUTH_ENABLED=true','-e','AGENTOS_AD_AUTH_ENABLED=false','-e','AGENTOS_AUDIT_ROOT=/data/audit',
 '-e','AGENTOS_REVIEW_ADMIN_NAME=Synthetic reviewer','-e','AGENTOS_REVIEW_ADMIN_EMAIL=reviewer@example.test',
 '-e','AGENTOS_REVIEW_ADMIN_USERNAME=review.admin','-e','AGENTOS_REVIEW_ADMIN_PASSWORD=synthetic-review-password',
];

async function main(){
 let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
 docker(['image','inspect',image]);
 docker(['network','create',network]);docker(['volume','create',volume]);
 try{
  assert.equal(docker(['run','--rm',image],true).ok,false,'review image must refuse missing settings');
  assert.equal(docker(['run','--rm',...reviewEnv,image],true).ok,false,'review image must refuse a missing persistent volume');
  stage='database start';docker(['run','-d','--name',dbName,'--network',network,'-e','POSTGRES_USER=agentos_review','-e',`POSTGRES_PASSWORD=${dbPassword}`,'-e','POSTGRES_DB=agentos_review','postgres:16']);
  for(let attempt=0;attempt<45;attempt++){
   if(docker(['exec',dbName,'pg_isready','-U','agentos_review','-d','agentos_review'],true).ok)break;
   if(attempt===44)throw new Error('Disposable PostgreSQL did not become ready');
   await new Promise(resolve=>setTimeout(resolve,1000));
  }
  stage='migration';docker(['run','--rm','--network',network,'-e',`DATABASE_URL=${dbUrl}`,'--entrypoint','npm',image,'run','db:migrate']);
  stage='web start';docker(['run','-d','--name',webName,'--network',network,'--publish','127.0.0.1:3201:3000','--mount',`type=volume,source=${volume},target=/data`,...reviewEnv,image]);
  for(let attempt=0;attempt<45;attempt++){
   try{if((await fetch(`${url}/api/review/health`,{signal:AbortSignal.timeout(2000)})).status===503)break;}catch{/* starting */}
   if(attempt===44)throw new Error('Review web did not become reachable');
   await new Promise(resolve=>setTimeout(resolve,1000));
  }
  assert.equal(docker(['exec',webName,'sh','-c',"awk '/^Uid:/ {print $2; exit}' /proc/1/status"]).output,'1000');
  assert.equal(docker(['exec',webName,'stat','-c','%a:%u','/data/audit']).output,'700:1000');
  stage='review bootstrap';docker(['exec',webName,'gosu','node:node','npm','run','review:bootstrap']);
  assert.equal((await fetch(`${url}/api/review/health`)).status,200);
  assert.equal(docker(['exec',webName,'gosu','node:node','npm','run','review:bootstrap'],true).ok,false);
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_BIN||undefined});
  const context=await browser.newContext(),page=await context.newPage();
  await page.goto(`${url}/login`);
  await page.getByLabel('帳號',{exact:true}).fill('review.admin');
  await page.getByLabel('密碼',{exact:true}).fill('synthetic-review-password');
  await page.getByRole('button',{name:'登入',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Hermes 指揮台',exact:true})).toBeVisible({timeout:30000});
  await expect(page.getByRole('button',{name:/Review synthetic Office workflow/})).toBeVisible();
  assert.equal((await context.request.get(`${url}/api/admin/task-audits`)).status(),200);
  console.log('Zeabur review image passed: isolated migration, non-root web, persistent private audit root, one-time admin/sample plan, readiness and browser login.');
 }finally{
  await browser?.close();
  docker(['rm','-f',webName],true);docker(['rm','-f',dbName],true);
  docker(['network','rm',network],true);docker(['volume','rm',volume],true);
 }
}
void main().catch(error=>{console.error(error instanceof Error?error.message:'Review image qualification failed');process.exitCode=1;});
