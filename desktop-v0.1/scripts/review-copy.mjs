// Preserve the first draft; materialize reviewed sources into a new directory.
import {readFile,mkdir,writeFile,symlink} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
const target=path.join(root,'work','review-01');
const files=['package.json','src/model.mjs','src/storage.mjs','src/main.jsx','src/styles.css','scripts/extract.py','scripts/setup.mjs','scripts/build.mjs','scripts/preview.mjs','scripts/desktop.mjs','electron/main.cjs','electron/preload.cjs'];
for(const file of files){
 let content=await readFile(path.join(root,file),'utf8');
 if(file==='src/styles.css')content=content.replace("@import url('');\n",'');
 if(file==='electron/preload.cjs')content+="\ncontextBridge.exposeInMainWorld('tadaHit',hit=>ipcRenderer.send('tada:hit',!!hit));\n";
 if(file==='electron/main.cjs'){
  const start=content.indexOf(" ipcMain.handle('tada:toggle'");
  const end=content.indexOf(' if(process.env.TADA_SMOKE){showPanel();');
  const handlers=content.slice(start,end);
  content=content.slice(0,start)+content.slice(end);
  content=content.replace(" await Promise.all([pet.loadFile",handlers+"\n ipcMain.on('tada:hit',(e,hit)=>{authorized(e);if(e.sender.id===pet.webContents.id)pet.setIgnoreMouseEvents(!hit,{forward:true});});\n await Promise.all([pet.loadFile");
  content=content.replace("app.on('before-quit',()=>{quitting=true;});","app.on('before-quit',e=>{if(!quitting){e.preventDefault();quitting=true;writeQueue.finally(()=>app.quit());}});");
  content=content.split('\n').filter(line=>!line.includes('const icon=nativeImage.createFromBuffer')).join('\n');
 }
 await mkdir(path.dirname(path.join(target,file)),{recursive:true});
 await writeFile(path.join(target,file),content,{flag:'wx'});
}
await symlink(path.join(root,'node_modules'),path.join(target,'node_modules'),'junction');
await mkdir(path.join(root,'runtimes'),{recursive:true});
await symlink(path.join(root,'runtimes'),path.join(target,'runtimes'),'junction');
console.log(target);
