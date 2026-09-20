# 📈 INE Product Price Tracker

**Live Application:** [https://assign-ten-sigma.vercel.app](https://assign-ten-sigma.vercel.app)  
**Backend API:** [https://assign-j1uf.onrender.com](https://assign-j1uf.onrender.com)  
**Demo Video:** *(Paste your video link here!)*

A full-stack web application that automatically scrapes and tracks product prices from the INE mock store, bypassing anti-bot protections.

## 🚀 Features
- **Automated Scraping:** Uses Playwright to simulate human mouse movements to bypass canvas fingerprinting and anti-bot overlays.
- **WASM Decryption Bypass:** Extracts the final decrypted prices directly from the rendered React DOM.
- **Cron Jobs:** Fully automated to run every 2 hours via cron-job.org.
- **Full Stack Dashboard:** React/Vite frontend to view price history and tracking status, powered by an Express/Supabase backend.

## 🛠️ Tech Stack
- **Frontend:** React, Vite, Tailwind CSS, Recharts
- **Backend:** Node.js, Express, Playwright
- **Database:** Supabase (PostgreSQL)
- **Deployment:** Vercel (Frontend), Render (Backend via Docker)

## 🏃‍♂️ How to Run Locally

### 1. Database
Set up a Supabase project and run the provided `schema.sql` to generate the tables.

### 2. Backend
```bash
cd backend
npm install
# Create a .env file with SUPABASE_URL, SUPABASE_ANON_KEY, and CRON_SECRET
npm start
```

To test the scraper visually in headed mode:
```bash
npm run scrape:headed
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```
