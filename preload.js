// preload.js
const { contextBridge, ipcRenderer } = require("electron");

// --- Safe IPC Bridge ---
contextBridge.exposeInMainWorld("electronAPI", {
    send: (channel, data) => {
        try {
            ipcRenderer.send(channel, data);
        } catch (err) {
            console.error("[Preload] Failed to send IPC message:", channel, err);
        }
    },
    receive: (channel, func) => {
        try {
            ipcRenderer.on(channel, (event, ...args) => func(...args));
        } catch (err) {
            console.error("[Preload] Failed to set IPC listener:", channel, err);
        }
    },
});

// --- Load renderer.js safely after DOM and webview are ready ---
window.addEventListener("DOMContentLoaded", () => {
    const webview = document.querySelector("webview");

    if (webview) {
        webview.addEventListener("dom-ready", () => {
            console.log("[Preload] Webview ready, loading renderer.js.");
            injectRenderer();
        });
    } else {
        console.warn("[Preload] No webview found, loading renderer.js immediately.");
        injectRenderer();
    }
});

function injectRenderer() {
    const script = document.createElement("script");
    script.src = "renderer.js";
    script.defer = true;
    document.body.appendChild(script);
}
