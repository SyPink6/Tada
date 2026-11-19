const {app,BrowserWindow,screen,ipcMain,Tray,Menu,nativeImage}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
let pet,panel,tray,quitting=false,journal,latest=null,writeQueue=Promise.resolve();
const root=path.resolve(__dirname,'..');
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const sessionDir=path.join(root,'work','electron-sessions',stamp);
app.setPath('userData',sessionDir);
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disk-cache-size','0');
app.setAppUserModelId('local.tada.companion');
const lock=app.requestSingleInstanceLock();
if(!lock)app.quit();
else {
app.on('second-instance',()=>{pet?.showInactive();});
app.on('before-quit',()=>{quitting=true;});
function authorized(event){if(![pet?.webContents.id,panel?.webContents.id].includes(event.sender.id))throw new Error('Unknown sender');}
function anchorPanel(){
  if(!pet||!panel)return;
  const p=pet.getBounds(),area=screen.getDisplayMatching(p).workArea;
  const width=390,height=Math.min(686,area.height-20);
  panel.setBounds({x:Math.max(area.x,Math.min(p.x+p.width-width,area.x+area.width-width)),y:Math.max(area.y+8,Math.min(p.y-height+8,area.y+area.height-height)),width,height});
}
function showPanel(){anchorPanel();panel.show();panel.focus();}
function createWindow(options){
 const win=new BrowserWindow({...options,frame:false,transparent:true,backgroundColor:'#00000000',hasShadow:false,show:false,resizable:false,maximizable:false,fullscreenable:false,skipTaskbar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,partition:'tada-memory-session',webSecurity:true}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',e=>e.preventDefault());
 win.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
 return win;
}
app.whenReady().then(async()=>{
 await fs.mkdir(sessionDir,{recursive:true});
 const dataDir=path.join(root,'data');await fs.mkdir(dataDir,{recursive:true});
 journal=path.join(dataDir,process.env.TADA_SMOKE?'smoke-history-'+stamp+'.jsonl':'companion-history.jsonl');
 try{const lines=(await fs.readFile(journal,'utf8')).trim().split('\n');for(let i=lines.length-1;i>=0;i--){try{const record=JSON.parse(lines[i]);if(record.version===1){latest=record;break;}}catch{}}}catch(e){if(e.code!=='ENOENT')throw e;}
 const area=screen.getPrimaryDisplay().workArea;
 pet=createWindow({width:180,height:180,x:area.x+area.width-214,y:area.y+area.height-208,alwaysOnTop:latest?.preferences?.onTop??false});
 panel=createWindow({width:390,height:686,alwaysOnTop:latest?.preferences?.onTop??false});
 const html=path.join(process.env.TADA_BUILD||'', 'index.html');
 if(!process.env.TADA_BUILD)throw new Error('Use npm run desktop to build and launch.');
 await Promise.all([pet.loadFile(html,{query:{view:'pet'}}),panel.loadFile(html,{query:{view:'panel'}})]);
 pet.showInactive();
 pet.on('move',()=>{if(panel.isVisible())anchorPanel();});
 screen.on('display-metrics-changed',()=>{const a=screen.getDisplayMatching(pet.getBounds()).workArea;const b=pet.getBounds();pet.setPosition(Math.max(a.x,Math.min(b.x,a.x+a.width-b.width)),Math.max(a.y,Math.min(b.y,a.y+a.height-b.height)));anchorPanel();});
 pet.on('close',e=>{if(!quitting){e.preventDefault();pet.hide();panel.hide();}});
 panel.on('close',e=>{if(!quitting){e.preventDefault();panel.hide();}});
 // Transparent margins pass mouse input through; the mascot remains interactive.
 pet.setIgnoreMouseEvents(true,{forward:true});
 pet.webContents.on('before-input-event',()=>{});
 await pet.webContents.executeJavaScript(`document.addEventListener('mousemove',e=>{const hit=e.target.closest('button,.pet-drag');window.tadaHit?.(!!hit);});`);
 const icon=nativeImage.createFromBuffer(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGUlEQVQ4T2P8v4ThPwMlgImBQjBqAA0NAAAGHx3xR/fNHAAAAABJRU5ErkJggg==','base64'));
 // A local SVG is rendered by Chromium for a crisp tray icon.
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect x="2" y="3" width="28" height="26" rx="12" fill="#E9CCA0"/><circle cx="11" cy="15" r="1.8" fill="#594737"/><circle cx="21" cy="15" r="1.8" fill="#594737"/><path d="M13 21q3 3 6 0" stroke="#594737" stroke-width="1.5" fill="none"/></svg>`;
 const rendered=await panel.webContents.executeJavaScript(`new Promise(resolve=>{const i=new Image();i.onload=()=>{const c=document.createElement('canvas');c.width=32;c.height=32;c.getContext('2d').drawImage(i,0,0);resolve(c.toDataURL());};i.src=${JSON.stringify('data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64'))};})`);
 tray=new Tray(nativeImage.createFromDataURL(rendered));tray.setToolTip('Tada! · 我在，不着急。');
 tray.setContextMenu(Menu.buildFromTemplate([{label:'展开小步面板',click:()=>{pet.showInactive();showPanel();}},{label:'让小团子回来',click:()=>pet.showInactive()},{label:'先休息（藏到托盘）',click:()=>{pet.hide();panel.hide();}},{type:'separator'},{label:'退出 Tada!',click:()=>app.quit()}]));
 tray.on('click',()=>{pet.showInactive();panel.isVisible()?panel.hide():showPanel();});
 ipcMain.handle('tada:toggle',e=>{authorized(e);panel.isVisible()?panel.hide():showPanel();});
 ipcMain.handle('tada:collapse',e=>{authorized(e);panel.hide();});
 ipcMain.handle('tada:rest',e=>{authorized(e);panel.hide();pet.hide();});
 ipcMain.handle('tada:on-top',(e,value)=>{authorized(e);if(typeof value!=='boolean')throw new Error('Invalid preference');pet.setAlwaysOnTop(value);panel.setAlwaysOnTop(value);});
 ipcMain.handle('tada:load',e=>{authorized(e);return latest;});
 ipcMain.handle('tada:save',async(e,state)=>{authorized(e);if(!state||state.version!==1||!Array.isArray(state.history)||JSON.stringify(state).length>2_000_000)throw new Error('Invalid snapshot');const record=JSON.stringify(state)+'\n';writeQueue=writeQueue.catch(()=>{}).then(()=>fs.appendFile(journal,record,{encoding:'utf8'}));await writeQueue;latest=state;return true;});
 if(process.env.TADA_SMOKE){showPanel();await new Promise(r=>setTimeout(r,1000));const shot=await panel.webContents.capturePage();await fs.writeFile(path.join(root,'work','electron-panel-'+stamp+'.png'),shot.toPNG(),{flag:'wx'});await fs.writeFile(path.join(root,'work','electron-smoke-'+stamp+'.json'),JSON.stringify({electron:process.versions.electron,petVisible:pet.isVisible(),panelVisible:panel.isVisible(),isolated:panel.webContents.getLastWebPreferences().contextIsolation,sandbox:panel.webContents.getLastWebPreferences().sandbox,body:await panel.webContents.executeJavaScript('document.body.innerText')},null,2),{flag:'wx'});app.quit();}
}).catch(e=>{console.error(e);app.quit();process.exitCode=1;});
}
