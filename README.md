# bun-api-server-demo

Bun + [Hono](https://hono.dev/) の最小 REST API と、その前段の [Next.js](https://nextjs.org/) 画面です。どちらも Docker で起動し、`items` は AWS DynamoDB に保存します。ブラウザは Next.js だけを見て、Next.js のサーバーが Bun API を呼びます。テーブル、Lambda、ALB と Fargate は [Terraform](infra/) です。

## 構成

```text
├── infra/             # DynamoDB、Lambda、ALB と Fargate（Terraform）
├── package.json       # Bun workspace（api と web）。zod はここの dependencies。typescript と vitest は devDependencies
├── vitest.config.ts   # api と web のユニットテスト
├── tsconfig.base.json # api と web で共有する TypeScript 設定
├── types/             # api と web で共有する型（types/item.ts）
├── bun.lock           # api と web で共有
├── bunfig.toml
├── Dockerfile         # 本番。target は api / web
├── Dockerfile.dev     # 開発。target は api / web
├── .dockerignore
├── docker-compose.yml
├── docker-compose.dev.yml   # Docker 開発（Compose Watch で api/src を sync）
├── api/               # Bun + Hono
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts   # サーバ起動
│       ├── lambda.ts  # Lambda ハンドラ（Node.js）
│       ├── app.ts     # Hono アプリ
│       ├── app.test.ts
│       ├── db.ts      # DynamoDB Document Client
│       └── items.ts   # /items ルート
└── web/               # Next.js（既定ページの一覧と投入フォーム）
    ├── package.json
    └── app/
```

| 項目 | 内容 |
|------|------|
| API ランタイム | Bun |
| API フレームワーク | Hono |
| 画面 | Next.js（ホスト `3001`、コンテナ内 `3000`） |
| データストア | Amazon DynamoDB |
| API ベースイメージ | `oven/bun:1` |
| 画面の本番イメージ | ビルドも起動も `oven/bun:1`（standalone を `bun web/server.js`） |

## 作業手順（プランに沿った構築手順）

このリポジトリは、次の順で作ったものです。同じ手順で再現できます。

### 1. Bun プロジェクトの初期化

```bash
mkdir api && cd api
bun init -y
bun add hono
bun add -d typescript @types/bun
```

今のリポジトリは、このあとルートを Bun workspace にしている。`package.json` の `workspaces` は `api` と `web` で、依存のインストールと `bun.lock` はルートに一つだけある。`zod` はルートの dependencies に一つだけ置き、api と web の両方から使う。`typescript` と `vitest` もルートの devDependencies に一つだけ置く。

`api/package.json` にスクリプトを追加:

- `dev` — ホットリロード付き開発サーバ
- `start` — 本番相当の起動

ルートの `test` は Vitest。API と Next.js の両方を実行する。API の DynamoDB はモックし、AWS には接続しない。

Bun が手元にない場合は、Docker で lockfile を生成できます:

```bash
docker run --rm -v "$PWD":/usr/src/app -w /usr/src/app oven/bun:1 bun install
```

`bun.lock` はリポジトリルートに一つだけコミットしてください。Docker ビルドの `bun install --frozen-lockfile` で使います。

### 2. API の実装（`api/src/index.ts`）

1. `Hono` インスタンスを作成
2. ルートを定義
   - `GET /health` → `{ "status": "ok" }`
   - `GET /items` → 一覧
   - `POST /items` → JSON `{ "name": string }` で作成（201 + 生成 ID）
   - `GET /items/:id` → 1件（無ければ 404）
3. `const port = Number(process.env.PORT ?? 3000)` でポートを決定
4. `export default { port, fetch: app.fetch }` で Bun にサーバを渡す（`bun --watch` が再起動できるようにする）

### 3. Dockerfile（マルチステージ）

本番はリポジトリ直下の `Dockerfile`、開発は `Dockerfile.dev` です。どちらも API と Next.js のステージを置き、Compose は `target` でイメージを選びます。API の依存インストールは [Bun 公式の Docker ガイド](https://bun.com/docs/guides/ecosystem/docker) に沿います。

1. **api**（`Dockerfile`）— `oven/bun:1`。ルートの workspace から `bun install --frozen-lockfile --filter api --filter bun-api-server-demo`（prod は `--production`）。ルート側は zod を入れるため。最終ステージは prod の `node_modules`、`api/package.json`、`src/`。`USER bun`、`EXPOSE 3000`、`ENTRYPOINT ["bun", "run", "start"]`
2. **web**（`Dockerfile`）— ビルドも起動も `oven/bun:1`。standalone を `bun web/server.js` で起動する
3. **api** / **web**（`Dockerfile.dev`）— 開発用。`docker-compose.dev.yml` がこのファイルを使う

### 4. docker-compose.yml

- サービス名 `api` と `web`
- ビルドコンテキストはリポジトリルート。`target` は本番も開発も `api` / `web`。開発は `Dockerfile.dev` を使う
- API は `3000:3000`、Next.js は `3001:3000`
- 環境変数 `PORT=3000`、`AWS_REGION`、`ITEMS_TABLE`、AWS の一時キー
- Next.js の `API_URL` はコンテナ内で `http://api:3000`

### 5. `.dockerignore`

ビルドコンテキストはリポジトリルートなので、除外はルートの `.dockerignore` に書く。少なくとも次を除外:

- `**/node_modules`
- `**/.next`
- `**/dist`
- `.git`
- `*.md`

### 6. 動作確認

ローカル（Bun あり）。AWS の認証情報は SDK の自動探索に任せます。

```bash
bun install
bun run dev:api
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

型チェック（api と web）とユニットテスト（Bun あり）:

```bash
bun run typecheck
bun run test
```

Bun が手元にない場合のユニットテスト。AWS には接続しません。リポジトリルートで実行します。

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
bun run dev:api
```

### Docker（本番相当・イメージに src を焼き込み）

起動するシェルで一時キーを出してから上げます。API コンテナが AWS の DynamoDB に届くために使います。

```bash
eval "$(aws configure export-credentials --format env)"
bun run docker
```

画面は http://localhost:3001 、API は http://localhost:3000 です。

バックグラウンド:

```bash
docker-compose up --build -d
```

停止（この節の本番相当。API と Next.js）:

```bash
bun run docker:down
```
### Docker（開発・ファイル保存で再起動）

Mac / Colima では、バインドマウント越しの `bun --watch` も、Compose の `restart` も途中で切れます。開発時は次の分担です。

- Compose `--watch` がホストの `api/src/` 保存を検知し、コンテナ内へ **sync だけ**する
- コンテナ内の `bun --watch` が、同期されたファイルを見てプロセスを再起動する

**`--watch` が必須です。**

```bash
bun run dev:docker
```

停止（起動時と同じ 2 ファイルを指定する）:

```bash
bun run dev:docker:down
```

ログに `Watch enabled` と `Syncing service "api"` が出れば監視中です。Next.js も同じコマンドで上がり、`web/app` の保存は画面コンテナへ同期されます。`items` は DynamoDB に残るので、API コンテナを再起動しても消えません。

画面は http://localhost:3001 です。ここでも、起動前に `eval "$(aws configure export-credentials --format env)"` で一時キーを渡します。

注意:

- **`docker-compose up` だけ**（`docker-compose.dev.yml` なし、`--watch` なし）では反映されません
- 依存パッケージ（`package.json`）を変えたときは、イメージの再ビルドが必要です

## 画面

http://localhost:3001 の既定ページに、`items` の一覧と `name` の投入フォームがあります。送信は Next.js の Server Action が `POST /items` し、一覧は `GET /items` です。ブラウザは Bun API に直接繋ぎません。

## DynamoDB テーブルを作り直す

テーブルだけを AWS に作ります。Lambda の zip は要りません。事前に `aws sso login` などで認証します。

`infra` の `terraform apply` は `allowed_cidr` が必須です。テーブルだけを作るときも渡します。値はこの PC のグローバル IP を `/32` にしたものです。

```bash
cd infra
terraform init
terraform apply -target=aws_dynamodb_table.items -var="allowed_cidr=$(curl -4 -s ifconfig.me)/32"
```

リージョンは `ap-northeast-1`、テーブル名は `items` です。

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
| `API_URL` | `http://localhost:3000` | Next.js が呼ぶ Bun API。Docker 内では `http://api:3000` |

## Lambda

同じ Hono アプリを Node.js 22 の Lambda で動かします。ローカルの `bun run dev:api` はそのまま使えます。入口は Function URL で、IAM 署名がないリクエストは 403 になります。

事前に `aws sso login` などで、この Terraform を適用できる認証を済ませておきます。

```bash
bun run build:lambda
cd infra
terraform init
terraform apply -var="allowed_cidr=$(curl -4 -s ifconfig.me)/32"
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

## Fargate

Next.js と Hono を、1 つの Fargate タスクで動かします。ブラウザの入口は ALB の 80 番で、許可するのは `allowed_cidr` の 1 アドレスだけです。ALB は Next.js の 3000 番へ転送し、Hono は同じタスクの `127.0.0.1:3002` にいます。API の DynamoDB 認証はタスクロールの一時キーです。アクセスキーは渡しません。

イメージが ECR に無いとタスクは起動しないので、先にリポジトリだけを作り、`linux/arm64` で push してから残りを適用します。事前に `aws sso login` などで認証します。

```bash
cd infra
terraform init
terraform apply \
  -target=aws_ecr_repository.web \
  -target=aws_ecr_repository.api \
  -var="allowed_cidr=$(curl -4 -s ifconfig.me)/32"

WEB_REPO=$(terraform output -raw ecr_web_repository_url)
API_REPO=$(terraform output -raw ecr_api_repository_url)
aws ecr get-login-password --region "${AWS_REGION:-ap-northeast-1}" \
  | docker login --username AWS --password-stdin "${WEB_REPO%%/*}"

cd ..
docker buildx build --platform linux/arm64 -t "${API_REPO}:latest" --target api --push .
docker buildx build --platform linux/arm64 -t "${WEB_REPO}:latest" --target web --push .

cd infra
terraform apply -var="allowed_cidr=$(curl -4 -s ifconfig.me)/32"
```

画面は `http://<ALBのDNS名>/` です。

```bash
echo "http://$(terraform output -raw alb_dns_name)/"
```

回線のグローバル IP が変わったら、`allowed_cidr` を新しい `/32` にして、もう一度 `terraform apply` します。
