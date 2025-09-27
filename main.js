const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { resolveLink, isSupportedHost } = require("./logic/hostResolver");

function createWindow() {
    const win = new BrowserWindow({
        width: 640,
        height: 480,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            webviewTag: true,
        },
    });

    win.loadFile("renderer/index.html");
}

// Logging from renderer
ipcMain.on("renderer-log", (event, message) => {
    console.log(`[Renderer] ${message}`);
});

// --- Scan Page with filtering + concurrency (8 workers) ---
ipcMain.on("scan-page", async (event, viewerLinks) => {
    console.log(`[Scraper] Received ${viewerLinks.length} raw links`);

    // Filter to only supported hosts
    const filteredLinks = viewerLinks.filter(isSupportedHost);
    console.log(`[Scraper] ${filteredLinks.length} supported links after filtering`);

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
                            console.log("[Scraper] All links processed");
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
