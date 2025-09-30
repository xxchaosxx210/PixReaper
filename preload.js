// preload.js
const { contextBridge, ipcRenderer } = require("electron");

// Expose IPC safely to renderer
contextBridge.exposeInMainWorld("electronAPI", {
    send: (channel, data) => ipcRenderer.send(channel, data),
    receive: (channel, func) =>
        ipcRenderer.on(channel, (event, ...args) => func(...args))
});

// ❌ Removed extra injection of renderer.js
// index.html already loads renderer.js at the bottom
