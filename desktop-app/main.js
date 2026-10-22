/**
 * ExamProctor.ai — Electron Main Process
 * Manages the desktop application lifecycle, secure BrowserWindow creation,
 * native fullscreen enforcement, focus tracking, and camera permissions.
 */

const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');

// Enforce single application instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
const isDev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';

function getEntryUrl() {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
  if (isDev) {
    return { type: 'url', value: devServerUrl };
  }

  // Look for built dist/index.html in production locations
  const possiblePaths = [
    path.join(__dirname, 'frontend/dist/index.html'),
    path.join(__dirname, '../frontend/dist/index.html'),
    path.join(process.resourcesPath || '', 'frontend/dist/index.html'),
    path.join(process.resourcesPath || '', 'app.asar/frontend/dist/index.html'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return { type: 'file', value: p };
    }
  }

  // Default to relative frontend/dist
  return { type: 'file', value: path.join(__dirname, '../frontend/dist/index.html') };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    title: 'ExamProctor.ai — Student Examination Platform',
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#0a0d14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  // Grant camera permission for proctoring checks
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);
      return;
    }
    callback(false);
  });

  // Native fullscreen event forwarding
  mainWindow.on('enter-full-screen', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:fullscreen-change', true);
    }
  });

  mainWindow.on('leave-full-screen', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:fullscreen-change', false);
    }
  });

  // Focus and blur tracking for examination integrity
  mainWindow.on('blur', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:blur', {
        timestamp: new Date().toISOString(),
      });
    }
  });

  mainWindow.on('focus', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:focus', {
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Restrict navigation to prevent leaving the application
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isLocalhost = url.startsWith('http://localhost:5173') || url.startsWith('http://127.0.0.1:5173');
    const isFile = url.startsWith('file://');
    if (!isLocalhost && !isFile) {
      event.preventDefault();
      console.warn('[Security] Blocked external navigation to:', url);
    }
  });

  // Deny new window creation (window.open, target="_blank")
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.warn('[Security] Denied window.open to:', url);
    return { action: 'deny' };
  });

  // Load content
  const entry = getEntryUrl();
  console.log(`[ExamProctor Desktop] Resolved frontend entry (${entry.type}):`, entry.value);
  if (entry.type === 'url') {
    const devUrl = entry.value.replace(/\/+$/, '');
    mainWindow.loadURL(`${devUrl}/#/login`);
  } else {
    mainWindow.loadFile(entry.value, { hash: '/login' });
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Second instance focus
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// Register IPC handlers
ipcMain.handle('window:set-fullscreen', (_event, flag) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const target = Boolean(flag);
    if (mainWindow.isFullScreen() !== target) {
      mainWindow.setFullScreen(target);
    }
    return mainWindow.isFullScreen();
  }
  return false;
});

ipcMain.handle('window:get-fullscreen', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow.isFullScreen();
  }
  return false;
});

ipcMain.handle('app:get-version', () => {
  return app.getVersion();
});

// App lifecycle
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
