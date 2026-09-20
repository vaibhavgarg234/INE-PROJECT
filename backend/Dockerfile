FROM node:22-slim

# Playwright needs these OS packages to run Chromium
RUN apt-get update && apt-get install -y \
    libnss3 libatk-bridge2.0-0 libdrm2 libxcomposite1 libxdamage1 \
    libxrandr2 libgbm1 libasound2 libpango-1.0-0 libcairo2 \
    libatspi2.0-0 libcups2 libxkbcommon0 libxfixes3 fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install dependencies FIRST
COPY package*.json ./
RUN npm ci --production

# Install Playwright browsers AFTER npm install (so versions match)
RUN npx playwright install chromium

# Copy source code
COPY . .

# Expose port (Render will set PORT env var)
EXPOSE 3001

# Start server
CMD ["node", "server.js"]
