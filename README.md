# bun-api-server-demo

Bun + [Hono](https://hono.dev/) の最小 REST API。Docker でコンテナ起動できます。`items` は PostgreSQL に保存します。ローカル開発は同梱の Postgres、本番は起動時に渡す `DATABASE_URL` の別 DB です。

## 構成

```text
├── package.json
├── bun.lock
├── tsconfig.json
├── src/
│   ├── index.ts       # API 本体
│   ├── db.ts          # Bun SQL と items テーブル作成
│   └── items.ts       # /items ルート
├── Dockerfile         # マルチステージ（本番用 node_modules）
├── Dockerfile.dev     # 開発用（bun install + bun --watch）
├── docker-compose.yml
├── docker-compose.dev.yml   # Docker 開発（Compose Watch で src を sync）
└── .dockerignore
```

| 項目 | 内容 |
|------|------|
| ランタイム | Bun |
| フレームワーク | Hono |
| ベースイメージ | `oven/bun:1` |

## 作業手順（プランに沿った構築手順）

このリポジトリは、次の順で作ったものです。同じ手順で再現できます。

### 1. Bun プロジェクトの初期化

```bash
bun init -y
bun add hono
bun add -d typescript @types/bun
```

`package.json` にスクリプトを追加:

- `dev` — ホットリロード付き開発サーバ
- `start` — 本番相当の起動
- `typecheck` — TypeScript の型チェック

Bun が手元にない場合は、Docker で lockfile を生成できます:

```bash
docker run --rm -v "$PWD":/usr/src/app -w /usr/src/app oven/bun:1 bun install
```

`bun.lock` はコミット対象にしてください。Docker ビルドの `bun install --frozen-lockfile` で使います。

### 2. API の実装（`src/index.ts`）

1. `Hono` インスタンスを作成
2. ルートを定義
   - `GET /health` → `{ "status": "ok" }`
   - `GET /items` → 一覧
   - `POST /items` → JSON `{ "name": string }` で作成（201 + 生成 ID）
   - `GET /items/:id` → 1件（無ければ 404）
3. `const port = Number(process.env.PORT ?? 3000)` でポートを決定
4. `export default { port, fetch: app.fetch }` で Bun にサーバを渡す（`bun --watch` が再起動できるようにする）

### 3. Dockerfile（マルチステージ）

[Bun 公式の Docker ガイド](https://bun.com/docs/guides/ecosystem/docker) に沿った構成:

1. **base** — `FROM oven/bun:1`、`WORKDIR /usr/src/app`
2. **install** — dev / prod 用に `bun install --frozen-lockfile`（prod は `--production`）
3. **release** — prod の `node_modules`、`package.json`、`src/` をコピー
4. `USER bun`、`EXPOSE 3000`、`ENTRYPOINT ["bun", "run", "start"]`

### 4. docker-compose.yml

- サービス名 `api`
- ビルドコンテキストはプロジェクトルート
- `3000:3000` で公開
- 環境変数 `PORT=3000` と、起動時に渡す `DATABASE_URL`
- Postgres コンテナは開発用の `docker-compose.dev.yml` だけ

### 5. `.dockerignore`

ビルドを軽くするため、少なくとも次を除外:

- `node_modules`
- `.git`
- `*.md`（任意）

### 6. 動作確認

ローカル（Bun あり）。先に開発用 Postgres を上げる:

```bash
bun install
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db
DATABASE_URL=postgres://app:app@localhost:5432/app bun run dev
curl http://localhost:3000/health
```

Docker（本番相当。`DATABASE_URL` は別 DB）:

```bash
DATABASE_URL=postgres://user:pass@host:5432/dbname docker compose up --build
# または（Compose V2 プラグインがない環境）
docker-compose up --build
```

```bash
curl http://localhost:3000/health
curl -X POST http://localhost:3000/items \
  -H 'Content-Type: application/json' \
  -d '{"name":"demo"}'
curl http://localhost:3000/items
```

型チェック:

```bash
bun run typecheck
```

## 前提

- [Bun](https://bun.sh/)（ローカル開発する場合）
- [Docker](https://www.docker.com/)（コンテナで動かす場合）

## 起動

### ローカル開発

Postgres は開発用 Compose だけが起動します。ホストの Bun から繋ぐときは db だけ上げます。

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db
DATABASE_URL=postgres://app:app@localhost:5432/app bun run dev
```

ユーザ / パスワード / DB 名はいずれも `app` です。

### Docker（本番相当・イメージに src を焼き込み）

Postgres コンテナは起動しません。接続先の `DATABASE_URL` が必須です。

```bash
DATABASE_URL=postgres://user:pass@host:5432/dbname docker compose up --build
# Compose プラグインがない環境: docker-compose up --build
```

バックグラウンド:

```bash
docker compose up --build -d
```

停止:

```bash
docker compose down
```
### Docker（開発・ファイル保存で再起動）

Mac / Colima では、バインドマウント越しの `bun --watch` も、Compose の `restart` も途中で切れます。開発時は次の分担です。

- Compose `--watch` がホストの `src/` 保存を検知し、コンテナ内へ **sync だけ**する
- コンテナ内の `bun --watch` が、同期されたファイルを見てプロセスを再起動する

**`--watch` が必須です。**

```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up --build --watch
```

または:

```bash
bun run dev:docker
```

ログに `Watch enabled` と `Syncing service "api"` が出れば監視中です。`items` は同梱 Postgres のボリュームに残るので、API コンテナを再起動しても消えません。

注意:

- **`docker-compose up` だけ**（`docker-compose.dev.yml` なし、`--watch` なし）では反映されません
- 依存パッケージ（`package.json`）を変えたときは、イメージの再ビルドが必要です

## API

| メソッド | パス | 説明 |
|----------|------|------|
| GET | `/health` | ヘルスチェック |
| GET | `/items` | アイテム一覧 |
| POST | `/items` | アイテム作成（body: `{ "name": "..." }`） |
| GET | `/items/:id` | ID で 1件取得 |

### curl 例

```bash
# ヘルス
curl http://localhost:3000/health

# 作成
curl -X POST http://localhost:3000/items \
  -H 'Content-Type: application/json' \
  -d '{"name":"demo"}'

# 一覧
curl http://localhost:3000/items

# 1件（レスポンスの id を指定）
curl http://localhost:3000/items/<id>
```

## 環境変数

| 変数 | 既定値 | 説明 |
|------|--------|------|
| `PORT` | `3000` | 待ち受けポート |
| `DATABASE_URL` | なし（必須） | PostgreSQL の接続文字列。未設定だと起動時に失敗する。開発用 Compose は `postgres://app:app@db:5432/app` を渡す |
