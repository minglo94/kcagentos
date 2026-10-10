import {createHash,randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat,realpath,open,mkdir,link,unlink,type FileHandle} from 'node:fs/promises';
import {isAbsolute,resolve,relative,extname} from 'node:path';
import type {ExecutionPolicy} from './policy';

type Env=Record<string,string|undefined>;
type Config={sources:Record<string,string>;output:{id:string;path:string};grants:Record<string,{sourceIds:string[];outputRootId:string|null}>;hash:string};
const MAX_FILE_BYTES=1024*1024;
const allowedExtensions=new Set(['.txt','.md','.csv','.json']);
const idPattern=/^[A-Za-z0-9_-]{1,64}$/;
const uuidPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const deny=()=>new Error('FILE_ACCESS_DENIED');
function segments(path:string):string[] {
 if(!path || path.length>240 || path.includes('\\') || path.includes('\0') || isAbsolute(path) || /^[A-Za-z]:/.test(path))throw deny();
 const parts=path.split('/');
 if(parts.length>8 || parts.some(p=>!p || p==='.' || p==='..' || p.length>100 || /[\x00-\x1f]/.test(p)))throw deny();
 return parts;
}
function ordinaryFile(name:string) {if(!allowedExtensions.has(extname(name).toLowerCase()))throw deny();}
function inside(parent:string,child:string) {const rel=relative(parent,child);return !rel || (rel!=='..' && !rel.startsWith('../') && !isAbsolute(rel));}
async function canonicalDirectory(path:string,privateOutput=false):Promise<string> {
 if(!isAbsolute(path) || path!==resolve(path))throw new Error('FILE_CONFIG_INVALID');
 const info=await lstat(path);if(!info.isDirectory() || info.isSymbolicLink() || await realpath(path)!==path)throw new Error('FILE_CONFIG_INVALID');
 if(inside(process.cwd(),path))throw new Error('FILE_CONFIG_INVALID');
 if(privateOutput && ((info.mode&0o077)!==0 || info.uid!==process.getuid?.()))throw new Error('FILE_CONFIG_INVALID');
 return path;
}
async function config(env:Env=process.env):Promise<Config|null> {
 const {AGENTOS_FILE_SOURCES:s,AGENTOS_FILE_OUTPUT:o,AGENTOS_FILE_GRANTS:g}=env;
 if(!s && !o && !g)return null;
 if(!s || !o || !g)throw new Error('FILE_CONFIG_INVALID');
 try {
  const sources=JSON.parse(s),output=JSON.parse(o),grants=JSON.parse(g);
  if(!sources || Array.isArray(sources) || typeof sources!=='object' || !output || Array.isArray(output) || !grants || Array.isArray(grants) || typeof grants!=='object')throw new Error();
  if(!idPattern.test(output.id) || typeof output.path!=='string' || Object.keys(output).sort().join(',')!=='id,path')throw new Error();
  const inputEntries=Object.entries(sources);
  if(!inputEntries.length || inputEntries.length>32 || inputEntries.some(([id,p])=>!idPattern.test(id) || typeof p!=='string' || id===output.id))throw new Error();
  const canonicalSources:Record<string,string>=Object.create(null);
  for(const [id,p] of inputEntries)canonicalSources[id]=await canonicalDirectory(p as string);
  const outputPath=await canonicalDirectory(output.path,true);
  const paths=[...Object.values(canonicalSources),outputPath];
  if(paths.some((a,i)=>paths.some((b,j)=>i!==j && inside(a,b))))throw new Error();
  if(env.AGENTOS_AUDIT_ROOT){const audit=await canonicalDirectory(env.AGENTOS_AUDIT_ROOT,true);if(paths.some(path=>inside(path,audit)||inside(audit,path)))throw new Error();}
  const validGrants:Config['grants']=Object.create(null);
  for(const [actor,grant] of Object.entries(grants)){
   if(!actor || !grant || typeof grant!=='object' || Array.isArray(grant))throw new Error();
   const entry=grant as Record<string,unknown>;
   if(Object.keys(entry).sort().join(',')!=='outputRootId,sourceIds' || !Array.isArray(entry.sourceIds) || entry.sourceIds.length>32 || entry.sourceIds.some(id=>typeof id!=='string' || !Object.hasOwn(canonicalSources,id)) || new Set(entry.sourceIds).size!==entry.sourceIds.length || (entry.outputRootId!==null && entry.outputRootId!==output.id))throw new Error();
   validGrants[actor]={sourceIds:entry.sourceIds as string[],outputRootId:entry.outputRootId as string|null};
  }
  const hash=createHash('sha256').update(JSON.stringify([Object.entries(canonicalSources).sort(),output.id,outputPath,Object.entries(validGrants).sort()])).digest('hex');
  return {sources:canonicalSources,output:{id:output.id,path:outputPath},grants:validGrants,hash};
 }catch{throw new Error('FILE_CONFIG_INVALID');}
}
export async function configuredFileScope(actorId:string,env:Env=process.env):Promise<{sourceIds:string[];outputRootId:string|null;fileConfigHash?:string}> {
 const c=await config(env);
 if(!c)return {sourceIds:[],outputRootId:null};
 const grant=c.grants[actorId];return {sourceIds:grant?[...grant.sourceIds]:[],outputRootId:grant?.outputRootId??null,fileConfigHash:c.hash};
}
async function authorized(policy:ExecutionPolicy,c:Config|null,env:Env) {
 if(env.AGENTOS_TASK_DATA_MODE!=='synthetic')throw new Error('SCHOOL_EXECUTION_NOT_READY');
 if(!c || policy.fileConfigHash!==c.hash)throw new Error('POLICY_DENIED');
 const grant=c.grants[policy.actorId];
 if(!grant || JSON.stringify([...grant.sourceIds].sort())!==JSON.stringify([...policy.sourceIds].sort()) || grant.outputRootId!==policy.outputRootId)throw new Error('POLICY_DENIED');
}
async function rootHandle(path:string):Promise<FileHandle> {
 const before=await lstat(path);
 const handle=await open(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
 const after=await handle.stat();
 if(!after.isDirectory() || before.dev!==after.dev || before.ino!==after.ino){await handle.close();throw deny();}
 return handle;
}
async function childDirectory(parent:FileHandle,name:string):Promise<FileHandle> {
 return open(`/proc/self/fd/${parent.fd}/${name}`,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
}
function mapReadError(error:unknown):Error {
 const code=(error as NodeJS.ErrnoException).code;
 if(code==='ENOENT')return new Error('FILE_SOURCE_UNAVAILABLE');
 if(error instanceof Error && ['FILE_ACCESS_DENIED','FILE_TOO_LARGE','FILE_SOURCE_UNAVAILABLE'].includes(error.message))return error;
 return deny();
}
export async function readControlledFile(policy:ExecutionPolicy,sourceId:string,relativePath:string,env:Env=process.env) {
 const c=await config(env);await authorized(policy,c,env);
 if(!policy.sourceIds.includes(sourceId) || !c?.sources[sourceId])throw new Error('POLICY_DENIED');
 const parts=segments(relativePath);ordinaryFile(parts.at(-1)!);
 const handles:FileHandle[]=[];
 try {
  let dir=await rootHandle(c.sources[sourceId]);handles.push(dir);
  for(const part of parts.slice(0,-1)){dir=await childDirectory(dir,part);handles.push(dir);}
  const file=await open(`/proc/self/fd/${dir.fd}/${parts.at(-1)}`,constants.O_RDONLY|constants.O_NOFOLLOW);handles.push(file);
  const info=await file.stat();if(!info.isFile())throw deny();if(info.size>MAX_FILE_BYTES)throw new Error('FILE_TOO_LARGE');
  const bounded=Buffer.alloc(MAX_FILE_BYTES+1);let used=0;
  while(used<bounded.length){const {bytesRead}=await file.read(bounded,used,bounded.length-used,null);if(!bytesRead)break;used+=bytesRead;}
  if(used>MAX_FILE_BYTES)throw new Error('FILE_TOO_LARGE');
  const content=bounded.subarray(0,used);
  const text=new TextDecoder('utf-8',{fatal:true}).decode(content);
  return {sourceId,path:relativePath,text,bytes:content.byteLength,sha256:createHash('sha256').update(content).digest('hex'),readAt:new Date().toISOString()};
 }catch(e){throw mapReadError(e);}finally{await Promise.all(handles.map(h=>h.close().catch(()=>{})));}
}
async function publishExclusive(dir:FileHandle,name:string,content:Uint8Array) {
 const temporary=`.${randomUUID()}.tmp`;
 const tempPath=`/proc/self/fd/${dir.fd}/${temporary}`,destination=`/proc/self/fd/${dir.fd}/${name}`;
 const file=await open(tempPath,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 try {await file.writeFile(content);await file.sync();}finally{await file.close();}
 try {await link(tempPath,destination);}finally{await unlink(tempPath).catch(()=>{});}
}
function actorDirectory(actorId:string) {return `.staged-${createHash('sha256').update(actorId).digest('hex').slice(0,32)}`;}
export async function stageControlledOutput(policy:ExecutionPolicy,attemptId:string,name:string,content:string,env:Env=process.env) {
 const c=await config(env);await authorized(policy,c,env);
 if(!c || policy.outputRootId!==c.output.id)throw new Error('POLICY_DENIED');
 if(!uuidPattern.test(attemptId) || segments(name).length!==1)throw deny();ordinaryFile(name);
 const bytes=Buffer.from(content,'utf8');if(bytes.byteLength>MAX_FILE_BYTES)throw new Error('FILE_TOO_LARGE');
 const root=await rootHandle(c.output.path);
 let actor:FileHandle|undefined;
 try {
  const directory=actorDirectory(policy.actorId);
  await mkdir(`/proc/self/fd/${root.fd}/${directory}`,{mode:0o700}).catch(e=>{if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;});await root.sync();
  actor=await childDirectory(root,directory);const info=await actor.stat();if((info.mode&0o077)!==0 || info.uid!==process.getuid?.())throw deny();
  const sha256=createHash('sha256').update(bytes).digest('hex');
  const manifest={attemptId,rootId:c.output.id,name,sha256,bytes:bytes.byteLength,stagedAt:new Date().toISOString()};
  const bundle=Buffer.from(JSON.stringify({manifest,content}));
  try {await publishExclusive(actor,`${attemptId}.json`,bundle);await actor.sync();}
  catch{throw deny();}
  return manifest;
 }finally{await actor?.close();await root.close();}
}
export async function removeStagedOutput(policy:ExecutionPolicy,attemptId:string,env:Env=process.env) {
 if(!uuidPattern.test(attemptId))throw deny();
 const c=await config(env);await authorized(policy,c,env);
 if(!c || policy.outputRootId!==c.output.id)throw new Error('POLICY_DENIED');
 const root=await rootHandle(c.output.path);
 try {const actor=await childDirectory(root,actorDirectory(policy.actorId));try {await unlink(`/proc/self/fd/${actor.fd}/${attemptId}.json`);await actor.sync();}finally{await actor.close();}}
 finally{await root.close();}
}
