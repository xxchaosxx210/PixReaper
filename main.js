const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

function createWindow() {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        autoHideMenuBar: true, // hides the default Electron menu bar
        webPreferences: {
            preload: path.join(__dirname, "preload.js"), // preload script for IPC
            contextIsolation: true, // keeps main/renderer isolated for security
            nodeIntegration: false  // don’t expose Node APIs directly in renderer
        }
    });

    // Load your UI
    win.loadFile("renderer/index.html");
}

// 🔹 Listen for log messages sent from the renderer
ipcMain.on("renderer-log", (event, message) => {
    console.log(`[Renderer] ${message}`);
});

// 🔹 App lifecycle
app.whenReady().then(() => {
    createWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Quit when all windows are closed (except on macOS)
app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});
