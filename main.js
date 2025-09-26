const { app, BrowserWindow } = require('electron');

function createWindow() {
    // For now, just show a blank window
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        autoHideMenuBar: true // 👈 hides the Electron menu
    });

    win.loadURL('about:blank');
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
