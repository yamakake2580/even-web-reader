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

## クイックスタート（実機での動作確認）

1. Backendを起動する（別ターミナル）:
   ```bash
   cd backend
   npm install
   npx playwright install chromium   # 初回のみ
   npm run dev                       # http://localhost:8787
   ```
2. スマホのEvenアプリから「backend URL」に、開発機のLAN IPで
   `http://<開発機のLAN IP>:8787` を保存する（Vite起動時のターミナルに
   `Network: http://<IP>:5173/` として同じIPが表示される）。
3. Appを起動する（別ターミナル）:
   ```bash
   cd app
   npm install
   npm run dev                       # http://localhost:5173
   ```
4. 実機のG2に転送する:
   ```bash
   cd app
   npx evenhub qr --ip <開発機のLAN IP> --port 5173 --http
   ```
   表示されたQRコードをEvenアプリでスキャンする。
5. スマホのcompanion画面（Vite devサーバーを開いたときに出るフォーム）から
   ハーメルンの作品URL（例: `https://syosetu.org/novel/1/`）を登録する。
6. G2グラス側で本棚 → 話数リスト → リーダーの順に操作し、実際にページ送りできることを確認する。

シミュレーターのみで確認したい場合は `app/` で `npm run simulate` を実行する
（GUIウィンドウが開く。このセッションではアクセシビリティ権限の制約で
自動スクリーンショットが取れなかったため、目視確認が必要）。

## 開発の進め方

実装計画は `/Users/kyamamoto/.claude/plans/golden-sleeping-lighthouse.md` を参照。
