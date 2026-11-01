// Desktop (macOS) wrapper: opens the WebGL game from ../www in a native window.
const { app, BrowserWindow, Menu, net, protocol, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const WEB_ROOT = path.join(__dirname, '..', 'www');
const SCHEME = 'app';

// Serve the game from app://game/ instead of file:// so it behaves like a normal
// web origin (textures for WebGL, audio streaming, sessionStorage for "Play again").
protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

function registerAppProtocol() {
  protocol.handle(SCHEME, (request) => {
    const { pathname } = new URL(request.url);
    const filePath = path.normalize(path.join(WEB_ROOT, decodeURIComponent(pathname)));
    // Never serve anything outside the game folder
    if (filePath !== WEB_ROOT && !filePath.startsWith(WEB_ROOT + path.sep)) {
      return new Response('Not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 450,
    backgroundColor: '#000000',
    title: 'Subway Surfers',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // CI machines may report the window as occluded; keep the game loop running there
      backgroundThrottling: !process.env.SMOKE_TEST,
    },
  });

  win.once('ready-to-show', () => win.show());

  // Links (if any) open in the default browser, never inside the game window
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${SCHEME}://`)) event.preventDefault();
  });

  if (process.env.SMOKE_TEST) runSmokeTest(win);
  win.loadURL(`${SCHEME}://game/index.html`);
}

// CI check (SMOKE_TEST=1): load the game, start it with the keyboard, switch
// lanes, then exit with a non-zero code if anything failed to load.
function runSmokeTest(win) {
  const errors = [];
  win.webContents.on('console-message', (event, ...legacy) => {
    const level = legacy.length ? legacy[0] : event.level;
    const message = legacy.length ? legacy[1] : event.message;
    if (level === 3 || level === 'error') errors.push(message);
  });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => errors.push(`did-fail-load ${code} ${desc} ${url}`));

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const state = () => win.webContents.executeJavaScript(
    '({ started: STARTED, x: staticObjects[0].translation[0], distance: actual_distance, ' +
    'webgl: !!document.getElementById("glcanvas").getContext("webgl"), ' +
    'audioReady: audio.readyState, audioError: audio.error && audio.error.code })');
  const press = async (keyCode) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode });
    await sleep(300);
  };

  win.webContents.once('did-finish-load', async () => {
    let code = 0;
    try {
      win.focus();
      await sleep(4000);
      const before = await state();
      await press('Return');
      await sleep(500);
      const started = await state();
      await press(started.x === 0 ? 'Right' : 'Left');
      const moved = await state();
      console.log('SMOKE before ', JSON.stringify(before));
      console.log('SMOKE started', JSON.stringify(started));
      console.log('SMOKE moved  ', JSON.stringify(moved));
      if (!before.webgl) errors.push('WebGL context not available');
      if (before.audioError) errors.push('Audio failed to load: ' + before.audioError);
      if (!started.started) errors.push('Enter did not start the game');
      if (!(started.distance > before.distance)) errors.push('Game loop is not running');
    } catch (e) {
      errors.push(String(e && e.stack || e));
    }
    if (errors.length) {
      console.error('SMOKE FAILED:\n' + errors.join('\n'));
      code = 1;
    } else {
      console.log('SMOKE OK');
    }
    app.exit(code);
  });
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'Game',
      submenu: [
        { label: 'Restart', accelerator: 'CmdOrCtrl+R', click: (_, win) => win && win.webContents.reload() },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools', accelerator: isMac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I' },
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  registerAppProtocol();
  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// It's a game: closing the window quits the app (also on macOS)
app.on('window-all-closed', () => app.quit());
