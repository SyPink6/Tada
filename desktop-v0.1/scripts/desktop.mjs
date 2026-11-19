import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {buildApp} from './build.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const folder=await buildApp();
const env={...process.env,TADA_BUILD:folder};
// Electron can inherit this from agent terminals; an empty value restores GUI mode.
env.ELECTRON_RUN_AS_NODE='';
const child=spawn(path.join(root,'runtimes/electron-45.3.4/electron.exe'),[root],{env,stdio:'inherit',windowsHide:true});
child.on('error',e=>{console.error(e.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code||0;});
