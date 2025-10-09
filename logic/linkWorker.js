// logic/linkWorker.js
const { parentPort } = require("worker_threads");
const { resolveLink } = require("./hostResolver");

/**
 * Wrap a promise with a timeout to prevent hanging workers.
 * If resolveLink takes too long, reject automatically.
 */
function withTimeout(promise, ms, link) {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`Timeout after ${ms}ms for ${link}`)), ms);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

// ✅ Persistent worker — stays alive and handles multiple messages
parentPort.on("message", async (link) => {
    try {
        const resolved = await withTimeout(resolveLink(link), 8000, link); // 8s timeout per link
        parentPort.postMessage({
            link,
            resolved,
            status: resolved ? "success" : "failed",
        });
    } catch (err) {
        parentPort.postMessage({
            link,
            resolved: null,
            status: "failed",
            error: err.message,
        });
    }
});
