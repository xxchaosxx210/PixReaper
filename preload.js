// preload.js
const { contextBridge, ipcRenderer } = require("electron");

// Expose IPC safely to renderer
contextBridge.exposeInMainWorld("electronAPI", {
    send: (channel, data) => ipcRenderer.send(channel, data),
    receive: (channel, func) =>
        ipcRenderer.on(channel, (event, ...args) => func(...args))
});

// Load renderer.js into the isolated world
window.addEventListener("DOMContentLoaded", () => {
    const script = document.createElement("script");
    script.src = "renderer.js"; // loads from the same folder as index.html
    document.body.appendChild(script);
});
