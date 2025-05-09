const { app, ipcMain, BrowserWindow, dialog } = require('electron');
const path = require('node:path');
const fs = require('fs');

let window;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  window = new BrowserWindow({
    show: false,
    frame: false,
    icon: path.join(__dirname, 'assets/fileflow_icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // and load the index.html of the app.
  window.maximize();
  window.once('ready-to-show', () => {
    window.show();
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

ipcMain.on('minimize', () => {
  window.minimize();
});

ipcMain.on('maximize', () => {
  if (window.isMaximized()) {
    window.restore();
  } else {
    window.maximize();
  }
});

ipcMain.on('close', () => {
  window.close();
});

function isSupportedFile(filePath) {
  return /\.(jpe?g|png|webp|gif|mp4|mov|avi|mkv|webm)$/i.test(filePath);
}

function getSortedFiles(folderPath, sortOption) {
  let files = fs.readdirSync(folderPath)
    .filter(isSupportedFile)
    .map(file => path.join(folderPath, file));

  return sortFiles(files, sortOption);
}

function sortFiles(filePaths, sortOption) {
  if (sortOption === 'created') {
    return filePaths.sort((a, b) => {
      const statA = fs.statSync(a);
      const statB = fs.statSync(b);

      const timeA = statA.birthtimeMs > 0 ? statA.birthtimeMs : statA.mtimeMs;
      const timeB = statB.birthtimeMs > 0 ? statB.birthtimeMs : statB.mtimeMs;

      return timeA - timeB;
    });
  }

  // Default: sort by filename
  return filePaths.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

ipcMain.handle('select-folder', async (_, sortOption) => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });

  if (canceled || filePaths.length === 0) {
    return [];
  }

  const folderPath = filePaths[0];
  return getSortedFiles(folderPath, sortOption);
});

ipcMain.handle('read-folder', async (_, folderPath, sortOption) => {
  return getSortedFiles(folderPath, sortOption);
});

ipcMain.handle('get-file-size', async (_, filePath) => {
  try {
    const stats = fs.statSync(filePath);
    return stats.size;
  } catch (err) {
    console.error('Failed to get file size:', err);
    return null;
  }
});

ipcMain.handle('delete-file', async (_, filePath) => {
  const maxRetries = 20;
  const delay = 300;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      fs.unlinkSync(filePath);
      return true;
    } catch (err) {
      if (['EBUSY', 'EPERM', 'EACCES'].includes(err.code)) {
        console.warn(`Attempt ${attempt}/${maxRetries} failed: file locked — retrying in ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw err; // Non-lock error, propagate
      }
    }
  }
  throw new Error(`File remained locked after ${maxRetries} attempts: ${filePath}`);
});

ipcMain.handle('reorder-images', async (event, paths, prefix, startNumber = 1) => {
  const dir = path.dirname(paths[0]);
  const zeroPad = (startNumber + paths.length - 1).toString().length;
  const tempPaths = [];
  const newPaths = [];

  // Step 1: Rename to temporary names to avoid collisions
  for (let i = 0; i < paths.length; i++) {
    const ext = path.extname(paths[i]);
    const index = String(startNumber + i).padStart(zeroPad, '0');
    const tempName = `.temp_${prefix}_${index}${ext}`;
    const tempPath = path.join(dir, tempName);

    while (true) {
      try {
        fs.renameSync(paths[i], tempPath);
        tempPaths.push(tempPath);
        break;
      } catch (err) {
        const response = await event.sender.invoke('locked-file-action', path.basename(paths[i]));
        if (response === 'skip') {
          break;
        }
        if (response === 'cancel') {
          return { success: false, error: 'Operation cancelled by user.' };
        }
      }
    }
  }

  // Step 2: Rename from temp to final names
  for (let i = 0; i < tempPaths.length; i++) {
    const ext = path.extname(tempPaths[i]);
    const index = String(startNumber + i).padStart(zeroPad, '0');
    const finalName = `${prefix}${index}${ext}`;
    const finalPath = path.join(dir, finalName);

    while (true) {
      try {
        fs.renameSync(tempPaths[i], finalPath);
        newPaths.push(finalPath);
        break;
      } catch (err) {
        const response = await event.sender.invoke('locked-file-action', path.basename(tempPaths[i]));
        if (response === 'skip') {
          break;
        }
        if (response === 'cancel') {
          return { success: false, error: 'Operation cancelled by user.' };
        }
      }
    }
  }

  return { success: true, newPaths };
});
