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
    debugLogging: false,     // toggle debug logging
    validExtensions: ["jpg", "jpeg"], // ✅ default allowed extensions

    // ✅ Default supported hosts (can be edited in Options UI)
    validHosts: [
        "pixhost.to",
        "imagebam.com",
        "imagevenue.com",
        "imgbox.com",
        "pimpandhost.com",
        "postimg.cc",
        "turboimagehost.com",
        "fastpic.org",
        "fastpic.ru",
        "imagetwist.com",
        "imgview.net",
        "radikal.ru",
        "imageupper.com"
    ],

    // ✅ New: Remember last visited URL (for persistence)
    lastUrl: "about:blank"
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

            // Merge with defaults so new keys (like lastUrl) get added automatically
            const merged = { ...DEFAULT_OPTIONS, ...parsed };

            // ✅ Ensure savePath is valid and normalized
            if (!merged.savePath || typeof merged.savePath !== "string") {
                merged.savePath = DEFAULT_OPTIONS.savePath;
            } else {
                merged.savePath = path.normalize(merged.savePath);
            }

            // ✅ Ensure numeric and string validations
            if (typeof merged.maxConnections !== "number" || merged.maxConnections <= 0) {
                merged.maxConnections = DEFAULT_OPTIONS.maxConnections;
            }

            // ✅ Normalize extensions
            if (!Array.isArray(merged.validExtensions)) {
                merged.validExtensions = [...DEFAULT_OPTIONS.validExtensions];
            } else {
                merged.validExtensions = merged.validExtensions.map(ext =>
                    String(ext).toLowerCase().replace(/^\./, "")
                );
            }

            // ✅ Normalize hosts
            if (!Array.isArray(merged.validHosts)) {
                merged.validHosts = [...DEFAULT_OPTIONS.validHosts];
            } else {
                merged.validHosts = merged.validHosts.map(h =>
                    String(h).toLowerCase().replace(/^www\./, "")
                );
            }

            // ✅ Ensure lastUrl is a valid string
            if (typeof merged.lastUrl !== "string" || !merged.lastUrl.trim()) {
                merged.lastUrl = DEFAULT_OPTIONS.lastUrl;
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

    // ✅ Validate & normalize savePath
    if (!merged.savePath || typeof merged.savePath !== "string") {
        merged.savePath = DEFAULT_OPTIONS.savePath;
    } else {
        merged.savePath = path.normalize(merged.savePath);
    }

    // ✅ Validate numeric field
    if (typeof merged.maxConnections !== "number" || merged.maxConnections <= 0) {
        merged.maxConnections = DEFAULT_OPTIONS.maxConnections;
    }

    // ✅ Normalize extensions before saving
    if (!Array.isArray(merged.validExtensions)) {
        merged.validExtensions = [...DEFAULT_OPTIONS.validExtensions];
    } else {
        merged.validExtensions = merged.validExtensions.map(ext =>
            String(ext).toLowerCase().replace(/^\./, "")
        );
    }

    // ✅ Normalize hosts before saving
    if (!Array.isArray(merged.validHosts)) {
        merged.validHosts = [...DEFAULT_OPTIONS.validHosts];
    } else {
        merged.validHosts = merged.validHosts.map(h =>
            String(h).toLowerCase().replace(/^www\./, "")
        );
    }

    // ✅ Ensure lastUrl always exists as a string
    if (typeof merged.lastUrl !== "string" || !merged.lastUrl.trim()) {
        merged.lastUrl = DEFAULT_OPTIONS.lastUrl;
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
