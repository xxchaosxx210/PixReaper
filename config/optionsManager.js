/**
 * optionsManager.js
 * Handles reading/writing PixReaper options from config/options.json
 */

const path = require("path");
const fs = require("fs");

// Path to options.json (inside config folder)
const optionsFilePath = path.join(__dirname, "options.json");

// Default options (used if file missing/corrupted)
const DEFAULT_OPTIONS = {
    prefix: "",
    savePath: "",
    createSubfolder: true,
    maxConnections: 10
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

            return { ...DEFAULT_OPTIONS, ...parsed };
        }
    } catch (err) {
        console.error("[OptionsManager] Failed to load options:", err);
    }

    // fallback
    return { ...DEFAULT_OPTIONS };
}

/**
 * Save options to disk, merging with defaults.
 * Returns the final saved object.
 */
function saveOptions(newOptions = {}) {
    const current = loadOptions();
    const merged = { ...current, ...newOptions };

    // Basic validation
    if (typeof merged.maxConnections !== "number" || merged.maxConnections <= 0) {
        merged.maxConnections = DEFAULT_OPTIONS.maxConnections;
    }

    try {
        fs.writeFileSync(optionsFilePath, JSON.stringify(merged, null, 2), "utf-8");
    } catch (err) {
        console.error("[OptionsManager] Failed to save options:", err);
    }

    return merged;
}

/**
 * Get a copy of default options.
 */
function getDefaultOptions() {
    return { ...DEFAULT_OPTIONS };
}

module.exports = {
    loadOptions,
    saveOptions,
    getDefaultOptions
};
