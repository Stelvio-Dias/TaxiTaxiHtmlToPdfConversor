# Base Debian (node:slim)
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    fonts-noto-core \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# O server.js procura o Chromium nestes caminhos, mas fixamos por env var.
ENV CHROMIUM_PATH=/usr/bin/chromium
ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]