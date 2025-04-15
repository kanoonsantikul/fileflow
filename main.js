const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.loadFile('renderer/index.html');
}

app.whenReady().then(createWindow);

// Handle renaming request
ipcMain.handle('rename-images', async (_, filePaths, prefix) => {
  const padding = String(filePaths.length).length;
  filePaths.forEach((filePath, i) => {
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const newName = `${prefix}${String(i + 1).padStart(padding, '0')}${ext}`;
    const newPath = path.join(dir, newName);
    fs.renameSync(filePath, newPath);
  });
  return true;
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  const dir = result.filePaths[0];
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'];

  const images = fs.readdirSync(dir)
    .filter(file => imageExtensions.includes(path.extname(file).toLowerCase()))
    .map(file => path.join(dir, file));

  return { dir, images };
});