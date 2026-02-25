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
      headless: "new",
      executablePath: "/usr/bin/chromium",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    });

    const page = await browser.newPage();
    
    // 直接、検索結果ページ（絵文字タブ）にアクセスする
    // これにより、検索窓に入力するステップでのエラーを回避します
    const searchUrl = `https://store.line.me{encodeURIComponent(keyword)}&type=emoji`;
    await page.goto(searchUrl, { waitUntil: "networkidle2" });

    // 検索結果の絵文字一覧を取得
    const results = await page.evaluate(() => {
      const items = [...document.querySelectorAll(".mdCMN02Li")];
      return items.map((item, index) => {
        const titleEl = item.querySelector(".mdCMN02Ttl");
        return {
          title: titleEl ? titleEl.textContent.trim() : null,
          rank: index + 1
        };
      });
    });

    const found = results.find(r => r.title === myEmojiName);

    if (!found) {
      return res.json({
        myEmojiName,
        keyword,
        rank: null,
        message: "この検索ワードの1ページ目（約24件）には見つかりませんでした"
      });
    }

    res.json({
      myEmojiName,
      keyword,
      rank: found.rank
    });

  } catch (error) {
    res.json({ error: error.message });
  } finally {
    if (browser) await browser.close();
  }
});

app.get("/", (req, res) => {
  res.send("API稼働中です。/rank?my=名前&q=キーワード で検索してください。");
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});
