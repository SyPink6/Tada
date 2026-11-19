const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('tada',Object.freeze({
  toggle:()=>ipcRenderer.invoke('tada:toggle'),
  collapse:()=>ipcRenderer.invoke('tada:collapse'),
  onTop:value=>ipcRenderer.invoke('tada:on-top',value),
  rest:()=>ipcRenderer.invoke('tada:rest'),
  load:()=>ipcRenderer.invoke('tada:load'),
  save:state=>ipcRenderer.invoke('tada:save',state)
}));

contextBridge.exposeInMainWorld('tadaHit',hit=>ipcRenderer.send('tada:hit',!!hit));
