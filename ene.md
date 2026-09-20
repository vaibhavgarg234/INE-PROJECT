# Design Notes: Scraping Reliability

The core challenge of this assignment was correctly scraping the mock store (demo.inelabteamdev.com), which employs several sophisticated anti-bot mechanisms. 

## Analysis of the Target
Through analysis of the JS bundle and network traffic, I discovered:
1. **Price Data Encryption**: The store doesn't send plain HTML or JSON prices. It downloads a WebAssembly module that decrypts the price data using an XOR cipher.
2. **Anti-Bot Mouse Tracking**: The store initializes a mouse tracking class (`Ar`) that monitors cursor coordinates and timestamps. It requires at least 8 distinct mouse movements over the price area and a minimum dwell time of 600ms before the "Reveal price" button becomes clickable.
3. **Random Failures**: The API intentionally fails or artificially delays (~900ms) on ~35% of requests to test resilience.

## Trade-offs and Tooling Choice
Because of the WebAssembly decryption and canvas fingerprinting, **lightweight HTTP fetching (e.g., Axios + Cheerio) was impossible.** 

I chose **Playwright** as the scraper to run a headless Chromium instance. While heavier, it accurately executes the WASM, correctly triggers React hydration, and natively supports the mouse simulation required to beat the anti-bot layer.

## Making the Scraper Reliable
To ensure the scraper works across many unattended runs:
1. **Mouse Simulation**: The scraper algorithm calculates the bounding box of the price area, moves to its center, and then loops 12 times (exceeding the required 8) moving to random coordinates within the box with slight delays to perfectly mimic human interaction.
2. **Exponential Backoff**: The store itself retries 6 times. The Playwright script catches loading errors or "failed to load" DOM states, completely tears down the browser context, and restarts the attempt (up to 4 times) using an exponential backoff strategy (1s, 2s, 3s).
3. **Graceful Degradation**: If all retries fail, it catches the error and logs it honestly to Supabase as a `failed` state with the specific error message, without crashing the cron job or skipping other tracked products.
4. **Resilient Selectors**: Instead of relying on strict DOM paths, the scraper looks for class names (`.price-main .price-value` and `[data-price="true"]`) to find prices, handling slight UI shifts.

## AI Corrections & Corrections Made
* **First attempt assumption**: I initially assumed the catalog API might also return price data.
* **Correction**: By digging deeper into the minified JS bundle, I saw the WebAssembly hook and the `Ar` mouse tracker. I immediately pivoted from a lightweight HTTP plan to a Playwright plan, recognizing that the mock store was designed specifically to defeat lightweight scrapers. I wrote a Node script (`analyze2.js`) to parse the bundle, successfully reverse-engineering the exact anti-bot constraints (8 moves, 600ms dwell) to program them into the scraper.
