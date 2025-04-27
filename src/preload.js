const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fileAPI', {
  selectFolder: (sortBy) => ipcRenderer.invoke('select-folder', sortBy),
  reorderImages: (paths, prefix) => ipcRenderer.invoke('reorder-images', paths, prefix)
});