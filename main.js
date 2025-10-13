/* main.js */

const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const { logDebug, logInfo, logError, setDebug } = require("./utils/logger");
const optionsManager = require("./config/optionsManager");
const downloader = require("./logic/downloader");
const { Worker } = require("worker_threads");
const os = require("os");

/* -------------------- Globals -------------------- */
let mainWindow;
let cancelScan = false;
let cancelDownload = false;
let activeWorkers = new Set();

const MAX_WORKERS = Math.min(8, os.cpus().length);

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
            webviewTag: true,
        },
    });

    mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
    logInfo("[Main] Browser window created and renderer loaded.");

    mainWindow.webContents.on("did-finish-load", () => {
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

    // Preload heavy modules once to avoid first-scan delay
    setTimeout(() => {
        logDebug("[Warmup] Preloading resolver modules...");
        try {
            const { resolveLink } = require("./logic/hostResolver");
            resolveLink("https://example.com").catch(() => { });
        } catch (e) {
            logError("[Warmup] Failed to preload:", e);
        }
    }, 2000);

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
        if (!("lastUrl" in newOptions)) {
            mainWindow?.webContents?.send("options:load", saved);
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
                mainWindow?.webContents?.send("options:load", saved);
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
                mainWindow?.webContents?.send("options:load", saved);
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
        mainWindow?.webContents?.send("options:load", saved);
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
        if (mainWindow?.webContents && !mainWindow.webContents.isDestroyed()) {
            mainWindow.webContents.send("download:cancelled");
        }
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

    /* ---------- IPC: Logging bridge ---------- */
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

/* -------------------- Scan Page (Persistent Worker Pool) -------------------- */
ipcMain.on("scan-page", async (event, links) => {
    logInfo(`[Scan] Starting scan for ${links.length} links using ${MAX_WORKERS} workers`);
    cancelScan = false;
    activeWorkers.clear();

    const queue = [...links];
    const results = [];

    const assignNext = (worker) => {
        if (cancelScan) return;
        const nextLink = queue.shift();
        if (nextLink) {
            logDebug(`[Scan] Assigning link → ${nextLink} (Active: ${activeWorkers.size}, Remaining: ${queue.length})`);
            worker.postMessage(nextLink);
        } else if (activeWorkers.size === 0 && !cancelScan) {
            if (!event.sender.isDestroyed()) event.sender.send("scan-complete", results);
            logInfo(`[Scan] Completed all ${results.length} links.`);
        }
    };

    for (let i = 0; i < MAX_WORKERS && queue.length > 0; i++) {
        const worker = new Worker(path.join(__dirname, "logic", "linkWorker.js"));
        activeWorkers.add(worker);
        worker.unref();

        worker.on("message", (data) => {
            if (cancelScan) return;
            if (data) {
                results.push(data);
                if (!event.sender.isDestroyed()) event.sender.send("scan-progress", data);
                logDebug(`[Scan] ${data.status.toUpperCase()} → ${data.link} (${data.duration ?? "?"}ms)`);
            }
            assignNext(worker);
        });

        worker.on("error", (err) => {
            logError("[Scan] Worker error:", err);
            assignNext(worker);
        });

        worker.on("exit", (code) => {
            activeWorkers.delete(worker);
            logDebug(`[Scan] Worker exited (${code}). Active: ${activeWorkers.size}`);
            if (queue.length === 0 && activeWorkers.size === 0 && !cancelScan) {
                if (!event.sender.isDestroyed()) event.sender.send("scan-complete", results);
                logInfo("[Scan] All workers finished after exit.");
            }
        });

        assignNext(worker);
    }
});

/* --- Cancel Scan --- */
ipcMain.on("scan:cancel", () => {
    logInfo("[Scan] Cancelling scan...");
    cancelScan = true;

    for (const worker of activeWorkers) {
        try {
            worker.terminate();
        } catch (e) {
            logError("[Scan] Error terminating worker:", e);
        }
    }

    activeWorkers.clear();
    logInfo("[Scan] Workers terminated.");

    if (mainWindow?.webContents && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send("scan:cancelled");
    }
});
