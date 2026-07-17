# backend を常時起動サーバーに置く（Docker）

x86_64 のミニPC等で、Docker を使って backend を常時起動する手順。
ラズパイ（ARM）よりこちらが楽です（Chromium がそのまま動く）。

## 前提

- ミニPCに **Docker** と **Docker Compose** が入っていること
  （Debian/Ubuntu 系なら `curl -fsSL https://get.docker.com | sh`）
- 同じ Tailnet に参加させる **Tailscale**（外出先から使うため。任意）

## 手順

```bash
# 1. リポジトリを取得
git clone https://github.com/yamakake2580/even-web-reader.git
cd even-web-reader/backend

# 2. .env を用意（Mac の backend/.env の中身をそのままコピー）
cp .env.example .env
#   → HAMELN_COOKIE / HAMELN_MIN_INTERVAL_MS などを設定。
#   → 外部に晒す構成なら AUTH_TOKEN も設定推奨（下記「認証」参照）。

# 3. ビルド & 起動（バックグラウンド・常時起動）
docker compose up -d --build
```

`docker compose up -d` の `restart: unless-stopped`（compose に設定済み）により、
**クラッシュ時も、ミニPCの再起動後も自動で立ち上がります**（Docker デーモンが
起動時に走る前提。多くのディストロで既定で有効）。

## 動作確認

```bash
curl http://localhost:8787/health        # {"ok":true}
docker compose logs -f                    # ログを見る
```

## スマホからの接続先

- 同一LANだけで使うなら、ミニPCの **LAN IP** を Even アプリの「Backend URL」に。
- 外出先でも使うなら、ミニPCに Tailscale を入れて、その **Tailscale IP** を設定。

## 認証（外部公開する場合）

`.env` に `AUTH_TOKEN=...` を設定すると `/novels`・`/favorites` に
`Authorization: Bearer <token>` が必要になります。ただし現状アプリ側は
この Authorization ヘッダを送っていないため、**AUTH_TOKEN を設定する場合は
アプリ側の対応も必要**です（Tailscale だけで閉じるなら未設定で可）。

## 更新のしかた

```bash
cd even-web-reader && git pull
cd backend && docker compose up -d --build
```

## キャッシュ

`backend/data/` はコンテナにボリュームマウントしているので、
取得済みの小説・話数のキャッシュはコンテナを作り直しても残ります。
