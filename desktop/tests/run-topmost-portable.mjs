import{spawn}from'node:child_process';
import{mkdir,readFile,writeFile}from'node:fs/promises';
import{fileURLToPath}from'node:url';
import path from'node:path';
import{buildApp}from'../scripts/build.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'work','pin-test-'+Date.now()+'-'+process.pid);
await mkdir(path.join(target,'electron'),{recursive:true});await mkdir(path.join(target,'tests'));
await writeFile(path.join(target,'package.json'),JSON.stringify({name:'tada-pin-regression',version:'0.1.0',main:'electron/main.cjs'}),{flag:'wx'});
for(const file of['electron/main.cjs','electron/preload.cjs','electron/topmost-sync.cjs','tests/topmost-native.cjs']){
 let content=await readFile(path.join(root,file),'utf8');
 if(file==='electron/main.cjs')content=content.replace("require('../tests/native-smoke.cjs')","require('../tests/topmost-native.cjs')");
 await writeFile(path.join(target,file),content,{flag:'wx'});
}
const folder=await buildApp();
const{ELECTRON_RUN_AS_NODE:ignored,...inherited}=process.env;
const child=spawn(path.join(root,'runtimes/electron-45.3.4/electron.exe'),[target],{env:{...inherited,TADA_BUILD:folder,TADA_SMOKE:'1'},stdio:'inherit',windowsHide:true});
child.on('error',e=>{console.error(e);process.exitCode=1;});child.on('exit',code=>{process.exitCode=code||0;});
