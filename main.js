const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
// main.js
const { resolveLink, isSupportedHost } = require("./logic/hostResolver");
const { setDebug, logDebug } = require("./utils/logger");

// enable debugging
setDebug(true);

// Later you can wire this up to a menu item, keyboard shortcut, or even a toggle button in your UI.


function createWindow() {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            webviewTag: true,
        },
    });

    win.loadFile(path.join(__dirname, "renderer", "index.html"));
}


// Logging from renderer
ipcMain.on("renderer-log", (event, message) => {
    logDebug(`[Renderer] ${message}`);
});

// --- Scan Page with filtering + concurrency (8 workers) ---
ipcMain.on("scan-page", async (event, viewerLinks) => {
    logDebug(`[Scraper] Received ${viewerLinks.length} raw links`);

    // Filter to only supported hosts
    const filteredLinks = viewerLinks.filter(isSupportedHost);
    logDebug(`[Scraper] ${filteredLinks.length} supported links after filtering`);

    const concurrency = 8;
    let active = 0;
    let index = 0;

    return new Promise((resolve) => {
        const next = () => {
            while (active < concurrency && index < filteredLinks.length) {
                const currentIndex = index++;
                const link = filteredLinks[currentIndex];
                active++;

                resolveLink(link)
                    .then((resolved) => {
                        if (resolved) {
                            event.sender.send("scan-progress", {
                                index: currentIndex,
                                url: link,
                                status: "ok",
                                resolved,
                            });
                        } else {
                            event.sender.send("scan-progress", {
                                index: currentIndex,
                                url: link,
                                status: "failed",
                            });
                        }
                    })
                    .catch((err) => {
                        console.error("Error resolving link:", err);
                        event.sender.send("scan-progress", {
                            index: currentIndex,
                            url: link,
                            status: "failed",
                        });
                    })
                    .finally(() => {
                        active--;
                        if (index < filteredLinks.length) {
                            next(); // queue next
                        } else if (active === 0) {
                            logDebug("[Scraper] All links processed");
                            resolve();
                        }
                    });
            }
        };

        next();
    });
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
