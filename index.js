import express from "express";
import puppeteer from "puppeteer";

const app = express();
const port = process.env.PORT || 3000;

app.get("/rank", async (req, res) => {
  const myEmojiName = req.query.my;   // 自分の絵文字名（正式名称）
  const keyword = req.query.q;        // 検索ワード

  if (!myEmojiName || !keyword) {
    return res.json({ error: "my と q の2つのパラメータが必要です" });
  }

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();

    // ① ホーム画面を開く
    await page.goto("https://store.line.me/home/ja", {
      waitUntil: "networkidle2"
    });

    // ② 検索バーにキーワードを入力
    await page.type("input[name='query']", keyword);

    // ③ Enter で検索実行
    await page.keyboard.press("Enter");

    // ④ 検索結果ページの読み込みを待つ
    await page.waitForNavigation({ waitUntil: "networkidle2" });

    // ⑤ 検索結果の絵文字一覧を取得
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

    // ⑥ 自分の絵文字名を検索（100位以内）
    const found = results.find(r => r.title === myEmojiName);

    if (!found || found.rank > 100) {
      return res.json({
        myEmojiName,
        keyword,
        rank: null,
        message: "100位以内に見つかりませんでした"
      });
    }

    // ⑦ 見つかった場合は順位を返す
    res.json({
      myEmojiName,
      keyword,
      rank: found.rank
    });

  } catch (error) {
    res.json({ error: error.message });
  } finally {
    await browser.close();
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
