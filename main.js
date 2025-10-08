/* main.js */

const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const { resolveLink } = require("./logic/hostResolver");
const { logDebug, logInfo, logError, setDebug } = require("./utils/logger");
const optionsManager = require("./config/optionsManager");
const downloader = require("./logic/downloader");

let mainWindow;
let cancelScan = false;
let cancelDownload = false;

/* -------------------- Window Creation -------------------- */
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
    logInfo("[Main] Browser window created and renderer loaded.");

    // When the renderer has loaded, send current options (including lastUrl)
    mainWindow.webContents.on("did-finish-load", () => {
        if (!mainWindow?.webContents) return;
        const currentOptions = optionsManager.loadOptions();
        setDebug(!!currentOptions.debugLogging);
        mainWindow.webContents.send("options:load", currentOptions);
        logInfo("[Main] Renderer finished loading. Options sent to renderer.");
    });

    mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
        logError(`[Main] did-fail-load: ${code} ${desc} ${url}`);
    });

    mainWindow.on("closed", () => {
        logInfo("[Main] Main window closed.");
        mainWindow = null;
    });
}

/* -------------------- App Ready -------------------- */
app.whenReady().then(() => {
    logInfo("[App] Application is ready.");
    createWindow();

    /* ---------- IPC: Options ---------- */
    ipcMain.on("options:save", (event, newOptions) => {
        const saved = optionsManager.saveOptions(newOptions);
        setDebug(!!saved.debugLogging);
        event.sender.send("options:saved", saved);

        // Avoid reload loop when only saving lastUrl
        if (!("lastUrl" in newOptions)) {
            if (mainWindow?.webContents) mainWindow.webContents.send("options:load", saved);
        }

        logInfo("[IPC] Options saved and reloaded.");
    });

    ipcMain.on("options:addBookmark", (event, bookmark) => {
        try {
            const options = optionsManager.loadOptions();
            options.bookmarks = options.bookmarks || [];

            const exists = options.bookmarks.some(
                (b) => b.url.toLowerCase() === bookmark.url.toLowerCase()
            );

            if (!exists && bookmark.url) {
                options.bookmarks.push({
                    title: bookmark.title || bookmark.url,
                    url: bookmark.url,
                });

                const saved = optionsManager.saveOptions(options);
                if (mainWindow?.webContents) mainWindow.webContents.send("options:load", saved);
                event.sender.send("options:saved", saved);
                logInfo(`[IPC] Bookmark added: ${bookmark.url}`);
            } else {
                logDebug("[IPC] Bookmark already exists or invalid:", bookmark);
            }
        } catch (err) {
            logError("[IPC] Failed to add bookmark:", err);
        }
    });

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
                if (mainWindow?.webContents) mainWindow.webContents.send("options:load", saved);
                event.sender.send("options:saved", saved);
                logInfo(`[IPC] Bookmark removed: ${urlToRemove}`);
            } else {
                logDebug("[IPC] No matching bookmark found for removal:", urlToRemove);
            }
        } catch (err) {
            logError("[IPC] Failed to remove bookmark:", err);
        }
    });

    ipcMain.on("options:reset", (event) => {
        const defaults = optionsManager.getDefaultOptions();
        const saved = optionsManager.saveOptions(defaults);
        setDebug(!!saved.debugLogging);
        if (mainWindow?.webContents) mainWindow.webContents.send("options:load", saved);
        event.sender.send("options:saved", saved);
        logInfo("[IPC] Options reset to defaults.");
    });

    /* ---------- IPC: Downloads ---------- */
    ipcMain.on("download:start", async (event, { manifest, options }) => {
        logInfo(`[Download] Starting download of ${manifest.length} files.`);
        cancelDownload = false;

        try {
            await downloader.startDownload(
                manifest,
                options,
                (index, status, savePath) => {
                    if (cancelDownload) {
                        logInfo("[Download] Download cancelled mid-process.");
                        event.sender.send("download:complete");
                        return;
                    }
                    event.sender.send("download:progress", { index, status, savePath });
                },
                () => cancelDownload
            );

            if (!cancelDownload) {
                logInfo("[Download] All downloads completed successfully.");
                event.sender.send("download:complete");
            }
        } catch (err) {
            logError("[Download] Download error:", err);
        }
    });

    ipcMain.on("download:cancel", () => {
        logInfo("[Download] Cancelling downloads...");
        cancelDownload = true;
    });

    /* ---------- IPC: Folder Picker ---------- */
    ipcMain.on("choose-folder", async (event) => {
        logDebug("[Dialog] Folder picker opened.");
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ["openDirectory", "createDirectory"],
        });

        if (!result.canceled && result.filePaths.length > 0) {
            logDebug("[Dialog] Folder selected:", result.filePaths[0]);
            event.sender.send("choose-folder:result", result.filePaths[0]);
        } else {
            logDebug("[Dialog] Folder selection cancelled.");
            event.sender.send("choose-folder:result", null);
        }
    });

    /* ---------- IPC: Logging bridge from renderer ---------- */
    ipcMain.on("log:debug", (_event, args) => logDebug(...args));
    ipcMain.on("log:info", (_event, args) => logInfo(...args));
    ipcMain.on("log:error", (_event, args) => logError(...args));
});

/* -------------------- App Events -------------------- */
app.on("window-all-closed", () => {
    logInfo("[App] All windows closed.");
    if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
    logInfo("[App] Activating application.");
    if (mainWindow === null) createWindow();
});

/* -------------------- IPC: Scan Page -------------------- */
const CONCURRENCY = 8;

ipcMain.on("scan-page", async (event, links) => {
    logInfo(`[Scan] Received ${links.length} links for resolution.`);
    cancelScan = false;

    for (let i = 0; i < links.length; i += CONCURRENCY) {
        if (cancelScan) {
            logInfo("[Scan] Scan cancelled by user.");
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
                        logDebug(`[Scan] Resolved: ${link} → ${resolved || "failed"}`);
                    }
                } catch (err) {
                    logError("[Scan] Resolver error for:", link, err);
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
        logInfo("[Scan] All links processed.");
        event.sender.send("scan-complete");
    }
});

ipcMain.on("scan:cancel", () => {
    logInfo("[Scan] Cancelling scan...");
    cancelScan = true;
});
