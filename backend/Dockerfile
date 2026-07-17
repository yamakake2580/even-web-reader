# Debian base so `playwright install --with-deps` can apt-get Chromium's
# system libraries. x86_64 mini PC target - no ARM/Playwright headaches.
FROM node:22-bookworm

WORKDIR /app

# Install deps first (better layer caching), then the Chromium browser +
# its system dependencies.
COPY package.json package-lock.json ./
RUN npm ci
RUN npx playwright install --with-deps chromium

COPY . .

EXPOSE 8787
CMD ["npm", "start"]
