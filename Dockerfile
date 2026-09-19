FROM node:22-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip git && \
    pip3 install --break-system-packages --no-cache-dir -U "yt-dlp[default,curl-cffi]" bgutil-ytdlp-pot-provider && \
    git clone --depth 1 https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git /opt/bgutil-ytdlp-pot-provider && \
    cd /opt/bgutil-ytdlp-pot-provider/server && npm ci && npx tsc && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
COPY client/package*.json client/
COPY server/package*.json server/
RUN npm install
COPY . .
ENV NODE_ENV=production HOST=0.0.0.0 DONATIONS_FILE=/app/server/donations.json
RUN npm run build -w client
EXPOSE 10000
CMD ["sh", "-c", "node /opt/bgutil-ytdlp-pot-provider/server/build/main.js --host 127.0.0.1 & exec npm start"]
