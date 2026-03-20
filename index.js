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
// JSTで日付を取得
// ------------------------------
function getJSTDate() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

// ------------------------------
// 履歴保存（1日1件・上書き）
// ------------------------------
function saveHistory(name, keyword, rank) {
  const today = getJSTDate();

  const existing = db.prepare(`
    SELECT id FROM history
    WHERE name = ? AND keyword = ? AND date = ?
  `).get(name, keyword, today);

  if (existing) {
    db.prepare(`UPDATE history SET rank = ? WHERE id = ?`).run(rank, existing.id);
    return;
  }

  db.prepare(`
    INSERT INTO history (name, keyword, date, rank)
    VALUES (?, ?, ?, ?)
  `).run(name, keyword, today, rank);
}

// ------------------------------
// Puppeteer（VPS 用）
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
// 3ページを並列取得（順位判定なし）
// ------------------------------
async function fetch3Pages(browser, baseUrl, keyword, startPage, selectorConfig) {
  const results = {};
  const tasks = [];

  for (let p = startPage; p < startPage + 3; p++) {
    if (p > 14) break;

    tasks.push(
      (async () => {
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
              return { title: titleEl ? titleEl.textContent.trim() : null };
            });
          }, selectorConfig);

          results[p] = pageResults;
        } catch (e) {
          results[p] = [];
        }

        await page.close();
      })()
    );
  }

  await Promise.all(tasks);
  return results;
}

// ------------------------------
// 絵文字検索 /rank（最速版）
// ------------------------------
app.get("/rank", async (req, res) => {
  const myEmojiName = req.query.my;
  const keyword = req.query.q;

  if (!myEmojiName || !keyword) {
    return res.json({ error: "my と q が必要です" });
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

    // ★ 3ページずつ取得 → 判定 → 即終了
    for (let startPage = 1; startPage <= 14; startPage += 3) {
      const pages = await fetch3Pages(browser, baseUrl, keyword, startPage, selectorEmoji);

      for (let p = startPage; p < startPage + 3; p++) {
        if (p > 14) break;

        const pageResults = pages[p] || [];

        for (const item of pageResults) {
          if (item.title === myEmojiName) {
            saveHistory(myEmojiName, keyword, rankCounter);
            return res.json({ myEmojiName, keyword, rank: rankCounter, foundPage: p });
          }
          rankCounter++;
        }
      }
    }

    saveHistory(myEmojiName, keyword, null);
    return res.json({ myEmojiName, keyword, rank: null, foundPage: null });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  } finally {
    if (browser) await browser.close();
  }
});

// ------------------------------
app.listen(port, () => {
  console.log(`http://localhost:${port} で起動中`);
});
