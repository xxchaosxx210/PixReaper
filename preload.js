const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld("logger", {
    log: (msg) => ipcRenderer.send("renderer-log", msg)
});
