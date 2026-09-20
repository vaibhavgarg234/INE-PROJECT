# INE Product Price Tracker

A full-stack web application built for the INE Software Engineer Intern Assignment. 
It tracks product prices from the INE Mock Store and records price history and scrape outcomes.

## Architecture

* **Frontend**: React.js (Vite) + Recharts + Lucide Icons (Vanilla CSS, custom design system)
* **Backend**: Node.js + Express
* **Scraper**: Playwright (required due to WebAssembly encryption & anti-bot mechanics)
* **Database**: Supabase (PostgreSQL)

---

## Setup Instructions

### 1. Database (Supabase) Setup
1. Create a [Supabase](https://supabase.com) project.
2. Go to the SQL Editor and run the SQL provided in `schema.sql`.
3. Go to Project Settings -> API and copy your **Project URL** and **anon public key**.

### 2. Backend Setup
The backend runs the API and the headless Playwright scraper.

1. Navigate to the `backend/` directory:
   ```bash
   cd backend
   npm install
   ```
2. Create a `.env` file in the `backend/` directory using `.env.example`:
   ```env
   PORT=3001
   SUPABASE_URL=your_project_url
   SUPABASE_ANON_KEY=your_anon_key
   HEADED=false
   CRON_SECRET=your_secure_random_string
   ```
3. Install Playwright browsers:
   ```bash
   npx playwright install chromium
   ```
4. Start the server:
   ```bash
   npm start
   ```

### 3. Frontend Setup
1. Navigate to the `frontend/` directory:
   ```bash
   cd frontend
   npm install
   ```
2. Create a `.env` file in the `frontend/` directory:
   ```env
   VITE_API_URL=http://localhost:3001/api
   ```
3. Start the dev server:
   ```bash
   npm run dev
   ```

---

## Scraping Schedule

To fulfill the "fixed schedule of once every 2 hours" requirement without keeping a free-tier instance running 24/7, the scraping logic is exposed via a secure HTTP endpoint:

`POST /api/scrape`

You should trigger this using an external cron service (like [cron-job.org](https://cron-job.org/)).
* **Schedule**: Every 2 hours
* **Method**: POST
* **Headers**: `x-cron-secret: your_secure_random_string` (to prevent unauthorized scrape triggers)

---

## Observable (Headed) Run

To run the scraper locally in headed mode (so you can watch it navigate, move the mouse, and handle errors):

1. Go to the `backend/` directory.
2. Run:
   ```bash
   npm run scrape:headed
   ```
This will open Chromium, navigate to the products, simulate human mouse movements, extract the price, and exit.
