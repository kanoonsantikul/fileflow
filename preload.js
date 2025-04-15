const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  renameImages: (filePaths, prefix) => ipcRenderer.invoke('rename-images', filePaths, prefix)
});