import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {buildApp} from './build.mjs';
const folder=await buildApp();
const port=Number(process.env.PORT||4174);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
async function handleProxy(req,res){
  const url = `http://127.0.0.1:8080${req.url}`;
  const opts = {method: req.method, headers: {'Content-Type': req.headers['content-type']||'application/json'}};
  if (req.method !== 'GET') { let body=''; for await(const chunk of req) body+=chunk; opts.body = body; }
  try {
    const r = await fetch(url, opts);
    const buf = Buffer.from(await r.arrayBuffer());
    res.writeHead(r.status, {'Content-Type': r.headers.get('content-type')||'application/json', 'Cache-Control':'no-store'});
    res.end(buf);
  } catch(e) {
    res.writeHead(502, {'Content-Type':'application/json'}).end(JSON.stringify({error:'Python backend unavailable: '+String(e.message)}));
  }
}
createServer(async(req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname;
  if(name.startsWith('/api/')){await handleProxy(req,res);return;}
  const file=path.resolve(folder,'.'+(name==='/'?'/index.html':decodeURIComponent(name)));
  if(!file.startsWith(folder+path.sep)){res.writeHead(403).end();return;}
  try{const data=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);}
  catch{
    // SPA fallback: non-file routes (no extension) serve index.html
    if(!name.includes('.')){try{const data=await readFile(path.join(folder,'index.html'));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(data);return;}catch{}}
    res.writeHead(404).end('Not found');
  }
}).listen(port,'127.0.0.1',()=>console.log(`Tada preview: http://127.0.0.1:${port}\nBuild preserved: ${folder}`));
