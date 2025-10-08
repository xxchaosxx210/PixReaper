// utils/logger.js
let DEBUG = false;

function setDebug(enabled) {
    const newState = !!enabled;
    if (DEBUG === newState) return; // skip redundant toggles
    DEBUG = newState;
    console.log(`[Logger] Debug mode ${DEBUG ? "ENABLED" : "DISABLED"}`);
}


function logDebug(...args) {
    if (DEBUG) console.log("[DEBUG]", ...args);
}

function logWarn(...args) {
    // warnings should always show, regardless of debug
    console.warn("[WARN]", ...args);
}

function logError(...args) {
    // errors should always show, regardless of debug
    console.error("[ERROR]", ...args);
}

module.exports = { setDebug, logDebug, logWarn, logError };
