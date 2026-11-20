// Keep the preference-driven task panel in the requested topmost band on hide/restore. The mascot is pinned independently.
// Existing application sources and user snapshots are preserved.
exports.install = ({app,getWindows,getPreference}) => {
  let ready=false, applying=false, desired=false, pending=null;
  const originals=new Map();
  function apply() {
    if(applying||!ready)return;
    applying=true;
    try {
      const windows=getWindows().filter(w=>w&&!w.isDestroyed());
      // Raising an inactive companion must not take keyboard focus.
      for(const win of windows)originals.get(win)?.(desired,'floating');
      if(desired)for(const win of windows)if(win.isVisible())win.moveTop();
    }finally{applying=false;}
  }
  function schedule(){if(applying||pending)return;pending=setTimeout(()=>{pending=null;apply();},0);}
  function attach() {
    const windows=getWindows().filter(w=>w&&!w.isDestroyed());
    if(windows.length===0)return false;
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
