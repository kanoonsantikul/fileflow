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
    icon: path.join(__dirname, 'assets/fileflow_icon.ico'),
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
  // window.webContents.openDevTools();
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

ipcMain.handle('reorder-images', async (_, paths, prefix) => {
  try {
    const dir = path.dirname(paths[0]);
    const zeroPad = paths.length.toString().length;
    const tempPaths = [];
    const newPaths = [];

    // Step 1: rename to temporary names
    for (let i = 0; i < paths.length; i++) {
      const ext = path.extname(paths[i]);
      const tempName = `.temp_${prefix}_${i}${ext}`;
      const tempPath = path.join(dir, tempName);
      fs.renameSync(paths[i], tempPath);
      tempPaths.push(tempPath);
    }

    // Step 2: rename from temp to final names
    for (let i = 0; i < tempPaths.length; i++) {
      const ext = path.extname(tempPaths[i]);
      const finalName = `${prefix}${String(i + 1).padStart(zeroPad, '0')}${ext}`;
      const finalPath = path.join(dir, finalName);
      fs.renameSync(tempPaths[i], finalPath);
      newPaths.push(finalPath);
    }

    return { success: true, newPaths };
  } catch (error) {
    return { success: false, error: error.message };
  }
});