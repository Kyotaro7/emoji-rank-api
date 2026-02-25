import express from "express";
import puppeteer from "puppeteer";

const app = express();
const port = process.env.PORT || 3000;

app.get("/rank", async (req, res) => {
  const myEmojiName = req.query.my;   // 自分の絵文字名（正確な名称）
  const keyword = req.query.q;        // 検索ワード

  if (!myEmojiName || !keyword) {
    return res.json({ error: "my と q の2つのパラメータが必要です" });
  }

  let browser;
  try {
    // RailwayのDocker環境で動かすための必須設定
    browser = await puppeteer.launch({
      headless: "new",
      executablePath: "/usr/bin/chromium", // Dockerfileで指定したパス
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu"
      ]
    });

    const page = await browser.newPage();
    
    // タイムアウトを60秒に設定
    page.setDefaultNavigationTimeout(60000);

    // 直接、検索結果ページ（絵文字タブ）にアクセスする
    // ※ テンプレートリテラル（バッククォート）を使用して変数を展開します
    const searchUrl = `https://store.line.me{encodeURIComponent(keyword)}&type=emoji`;
    
    console.log(`Accessing: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: "networkidle2" });

    // 検索結果の絵文字一覧を取得（1ページ目の最大件数）
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

    // 自分の絵文字名を検索
    const found = results.find(r => r.title === myEmojiName);

    if (!found) {
      return res.json({
        myEmojiName,
        keyword,
        rank: null,
        message: "検索結果の1ページ目に見つかりませんでした。名前が完全一致しているか確認してください。"
      });
    }

    // 見つかった場合は順位を返す
    res.json({
      myEmojiName,
      keyword,
      rank: found.rank
    });

  } catch (error) {
    console.error("Error occurred:", error.message);
    res.status(500).json({ error: error.message });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

// ルートパスへのアクセス確認用
app.get("/", (req, res) => {
  res.send("LINE絵文字ランクAPIは正常に稼働中です。/rank?my=名前&q=キーワード で検索してください。");
});

// 0.0.0.0 を指定して外部接続を許可
app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});
