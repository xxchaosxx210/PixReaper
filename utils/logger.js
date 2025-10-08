// utils/logger.js

const chalk = require?.("chalk") || null; // optional dependency for color output
let DEBUG = false;

/**
 * Enable or disable debug logging.
 * @param {boolean} enabled
 */
function setDebug(enabled) {
    const newState = !!enabled;
    if (DEBUG === newState) return; // skip redundant toggles
    DEBUG = newState;
    logInfo(`[Logger] Debug mode ${DEBUG ? "ENABLED" : "DISABLED"}`);
}

/**
 * Internal helper to colorize logs if chalk is available.
 */
function colorize(level, text) {
    if (!chalk) return text;
    switch (level) {
        case "INFO":
            return chalk.cyan(text);
        case "DEBUG":
            return chalk.gray(text);
        case "WARN":
            return chalk.yellow(text);
        case "ERROR":
            return chalk.red(text);
        default:
            return text;
    }
}

/**
 * General-purpose log (always shown)
 */
function logInfo(...args) {
    console.log(colorize("INFO", "[INFO]"), ...args);
}

/**
 * Debug-level log (only shown if DEBUG enabled)
 */
function logDebug(...args) {
    if (!DEBUG) return;
    console.log(colorize("DEBUG", "[DEBUG]"), ...args);
}

/**
 * Warning-level log (always shown)
 */
function logWarn(...args) {
    console.warn(colorize("WARN", "[WARN]"), ...args);
}

/**
 * Error-level log (always shown)
 */
function logError(...args) {
    console.error(colorize("ERROR", "[ERROR]"), ...args);
}

/**
 * Exported API
 */
module.exports = {
    setDebug,
    logDebug,
    logInfo,
    logWarn,
    logError,
};
