import fetch from "node-fetch";
import fetchCookie from "fetch-cookie";
import { JSDOM } from "jsdom";
import fs from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const tough = require("tough-cookie");

const jar = new tough.CookieJar();
const fetchWithCookies = fetchCookie(fetch, jar);

const TEST_URL = "http://www.imagebam.com/image/dd8c651372952010";

async function testImageBam(url) {
    console.log("🔎 Testing ImageBam resolver:", url);

    try {
        // First fetch
        const res1 = await fetchWithCookies(url);
        console.log("➡️ First fetch status:", res1.status);
        console.log("🍪 Set-Cookie headers:", res1.headers.raw()["set-cookie"]);

        const html1 = await res1.text();
        fs.writeFileSync("imagebam-first.html", html1);
        console.log("💾 Saved first response to imagebam-first.html");

        const dom1 = new JSDOM(html1);
        const doc1 = dom1.window.document;

        const continueLink = doc1.querySelector("#continue a[data-shown='inter']");
        if (continueLink) {
            console.log("⚠️ Found continue link:", continueLink.href);

            // Manually inject nsfw_inter cookie
            jar.setCookieSync("nsfw_inter=1; Domain=.imagebam.com; Path=/", url);
            console.log("🍪 Manually injected nsfw_inter=1 cookie");

            // Second fetch (after cookie set)
            const res2 = await fetchWithCookies(url);
            console.log("➡️ Second fetch status:", res2.status);

            const allCookies = await jar.getCookies(url);
            console.log("🍪 Cookies in jar now:", allCookies);

            const html2 = await res2.text();
            fs.writeFileSync("imagebam-after-cookie.html", html2);
            console.log("💾 Saved after-cookie response to imagebam-after-cookie.html");

            const dom2 = new JSDOM(html2);
            const doc2 = dom2.window.document;

            const img =
                doc2.querySelector("#imageContainer img") ||
                doc2.querySelector(".main-image") ||
                doc2.querySelector("img#mainImage");

            if (img && img.src) {
                console.log("✅ Resolved direct image URL:", img.src);
            } else {
                console.log("❌ Could not resolve image even after cookie injection.");
            }
        } else {
            console.log("ℹ️ No continue link found, checking first page...");

            const img =
                doc1.querySelector("#imageContainer img") ||
                doc1.querySelector(".main-image") ||
                doc1.querySelector("img#mainImage");

            if (img && img.src) {
                console.log("✅ Resolved direct image URL:", img.src);
            } else {
                console.log("❌ Could not resolve image directly on first page.");
            }
        }
    } catch (err) {
        console.error("💥 Error testing ImageBam:", err);
    }
}

testImageBam(TEST_URL);
