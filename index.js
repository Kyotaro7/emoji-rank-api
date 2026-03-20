const express = require("express");
const puppeteer = require("puppeteer");
const Database = require("better-sqlite3");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static("public"));

// ------------------------------
// SQLite 初期化
// ------------------------------
const db = new Database("stamoji.db");

db.prepare(`
  CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    keyword TEXT,
    date TEXT,
    rank INTEGER
  )
`).run();

// ------------------------------
// JSTで日付を取得する関数
// ------------------------------
function getJSTDate() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

// ------------------------------
// ★ 最後の検索結果で上書き保存する saveHistory
// ------------------------------
function saveHistory(name, keyword, rank) {
  const today = getJSTDate();

  const existing = db.prepare(`
    SELECT id FROM history
    WHERE name = ? AND keyword = ? AND date = ?
  `).get(name, keyword, today);

  if (existing) {
    db.prepare(`
      UPDATE history
      SET rank = ?
      WHERE id = ?
    `).run(rank, existing.id);

    console.log("今日のデータを上書きしました:", name, keyword, today, rank);
    return;
  }

  db.prepare(`
    INSERT INTO history (name, keyword, date, rank)
    VALUES (?, ?, ?, ?)
  `).run(name, keyword, today, rank);

  console.log("履歴を保存しました:", name, keyword, today, rank);
}

// ------------------------------
// ★ 履歴取得API
// ------------------------------
app.get("/history", (req, res) => {
  const name = req.query.name;
  const keyword = req.query.keyword;

  if (!name || !keyword) {
    return res.json({ error: "name と keyword が必要です" });
  }

  const rows = db.prepare(`
    SELECT h.date, h.rank
    FROM history h
    JOIN (
      SELECT name, keyword, date, MAX(id) AS max_id
      FROM history
      WHERE name = ? AND keyword = ?
      GROUP BY name, keyword, date
    ) latest
      ON h.id = latest.max_id
    ORDER BY h.date ASC
  `).all(name, keyword);

  res.json(rows);
});

// ------------------------------
// 共通：複数ページを並列で読み込む
// ------------------------------
async function fetchPages(browser, baseUrl, keyword, startPage, endPage, selectorConfig) {
  const results = Array(endPage + 1).fill(null);

  const tasks = [];
  for (let p = startPage; p <= endPage; p++) {
    tasks.push((async () => {
      const page = await browser.newPage();

      await page.setRequestInterception(true);
      page.on("request", (req) => {
        if (req.resourceType() === "image") req.abort();
        else req.continue();
      });

      const url =
        p === 1
          ? `${baseUrl}?q=${encodeURIComponent(keyword)}`
          : `${baseUrl}?q=${encodeURIComponent(keyword)}&page=${p}`;

      console.log("Opening:", url);
      await page.goto(url, { waitUntil: "domcontentloaded" });

      try {
        await page.waitForSelector(selectorConfig.list, { timeout: 15000 });

        const pageResults = await page.evaluate((selectorConfig) => {
          const ul = document.querySelector(selectorConfig.list);
          if (!ul) return [];

          const items = [...ul.querySelectorAll(selectorConfig.item)];

          return items.map((item) => {
            const titleEl = item.querySelector(selectorConfig.title);
            const title = titleEl ? titleEl.textContent.trim() : null;
            return { title };
          });
        }, selectorConfig);

        results[p] = pageResults;

      } catch (e) {
        results[p] = [];
      }

      await page.close();
    })());
  }

  await Promise.all(tasks);

  return results;
}

// ------------------------------
// Puppeteer 起動設定（VPS 用）
// ------------------------------
async function launchBrowser() {
  return await puppeteer.launch({
    headless: "new",
    executablePath: "/usr/bin/chromium-browser",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--single-process",
      "--no-zygote"
    ]
  });
}

// ------------------------------
// 絵文字検索 /rank
// ------------------------------
app.get("/rank", async (req, res) => {
  const myEmojiName = req.query.my;
  const keyword = req.query.q;

  if (!myEmojiName || !keyword) {
    return res.json({ error: "my と q の2つのパラメータが必要です" });
  }

  let browser;
  try {
    browser = await launchBrowser();

    let rankCounter = 1;

    const selectorEmoji = {
      list: 'ul[data-test="search-emoji-item-list"]',
      item: "li",
      title: '[data-test="search-emoji-item-name"]'
    };

    const baseUrl = "https://store.line.me/search/emoji/ja";

    const batch1 = await fetchPages(browser, baseUrl, keyword, 1, 7, selectorEmoji);

    for (let p = 1; p <= 7; p++) {
      for (const item of batch1[p]) {
        if (item.title === myEmojiName) {
          saveHistory(myEmojiName, keyword, rankCounter);
          return res.json({ myEmojiName, keyword, rank: rankCounter, foundPage: p });
        }
        rankCounter++;
      }
    }

    const batch2 = await fetchPages(browser, baseUrl, keyword, 8, 14, selectorEmoji);

    for (let p = 8; p <= 14; p++) {
      for (const item of batch2[p]) {
        if (item.title === myEmojiName) {
          saveHistory(myEmojiName, keyword, rankCounter);
          return res.json({ myEmojiName, keyword, rank: rankCounter, foundPage: p });
        }
        rankCounter++;
        if (rankCounter > 500) break;
      }
      if (rankCounter > 500) break;
    }

    saveHistory(myEmojiName, keyword, null);
    return res.json({ myEmojiName, keyword, rank: null, foundPage: null });

  } catch (error) {
    console.error("Error occurred:", error);
    res.status(500).json({ error: error.message });
  } finally {
    if (browser) await browser.close();
  }
});

// ------------------------------
// スタンプ検索 /rank-stamp
// ------------------------------
app.get("/rank-stamp", async (req, res) => {
  const myStampName = req.query.my;
  const keyword = req.query.q;

  if (!myStampName || !keyword) {
    return res.json({ error: "my と q の2つのパラメータが必要です" });
  }

  let browser;
  try {
    browser = await launchBrowser();

    let rankCounter = 1;

    const selectorStamp = {
      list: 'ul[data-test="search-sticker-item-list"]',
      item: "li",
      title: '[data-test="search-sticker-item-name"]'
    };

    const baseUrl = "https://store.line.me/search/sticker/ja";

    const batch1 = await fetchPages(browser, baseUrl, keyword, 1, 7, selectorStamp);

    for (let p = 1; p <= 7; p++) {
      for (const item of batch1[p]) {
        if (item.title === myStampName) {
          saveHistory(myStampName, keyword, rankCounter);
          return res.json({ myStampName, keyword, rank: rankCounter, foundPage: p });
        }
        rankCounter++;
      }
    }

    const batch2 = await fetchPages(browser, baseUrl, keyword, 8, 14, selectorStamp);

    for (let p = 8; p <= 14; p++) {
      for (const item of batch2[p]) {
        if (item.title === myStampName) {
          saveHistory(myStampName, keyword, rankCounter);
          return res.json({ myStampName, keyword, rank: rankCounter, foundPage: p });
        }
        rankCounter++;
        if (rankCounter > 500) break;
      }
      if (rankCounter > 500) break;
    }

    saveHistory(myStampName, keyword, null);
    return res.json({ myStampName, keyword, rank: null, foundPage: null });

  } catch (error) {
    console.error("Error occurred:", error);
    res.status(500).json({ error: error.message });
  } finally {
    if (browser) await browser.close();
  }
});

// ------------------------------
app.listen(port, () => {
  console.log(`http://localhost:${port} で起動中`);
});
