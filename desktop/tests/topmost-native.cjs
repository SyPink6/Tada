const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
module.exports=async({app,pet,panel,root,stamp})=>{
 const tick=()=>new Promise(r=>setTimeout(r,120));
 const report=[];
 function check(label,pin){assert.equal(pet.isAlwaysOnTop(),pin,label+' pet');assert.equal(panel.isAlwaysOnTop(),pin,label+' panel');report.push(label);}
 await tick();
 pet.setAlwaysOnTop(true);check('pin from pet applies to both',true);
 panel.show();await tick();check('opening panel keeps pet pinned',true);
 panel.hide();await tick();check('collapsed companion stays pinned',true);
 const before=panel.isFocused();pet.showInactive();await tick();check('inactive show keeps pin',true);assert.equal(panel.isFocused(),before);
 panel.setAlwaysOnTop(false);check('unpin from panel applies to both',false);
 pet.hide();pet.showInactive();await tick();check('unpin survives hide and show',false);
 panel.setAlwaysOnTop(true);pet.hide();panel.hide();pet.showInactive();panel.show();await tick();check('pin survives tray-style restore',true);
 await panel.webContents.reload();await new Promise(r=>setTimeout(r,400));
 await panel.webContents.executeJavaScript('window.tada.onTop(true)');await tick();check('renderer bridge pins both after reload',true);
 await panel.webContents.executeJavaScript('window.tada.collapse()');await tick();check('bridge collapse leaves companion pinned',true);
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
