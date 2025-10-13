// logic/linkWorker.js
const { parentPort } = require("worker_threads");
const { resolveLink } = require("./hostResolver");

/**
 * Adds a timeout guard so no single link can hang.
 */
function withTimeout(promise, ms, link) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms for ${link}`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Persistent worker — stays alive and handles multiple messages.
 */
parentPort.on("message", async (link) => {
    if (!link) return;
    const start = Date.now();

    try {
        const resolved = await withTimeout(resolveLink(link), 8000, link);
        parentPort.postMessage({
            link,
            resolved,
            status: resolved ? "success" : "failed",
            duration: Date.now() - start,
        });
    } catch (err) {
        parentPort.postMessage({
            link,
            resolved: null,
            status: "failed",
            error: err.message,
            duration: Date.now() - start,
        });
    }
});
