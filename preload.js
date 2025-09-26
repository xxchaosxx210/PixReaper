const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("logger", {
    log: (msg) => ipcRenderer.send("renderer-log", msg),
});

contextBridge.exposeInMainWorld("electronAPI", {
    scanPage: (links) => ipcRenderer.send("scan-page", links),
    onScanProgress: (callback) =>
        ipcRenderer.on("scan-progress", (event, data) => callback(data)),
});
