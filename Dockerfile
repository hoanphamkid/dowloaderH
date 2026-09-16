FROM node:22-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip && pip3 install --break-system-packages yt-dlp && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
COPY client/package*.json client/
COPY server/package*.json server/
RUN npm install --omit=dev
COPY . .
ENV NODE_ENV=production HOST=0.0.0.0
RUN npm run build -w client
EXPOSE 10000
CMD ["npm", "start"]
