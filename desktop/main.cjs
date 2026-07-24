const { app, BrowserWindow, screen } = require('electron');
const path = require('path');

app.setAppUserModelId('com.drosalop.iptvplayer');

function createWindow() {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  const win = new BrowserWindow({
    width,
    height,
    useContentSize: true,
    fullscreen: false,
    maximizable: true,
    resizable: true,
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    icon: path.join(app.getAppPath(), 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  });

  win.once('ready-to-show', () => {
    win.maximize();
  });

  win.loadFile(path.join(app.getAppPath(), 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
