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

  let browser;
  try {
    // RailwayのDocker環境で動かすための必須設定
    browser = await puppeteer.launch({
      headless: "new",
      executablePath: "/usr/bin/chromium", // Dockerfileでインストールしたパスを指定
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage", // メモリ不足によるクラッシュ防止
        "--disable-gpu"
      ]
    });

    const page = await browser.newPage();
    
    // タイムアウトを少し長め（60秒）に設定
    page.setDefaultNavigationTimeout(60000);

    // ① ホーム画面を開く
    await page.goto("https://store.line.me", {
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
    console.error("Error occurred:", error); // Railwayのログに出力
    res.status(500).json({ error: error.message });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

// ルートパスへのアクセス時に使い方のヒントを表示
app.get("/", (req, res) => {
  res.send("LINE絵文字ランクAPIは稼働中です。/rank?my=名前&q=キーワード でアクセスしてください。");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
