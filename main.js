const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { resolveLink } = require("./logic/hostResolver");
const { logDebug, logError } = require("./utils/logger");
const optionsManager = require("./config/optionsManager");


let mainWindow;

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

        // Reply back with confirmation
        event.sender.send("options:saved", saved);
    });

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
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

    for (let i = 0; i < links.length; i += CONCURRENCY) {
        const batch = links.slice(i, i + CONCURRENCY);

        await Promise.all(batch.map(async (link) => {
            try {
                const resolved = await resolveLink(link);
                event.sender.send("scan-progress", {
                    original: link,
                    resolved,
                    status: resolved ? "success" : "failed",
                });

                logDebug("[Main] Resolved:", link, "->", resolved);
            } catch (err) {
                logError("[Main] Resolver error for:", link, err);

                event.sender.send("scan-progress", {
                    original: link,
                    resolved: null,
                    status: "failed",
                });
            }
        }));
    }
});
