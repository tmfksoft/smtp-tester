const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('smtp', {
  sendEmail: (config) => ipcRenderer.invoke('send-email', config),
});
