import express from "express";
import puppeteer from "puppeteer";

const app = express();

app.get("/rank", async (req, res) => {
  const q = req.query.q;
  if (!q) return res.json({ error: "q が必要です" });

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox"]
  });
  const page = await browser.newPage();

  await page.goto(`https://store.line.me/emojishop/search/ja?q=${q}`);

  const rank = await page.evaluate(() => {
    const el = document.querySelector(".mdCMN02Rank");
    return el ? el.innerText : null;
  });

  await browser.close();

  res.json({ q, rank });
});

app.listen(3000, () => console.log("Server running"));
