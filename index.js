import express from "express";
import cors from "cors";
import puppeteer from "puppeteer";

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());

// ------------------------------
// 共通：複数ページを並列で読み込む関数（画像読み込みあり）
// ------------------------------
async function fetchPages(browser, baseUrl, keyword, startPage, endPage, selectorConfig) {
  const results = Array(endPage + 1).fill(null);

  const tasks = [];
  for (let p = startPage; p <= endPage; p++) {
    tasks.push((async () => {
      const page = await browser.newPage();

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
    browser = await puppeteer.launch({
      headless: "new",
      executablePath: "/usr/bin/chromium",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer"
      ]
    });

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
          return res.json({ myEmojiName, keyword, rank: rankCounter, foundPage: p });
        }
        rankCounter++;
      }
    }

    const batch2 = await fetchPages(browser, baseUrl, keyword, 8, 14, selectorEmoji);

    for (let p = 8; p <= 14; p++) {
      for (const item of batch2[p]) {
        if (item.title === myEmojiName) {
          return res.json({ myEmojiName, keyword, rank: rankCounter, foundPage: p });
        }
        rankCounter++;
        if (rankCounter > 500) break;
      }
      if (rankCounter > 500) break;
    }

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
    browser = await puppeteer.launch({
      headless: "new",
      executablePath: "/usr/bin/chromium",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer"
      ]
    });

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
          return res.json({ myStampName, keyword, rank: rankCounter, foundPage: p });
        }
        rankCounter++;
      }
    }

    const batch2 = await fetchPages(browser, baseUrl, keyword, 8, 14, selectorStamp);

    for (let p = 8; p <= 14; p++) {
      for (const item of batch2[p]) {
        if (item.title === myStampName) {
          return res.json({ myStampName, keyword, rank: rankCounter, foundPage: p });
        }
        rankCounter++;
        if (rankCounter > 500) break;
      }
      if (rankCounter > 500) break;
    }

    return res.json({ myStampName, keyword, rank: null, foundPage: null });

  } catch (error) {
    console.error("Error occurred:", error);
    res.status(500).json({ error: error.message });
  } finally {
    if (browser) await browser.close();
  }
});

// ------------------------------
app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});
