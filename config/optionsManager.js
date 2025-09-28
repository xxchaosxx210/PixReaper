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

// --- Public API ---

/**
 * loadOptions()
 * - Reads options.json from disk.
 * - If missing/corrupted, falls back to DEFAULT_OPTIONS.
 * - Returns merged options object.
 */
function loadOptions() {
    // implementation goes here
}

/**
 * saveOptions(newOptions)
 * - Validates values (types, ranges).
 * - Merges with existing options.
 * - Writes back to options.json.
 * - Returns final saved options.
 */
function saveOptions(newOptions) {
    // implementation goes here
}

/**
 * getDefaultOptions()
 * - Returns a clone of DEFAULT_OPTIONS.
 */
function getDefaultOptions() {
    // implementation goes here
}

module.exports = {
    loadOptions,
    saveOptions,
    getDefaultOptions
};
