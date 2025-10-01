/* main.js */

const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const { resolveLink } = require("./logic/hostResolver");
const { logDebug, logError, setDebug } = require("./utils/logger");
const optionsManager = require("./config/optionsManager");
const downloader = require("./logic/downloader");

let mainWindow;
let cancelScan = false;
let cancelDownload = false;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            webviewTag: true,
        },
    });

    mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

    mainWindow.webContents.on("did-finish-load", () => {
        const currentOptions = optionsManager.loadOptions();
        setDebug(!!currentOptions.debugLogging);
        mainWindow.webContents.send("options:load", currentOptions);
    });

    mainWindow.on("closed", () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    createWindow();

    // IPC: save options
    ipcMain.on("options:save", (event, newOptions) => {
        const saved = optionsManager.saveOptions(newOptions);
        setDebug(!!saved.debugLogging);
        event.sender.send("options:saved", saved);
        mainWindow.webContents.send("options:load", saved);
    });

    // IPC: reset options to defaults
    ipcMain.on("options:reset", (event) => {
        const defaults = optionsManager.getDefaultOptions();
        const saved = optionsManager.saveOptions(defaults);
        setDebug(!!saved.debugLogging);
        event.sender.send("options:saved", saved);
        mainWindow.webContents.send("options:load", saved); // refresh UI
    });


    // IPC: start downloads
    ipcMain.on("download:start", async (event, { manifest, options }) => {
        logDebug("[Main] Starting downloads:", manifest.length, "files");
        cancelDownload = false;

        try {
            await downloader.startDownload(
                manifest,
                options,
                (index, status, savePath) => {
                    if (cancelDownload) {
                        logDebug("[Main] Download cancelled.");
                        event.sender.send("download:complete");
                        return;
                    }
                    event.sender.send("download:progress", { index, status, savePath });
                },
                () => cancelDownload
            );

            if (!cancelDownload) {
                logDebug("[Main] All downloads finished.");
                event.sender.send("download:complete");
            }
        } catch (err) {
            logError("[Main] Download error:", err);
        }
    });

    // IPC: cancel download
    ipcMain.on("download:cancel", () => {
        logDebug("[Main] Cancelling downloads...");
        cancelDownload = true;
    });

    // IPC: folder picker
    ipcMain.on("choose-folder", async (event) => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ["openDirectory", "createDirectory"],
        });

        if (!result.canceled && result.filePaths.length > 0) {
            event.sender.send("choose-folder:result", result.filePaths[0]);
        } else {
            event.sender.send("choose-folder:result", null);
        }
    });

    // IPC: scan page
    const CONCURRENCY = 8;
    ipcMain.on("scan-page", async (event, links) => {
        logDebug("[Main] Received links:", links.length);
        cancelScan = false;

        for (let i = 0; i < links.length; i++) {
            if (cancelScan) break;
            const href = links[i];
            try {
                const resolved = await resolveLink(href);
                event.sender.send("scan-progress", { original: href, resolved });
            } catch (err) {
                logError("[Main] Resolver failed for:", href, err);
            }
        }

        event.sender.send("scan-complete");
    });

    ipcMain.on("scan:cancel", () => {
        cancelScan = true;
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});
