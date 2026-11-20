const {app,BrowserWindow,screen,ipcMain,Tray,Menu,nativeImage}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
let pet,panel,chat,tray,quitting=false,journal,latest=null,writeQueue=Promise.resolve();
const root=path.resolve(__dirname,'..');
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const sessionDir=path.join(root,'work','electron-sessions',stamp);
const profileDir=path.join(root,'data','profile');
require('node:fs').mkdirSync(profileDir,{recursive:true});
app.setPath('userData',profileDir);
app.setPath('sessionData',sessionDir);
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disk-cache-size','0');
app.setAppUserModelId('local.tada.companion');
const lock=app.requestSingleInstanceLock();
if(!lock)app.quit();
else {
app.on('second-instance',()=>{pet?.showInactive();});
app.on('before-quit',e=>{if(!quitting){e.preventDefault();quitting=true;writeQueue.finally(()=>app.quit());}});
function authorized(event){if(![pet?.webContents.id,panel?.webContents.id,chat?.webContents.id].includes(event.sender.id))throw new Error('Unknown sender');}
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
 // The mascot is pinned on top as a quiet desktop pet, decoupled from the onTop preference (which only governs the task panel).
 pet=createWindow({width:180,height:180,x:area.x+area.width-214,y:area.y+area.height-208,alwaysOnTop:true});
 panel=createWindow({width:390,height:686,alwaysOnTop:latest?.preferences?.onTop??false});
 chat=createWindow({width:300,height:400,alwaysOnTop:true});
 function showChat(){const p=pet.getBounds();chat.setBounds({x:Math.max(10,p.x-310),y:Math.max(10,p.y-410),width:300,height:400});chat.show();chat.focus();chat.webContents.reload();}
 function hideChat(){if(chat)chat.hide();}
 const html=path.join(process.env.TADA_BUILD||'', 'index.html');
 if(!process.env.TADA_BUILD)throw new Error('Use npm run desktop to build and launch.');
 ipcMain.handle('tada:toggle',e=>{authorized(e);chat.isVisible()?hideChat():showChat();});
 ipcMain.handle('tada:collapse',e=>{authorized(e);hideChat();});
 ipcMain.handle('tada:rest',e=>{authorized(e);hideChat();pet.hide();});
 ipcMain.handle('tada:chat',async(e,message)=>{authorized(e);const d=new Date();const today=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;try{const r=await fetch('http://127.0.0.1:8080/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_key:today,message})});const data=await r.json();return data;}catch(err){return {reply:'团子暂时连不上服务，等一下再试。',error:true};}});
 ipcMain.handle('tada:close-chat',e=>{authorized(e);hideChat();});
 ipcMain.handle('tada:on-top',(e,value)=>{authorized(e);if(typeof value!=='boolean')throw new Error('Invalid preference');panel.setAlwaysOnTop(value);});
 ipcMain.handle('tada:load',e=>{authorized(e);return latest;});
 ipcMain.handle('tada:save',async(e,state)=>{authorized(e);if(!state||state.version!==1||!Array.isArray(state.history)||JSON.stringify(state).length>2_000_000)throw new Error('Invalid snapshot');const record=JSON.stringify(state)+'\n';writeQueue=writeQueue.catch(()=>{}).then(()=>fs.appendFile(journal,record,{encoding:'utf8'}));await writeQueue;latest=state;return true;});

 ipcMain.on('tada:hit',(e,hit)=>{authorized(e);if(e.sender.id===pet.webContents.id)pet.setIgnoreMouseEvents(!hit,{forward:true});});
 await Promise.all([pet.loadFile(html,{query:{view:'pet'}}),panel.loadFile(html,{query:{view:'panel'}}),chat.loadFile(html,{query:{view:'desktop-chat'}})]);
 pet.showInactive();
 pet.on('move',()=>{if(panel.isVisible())anchorPanel();});
 screen.on('display-metrics-changed',()=>{const a=screen.getDisplayMatching(pet.getBounds()).workArea;const b=pet.getBounds();pet.setPosition(Math.max(a.x,Math.min(b.x,a.x+a.width-b.width)),Math.max(a.y,Math.min(b.y,a.y+a.height-b.height)));anchorPanel();});
 pet.on('close',e=>{if(!quitting){e.preventDefault();pet.hide();panel.hide();hideChat();}});
 panel.on('close',e=>{if(!quitting){e.preventDefault();panel.hide();}});
 chat.on('close',e=>{if(!quitting){e.preventDefault();hideChat();}});
 // Transparent margins pass mouse input through; the mascot remains interactive.
 pet.setIgnoreMouseEvents(true,{forward:true});
 pet.webContents.on('before-input-event',()=>{});
 await pet.webContents.executeJavaScript(`document.addEventListener('mousemove',e=>{const b=document.querySelector('.pet-button').getBoundingClientRect();const x=(e.clientX-b.x)/b.width,y=(e.clientY-b.y)/b.height;const hit=e.target.closest('.pet-drag')||e.target.closest('.pet-collapse')||((x-.52)**2/.44**2+(y-.57)**2/.38**2<1);window.tadaHit?.(!!hit);});`);
 // A local SVG is rendered by Chromium for a crisp tray icon.
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect x="2" y="3" width="28" height="26" rx="12" fill="#E9CCA0"/><circle cx="11" cy="15" r="1.8" fill="#594737"/><circle cx="21" cy="15" r="1.8" fill="#594737"/><path d="M13 21q3 3 6 0" stroke="#594737" stroke-width="1.5" fill="none"/></svg>`;
 const rendered=await panel.webContents.executeJavaScript(`new Promise(resolve=>{const i=new Image();i.onload=()=>{const c=document.createElement('canvas');c.width=32;c.height=32;c.getContext('2d').drawImage(i,0,0);resolve(c.toDataURL());};i.src=${JSON.stringify('data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64'))};})`);
 tray=new Tray(nativeImage.createFromDataURL(rendered));tray.setToolTip('Tada! · 我在，不着急。');
 tray.setContextMenu(Menu.buildFromTemplate([{label:'和团子聊聊',click:()=>{pet.showInactive();pet.moveTop();showChat();}},{label:'让小团子回来',click:()=>{pet.showInactive();pet.moveTop();}},{label:'先休息（藏到托盘）',click:()=>{pet.hide();panel.hide();hideChat();}},{type:'separator'},{label:'退出 Tada!',click:()=>app.quit()}]));
 tray.on('click',()=>{pet.showInactive();pet.moveTop();chat.isVisible()?hideChat():showChat();});
 if(process.env.TADA_SMOKE)await require('../tests/native-smoke.cjs')({app,pet,panel,root,stamp,journal});
}).catch(e=>{console.error(e);app.quit();process.exitCode=1;});
}

// Shared native-window pin policy, added 2026-11-19.
if(lock)require('./topmost-sync.cjs').install({app,getWindows:()=>[panel],getPreference:()=>latest?.preferences?.onTop??false});
