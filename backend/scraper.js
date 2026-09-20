/**
 * scraper.js — Playwright-based scraper for INE's mock store
 *
 * The mock store encrypts prices with WebAssembly, requires canvas
 * fingerprinting and mouse-movement tracking before revealing prices.
 * That makes a headless browser mandatory.
 *
 * Anti-bot measures observed:
 *   - ≥8 mouse moves over the price area required
 *   - ≥600ms hover dwell time before "Reveal price" enables
 *   - ~35% random chance of delay (900ms) or silent drop
 *   - Server returns 429 / transient errors on price endpoint
 *   - Up to 6 internal retry attempts with 300ms×attempt backoff
 *
 * Strategy:
 *   1. Navigate to product page
 *   2. Wait for the page to render (React hydration)
 *   3. Move mouse over the price area (simulating real user)
 *   4. Click "Reveal price" and wait for price data
 *   5. Extract rendered price, stock, and metadata from DOM
 *   6. Retry entire flow up to MAX_RETRIES times on failure
 */

const { chromium } = require("playwright");

const STORE_URL =
  process.env.MOCK_STORE_URL || "https://demo.inelabteamdev.com";
const MAX_RETRIES = 4;
const HEADED = process.env.HEADED === "true";

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Dismiss cookie consent banner by clicking ACCEPT or force-removing overlay.
 * Called multiple times during scraping to handle late-appearing banners.
 */
async function dismissCookieBanner(page) {
  try {
    // Strategy 1: Try to click ACCEPT / Accept button
    const clicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const acceptBtn = buttons.find(b => 
        /^(ACCEPT|Accept|accept)$/.test(b.textContent.trim())
      );
      if (acceptBtn) {
        acceptBtn.click();
        return true;
      }
      return false;
    });

    if (clicked) {
      await sleep(500);
      return;
    }

    // Strategy 2: Force-remove any cookie overlay/banner from the DOM
    await page.evaluate(() => {
      // Remove by common class names
      const selectors = [
        '.cookie-overlay', '.cookie-banner', '.cookie-consent',
        '[class*="cookie-overlay"]', '[class*="cookie-banner"]',
        '[class*="consent"]', '[id*="cookie"]'
      ];
      selectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => el.remove());
      });

      // Remove any fixed/absolute positioned element that covers the full viewport
      document.querySelectorAll('div').forEach(el => {
        const style = window.getComputedStyle(el);
        if (
          (style.position === 'fixed' || style.position === 'absolute') &&
          parseInt(style.zIndex) > 100 &&
          el.offsetWidth >= window.innerWidth * 0.8 &&
          el.offsetHeight >= window.innerHeight * 0.5
        ) {
          el.remove();
        }
      });
    });
    await sleep(200);
  } catch (e) {
    // Silently ignore — cookie banner may not be present
  }
}

/**
 * Scrape price/stock for a single product by its mock-store ID.
 *
 * @param {import('playwright').Browser} browser - reuse across products
 * @param {number} productId - mock store product ID
 * @returns {{ success: boolean, data?: object, attempts: number, error?: string, durationMs: number }}
 */
async function scrapeProduct(browser, productId) {
  const startTime = Date.now();
  let lastError = "";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    // Inject a script that auto-removes cookie overlays the INSTANT they appear
    await page.addInitScript(() => {
      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            if (node.nodeType === 1) {
              // Check if the added node IS the cookie overlay
              if (node.classList && node.classList.contains('cookie-overlay')) {
                node.remove();
                continue;
              }
              // Check children too
              const overlays = node.querySelectorAll ? node.querySelectorAll('.cookie-overlay') : [];
              overlays.forEach(el => el.remove());
            }
          }
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    });

    try {
      console.log(
        `  [Product ${productId}] Attempt ${attempt}/${MAX_RETRIES} — navigating...`
      );

      // 1. Navigate to the product page
      await page.goto(`${STORE_URL}/product/${productId}`, {
        waitUntil: "networkidle",
        timeout: 30000,
      });

      // 1.5 Dismiss cookie banner IMMEDIATELY after page load (before anything else)
      await dismissCookieBanner(page);

      // 2. Wait for React to render the product detail
      await page.waitForSelector(".detail-card", { timeout: 15000 });
      await page.waitForSelector(".price-block", { timeout: 10000 });

      // 3. Check if there's an error loading the product
      const loadError = await page.$(".grid-error");
      if (loadError) {
        const errorText = await loadError.textContent();
        throw new Error(`Product load error: ${errorText}`);
      }

      // 3.5 Dismiss cookie banner again (it can reappear after React renders)
      await dismissCookieBanner(page);

      // 4. Simulate mouse movements over the price area to satisfy anti-bot
      const priceBlock = await page.waitForSelector(".price-block", {
        timeout: 10000,
      });
      const box = await priceBlock.boundingBox();
      if (!box) throw new Error("Price block not visible");

      // Move mouse into the price area first (triggers "enter")
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await sleep(100);

      // Perform ≥10 mouse movements across the price area (requirement: ≥8)
      for (let i = 0; i < 12; i++) {
        const x = box.x + 20 + Math.random() * (box.width - 40);
        const y = box.y + 10 + Math.random() * (box.height - 20);
        await page.mouse.move(x, y, { steps: 3 });
        await sleep(60 + Math.random() * 40);
      }

      // 5. Wait for the dwell time (≥600ms) — we've already spent time moving
      await sleep(400);

      // 6. Wait for "Reveal price" button to be enabled
      const revealBtn = await page.waitForSelector(
        'button[aria-label="Reveal price"]:not([disabled])',
        { timeout: 8000 }
      );

      if (!revealBtn) throw new Error("Reveal price button not found or still disabled");

      // 7. Click "Reveal price" (force: true bypasses overlay interception checks)
      await revealBtn.click({ force: true });

      // 8. Wait for price to load — could be "loading", "retrying", or "success"
      //    The store's own UI retries up to 6 times internally
      //    We wait for either success or error state
      await page.waitForFunction(
        () => {
          const el = document.querySelector(".price-block");
          if (!el) return false;
          return (
            el.classList.contains("price-success") ||
            el.classList.contains("price-error")
          );
        },
        { timeout: 45000 }
      );

      // 9. Check if it succeeded or failed
      const isSuccess = await page.$(".price-block.price-success");
      if (!isSuccess) {
        const errorEl = await page.$(".price-status");
        const errorText = errorEl
          ? await errorEl.textContent()
          : "Price load failed";
        throw new Error(errorText);
      }

      // 10. Extract the price data from the rendered DOM
      const data = await page.evaluate(() => {
        const result = {};

        // Main displayed price — look for the large price element
        const priceValueEl = document.querySelector(".price-main .price-value");
        if (priceValueEl) {
          // The price text is like "₹1,234" — parse the number
          const priceText = priceValueEl.textContent.trim();
          const numMatch = priceText.replace(/[^0-9.]/g, "");
          result.price = numMatch ? parseFloat(numMatch) : null;
        }

        // Hidden data-price element contains an alternative price value
        const dataPriceEl = document.querySelector('[data-price="true"]');
        if (dataPriceEl) {
          const dpText = dataPriceEl.textContent.trim();
          const dpNum = dpText.replace(/[^0-9.]/g, "");
          if (dpNum) result.dataPrice = parseFloat(dpNum);
        }

        // Look through all price-related spans for MRP, sale, discount
        const priceMainEl = document.querySelector(".price-main");
        if (priceMainEl) {
          const spans = priceMainEl.querySelectorAll("span");
          spans.forEach((span) => {
            const text = span.textContent.trim();
            const style = span.getAttribute("style") || "";

            // MRP (struck-through price)
            if (style.includes("line-through")) {
              const mrpNum = text.replace(/[^0-9.]/g, "");
              if (mrpNum) result.mrp = parseFloat(mrpNum);
            }

            // Sale / Deal price
            if (text.startsWith("Deal price")) {
              const saleNum = text.replace(/[^0-9.]/g, "");
              if (saleNum) result.salePrice = parseFloat(saleNum);
            }

            // Discount badge ("X% off")
            if (text.includes("% off")) {
              const pctMatch = text.match(/([\d.]+)%/);
              if (pctMatch) result.discountPct = parseFloat(pctMatch[1]);
            }
          });
        }

        // Stock info
        const stockBadge = document.querySelector(".stock-badge");
        if (stockBadge) {
          if (stockBadge.classList.contains("out-stock")) {
            result.stock = 0;
          } else {
            const stockText = stockBadge.textContent.trim();
            const stockNum = stockText.match(/(\d+)/);
            result.stock = stockNum ? parseInt(stockNum[1], 10) : -1;
          }
        }

        // Rating
        const ratingEl = document.querySelector(".review-stars");
        if (ratingEl) {
          const ariaLabel = ratingEl.getAttribute("aria-label") || "";
          const ratingMatch = ariaLabel.match(/([\d.]+)/);
          if (ratingMatch) result.rating = parseFloat(ratingMatch[1]);
        }

        // Rating count
        const ratingCountEl = document.querySelector(".price-facets");
        if (ratingCountEl) {
          const rcText = ratingCountEl.textContent;
          // Look for patterns like "1.2k ratings" or "523 ratings"
          const rcMatch = rcText.match(/([\d.]+k?)\s*rating/i);
          if (rcMatch) {
            let rc = rcMatch[1];
            if (rc.endsWith("k")) {
              result.ratingCount = Math.round(parseFloat(rc) * 1000);
            } else {
              result.ratingCount = parseInt(rc, 10);
            }
          }
        }

        // Seller
        const sellerEl = document.querySelector(".price-facets");
        if (sellerEl) {
          const sellerMatch = sellerEl.textContent.match(
            /(?:Sold by|Seller:?)\s*([^·\n]+)/i
          );
          if (sellerMatch) result.seller = sellerMatch[1].trim();
        }

        // Delivery
        if (sellerEl) {
          const delivMatch = sellerEl.textContent.match(
            /(\d+)\s*(?:day|business day)/i
          );
          if (delivMatch) result.deliveryDays = parseInt(delivMatch[1], 10);
        }

        // Attempts the store UI took
        const metaEl = document.querySelector(".price-meta");
        if (metaEl) {
          const attMatch = metaEl.textContent.match(/Loaded in (\d+) attempt/);
          if (attMatch) result.storeAttempts = parseInt(attMatch[1], 10);
        }

        // Currency — default INR
        result.currency = "INR";

        return result;
      });

      // Use the main price, or fall back to dataPrice
      const finalPrice = data.price || data.dataPrice || null;

      if (finalPrice === null) {
        throw new Error("Extracted price was null/empty — possible DOM change");
      }

      console.log(
        `  [Product ${productId}] ✅ Success on attempt ${attempt}: ₹${finalPrice}, stock=${data.stock}`
      );

      return {
        success: true,
        data: {
          price: finalPrice,
          mrp: data.mrp || null,
          salePrice: data.salePrice || null,
          discountPct: data.discountPct || null,
          stock: data.stock ?? null,
          currency: data.currency || "INR",
          rating: data.rating || null,
          ratingCount: data.ratingCount || null,
          seller: data.seller || null,
          deliveryDays: data.deliveryDays || null,
        },
        attempts: attempt,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      lastError = err.message || String(err);
      console.log(
        `  [Product ${productId}] ❌ Attempt ${attempt} failed: ${lastError}`
      );

      if (attempt < MAX_RETRIES) {
        // Exponential backoff: 1s, 2s, 3s
        const delay = attempt * 1000;
        console.log(`  [Product ${productId}] Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    } finally {
      await page.close().catch(() => {});
      await context.close().catch(() => {});
    }
  }

  // All retries exhausted
  console.log(
    `  [Product ${productId}] ❌ All ${MAX_RETRIES} attempts failed: ${lastError}`
  );
  return {
    success: false,
    attempts: MAX_RETRIES,
    error: lastError,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Scrape all tracked products from the database.
 */
async function scrapeAllTracked() {
  const { supabase } = require("./db");

  // Fetch tracked products
  const { data: products, error } = await supabase
    .from("tracked_products")
    .select("*");

  if (error) throw new Error(`DB error fetching tracked products: ${error.message}`);
  if (!products || products.length === 0) {
    console.log("No tracked products to scrape.");
    return { scraped: 0, results: [] };
  }

  console.log(`\n🔄 Starting scrape of ${products.length} tracked product(s)...\n`);

  // Launch browser once, reuse for all products
  const browser = await chromium.launch({
    headless: !HEADED,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

  const results = [];

  try {
    for (const product of products) {
      console.log(`\n📦 Scraping: ${product.name} (ID: ${product.product_id})`);
      const result = await scrapeProduct(browser, product.product_id);
      results.push({ productId: product.product_id, ...result });

      // Save to database
      if (result.success && result.data) {
        // Insert into price_history
        const { error: insertError } = await supabase
          .from("price_history")
          .insert({
            product_id: product.product_id,
            price: result.data.price,
            mrp: result.data.mrp,
            sale_price: result.data.salePrice,
            discount_pct: result.data.discountPct,
            stock: result.data.stock,
            currency: result.data.currency,
            rating: result.data.rating,
            rating_count: result.data.ratingCount,
            seller: result.data.seller,
            delivery_days: result.data.deliveryDays,
          });

        if (insertError) {
          console.error(`  DB error (price_history): ${insertError.message}`);
        }

        // Log success
        const { error: logError } = await supabase.from("scrape_logs").insert({
          product_id: product.product_id,
          status: result.attempts > 1 ? "retried" : "success",
          attempts: result.attempts,
          duration_ms: result.durationMs,
        });

        if (logError) {
          console.error(`  DB error (scrape_logs): ${logError.message}`);
        }
      } else {
        // Log failure — never hide failures
        const { error: logError } = await supabase.from("scrape_logs").insert({
          product_id: product.product_id,
          status: "failed",
          attempts: result.attempts,
          error_message: result.error,
          duration_ms: result.durationMs,
        });

        if (logError) {
          console.error(`  DB error (scrape_logs): ${logError.message}`);
        }
      }

      // Small delay between products to avoid overwhelming the store
      await sleep(500);
    }
  } finally {
    await browser.close();
  }

  const successCount = results.filter((r) => r.success).length;
  console.log(
    `\n✅ Scrape complete: ${successCount}/${products.length} succeeded\n`
  );

  return {
    scraped: products.length,
    succeeded: successCount,
    failed: products.length - successCount,
    results,
  };
}

/**
 * Search the mock store's catalog API for products matching a query.
 * This uses lightweight HTTP — no browser needed for the catalog.
 */
async function searchMockStore(query, page = 1, pageSize = 20) {
  const url = `${STORE_URL}/api/catalog?page=${page}&pageSize=${pageSize}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Catalog API returned ${response.status}`);
  const data = await response.json();

  // Filter by name match (case-insensitive partial match)
  const q = query.toLowerCase();
  const filtered = data.items.filter(
    (item) =>
      item.name.toLowerCase().includes(q) ||
      item.brand.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.sku.toLowerCase().includes(q)
  );

  return {
    items: filtered,
    page: data.page,
    pages: data.pages,
    total: data.total,
  };
}

/**
 * Search across ALL pages of the mock store catalog.
 * The store has 1000 products across 20 pages (50/page).
 */
async function searchAllPages(query) {
  const allItems = [];
  const q = query.toLowerCase();

  // Fetch pages in parallel (batches of 5)
  const totalPages = 20;
  for (let batch = 0; batch < totalPages; batch += 5) {
    const promises = [];
    for (let p = batch + 1; p <= Math.min(batch + 5, totalPages); p++) {
      promises.push(
        fetch(`${STORE_URL}/api/catalog?page=${p}&pageSize=50`)
          .then((r) => (r.ok ? r.json() : { items: [] }))
          .catch(() => ({ items: [] }))
      );
    }
    const results = await Promise.all(promises);
    for (const result of results) {
      const matched = (result.items || []).filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.brand.toLowerCase().includes(q) ||
          item.sku.toLowerCase().includes(q)
      );
      allItems.push(...matched);
    }
  }

  return allItems;
}

module.exports = {
  scrapeProduct,
  scrapeAllTracked,
  searchMockStore,
  searchAllPages,
};
