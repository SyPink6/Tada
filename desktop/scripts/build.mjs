import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function buildApp() {
  const folder=path.join(root,'builds',`${new Date().toISOString().replace(/[:.]/g,'-')}-${process.pid}`);
  await mkdir(folder,{recursive:true});
  await build({entryPoints:[path.join(root,'src/main.jsx')],outdir:folder,bundle:true,format:'esm',minify:true,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},logLevel:'warning'});
  await writeFile(path.join(folder,'index.html'),`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'"><title>Tada! · 每一小步，都值得庆祝</title><link rel="stylesheet" href="./main.css"></head><body><div id="root"></div><script type="module" src="./main.js"></script></body></html>`,{flag:'wx'});
  return folder;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) console.log(await buildApp());
