const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

app.setAppUserModelId('com.drosalop.iptvplayer');

function getDisplayMetrics(win) {
  const bounds = win?.getBounds?.() || { x: 0, y: 0, width: 0, height: 0 };
  const display = screen.getDisplayMatching(bounds) || screen.getPrimaryDisplay();
  return {
    bounds: display.bounds,
    workArea: display.workArea,
    workAreaSize: display.workAreaSize,
    scaleFactor: display.scaleFactor,
    id: display.id
  };
}

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
    win.webContents.send('iptv-display-metrics', getDisplayMetrics(win));
  });

  win.webContents.on('did-finish-load', () => {
    win.webContents.send('iptv-display-metrics', getDisplayMetrics(win));
  });

  const pushMetrics = () => {
    if (!win.isDestroyed()) win.webContents.send('iptv-display-metrics', getDisplayMetrics(win));
  };
  win.on('resize', pushMetrics);
  win.on('move', pushMetrics);
  win.on('maximize', pushMetrics);
  win.on('unmaximize', pushMetrics);
  win.on('enter-full-screen', pushMetrics);
  win.on('leave-full-screen', pushMetrics);
  screen.on('display-metrics-changed', pushMetrics);

  win.loadFile(path.join(app.getAppPath(), 'index.html'));
}

app.whenReady().then(() => {
  ipcMain.on('iptv-get-display-metrics', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    event.returnValue = getDisplayMetrics(win);
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
