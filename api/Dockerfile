# syntax=docker/dockerfile:1
# 公式 Bun イメージ（メジャー 1.x）。以降のステージの共通土台
FROM oven/bun:1 AS base
# コンテナ内の作業ディレクトリ。以降の COPY / RUN の基準になる
WORKDIR /usr/src/app

# 依存インストール専用ステージ（最終イメージには残さない）
FROM base AS install
# lockfile 付き install 用の一時ディレクトリ（dev 依存込み）
RUN mkdir -p /temp/dev
# マニフェストを先にコピーして、依存が変わらない限りこの層をキャッシュする
COPY package.json bun.lock /temp/dev/
# lockfile どおりに全依存を入れる（typecheck 用など）
# tarball は BuildKit キャッシュに残す。--prefer-offline でメタデータの再取得を避け、足りないパッケージだけ落とす
RUN --mount=type=cache,target=/root/.bun/install/cache \
    cd /temp/dev && bun install --frozen-lockfile --prefer-offline

# 本番用 node_modules を別ディレクトリに入れる
RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
# 本番に必要なパッケージだけ入れる（typescript などは除外）
RUN --mount=type=cache,target=/root/.bun/install/cache \
    cd /temp/prod && bun install --frozen-lockfile --production --prefer-offline

# 実際に docker run される最終ステージ
FROM base AS release
# 本番用 node_modules を最終イメージへ持ってくる
COPY --from=install /temp/prod/node_modules node_modules
# bun run start が読む scripts
COPY package.json ./
# API のソースを置く
COPY src ./src

# root ではなく bun ユーザで動かして権限を絞る
USER bun
# コンテナが 3000/tcp を使うことのドキュメント（公開は compose の ports 側）
EXPOSE 3000/tcp
# コンテナ起動時に必ず実行するコマンド
ENTRYPOINT ["bun", "run", "start"]
