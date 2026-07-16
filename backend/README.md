# backend

ハーメルン (syosetu.org) のHTMLを取得・整形して返す個人用API。G2アプリの `app/` から
参照される。詳細な設計判断は `/Users/kyamamoto/.claude/plans/golden-sleeping-lighthouse.md` を参照。

## セットアップ

```bash
npm install
npx playwright install chromium   # チャプター本文ページのCloudflareチャレンジ突破に必須
cp .env.example .env               # 必要に応じて PORT / AUTH_TOKEN / HAMELN_MIN_INTERVAL_MS / HAMELN_COOKIE を編集
npm run dev
```

Node.js >= 20.18.1 が必要（cheerio 1.2系の要件）。

## なぜPlaywrightか

`syosetu.org` の話数本文ページ（目次ページは対象外）はCloudflareのmanaged challengeで
保護されており、`curl`/`fetch`では突破できない。ヘッドレスChromiumなら初回ナビゲーションで
自動的に通過することを確認済み。`fetcher.ts`はブラウザプロセス自体はプロセス生存期間中
維持しつつ、**リクエストごとに新しいブラウザコンテキスト**を使う（同一コンテキストを
使い回すと再チャレンジされやすくなることを確認済み）。直列キュー + 最小間隔でアクセス
頻度を抑えている。

## API

```
GET  /health
POST /novels                          { url }
POST /novels/import-favorites
GET  /novels
GET  /novels/:id
GET  /novels/:id/chapters/:episode
```

`AUTH_TOKEN` を設定した場合、`/novels` 配下は `Authorization: Bearer <token>` が必須になる
（未設定時はローカル開発の利便性のため無認証）。

## お気に入り一括インポート

`HAMELN_COOKIE` を設定すると `POST /novels/import-favorites` が使えるようになる。
ハーメルンのお気に入りページを全ページ取得し、載っている作品を一括で本棚に登録する
（話の本文までは取得しない。目次だけなので、個別にURLで追加するのと同じ軽さ）。

`HAMELN_COOKIE` は**自分で普段使っているブラウザで実際にログインし、その結果できた
セッションCookie（`autologin`/`sson`など）を手動でコピーして設定する**。このプロジェクトは
ハーメルンへのログイン処理自体を自動化しない（ログインのPOSTエンドポイントは
Cloudflareのボット対策がコンテンツ閲覧より強く、これを技術的に突破する実装はしない方針）。

## テスト

```bash
npm run typecheck
npm test   # test/fixtures/ の実HTMLに対するオフラインパーサーテスト（ネットワーク不要）
```
