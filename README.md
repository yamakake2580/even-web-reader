# even-web-reader

Even Realities G2 スマートグラス上でハーメルン (hameln.syosetu.org) などの
Web小説を読むための個人用アプリ。

## 個人利用について

このプロジェクトはハーメルンの非公式スクレイパーを含みます。**完全に個人利用のみを想定**しており、
以下の方針で実装します。

- 低頻度アクセス・強めのキャッシュ（同じ話数は一度取得したら再取得しない）
- 素性を隠さない User-Agent、直列リクエストキューによるアクセス間隔の確保
- 取得したコンテンツの再配布・公開は行わない
- Even Hub ストアには申請せず、`evenhub qr` によるサイドロードのみで利用する

## 構成

- `app/` — G2グラス上で動作するEven Hubプラグイン本体（Vite + TypeScript）
- `backend/` — ハーメルンのHTMLを取得・整形して返す個人用API（Express）

詳細は各ディレクトリのREADMEを参照してください。

## 開発の進め方

実装計画は `/Users/kyamamoto/.claude/plans/golden-sleeping-lighthouse.md` を参照。
