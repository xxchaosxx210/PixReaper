// utils/logger.js
let DEBUG = true;

function setDebug(enabled) {
    DEBUG = !!enabled;
    console.log(`[Logger] Debug mode ${DEBUG ? "ENABLED" : "DISABLED"}`);
}

function logDebug(...args) {
    if (DEBUG) console.log("[DEBUG]", ...args);
}

function logWarn(...args) {
    if (DEBUG) console.warn("[WARN]", ...args);
}

function logError(...args) {
    if (DEBUG) console.error("[ERROR]", ...args);
}

module.exports = { setDebug, logDebug, logWarn, logError };
