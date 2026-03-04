import express from "express";
import puppeteer from "puppeteer";

const app = express();
const port = process.env.PORT || 3000;

app.get("/rank", async (req, res) => {
  const myEmojiName = req.query.my;
  const keyword = req.query.q;

  if (!myEmojiName || !keyword) {
    return res.json({ error: "my と q の2つのパラメータが必要です" });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: "/usr/bin/chromium",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu"
      ]
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);

    // 絵文字検索ページに直接アクセス（最新仕様）
    const searchUrl = `https://store.line.me/search/emoji/ja?q=${encodeURIComponent(keyword)}`;
    await page.goto(searchUrl, { waitUntil: "networkidle2" });

    // 結果の取得（最新の LINE STORE に対応）
    const results = await page.evaluate(() => {
      const items = [...document.querySelectorAll("[data-test='search-emoji-item-name']")];
      return items.map((item, index) => ({
        title: item.textContent.trim(),
        rank: index + 1
      }));
    });

    const found = results.find(r => r.title === myEmojiName);

    if (!found || found.rank > 500) {
      return res.json({
        myEmojiName,
        keyword,
        rank: null,
        message: "500位以内に見つかりませんでした"
      });
    }

    res.json({
      myEmojiName,
      keyword,
      rank: found.rank
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    if (browser) await browser.close();
  }
});

app.get("/", (req, res) => {
  res.send("LINE絵文字ランクAPIは正常に稼働中です。/rank?my=名前&q=キーワード で検索してください。");
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});
