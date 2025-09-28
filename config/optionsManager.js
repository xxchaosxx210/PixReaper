/**
 * optionsManager.js
 * Handles reading/writing PixReaper options from config/options.json
 */

const path = require("path");
const fs = require("fs");
const os = require("os");

// Path to options.json (inside config folder)
const optionsFilePath = path.join(__dirname, "options.json");

// Default options (used if file missing/corrupted)
const DEFAULT_OPTIONS = {
    prefix: "",
    savePath: path.join(os.homedir(), "Downloads", "PixReaper"),
    createSubfolder: true,   // if true: try to use page URL slug, else fallback to timestamp
    maxConnections: 10,
    indexing: "order",       // "order" or "none"
    debugLogging: false      // toggle debug logging
};

/**
 * Safely load options from disk.
 * Falls back to DEFAULT_OPTIONS if file is missing or invalid.
 */
function loadOptions() {
    try {
        if (fs.existsSync(optionsFilePath)) {
            const raw = fs.readFileSync(optionsFilePath, "utf-8");
            const parsed = JSON.parse(raw);

            const merged = { ...DEFAULT_OPTIONS, ...parsed };

            if (!merged.savePath || typeof merged.savePath !== "string") {
                merged.savePath = DEFAULT_OPTIONS.savePath;
            } else {
                merged.savePath = path.normalize(merged.savePath);
            }

            if (typeof merged.maxConnections !== "number" || merged.maxConnections <= 0) {
                merged.maxConnections = DEFAULT_OPTIONS.maxConnections;
            }

            return merged;
        }
    } catch (err) {
        console.error("[OptionsManager] Failed to load options:", err);
    }

    return { ...DEFAULT_OPTIONS };
}

/**
 * Save options to disk, merging with defaults.
 * Returns the final saved object.
 */
function saveOptions(newOptions = {}) {
    const current = loadOptions();
    const merged = { ...current, ...newOptions };

    if (typeof merged.maxConnections !== "number" || merged.maxConnections <= 0) {
        merged.maxConnections = DEFAULT_OPTIONS.maxConnections;
    }

    if (!merged.savePath || typeof merged.savePath !== "string") {
        merged.savePath = DEFAULT_OPTIONS.savePath;
    } else {
        merged.savePath = path.normalize(merged.savePath);
    }

    try {
        fs.writeFileSync(optionsFilePath, JSON.stringify(merged, null, 2), "utf-8");
    } catch (err) {
        console.error("[OptionsManager] Failed to save options:", err);
    }

    return merged;
}

function getDefaultOptions() {
    return { ...DEFAULT_OPTIONS };
}

module.exports = {
    loadOptions,
    saveOptions,
    getDefaultOptions
};
