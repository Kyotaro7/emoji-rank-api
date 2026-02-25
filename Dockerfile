# Puppeteer が安定して動く Node イメージ
FROM node:18-slim

# Chromium に必要な依存パッケージをインストール
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-driver \
    fonts-ipafont-gothic \
    fonts-ipafont-mincho \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Puppeteer が自前の Chromium をダウンロードしないようにする
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# アプリの作業ディレクトリ
WORKDIR /app

# package.json をコピーして依存関係をインストール
COPY package*.json ./
RUN npm install

# アプリ本体をコピー
COPY . .

# Railway が使うポート
ENV PORT=3000
EXPOSE 3000

# アプリ起動
CMD ["npm", "start"]
