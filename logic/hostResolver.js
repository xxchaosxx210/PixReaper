// logic/hostResolver.js
const fetch = require("node-fetch");
let fetchCookie = require("fetch-cookie");
if (fetchCookie.default) fetchCookie = fetchCookie.default; // ESM interop
const { JSDOM } = require("jsdom");
const tough = require("tough-cookie");
const { logDebug, logWarn, logError } = require("../utils/logger");
const { loadOptions } = require("../config/optionsManager");

/* ---------- Shared Cookie Jar ---------- */
const jar = new tough.CookieJar();
const fetchWithCookies = fetchCookie(fetch, jar);

/* ---------- Safe Fetch Helper ---------- */
/**
 * Fetch wrapper with timeout and graceful abort.
 * Ensures every request resolves or rejects within `timeoutMs`.
 */
async function safeFetch(url, options = {}, timeoutMs = 7000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetchWithCookies(url, { ...options, signal: controller.signal });
        return res;
    } catch (err) {
        if (err.name === "AbortError") {
            logWarn(`[FetchTimeout] ${url} exceeded ${timeoutMs}ms`);
        } else {
            logError(`[FetchError] ${url}:`, err.message);
        }
        return null;
    } finally {
        clearTimeout(id);
    }
}

/* ---------- Utility: Valid Extension Regex ---------- */
function getExtRegex() {
    const options = loadOptions();
    const valid = options.validExtensions?.length ? options.validExtensions : ["jpg", "jpeg"];
    return new RegExp(`\\.(${valid.join("|")})(?:$|\\?)`, "i");
}

/* ---------- Generic Fallback Resolver ---------- */
async function genericResolver(url) {
    try {
        const res = await safeFetch(url);
        if (!res || !res.ok) throw new Error(`Generic resolver HTTP ${res?.status}`);
        const html = (await res.text()).slice(0, 500_000); // limit HTML to 500KB
        const doc = new JSDOM(html).window.document;
        const extRegex = getExtRegex();

        // Look for obvious <img>
        let img = doc.querySelector("img");
        if (img?.src && extRegex.test(img.src)) return new URL(img.src, url).href;

        // Try OpenGraph
        const og = doc.querySelector('meta[property="og:image"]');
        if (og?.content && extRegex.test(og.content)) return new URL(og.content, url).href;

        logWarn("Generic resolver failed (no match):", url);
        return null;
    } catch (err) {
        logError("Generic resolver error:", err);
        return null;
    }
}

/* ---------- Host-Specific Resolvers ---------- */
const hostResolvers = {
    /* --- Pixhost --- */
    "pixhost.to": async (url) => {
        try {
            const res = await safeFetch(url);
            if (!res || !res.ok) throw new Error(`Pixhost HTTP ${res?.status}`);
            const html = (await res.text()).slice(0, 400_000);
            const doc = new JSDOM(html).window.document;
            const extRegex = getExtRegex();

            const img = doc.querySelector("#image, img#show_image");
            if (img?.src && extRegex.test(img.src)) return new URL(img.src, url).href;

            const og = doc.querySelector('meta[property="og:image"]');
            if (og?.content && extRegex.test(og.content)) return new URL(og.content, url).href;

            logWarn("Pixhost resolver failed:", url);
            return null;
        } catch (err) {
            logError("Pixhost resolver error:", err);
            return null;
        }
    },

    /* --- ImageBam (interstitial cookie bypass) --- */
    "imagebam.com": async (url) => {
        try {
            const extRegex = getExtRegex();
            let res1 = await safeFetch(url);
            if (!res1 || !res1.ok) throw new Error(`ImageBam HTTP ${res1?.status}`);
            const html1 = (await res1.text()).slice(0, 400_000);
            const doc1 = new JSDOM(html1).window.document;

            const continueLink = doc1.querySelector("#continue a[data-shown='inter']");
            if (continueLink) {
                logDebug("⚠️ ImageBam interstitial detected, injecting cookie...");
                const cookies = await jar.getCookies(url);
                const hasCookie = cookies.some((c) => c.key === "nsfw_inter");
                if (!hasCookie) {
                    jar.setCookieSync("nsfw_inter=1; Domain=.imagebam.com; Path=/", url);
                    logDebug("🍪 nsfw_inter=1 cookie set");
                }

                const res2 = await safeFetch(url);
                if (!res2 || !res2.ok) throw new Error(`ImageBam retry HTTP ${res2?.status}`);
                const html2 = (await res2.text()).slice(0, 400_000);
                const doc2 = new JSDOM(html2).window.document;

                const img =
                    doc2.querySelector("#imageContainer img, .main-image, img#mainImage");
                if (img?.src && extRegex.test(img.src)) return new URL(img.src, url).href;
                return null;
            }

            const img =
                doc1.querySelector("#imageContainer img, .main-image, img#mainImage");
            if (img?.src && extRegex.test(img.src)) return new URL(img.src, url).href;
            return null;
        } catch (err) {
            logError("ImageBam resolver error:", err);
            return null;
        }
    },

    /* --- ImageVenue --- */
    "imagevenue.com": async (url) => {
        try {
            const res = await safeFetch(url, {
                headers: { "User-Agent": "PixReaper/1.0", Referer: url },
            });
            if (!res || !res.ok) throw new Error(`ImageVenue HTTP ${res?.status}`);
            const html = (await res.text()).slice(0, 400_000);
            const doc = new JSDOM(html).window.document;
            const extRegex = getExtRegex();

            const img = doc.querySelector("img#main-image");
            if (img?.src && extRegex.test(img.src)) return new URL(img.src, url).href;

            const candidates = [...doc.querySelectorAll("img")]
                .map((el) => el.src)
                .filter((src) => src && extRegex.test(src));
            if (candidates.length) return new URL(candidates[0], url).href;

            const og = doc.querySelector('meta[property="og:image"]');
            if (og?.content && extRegex.test(og.content)) return new URL(og.content, url).href;

            logWarn("ImageVenue resolver failed (no match):", url);
            return null;
        } catch (err) {
            logError("ImageVenue resolver error:", err);
            return null;
        }
    },

    /* --- ImgBox --- */
    "imgbox.com": async (url) => {
        try {
            const res = await safeFetch(url);
            if (!res || !res.ok) throw new Error(`ImgBox HTTP ${res?.status}`);
            const html = (await res.text()).slice(0, 400_000);
            const doc = new JSDOM(html).window.document;
            const extRegex = getExtRegex();

            const img = doc.querySelector(".img-content img");
            if (img?.src && extRegex.test(img.src)) return new URL(img.src, url).href;

            const og = doc.querySelector('meta[property="og:image"]');
            if (og?.content && extRegex.test(og.content)) return new URL(og.content, url).href;

            return null;
        } catch (err) {
            logError("ImgBox resolver error:", err);
            return null;
        }
    },

    /* --- TurboImageHost (others similar) --- */
    "turboimagehost.com": async (url) => {
        try {
            const res = await safeFetch(url);
            if (!res || !res.ok) throw new Error(`TurboImageHost HTTP ${res?.status}`);
            const html = (await res.text()).slice(0, 400_000);
            const doc = new JSDOM(html).window.document;
            const extRegex = getExtRegex();

            const img = doc.querySelector("img.pic");
            if (img?.src && extRegex.test(img.src)) return new URL(img.src, url).href;

            const og = doc.querySelector('meta[property="og:image"]');
            if (og?.content && extRegex.test(og.content)) return new URL(og.content, url).href;

            return null;
        } catch (err) {
            logError("TurboImageHost resolver error:", err);
            return null;
        }
    },
};

/* ---------- Dispatcher ---------- */
async function resolveLink(url) {
    try {
        const hostname = new URL(url).hostname.replace(/^www\./, "");
        const options = loadOptions();
        const validHosts = options.validHosts || [];

        const resolverKey = Object.keys(hostResolvers).find((host) =>
            hostname.endsWith(host)
        );

        if (resolverKey) {
            return await hostResolvers[resolverKey](url);
        }

        if (validHosts.some((h) => hostname.endsWith(h))) {
            logDebug(`Using generic resolver for: ${hostname}`);
            return await genericResolver(url);
        }

        logWarn("No resolver for host:", hostname);
        return null;
    } catch (err) {
        logError("resolveLink error:", err);
        return null;
    }
}

/* ---------- Host Support Checker ---------- */
function isSupportedHost(url) {
    try {
        const hostname = new URL(url).hostname.replace(/^www\./, "");
        const options = loadOptions();
        const validHosts = options.validHosts || [];
        return (
            Object.keys(hostResolvers).some((host) => hostname.endsWith(host)) ||
            validHosts.some((h) => hostname.endsWith(h))
        );
    } catch {
        return false;
    }
}

module.exports = { resolveLink, isSupportedHost };
