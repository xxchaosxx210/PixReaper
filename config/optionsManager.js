/**
 * optionsManager.js
 * Handles reading/writing PixReaper options from config/options.json
 */
const fs = require("fs");
const path = require("path");

const optionsPath = path.join(__dirname, "options.json");

function loadOptions() {
    if (!fs.existsSync(optionsPath)) {
        return getDefaultOptions();
    }
    try {
        const data = JSON.parse(fs.readFileSync(optionsPath, "utf-8"));
        return normalizeOptions(data);
    } catch (err) {
        console.error("[OptionsManager] Failed to load options:", err);
        return getDefaultOptions();
    }
}

function saveOptions(newOptions) {
    const normalized = normalizeOptions(newOptions);
    try {
        fs.writeFileSync(optionsPath, JSON.stringify(normalized, null, 2));
    } catch (err) {
        console.error("[OptionsManager] Failed to save options:", err);
    }
    return normalized;
}

function getDefaultOptions() {
    return {
        prefix: "",
        savePath: "",
        createSubfolder: false,
        indexing: "order",
        maxConnections: 10,
        debugLogging: false,
        validExtensions: ["jpg", "jpeg"],
        validHosts: ["imagebam", "imgbox", "pixhost", "imagevenue", "pimpandhost"]
    };
}

function normalizeOptions(opt) {
    return {
        prefix: opt.prefix ?? "",
        savePath: opt.savePath ?? "",
        createSubfolder: !!opt.createSubfolder,
        indexing: opt.indexing === "none" ? "none" : "order",
        maxConnections: Math.max(1, parseInt(opt.maxConnections ?? 10, 10)),
        debugLogging: !!opt.debugLogging,
        validExtensions: Array.isArray(opt.validExtensions) && opt.validExtensions.length > 0
            ? opt.validExtensions.map(e => String(e).toLowerCase())
            : ["jpg", "jpeg"],
        validHosts: Array.isArray(opt.validHosts) && opt.validHosts.length > 0
            ? opt.validHosts.map(h => String(h).toLowerCase().trim()).filter(Boolean)
            : ["imagebam", "imgbox", "pixhost", "imagevenue", "pimpandhost"]
    };
}

module.exports = { loadOptions, saveOptions };

