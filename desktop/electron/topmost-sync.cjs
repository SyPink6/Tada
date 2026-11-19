// Keep both native windows in the same topmost band, including hide/restore.
// Existing application sources and user snapshots are preserved.
exports.install = ({app,getWindows,getPreference}) => {
  let ready=false, applying=false, desired=false, pending=null;
  const originals=new Map();
  function apply() {
    if(applying||!ready)return;
    applying=true;
    try {
      const [pet,panel]=getWindows();
      for(const win of [pet,panel])if(win&&!win.isDestroyed())originals.get(win)(desired,'floating');
      // Raising an inactive companion must not take keyboard focus.
      if(desired&&pet&&!pet.isDestroyed()&&pet.isVisible())pet.moveTop();
      if(desired&&panel&&!panel.isDestroyed()&&panel.isVisible())panel.moveTop();
    }finally{applying=false;}
  }
  function schedule(){if(applying||pending)return;pending=setTimeout(()=>{pending=null;apply();},0);}
  function attach() {
    const windows=getWindows();
    if(windows.length!==2||windows.some(w=>!w||w.isDestroyed()))return false;
    desired=Boolean(getPreference());
    for(const win of windows){
      originals.set(win,win.setAlwaysOnTop.bind(win));
      win.setAlwaysOnTop=function(flag){
        if(typeof flag!=='boolean')throw new TypeError('Topmost preference must be boolean');
        desired=flag;apply();
      };
      for(const name of ['show','restore','hide','focus','blur','always-on-top-changed'])win.on(name,schedule);
    }
    ready=true;apply();return true;
  }
  app.whenReady().then(()=>{
    if(attach())return;
    const startup=setInterval(()=>{if(attach())clearInterval(startup);},25);
    startup.unref();
    app.once('before-quit',()=>clearInterval(startup));
  });
  app.once('before-quit',()=>{if(pending)clearTimeout(pending);});
};
