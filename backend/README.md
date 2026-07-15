# backend

ハーメルン (syosetu.org) のHTMLを取得・整形して返す個人用API。G2アプリの `app/` から
参照される。詳細な設計判断は `/Users/kyamamoto/.claude/plans/golden-sleeping-lighthouse.md` を参照。

## セットアップ

```bash
npm install
npx playwright install chromium   # チャプター本文ページのCloudflareチャレンジ突破に必須
cp .env.example .env               # 必要に応じて PORT / AUTH_TOKEN / HAMELN_MIN_INTERVAL_MS を編集
npm run dev
```

Node.js >= 20.18.1 が必要（cheerio 1.2系の要件）。

## なぜPlaywrightか

`syosetu.org` の話数本文ページ（目次ページは対象外）はCloudflareのmanaged challengeで
保護されており、`curl`/`fetch`では突破できない。ヘッドレスChromiumなら初回ナビゲーションで
自動的に通過することを確認済み。`fetcher.ts`はプロセス生存期間中ブラウザコンテキストを
1つ維持し、Cookie（cf_clearance等）を使い回すことで2回目以降のリクエストを高速化しつつ、
直列キュー + 最小間隔でアクセス頻度を抑えている。

## API

```
GET  /health
POST /novels                          { url }
GET  /novels
GET  /novels/:id
GET  /novels/:id/chapters/:episode
```

`AUTH_TOKEN` を設定した場合、`/novels` 配下は `Authorization: Bearer <token>` が必須になる
（未設定時はローカル開発の利便性のため無認証）。

## テスト

```bash
npm run typecheck
npm test   # test/fixtures/ の実HTMLに対するオフラインパーサーテスト（ネットワーク不要）
```
