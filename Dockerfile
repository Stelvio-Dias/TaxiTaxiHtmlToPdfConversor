# Base Debian (node:slim)
FROM node:22-slim

# Chromium + fontes (fonts-liberation para texto comum; fonts-noto-* para
# acentos/símbolos garantidos). ca-certificates para HTTPS em recursos remotos.
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

# Instalar dependências primeiro
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
