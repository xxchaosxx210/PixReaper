const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { resolveLink } = require("./logic/hostResolver");
const { logDebug, logError } = require("./utils/logger");

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 640,
        height: 480,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            webviewTag: true, // ✅ enable <webview> in index.html
        },
    });

    // Load the renderer UI
    mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

    // Debug: catch load errors
    mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
        console.error("[Main] did-fail-load:", code, desc, url);
    });

    mainWindow.on("closed", () => {
        mainWindow = null;
    });
}

app.whenReady().then(createWindow);

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
ipcMain.on("scan-page", async (event, links) => {
    logDebug("[Main] Received links:", links.length);

    for (const link of links) {
        try {
            const resolved = await resolveLink(link);

            event.sender.send("scan-progress", {
                original: link,                        // matches renderer.js
                resolved,                              // direct image URL
                status: resolved ? "success" : "failed", // normalize status
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
    }
});
