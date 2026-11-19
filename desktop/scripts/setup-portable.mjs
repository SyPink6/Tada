// Reproducible Windows setup, with verified downloads and no cleanup/overwrites.
import{mkdir,writeFile,readFile,stat}from'node:fs/promises';
import{createHash}from'node:crypto';
import{spawnSync}from'node:child_process';
import{fileURLToPath}from'node:url';
import path from'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
if(process.platform!=='win32'||process.arch!=='x64')throw Error('This prototype currently supports Windows x64.');
const stamp=new Date().toISOString().replace(/[:.]/g,'-')+'-'+process.pid;
const downloads=path.join(root,'work/downloads',stamp);
await mkdir(downloads,{recursive:true});
const exists=async p=>Boolean(await stat(p).catch(()=>null));
async function download(url,timeout=30000){
 let last;
 for(let attempt=1;attempt<=2;attempt++){
  try{const r=await fetch(url,{signal:AbortSignal.timeout(timeout)});if(!r.ok)throw Error('HTTP '+r.status);return Buffer.from(await r.arrayBuffer());}
  catch(e){last=e;console.log('Download retry:',new URL(url).hostname,attempt);}
 }
 throw last;
}
function extract(archive,target,kind){
 const result=spawnSync('python',[path.join(root,'scripts/extract.py'),archive,target,kind],{stdio:'inherit',windowsHide:true});
 if(result.status!==0)throw Error('Extraction failed. Existing and partial files have been preserved.');
}
const manifest=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const deps={...manifest.dependencies,esbuild:manifest.devDependencies.esbuild,'@esbuild/win32-x64':manifest.devDependencies.esbuild,'playwright-core':manifest.devDependencies['playwright-core']};
for(const[name,version]of Object.entries(deps)){
 const target=path.join(root,'node_modules',name);
 if(await exists(target)){
  const installed=JSON.parse(await readFile(path.join(target,'package.json'),'utf8'));
  if(installed.version!==version)throw Error(`Existing ${name} ${installed.version} differs from pinned ${version}; preserved unchanged.`);
  console.log('Ready:',name,version);continue;
 }
 const meta=JSON.parse((await download(`https://registry.npmjs.org/${name}/${version}`)).toString());
 const bytes=await download(meta.dist.tarball);
 const[algorithm,checksum]=meta.dist.integrity.split('-');
 if(createHash(algorithm).update(bytes).digest('base64')!==checksum)throw Error('Integrity mismatch: '+name);
 const archive=path.join(downloads,name.replace('@','').replace('/','-')+'-'+version+'.tgz');
 await writeFile(archive,bytes,{flag:'wx'});extract(archive,target,'tar');
}
if(!process.argv.includes('--web-only')){
 const version=manifest.devDependencies.electron;
 const target=path.join(root,'runtimes','electron-'+version);
 if(!(await exists(target))){
  const base=`https://github.com/electron/electron/releases/download/v${version}`;
  const name=`electron-v${version}-win32-x64.zip`;
  // Checksums must come from the official release, even when using a binary mirror.
  const sums=(await download(base+'/SHASUMS256.txt')).toString();
  const line=sums.split('\n').find(s=>s.trim().endsWith(name));
  if(!line)throw Error('Official release checksum is missing.');
  let bytes;
  try{bytes=await download(base+'/'+name,45000);}
  catch{console.log('Using a binary mirror; checking against the official SHA-256.');bytes=await download(`https://cdn.npmmirror.com/binaries/electron/${version}/${name}`,180000);}
  if(createHash('sha256').update(bytes).digest('hex')!==line.split(/\s+/)[0])throw Error('Electron checksum mismatch.');
  const archive=path.join(downloads,name);await writeFile(archive,bytes,{flag:'wx'});
  await writeFile(path.join(downloads,'official-SHASUMS256.txt'),sums,{flag:'wx'});extract(archive,target,'zip');
 }else if(!(await exists(path.join(target,'electron.exe'))))throw Error('Existing runtime is incomplete; preserved unchanged.');
}
console.log('Tada setup is ready. Run npm run desktop or npm run preview.');
