/* main.js */

const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const { logDebug, logInfo, logError, setDebug } = require("./utils/logger");
const optionsManager = require("./config/optionsManager");
const downloader = require("./logic/downloader");
const hostResolver = require("./logic/hostResolver");
const { Worker } = require("worker_threads");
const os = require("os");

/* -------------------- Globals -------------------- */
let mainWindow;
let cancelDownload = false;
let currentScan = null;

const cpuCount = os.cpus()?.length || 1;
const MAX_WORKERS = Math.min(8, Math.max(1, cpuCount));

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
        hostResolver.refreshResolverOptions(currentOptions);
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
            hostResolver.resolveLink("https://example.com").catch(() => { });
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
        hostResolver.refreshResolverOptions(saved);
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
                hostResolver.refreshResolverOptions(saved);
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
                hostResolver.refreshResolverOptions(saved);
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
        hostResolver.refreshResolverOptions(saved);
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
    const previousScan = currentScan;
    if (previousScan && !previousScan.hasFinished && !previousScan.cancelled) {
        logDebug("[Scan] Aborting previous scan before starting a new one.");
        for (const worker of previousScan.workers) {
            worker
                .terminate()
                .catch((err) => logError("[Scan] Error terminating stale worker:", err));
        }
        previousScan.workers.clear();
        previousScan.cancelled = true;
        if (Array.isArray(previousScan.queue)) previousScan.queue.length = 0;
        previousScan.inFlight = 0;
        if (previousScan.event?.sender && !previousScan.event.sender.isDestroyed()) {
            previousScan.event.sender.send("scan:cancelled");
        }
    }

    const queue = Array.isArray(links) ? [...links] : [];
    logInfo(`[Scan] Starting scan for ${queue.length} links using ${MAX_WORKERS} workers`);

    const scanState = {
        event,
        queue,
        results: [],
        inFlight: 0,
        workers: new Set(),
        cancelled: false,
        hasFinished: false,
    };
    currentScan = scanState;

    const safeSender = () => {
        const sender = scanState.event?.sender;
        return sender && !sender.isDestroyed() ? sender : null;
    };

    const queue = [...links];
    const results = [];
    let inFlight = 0;
    let hasFinished = false;

    const finishScan = () => {
        if (hasFinished || cancelScan) return;
        hasFinished = true;

        for (const worker of activeWorkers) {
            worker
                .terminate()
                .catch((err) => logError("[Scan] Error terminating worker after completion:", err));
        }
        activeWorkers.clear();

        if (!event.sender.isDestroyed()) event.sender.send("scan-complete", results);
        logInfo(`[Scan] Completed all ${results.length} links.`);
    };

    const assignNext = (worker) => {
        if (cancelScan || hasFinished) return;
        const nextLink = queue.shift();
        if (nextLink) {
            inFlight += 1;
            logDebug(`[Scan] Assigning link → ${nextLink} (Active: ${activeWorkers.size}, Remaining: ${queue.length}, InFlight: ${inFlight})`);
            worker.postMessage(nextLink);
        } else if (inFlight === 0) {
            finishScan();
        }
    };

    if (queue.length === 0) {
        finishScan();
        return;
    }

    for (let i = 0; i < MAX_WORKERS && queue.length > 0; i++) {
        const worker = new Worker(path.join(__dirname, "logic", "linkWorker.js"));
        scanState.workers.add(worker);
        worker.unref();

        worker.on("message", (data) => {
            if (inFlight > 0) inFlight -= 1;
            if (cancelScan || hasFinished) return;
            if (data) {
                scanState.results.push(data);
                const sender = safeSender();
                if (sender) sender.send("scan-progress", data);
                logDebug(`[Scan] ${data.status.toUpperCase()} → ${data.link} (${data.duration ?? "?"}ms)`);
            }
            assignNext(worker);
        });

        worker.on("error", (err) => {
            if (inFlight > 0) inFlight -= 1;
            logError("[Scan] Worker error:", err);
            assignNext(worker);
        });

        worker.on("exit", (code) => {
            activeWorkers.delete(worker);
            logDebug(`[Scan] Worker exited (${code}). Active: ${activeWorkers.size}`);
            if (inFlight > 0) inFlight -= 1;
            if (queue.length === 0 && activeWorkers.size === 0 && !cancelScan) {
                finishScan();
            }
        });

        return worker;
    };

    const workerCount = Math.min(MAX_WORKERS, scanState.queue.length);
    for (let i = 0; i < workerCount; i++) {
        const worker = spawnWorker();
        assignNext(worker);
    }
});

/* --- Cancel Scan --- */
ipcMain.on("scan:cancel", () => {
    logInfo("[Scan] Cancelling scan...");

    const scanState = currentScan;
    if (!scanState) {
        logDebug("[Scan] No active scan to cancel.");
        return;
    }

    scanState.cancelled = true;
    for (const worker of scanState.workers) {
        worker
            .terminate()
            .catch((err) => logError("[Scan] Error terminating worker:", err));
    }
    scanState.workers.clear();
    scanState.queue.length = 0;
    scanState.inFlight = 0;
    if (currentScan === scanState) currentScan = null;

    const sender = scanState.event?.sender && !scanState.event.sender.isDestroyed()
        ? scanState.event.sender
        : mainWindow?.webContents && !mainWindow.webContents.isDestroyed()
            ? mainWindow.webContents
            : null;
    if (sender) sender.send("scan:cancelled");

    logInfo("[Scan] Workers terminated.");
});
