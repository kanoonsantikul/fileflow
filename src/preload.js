const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  minimize: () => ipcRenderer.send('minimize'),
  maximize: () => ipcRenderer.send('maximize'),
  close: () => ipcRenderer.send('close'),
  selectFolder: (sortOption) => ipcRenderer.invoke('select-folder', sortOption),
  readFolder: (folderPath, sortOption) => ipcRenderer.invoke('read-folder', folderPath, sortOption),
  reorderImages: (paths, prefix, startNumber) => ipcRenderer.invoke('reorder-images', paths, prefix, startNumber),
  onLockedFileAction: (callback) => ipcRenderer.invoke('locked-file-action', (_, fileName) => callback(fileName))
});