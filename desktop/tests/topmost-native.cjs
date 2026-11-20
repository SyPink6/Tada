const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
module.exports=async({app,pet,panel,root,stamp})=>{
 const tick=()=>new Promise(r=>setTimeout(r,120));
 const report=[];
 // Contract: the mascot (pet) is always pinned on top; only the task panel follows the onTop preference.
 function check(label,panelPin){assert.equal(pet.isAlwaysOnTop(),true,label+' pet stays pinned');assert.equal(panel.isAlwaysOnTop(),panelPin,label+' panel');report.push(label);}
 await tick();
 check('default: mascot pinned, panel unpinned',false);
 panel.show();await tick();check('opening panel keeps mascot pinned',false);
 panel.hide();await tick();check('collapsed companion keeps mascot pinned',false);
 const before=panel.isFocused();pet.showInactive();await tick();check('inactive show keeps mascot pinned',false);assert.equal(panel.isFocused(),before);
 panel.setAlwaysOnTop(true);check('pin panel via setAlwaysOnTop',true);
 panel.setAlwaysOnTop(false);check('unpin panel via setAlwaysOnTop',false);
 pet.hide();pet.showInactive();await tick();check('mascot stays pinned across hide/show',false);
 panel.setAlwaysOnTop(true);pet.hide();panel.hide();pet.showInactive();panel.show();await tick();check('panel pin survives tray-style restore',true);
 await panel.webContents.reload();await new Promise(r=>setTimeout(r,400));
 await panel.webContents.executeJavaScript('window.tada.onTop(true)');await tick();check('renderer bridge pins panel after reload',true);
 await panel.webContents.executeJavaScript('window.tada.collapse()');await tick();check('bridge collapse leaves panel pinned',true);
 const result={passed:true,checks:report,electron:process.versions.electron};
 await fs.mkdir(path.join(root,'work'),{recursive:true});await fs.writeFile(path.join(root,'work','pin-report-'+stamp+'.json'),JSON.stringify(result,null,2),{flag:'wx'});
 console.log(JSON.stringify(result));app.quit();
};

// Assert actual WS_EX_TOPMOST flags too: Electron's boolean alone is insufficient.
const runBaseTest=module.exports;
module.exports=async context=>{
 const {spawnSync}=require('node:child_process');
 for(const window of [context.pet,context.panel]){
  const query=window.isAlwaysOnTop.bind(window);
  window.isAlwaysOnTop=()=>{
   const buf=window.getNativeWindowHandle();
   const handle=buf.length===8?buf.readBigUInt64LE().toString():String(buf.readUInt32LE());
   const python="import ctypes,sys;from ctypes import wintypes;u=ctypes.windll.user32;u.GetWindowLongW.argtypes=[wintypes.HWND,ctypes.c_int];print(int(bool(u.GetWindowLongW(int(sys.argv[1]),-20)&8)))";
   const native=spawnSync('python',['-c',python,handle],{encoding:'utf8',windowsHide:true});
   assert.equal(native.status,0,native.stderr);
   const actual=native.stdout.trim()==='1';
   assert.equal(query(),actual,'Electron and Windows native pin flags must agree');
   return actual;
  };
 }
 await runBaseTest(context);
};
