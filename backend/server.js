/**
 * server.js — Express API server for INE Price Tracker
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { supabase } = require("./db");
const { scrapeAllTracked, searchAllPages } = require("./scraper");

const app = express();
const PORT = process.env.PORT || 3001;

const isSupabaseUnavailable = (err) => {
  const message = (err && err.message) || "";
  return (
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_ANON_KEY ||
    /fetch failed|ENOTFOUND|ECONNREFUSED|network|timed out/i.test(message)
  );
};

// Middleware
app.use(cors());
app.use(express.json());

// ──────────────────────────────────────────────
// Health check
// ──────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ──────────────────────────────────────────────
// Search mock store products (lightweight HTTP)
// ──────────────────────────────────────────────
app.get("/api/search", async (req, res) => {
  try {
    const query = req.query.q || "";
    if (!query || query.length < 2) {
      return res
        .status(400)
        .json({ error: "Search query must be at least 2 characters" });
    }

    const items = await searchAllPages(query);
    res.json({ items, count: items.length });
  } catch (err) {
    console.error("Search error:", err.message);
    res.status(500).json({ error: "Search failed: " + err.message });
  }
});

// ──────────────────────────────────────────────
// Track a product (add to tracked_products)
// ──────────────────────────────────────────────
app.post("/api/track", async (req, res) => {
  try {
    const { product_id, slug, name, brand, category, sku, description } =
      req.body;

    if (!product_id || !name) {
      return res
        .status(400)
        .json({ error: "product_id and name are required" });
    }

    // Check if already tracked
    const { data: existing } = await supabase
      .from("tracked_products")
      .select("id")
      .eq("product_id", product_id)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ error: "Product already tracked" });
    }

    const { data, error } = await supabase
      .from("tracked_products")
      .insert({
        product_id,
        slug: slug || "",
        name,
        brand: brand || null,
        category: category || null,
        sku: sku || null,
        description: description || null,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error("Track error:", err.message);
    res.status(500).json({ error: "Failed to track product: " + err.message });
  }
});

// ──────────────────────────────────────────────
// List all tracked products (with latest price)
// ──────────────────────────────────────────────
app.get("/api/tracked", async (req, res) => {
  try {
    // Get tracked products
    const { data: products, error } = await supabase
      .from("tracked_products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    // For each product, get the latest price
    const enriched = await Promise.all(
      (products || []).map(async (product) => {
        const { data: latestPrice } = await supabase
          .from("price_history")
          .select("*")
          .eq("product_id", product.product_id)
          .order("scraped_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const { data: lastLog } = await supabase
          .from("scrape_logs")
          .select("*")
          .eq("product_id", product.product_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        return {
          ...product,
          latestPrice: latestPrice || null,
          lastScrape: lastLog || null,
        };
      })
    );

    res.json(enriched);
  } catch (err) {
    console.error("Tracked list error:", err.message);
    if (isSupabaseUnavailable(err)) {
      return res.json([]);
    }
    res.status(500).json({ error: "Failed to list tracked products" });
  }
});

// ──────────────────────────────────────────────
// Remove a tracked product
// ──────────────────────────────────────────────
app.delete("/api/tracked/:productId", async (req, res) => {
  try {
    const productId = parseInt(req.params.productId, 10);

    const { error } = await supabase
      .from("tracked_products")
      .delete()
      .eq("product_id", productId);

    if (error) throw error;
    res.json({ message: "Product untracked successfully" });
  } catch (err) {
    console.error("Delete error:", err.message);
    res.status(500).json({ error: "Failed to untrack product" });
  }
});

// ──────────────────────────────────────────────
// Get price history for a product
// ──────────────────────────────────────────────
app.get("/api/history/:productId", async (req, res) => {
  try {
    const productId = parseInt(req.params.productId, 10);
    const limit = parseInt(req.query.limit, 10) || 100;

    const { data, error } = await supabase
      .from("price_history")
      .select("*")
      .eq("product_id", productId)
      .order("scraped_at", { ascending: true })
      .limit(limit);

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error("History error:", err.message);
    res.status(500).json({ error: "Failed to get price history" });
  }
});

// ──────────────────────────────────────────────
// Get scrape logs for a product
// ──────────────────────────────────────────────
app.get("/api/logs/:productId", async (req, res) => {
  try {
    const productId = parseInt(req.params.productId, 10);
    const limit = parseInt(req.query.limit, 10) || 50;

    const { data, error } = await supabase
      .from("scrape_logs")
      .select("*")
      .eq("product_id", productId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error("Logs error:", err.message);
    res.status(500).json({ error: "Failed to get scrape logs" });
  }
});

// ──────────────────────────────────────────────
// Trigger a scrape of all tracked products
// (Called by cron-job.org every 2 hours)
// ──────────────────────────────────────────────
let scrapeInProgress = false;

app.post("/api/scrape", async (req, res) => {
  try {
    // Optional: protect with a secret
    const secret = req.headers["x-cron-secret"] || req.query.secret;
    if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (scrapeInProgress) {
      return res
        .status(429)
        .json({ error: "Scrape already in progress" });
    }

    scrapeInProgress = true;

    // Respond immediately so cron-job.org doesn't time out
    res.json({
      message: "Scrape started",
      timestamp: new Date().toISOString(),
    });

    // Run scrape in background
    try {
      const result = await scrapeAllTracked();
      console.log("Scrape result:", JSON.stringify(result, null, 2));
    } catch (err) {
      console.error("Scrape failed:", err.message);
    } finally {
      scrapeInProgress = false;
    }
  } catch (err) {
    scrapeInProgress = false;
    console.error("Scrape endpoint error:", err.message);
    res.status(500).json({ error: "Scrape failed to start" });
  }
});

// ──────────────────────────────────────────────
// Get product detail from mock store (proxy)
// ──────────────────────────────────────────────
app.get("/api/product/:id", async (req, res) => {
  try {
    const storeUrl =
      process.env.MOCK_STORE_URL || "https://demo.inelabteamdev.com";
    const response = await fetch(
      `${storeUrl}/api/product/${req.params.id}`
    );
    if (!response.ok) throw new Error(`Store returned ${response.status}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Product detail error:", err.message);
    res.status(500).json({ error: "Failed to fetch product detail" });
  }
});

// ──────────────────────────────────────────────
// Start server
// ──────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 INE Price Tracker API running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
  console.log(`   Search: http://localhost:${PORT}/api/search?q=headphones`);
  console.log(`   Scrape: POST http://localhost:${PORT}/api/scrape\n`);
});
