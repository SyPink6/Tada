// Add-only dependency bootstrap. No install hooks, cleanup or overwriting.
import {mkdir, writeFile, readFile, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const run = new Date().toISOString().replace(/[:.]/g, '-');
const downloads = path.join(root, 'work', 'downloads', run);
await mkdir(downloads, {recursive:true});
const exists = async p => !!(await stat(p).catch(()=>null));
async function fetchBytes(url) {
  const response = await fetch(url, {signal:AbortSignal.timeout(240000)});
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}
function extract(archive, target, kind) {
  const result=spawnSync('python', ['scripts/extract.py',archive,target,kind],{stdio:'inherit'});
  if(result.status!==0) throw new Error('Archive extraction failed; partial files preserved.');
}
const versions = {'react':'19.3.1','react-dom':'19.3.1','scheduler':'0.28.0','esbuild':'0.28.2','@esbuild/win32-x64':'0.28.2','playwright-core':'1.65.1'};
for(const [name,version] of Object.entries(versions)) {
  const target=path.join(root,'node_modules',name);
  if(await exists(target)) {console.log('Preserving existing dependency:',name); continue;}
  const meta = JSON.parse((await fetchBytes(`https://registry.npmjs.org/${name}/${version}`)).toString());
  const data = await fetchBytes(meta.dist.tarball);
  const [algorithm,digest]=meta.dist.integrity.split('-');
  if(createHash(algorithm).update(data).digest('base64')!==digest) throw new Error(`Integrity mismatch: ${name}`);
  const archive=path.join(downloads,`${name.replace('/','-').replace('@','')}-${version}.tgz`);
  await writeFile(archive,data,{flag:'wx'});
  extract(archive,target,'tar');
}
if(!process.argv.includes('--web-only')) {
  const version='45.3.4';
  const target=path.join(root,'runtimes',`electron-${version}`);
  if(!(await exists(target))) {
    const base=`https://github.com/electron/electron/releases/download/v${version}`;
    const name=`electron-v${version}-win32-x64.zip`;
    console.log('Downloading official Electron runtime…');
    const sums=(await fetchBytes(`${base}/SHASUMS256.txt`)).toString();
    const line=sums.split('\n').find(l=>l.trim().endsWith(name));
    if(!line) throw new Error('Missing runtime checksum');
    const data=await fetchBytes(`${base}/${name}`);
    if(createHash('sha256').update(data).digest('hex')!==line.split(/\s+/)[0]) throw new Error('Electron checksum mismatch');
    const archive=path.join(downloads,name);
    await writeFile(archive,data,{flag:'wx'});
    await writeFile(path.join(downloads,'SHASUMS256.txt'),sums,{flag:'wx'});
    extract(archive,target,'zip');
  }
}
console.log('Setup complete. Existing files and downloaded archives preserved.');
