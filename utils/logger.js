// utils/logger.js
const fs = require("fs");
const path = require("path");
const chalk = require?.("chalk") || null; // optional dependency for color output

let DEBUG = false;
let logFilePath = null;
let logStream = null;

/**
 * Initialize or reset the log file (overwrite mode)
 * Called when a new download starts
 */
function initLogFile(filePath) {
    if (logStream) {
        try { logStream.end(); } catch { }
    }
    logFilePath = filePath;
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    logStream = fs.createWriteStream(filePath, { flags: "w" }); // overwrite mode
}

/**
 * Write a line to the log file (if stream active)
 */
function writeToFile(level, args) {
    if (!logStream) return;
    const timestamp = new Date().toISOString().replace("T", " ").split(".")[0];
    const line = `[${timestamp}] [${level}] ${args.join(" ")}\n`;
    try { logStream.write(line); } catch { }
}

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
        case "INFO": return chalk.cyan(text);
        case "DEBUG": return chalk.gray(text);
        case "WARN": return chalk.yellow(text);
        case "ERROR": return chalk.red(text);
        default: return text;
    }
}

/**
 * General-purpose log (always shown)
 */
function logInfo(...args) {
    console.log(colorize("INFO", "[INFO]"), ...args);
    writeToFile("INFO", args);
}

/**
 * Debug-level log (only shown if DEBUG enabled)
 */
function logDebug(...args) {
    if (!DEBUG) return;
    console.log(colorize("DEBUG", "[DEBUG]"), ...args);
    writeToFile("DEBUG", args);
}

/**
 * Warning-level log (always shown)
 */
function logWarn(...args) {
    console.warn(colorize("WARN", "[WARN]"), ...args);
    writeToFile("WARN", args);
}

/**
 * Error-level log (always shown)
 */
function logError(...args) {
    console.error(colorize("ERROR", "[ERROR]"), ...args);
    writeToFile("ERROR", args);
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
    initLogFile
};
