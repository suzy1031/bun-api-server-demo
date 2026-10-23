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
COPY api/package.json api/bun.lock /temp/dev/
# lockfile どおりに全依存を入れる（typecheck 用など）
# tarball は BuildKit キャッシュに残す。--prefer-offline でメタデータの再取得を避け、足りないパッケージだけ落とす
RUN --mount=type=cache,target=/root/.bun/install/cache \
    cd /temp/dev && bun install --frozen-lockfile --prefer-offline

# 本番用 node_modules を別ディレクトリに入れる
RUN mkdir -p /temp/prod
COPY api/package.json api/bun.lock /temp/prod/
# 本番に必要なパッケージだけ入れる（typescript などは除外）
RUN --mount=type=cache,target=/root/.bun/install/cache \
    cd /temp/prod && bun install --frozen-lockfile --production --prefer-offline

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

COPY web/package.json web/bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --prefer-offline

COPY web/ .
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

FROM node:26-alpine AS web
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=web-build /app/.next/standalone ./
COPY --from=web-build /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
