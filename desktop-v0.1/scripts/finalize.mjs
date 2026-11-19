import{readFile,mkdir,writeFile,symlink}from'node:fs/promises';
import path from'node:path';
const draft=process.cwd(),source=path.join(draft,'work/review-01'),target=path.resolve(draft,'../desktop');
const files=['package.json','src/model.mjs','src/storage.mjs','src/main.jsx','src/styles.css','scripts/extract.py','scripts/setup.mjs','scripts/build.mjs','scripts/preview.mjs','electron/main.cjs','electron/preload.cjs','tests/model.test.mjs','tests/native-smoke.cjs'];
for(const file of files){
 let content=await readFile(path.join(source,file),'utf8');
 if(file==='electron/main.cjs'){
  content=content.replace("app.setPath('userData',sessionDir);","const profileDir=path.join(root,'data','profile');\nrequire('node:fs').mkdirSync(profileDir,{recursive:true});\napp.setPath('userData',profileDir);\napp.setPath('sessionData',sessionDir);");
  content=content.replace("const hit=e.target.closest('button,.pet-drag');window.tadaHit?.(!!hit);", "const b=document.querySelector('.pet-button').getBoundingClientRect();const x=(e.clientX-b.x)/b.width,y=(e.clientY-b.y)/b.height;const hit=e.target.closest('.pet-drag')||((x-.52)**2/.44**2+(y-.57)**2/.38**2<1);window.tadaHit?.(!!hit);");
  const start=content.indexOf(' if(process.env.TADA_SMOKE){showPanel();');
  const end=content.indexOf('\n}).catch',start);
  content=content.slice(0,start)+" if(process.env.TADA_SMOKE)await require('../tests/native-smoke.cjs')({app,pet,panel,root,stamp,journal});"+content.slice(end);
 }
 if(file==='scripts/preview.mjs')content=content.replace('process.env.PORT||4173','process.env.PORT||4174');
 await mkdir(path.dirname(path.join(target,file)),{recursive:true});await writeFile(path.join(target,file),content,{flag:'wx'});
}
await writeFile(path.join(target,'scripts/desktop.mjs'),await readFile(path.join(source,'scripts/run-desktop.mjs')),{flag:'wx'});
const browser=(await readFile(path.join(source,'tests/browser-final.mjs'),'utf8')).replace('http://127.0.0.1:4173','http://127.0.0.1:4174');
await writeFile(path.join(target,'tests/browser.mjs'),browser,{flag:'wx'});
await symlink(path.join(draft,'node_modules'),path.join(target,'node_modules'),'junction');
await symlink(path.join(draft,'runtimes'),path.join(target,'runtimes'),'junction');
console.log('Reviewed application:',target);
