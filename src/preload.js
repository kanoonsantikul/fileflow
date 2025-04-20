const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fileAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  reorderImages: (paths, prefix) => ipcRenderer.invoke('reorder-images', paths, prefix)
});