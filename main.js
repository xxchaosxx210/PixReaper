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

function resolveScanSender(scanState) {
    if (!scanState) return null;
    const sender = scanState.event?.sender;
    if (sender && !sender.isDestroyed()) {
        return sender;
    }
    const fallback = mainWindow?.webContents;
    if (fallback && !fallback.isDestroyed()) {
        return fallback;
    }
    return null;
}

function cancelScan(scanState, { reason = "Scan cancelled.", notifyRenderer = true } = {}) {
    if (!scanState || scanState.cancelled || scanState.hasFinished) {
        return false;
    }

    const resultCount = Array.isArray(scanState.results) ? scanState.results.length : 0;
    scanState.cancelled = true;
    scanState.hasFinished = true;

    if (Array.isArray(scanState.queue)) {
        scanState.queue.length = 0;
    }
    scanState.inFlight = 0;

    for (const worker of scanState.workers) {
        worker
            .terminate()
            .catch((err) => logError("[Scan] Error terminating worker:", err));
    }
    scanState.workers.clear();

    const sender = notifyRenderer ? resolveScanSender(scanState) : null;
    if (sender) {
        sender.send("scan:cancelled");
    }

    if (currentScan === scanState) {
        currentScan = null;
    }

    scanState.results = [];
    scanState.queue = [];
    scanState.event = null;

    logInfo(`[Scan] ${reason} Processed ${resultCount} links before cancellation.`);
    return true;
}

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
        cancelScan(previousScan, {
            reason: "Cancelled previous scan before starting a new one.",
            notifyRenderer: false,
        });
    }

    const linkQueue = Array.isArray(links) ? [...links] : [];
    logInfo(
        `[Scan] Starting scan for ${linkQueue.length} links using ${MAX_WORKERS} workers`
    );

    const scanState = {
        event,
        queue: linkQueue,
        results: [],
        inFlight: 0,
        workers: new Set(),
        cancelled: false,
        hasFinished: false,
    };
    currentScan = scanState;

    const completeScan = () => {
        if (scanState.hasFinished || scanState.cancelled) return;
        scanState.hasFinished = true;

        for (const worker of scanState.workers) {
            worker
                .terminate()
                .catch((err) => logError("[Scan] Error terminating worker after completion:", err));
        }
        scanState.workers.clear();

        const sender = resolveScanSender(scanState);
        if (sender) sender.send("scan-complete", scanState.results);
        if (currentScan === scanState) currentScan = null;
        scanState.event = null;
        scanState.queue = [];
        logInfo(`[Scan] Completed all ${scanState.results.length} links.`);
    };

    const decrementInFlight = () => {
        if (scanState.inFlight > 0) scanState.inFlight -= 1;
    };

    const assignNext = (worker) => {
        if (scanState.cancelled || scanState.hasFinished) return;
        const nextLink = scanState.queue.shift();
        if (nextLink) {
            scanState.inFlight += 1;
            logDebug(
                `[Scan] Assigning link → ${nextLink} (Active: ${scanState.workers.size}, Remaining: ${scanState.queue.length}, InFlight: ${scanState.inFlight})`
            );
            worker.postMessage(nextLink);
        } else if (scanState.inFlight === 0) {
            completeScan();
        }
    };

    if (scanState.queue.length === 0) {
        completeScan();
        return;
    }

    const spawnWorker = () => {
        const worker = new Worker(path.join(__dirname, "logic", "linkWorker.js"));
        scanState.workers.add(worker);
        worker.unref();

        worker.on("message", (data) => {
            decrementInFlight();
            if (scanState.cancelled || scanState.hasFinished) return;
            if (data) {
                scanState.results.push(data);
                const sender = resolveScanSender(scanState);
                if (sender) sender.send("scan-progress", data);
                logDebug(`[Scan] ${data.status.toUpperCase()} → ${data.link} (${data.duration ?? "?"}ms)`);
            }
            assignNext(worker);
        });

        worker.on("error", (err) => {
            decrementInFlight();
            if (scanState.cancelled || scanState.hasFinished) return;
            logError("[Scan] Worker error:", err);
            assignNext(worker);
        });

        worker.on("exit", (code) => {
            scanState.workers.delete(worker);
            logDebug(`[Scan] Worker exited (${code}). Active: ${scanState.workers.size}`);
            if (scanState.cancelled || scanState.hasFinished) {
                if (scanState.workers.size === 0 && currentScan === scanState) {
                    currentScan = null;
                }
                return;
            }
            if (scanState.queue.length === 0 && scanState.inFlight === 0 && scanState.workers.size === 0) {
                completeScan();
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
    if (!cancelScan(currentScan, { reason: "Scan cancelled by user.", notifyRenderer: true })) {
        logDebug("[Scan] No active scan to cancel.");
    }
});
