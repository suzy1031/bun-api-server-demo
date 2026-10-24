# syntax=docker/dockerfile:1

# --- API（本番）---
# 公式 Bun イメージ（メジャー 1.x）。API ステージの共通土台
FROM oven/bun:1 AS api-base
# コンテナ内の作業ディレクトリ。以降の COPY / RUN の基準になる
WORKDIR /usr/src/app

# 依存インストール専用ステージ（最終イメージには残さない）
FROM api-base AS api-install
# lockfile 付き install 用の一時ディレクトリ（dev 依存込み）
RUN mkdir -p /temp/dev
# マニフェストを先にコピーして、依存が変わらない限りこの層をキャッシュする
# ルートの workspace 定義と lockfile、各パッケージの package.json が揃って frozen install できる
COPY package.json bun.lock bunfig.toml /temp/dev/
COPY api/package.json /temp/dev/api/package.json
COPY web/package.json /temp/dev/web/package.json
# lockfile どおりに api とルートの依存を入れる。zod はルートの dependencies
# hoisted なのでパッケージは /temp/dev/node_modules に揃う
# tarball は BuildKit キャッシュに残す。--prefer-offline でメタデータの再取得を避け、足りないパッケージだけ落とす
RUN --mount=type=cache,target=/root/.bun/install/cache \
    cd /temp/dev && bun install --frozen-lockfile --filter api --filter bun-api-server-demo --linker hoisted --prefer-offline

# 本番用 node_modules を別ディレクトリに入れる
RUN mkdir -p /temp/prod
COPY package.json bun.lock bunfig.toml /temp/prod/
COPY api/package.json /temp/prod/api/package.json
COPY web/package.json /temp/prod/web/package.json
# 本番に必要な api とルートの dependencies だけ入れる（typescript や web は除外）
RUN --mount=type=cache,target=/root/.bun/install/cache \
    cd /temp/prod && bun install --frozen-lockfile --production --filter api --filter bun-api-server-demo --linker hoisted --prefer-offline

# Compose の target: api。実際に docker run される最終ステージ
FROM api-base AS api
# 本番用 node_modules を最終イメージへ持ってくる
COPY --from=api-install /temp/prod/node_modules node_modules
# bun run start が読む scripts
COPY api/package.json ./
# API のソースを置く
COPY api/src ./src

# root ではなく bun ユーザで動かして権限を絞る
USER bun
# コンテナが 3000/tcp を使うことのドキュメント（公開は compose の ports 側）
EXPOSE 3000/tcp
# コンテナ起動時に必ず実行するコマンド
ENTRYPOINT ["bun", "run", "start"]

# --- Web（本番）---
# ビルドは Bun。Compose の最終イメージは target: web
FROM oven/bun:1 AS web-build
WORKDIR /app

# ルートの workspace 定義と lockfile、各パッケージの package.json が揃って frozen install できる
# typescript はルートの devDependency なので、web に加えてルートパッケージも入れる
COPY package.json bun.lock bunfig.toml ./
COPY api/package.json api/package.json
COPY web/package.json web/package.json
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --filter web --filter bun-api-server-demo --linker hoisted --prefer-offline

# 開発イメージと同じく workspace の形を残す。web/tsconfig.json は親の tsconfig.base.json を参照する
# web/app は ../../types で共有型を読む。Turbopack の root はこの /app
COPY tsconfig.base.json ./tsconfig.base.json
COPY types ./types
COPY web ./web
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app/web
RUN bun run build

FROM node:26-alpine AS web
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# outputFileTracingRoot がリポジトリルートなので、standalone は web/server.js を含む
COPY --from=web-build /app/web/.next/standalone ./
COPY --from=web-build /app/web/.next/static ./web/.next/static

EXPOSE 3000
CMD ["node", "web/server.js"]
