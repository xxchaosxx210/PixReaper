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
            webviewTag: true, // ✅ enable <webview>
        },
    });

    mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

    // When the renderer has loaded, send current options
    mainWindow.webContents.on("did-finish-load", () => {
        const currentOptions = optionsManager.loadOptions();
        setDebug(!!currentOptions.debugLogging);
        mainWindow.webContents.send("options:load", currentOptions);
    });

    // Debug: catch load errors
    mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
        console.error("[Main] did-fail-load:", code, desc, url);
    });

    mainWindow.on("closed", () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    createWindow();

    // IPC: save options from renderer
    ipcMain.on("options:save", (event, newOptions) => {
        const saved = optionsManager.saveOptions(newOptions);
        setDebug(!!saved.debugLogging); // ✅ update logger
        event.sender.send("options:saved", saved);
        mainWindow.webContents.send("options:load", saved); // push latest back to renderer
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

                    event.sender.send("download:progress", {
                        index,
                        status,
                        savePath,
                    });
                },
                () => cancelDownload // ✅ pass cancel flag callback
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
    ipcMain.on("download:cancel", (event) => {
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
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("activate", () => {
    if (mainWindow === null) {
        createWindow();
    }
});

// --- IPC: Scan Page ---
const CONCURRENCY = 8;

ipcMain.on("scan-page", async (event, links) => {
    logDebug("[Main] Received links:", links.length);
    cancelScan = false;

    for (let i = 0; i < links.length; i += CONCURRENCY) {
        if (cancelScan) {
            logDebug("[Main] Scan cancelled.");
            event.sender.send("scan-complete");
            return;
        }

        const batch = links.slice(i, i + CONCURRENCY);

        await Promise.all(
            batch.map(async (link) => {
                if (cancelScan) return;
                try {
                    const resolved = await resolveLink(link);
                    if (!cancelScan) {
                        event.sender.send("scan-progress", {
                            original: link,
                            resolved,
                            status: resolved ? "success" : "failed",
                        });
                        logDebug("[Main] Resolved:", link, "->", resolved);
                    }
                } catch (err) {
                    logError("[Main] Resolver error for:", link, err);
                    if (!cancelScan) {
                        event.sender.send("scan-progress", {
                            original: link,
                            resolved: null,
                            status: "failed",
                        });
                    }
                }
            })
        );
    }

    if (!cancelScan) {
        event.sender.send("scan-complete");
    }
});

// IPC: cancel scan
ipcMain.on("scan:cancel", (event) => {
    logDebug("[Main] Cancelling scan...");
    cancelScan = true;
});
