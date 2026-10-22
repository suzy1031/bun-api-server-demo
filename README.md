test hooks
# bun-api-server-demo

Bun + [Hono](https://hono.dev/) の最小 REST API。Docker でコンテナ起動できます。`items` は AWS DynamoDB に保存します。テーブルと Lambda は [Terraform](infra/) です。

## 構成

```text
├── package.json
├── bun.lock
├── tsconfig.json
├── vitest.config.ts   # Vitest（ユニットテスト）
├── infra/             # DynamoDB と Lambda（Terraform）
├── src/
│   ├── index.ts       # サーバ起動
│   ├── lambda.ts      # Lambda ハンドラ（Node.js）
│   ├── app.ts         # Hono アプリ
│   ├── app.test.ts    # /health と /items のユニットテスト
│   ├── db.ts          # DynamoDB Document Client
│   └── items.ts       # /items ルート
├── Dockerfile         # マルチステージ（本番用 node_modules）
├── Dockerfile.dev     # 開発用（bun install）
├── docker-compose.yml
├── docker-compose.dev.yml   # Docker 開発（Compose Watch で src を sync）
└── .dockerignore
```

| 項目 | 内容 |
|------|------|
| ランタイム | Bun |
| フレームワーク | Hono |
| データストア | Amazon DynamoDB |
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
- `test` — Vitest のユニットテスト（DynamoDB はモックし、AWS には接続しない）

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
- 環境変数 `PORT=3000`、`AWS_REGION`、`ITEMS_TABLE`

### 5. `.dockerignore`

ビルドを軽くするため、少なくとも次を除外:

- `node_modules`
- `.git`
- `*.md`（任意）

### 6. 動作確認

ローカル（Bun あり）。AWS の認証情報は SDK の自動探索に任せます。

```bash
bun install
bun run dev
curl http://localhost:3000/health
```

Docker（本番相当）:

```bash
docker-compose up --build
```

```bash
curl http://localhost:3000/health
curl -X POST http://localhost:3000/items \
  -H 'Content-Type: application/json' \
  -d '{"name":"demo"}'
curl http://localhost:3000/items
```

型チェックとユニットテスト（Bun あり）:

```bash
bun run typecheck
bun run test
```

Bun が手元にない場合のユニットテスト。AWS には接続しません。

```bash
docker run --rm -v "$PWD":/usr/src/app -w /usr/src/app oven/bun:1 bun run test
```

## 前提

- [Bun](https://bun.sh/)（ローカル開発する場合）
- [Docker](https://www.docker.com/)（コンテナで動かす場合）

## 起動

### ローカル開発

ホストの Bun から DynamoDB へ接続します。事前に `aws sso login` などで認証しておきます。

```bash
bun run dev
```

### Docker（本番相当・イメージに src を焼き込み）

```bash
docker-compose up --build
```

バックグラウンド:

```bash
docker-compose up --build -d
```

停止（この節の本番相当。`api` だけ）:

```bash
docker-compose down
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

停止（起動時と同じ 2 ファイルを指定する）:

```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml down
```

ログに `Watch enabled` と `Syncing service "api"` が出れば監視中です。`items` は DynamoDB に残るので、API コンテナを再起動しても消えません。

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
| `AWS_REGION` | `ap-northeast-1` | DynamoDB のリージョン |
| `ITEMS_TABLE` | `items` | DynamoDB のテーブル名 |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN` | なし | 未設定のときは SDK が SSO や IAM ロールを探す。Docker から AWS へ接続するときは、起動するシェルで `aws configure export-credentials --format env` した値を渡す |

## Lambda

同じ Hono アプリを Node.js 22 の Lambda で動かします。ローカルの `bun run dev` はそのまま使えます。入口は Function URL で、IAM 署名がないリクエストは 403 になります。

事前に `aws sso login` などで、この Terraform を適用できる認証を済ませておきます。

```bash
bun run build:lambda
cd infra
terraform init
terraform apply
```

`apply` は DynamoDB テーブルと Lambda をまとめて作ります。URL は末尾が `/` です。

```bash
FUNCTION_URL=$(terraform output -raw function_url)
```

この PC の一時認証情報を環境変数に出してから、署名付きで呼びます。

```bash
eval "$(aws configure export-credentials --format env)"

curl --aws-sigv4 "aws:amz:${AWS_REGION:-ap-northeast-1}:lambda" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" \
  -H "x-amz-security-token: $AWS_SESSION_TOKEN" \
  "${FUNCTION_URL}health"

curl --aws-sigv4 "aws:amz:${AWS_REGION:-ap-northeast-1}:lambda" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" \
  -H "x-amz-security-token: $AWS_SESSION_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"demo"}' \
  "${FUNCTION_URL}items"

curl --aws-sigv4 "aws:amz:${AWS_REGION:-ap-northeast-1}:lambda" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" \
  -H "x-amz-security-token: $AWS_SESSION_TOKEN" \
  "${FUNCTION_URL}items"
```

署名を付けない `curl` は 403 になります。同じ AWS アカウントの権限がない別の PC からも呼べません。
