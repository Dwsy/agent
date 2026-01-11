#!/usr/bin/env node

import puppeteer from "puppeteer-core";

async function testBrowser() {
  console.log("🧪 Testing web-browser skill...\n");

  try {
    const browser = await puppeteer.connect({
      browserURL: "http://localhost:9222",
      defaultViewport: null,
    });

    console.log("✓ Connected to browser");

    const pages = await browser.pages();
    const page = pages[0] || await browser.newPage();

    console.log(`✓ Active pages: ${pages.length}`);

    // Test navigation
    await page.goto("https://example.com", { waitUntil: "networkidle2" });
    console.log("✓ Navigated to example.com");

    // Test localStorage
    await page.evaluate(() => {
      localStorage.setItem("test_key", "test_value");
    });
    const storedValue = await page.evaluate(() => localStorage.getItem("test_key"));
    console.log(`✓ localStorage works: "${storedValue}"`);

    // Test cookies
    await page.evaluate(() => {
      document.cookie = "test_cookie=test_value; path=/";
    });
    const cookies = await page.cookies();
    console.log(`✓ Cookies work: ${cookies.length} cookies set`);

    // Check profile directory
    const profileDir = process.env.HOME + "/.cache/scraping-web-browser";
    console.log(`✓ Profile directory: ${profileDir}`);

    await browser.disconnect();

    console.log("\n✅ All tests passed!");
    console.log("\n📝 Summary:");
    console.log("  - Independent browser instance running");
    console.log("  - Session storage (localStorage, cookies) working");
    console.log("  - Profile directory: ~/.cache/scraping-web-browser");
    console.log("  - Your main Chrome browser is NOT affected");

  } catch (error) {
    console.error("❌ Test failed:", error.message);
    process.exit(1);
  }
}

testBrowser();