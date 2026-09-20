FROM node:22-slim

# Playwright dependencies
RUN apt-get update && apt-get install -y \
    libnss3 libatk-bridge2.0-0 libdrm2 libxcomposite1 libxdamage1 \
    libxrandr2 libgbm1 libasound2 libpango-1.0-0 libcairo2 \
    libatspi2.0-0 libcups2 libxkbcommon0 libxfixes3 fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy backend package files and install dependencies
COPY backend/package*.json ./
RUN npm ci --production

# Install Playwright browser
RUN npx playwright install chromium

# Copy backend source code
COPY backend/ .

EXPOSE 3001

CMD ["node", "server.js"]
