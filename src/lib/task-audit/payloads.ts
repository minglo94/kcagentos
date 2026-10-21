import {constants} from 'node:fs';
import {open,lstat,realpath} from 'node:fs/promises';
import {isAbsolute,join,resolve,relative} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
export const MAX_AUDIT_BYTES=8*1024*1024;
export class PayloadStore {
 constructor(private root: string = process.env.AGENTOS_AUDIT_ROOT ?? '') {}
 private async path(ref:string) {
  if (!this.root || !isAbsolute(this.root) || !/^[a-f0-9-]{36}\.bin$/.test(ref)) throw new Error();
  const relativeToApp=relative(process.cwd(),resolve(this.root));
  if(!relativeToApp || (!relativeToApp.startsWith("..") && !isAbsolute(relativeToApp)))throw new Error();
  const info=await lstat(this.root);
  if(!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) || await realpath(this.root)!==resolve(this.root)) throw new Error();
  return join(this.root,ref);
 }
 async put(_attemptId:string,_direction:'input'|'output',_sequence:number,content:Uint8Array) {
  if(content.byteLength>MAX_AUDIT_BYTES)throw new Error('AUDIT_TOO_LARGE');
  try {
   const ref=`${randomUUID()}.bin`; const target=await this.path(ref);
   const file=await open(target,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
   try {await file.writeFile(content);await file.sync();}finally{await file.close();}
   const directory=await open(this.root,constants.O_RDONLY);try{await directory.sync();}finally{await directory.close();}
   return {ref,sha256:createHash('sha256').update(content).digest('hex'),bytes:content.byteLength};
  }catch{throw new Error('AUDIT_STORAGE_UNAVAILABLE');}
 }
 async read(ref:string):Promise<Buffer> {
  try { const file=await open(await this.path(ref),constants.O_RDONLY|constants.O_NOFOLLOW);
   try {const info=await file.stat();if(!info.isFile() || info.size>MAX_AUDIT_BYTES || (info.mode&0o077))throw new Error();return await file.readFile();}finally{await file.close();}
  }catch{throw new Error('AUDIT_STORAGE_UNAVAILABLE');}
 }
}
