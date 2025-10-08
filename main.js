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
        icon: path.join(__dirname, "build", "icon.ico"),
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            webviewTag: true, // ✅ enable <webview>
        },
    });

    mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

    // When the renderer has loaded, send current options (including lastUrl)
    mainWindow.webContents.on("did-finish-load", () => {
        const currentOptions = optionsManager.loadOptions();
        setDebug(!!currentOptions.debugLogging);
        mainWindow.webContents.send("options:load", currentOptions);
    });

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
        setDebug(!!saved.debugLogging);
        event.sender.send("options:saved", saved);

        // Avoid reload loop when only saving lastUrl
        if (!("lastUrl" in newOptions)) {
            mainWindow.webContents.send("options:load", saved);
        }

    });

    // ✅ IPC: Add bookmark
    ipcMain.on("options:addBookmark", (event, bookmark) => {
        try {
            const options = optionsManager.loadOptions();
            options.bookmarks = options.bookmarks || [];

            // Prevent duplicates
            const exists = options.bookmarks.some(
                (b) => b.url.toLowerCase() === bookmark.url.toLowerCase()
            );

            if (!exists && bookmark.url) {
                options.bookmarks.push({
                    title: bookmark.title || bookmark.url,
                    url: bookmark.url,
                });

                const saved = optionsManager.saveOptions(options);

                // Send updated options back to renderer
                mainWindow.webContents.send("options:load", saved);
                event.sender.send("options:saved", saved);
            } else {
                logDebug("[Main] Bookmark already exists or invalid:", bookmark);
            }
        } catch (err) {
            logError("[Main] Failed to add bookmark:", err);
        }
    });

    // ✅ IPC: Remove bookmark
    ipcMain.on("options:removeBookmark", (event, urlToRemove) => {
        if (!urlToRemove) return;

        try {
            const options = optionsManager.loadOptions();
            options.bookmarks = options.bookmarks || [];

            const beforeCount = options.bookmarks.length;
            options.bookmarks = options.bookmarks.filter(
                (b) => b.url.toLowerCase() !== urlToRemove.toLowerCase()
            );

            if (options.bookmarks.length < beforeCount) {
                const saved = optionsManager.saveOptions(options);

                // Update UI with refreshed bookmark list
                mainWindow.webContents.send("options:load", saved);
                event.sender.send("options:saved", saved);
            } else {
                logDebug("[Main] No matching bookmark found for removal:", urlToRemove);
            }
        } catch (err) {
            logError("[Main] Failed to remove bookmark:", err);
        }
    });

    // IPC: reset options to defaults
    ipcMain.on("options:reset", (event) => {
        const defaults = optionsManager.getDefaultOptions();
        const saved = optionsManager.saveOptions(defaults);
        setDebug(!!saved.debugLogging);
        mainWindow.webContents.send("options:load", saved);
        event.sender.send("options:saved", saved);
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

// --- APP Events ---
app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
    if (mainWindow === null) createWindow();
});

// --- IPC: Scan Page ---
const CONCURRENCY = 8;

ipcMain.on("scan-page", async (event, links) => {
    logDebug("[Main] Received links:", links);
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
