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
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu"
      ]
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);

    console.log("Opening LINE STORE home...");
    await page.goto("https://store.line.me/home/ja", {
      waitUntil: "networkidle2"
    });

    console.log("Typing keyword:", keyword);
    await page.type("input[name='query']", keyword);

    console.log("Pressing Enter...");
    await page.keyboard.press("Enter");

    console.log("Waiting for navigation...");
    await page.waitForNavigation({ waitUntil: "networkidle2" });

    console.log("Extracting results...");
    const results = await page.evaluate(() => {
      const items = [...document.querySelectorAll(".mdCMN02Li")];
      return items.map((item, index) => {
        const titleEl = item.querySelector(".mdCMN02Ttl");
        const title = titleEl ? titleEl.textContent.trim() : null;
        return {
          title,
          rank: index + 1
        };
      });
    });

    console.log("Search results:", results);

    const found = results.find(r => r.title === myEmojiName);

    if (!found || found.rank > 100) {
      return res.json({
        myEmojiName,
        keyword,
        rank: null,
        message: "100位以内に見つかりませんでした"
      });
    }

    res.json({
      myEmojiName,
      keyword,
      rank: found.rank
    });

  } catch (error) {
    console.error("Error occurred:", error); // ← エラー全体を出す
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
