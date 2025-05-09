const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  minimize: () => ipcRenderer.send('minimize'),
  maximize: () => ipcRenderer.send('maximize'),
  close: () => ipcRenderer.send('close'),
  selectFolder: (sortBy) => ipcRenderer.invoke('select-folder', sortBy),
  reorderImages: (paths, prefix, startNumber) => ipcRenderer.invoke('reorder-images', paths, prefix, startNumber),
  onLockedFileAction: (callback) => ipcRenderer.invoke('locked-file-action', (_, fileName) => callback(fileName))
});