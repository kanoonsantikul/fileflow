const { app, ipcMain, BrowserWindow, dialog } = require('electron');
const path = require('node:path');
const fs = require('fs');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // and load the index.html of the app.
  window.maximize();
  window.once('ready-to-show', () => {
    window.show()
  });
  
  window.loadFile(path.join(__dirname, 'index.html'));
  
  // Open the DevTools.
  window.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('select-folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });

  if (canceled || filePaths.length === 0) {
    return [];
  }

  const folder = filePaths[0];
  const files = fs.readdirSync(folder)
    .filter(file => /\.(jpe?g|png|webp|gif)$/i.test(file))
    .sort((a, b) => a.localeCompare(b))  // sort by name
    .map(file => path.join(folder, file));  // return full path

  return files;
});

ipcMain.handle('reorder-images', async (event, paths, prefix) => {
  try {
    const digits = String(paths.length).length;

    for (let i = 0; i < paths.length; i++) {
      const oldPath = paths[i];
      const ext = path.extname(oldPath);
      const newName = `${prefix}${String(i + 1).padStart(digits, '0')}${ext}`;
      const newPath = path.join(path.dirname(oldPath), newName);

      if (oldPath !== newPath) {
        fs.renameSync(oldPath, newPath);
      }
    }

    return { success: true };
  } catch (error) {
    console.error("Rename error:", error);
    return { success: false, error: error.message };
  }
});