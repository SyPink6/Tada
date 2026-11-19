import{readFile,mkdir,writeFile,stat}from'node:fs/promises';
import{createHash}from'node:crypto';
import{spawnSync}from'node:child_process';
import path from'node:path';
const name='electron-v45.3.4-win32-x64.zip';
const sums=await readFile('work/downloads/runtime-1795016937681/official-SHASUMS256.txt','utf8');
const checksum=sums.split('\n').find(l=>l.trim().endsWith(name)).split(/\s+/)[0];
const dir=path.resolve('work/downloads/mirror-'+Date.now());await mkdir(dir,{recursive:true});
const response=await fetch('https://cdn.npmmirror.com/binaries/electron/45.3.4/'+name,{signal:AbortSignal.timeout(240000)});
if(!response.ok)throw Error('HTTP '+response.status);
const chunks=[];let count=0,logAt=20_000_000;
for await(const chunk of response.body){chunks.push(chunk);count+=chunk.length;if(count>=logAt){console.log('Downloaded',Math.round(count/1e6),'MB');logAt+=20_000_000;}}
const data=Buffer.concat(chunks);if(createHash('sha256').update(data).digest('hex')!==checksum)throw Error('Checksum mismatch');
const archive=path.join(dir,name);await writeFile(archive,data,{flag:'wx'});
const target=path.resolve('runtimes/electron-45.3.4');
if(await stat(target).catch(()=>null)){console.log('Existing runtime preserved. Verified archive retained.');}
else{const result=spawnSync('python',['scripts/extract.py',archive,target,'zip'],{stdio:'inherit'});if(result.status!==0)throw Error('Extraction failed');}
console.log('Runtime ready; verified using official SHA-256.');
