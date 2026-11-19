import{mkdir,writeFile,stat}from'node:fs/promises';
import{createHash}from'node:crypto';
import{spawnSync}from'node:child_process';
import path from'node:path';
const root=process.cwd(),version='45.3.4',name=`electron-v${version}-win32-x64.zip`;
const official=`https://github.com/electron/electron/releases/download/v${version}`;
const mirror=`https://npmmirror.com/mirrors/electron/${version}`;
async function get(url){for(let attempt=1;attempt<=3;attempt++){try{const r=await fetch(url,{signal:AbortSignal.timeout(180000)});if(!r.ok)throw new Error('HTTP '+r.status);return Buffer.from(await r.arrayBuffer());}catch(e){console.log('Download attempt',attempt,e.message);if(attempt===3)throw e;}}}
const dir=path.join(root,'work','downloads','runtime-'+Date.now());await mkdir(dir,{recursive:true});
const sums=(await get(official+'/SHASUMS256.txt')).toString();
const line=sums.split('\n').find(l=>l.trim().endsWith(name));if(!line)throw Error('No official checksum');
await writeFile(path.join(dir,'official-SHASUMS256.txt'),sums,{flag:'wx'});
let data;try{data=await get(official+'/'+name);}catch{console.log('Using mirror, validated against official SHA-256.');data=await get(mirror+'/'+name);}
if(createHash('sha256').update(data).digest('hex')!==line.split(/\s+/)[0])throw Error('Checksum mismatch');
const archive=path.join(dir,name);await writeFile(archive,data,{flag:'wx'});
const target=path.join(root,'runtimes','electron-'+version);
if(await stat(target).catch(()=>null))throw Error('Target already exists; preserved.');
const result=spawnSync('python',['scripts/extract.py',archive,target,'zip'],{stdio:'inherit'});
if(result.status!==0)throw Error('Extraction failed');
console.log('Official Electron runtime verified and ready.');
