import express from "express";
import puppeteer from "puppeteer";

const app = express();
const port = process.env.PORT || 3000;

app.get("/rank", async (req, res) => {
  const q = req.query.q;

  if (!q) {
    return res.json({ error: "q parameter is required" });
  }

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();

    // ★ LINE STORE の正しい検索URL（2025年以降版）
    await page.goto(`https://store.line.me/emojishop/ja/search?q=${encodeURIComponent(q)}`, {
      waitUntil: "networkidle2"
    });

    // ランキング要素を取得
    const rank = await page.evaluate(() => {
      const el = document.querySelector(".mdCMN02Rank");
      return el ? el.textContent.trim() : null;
    });

    res.json({ q, rank });

  } catch (error) {
    res.json({ error: error.message });
  } finally {
    await browser.close();
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
