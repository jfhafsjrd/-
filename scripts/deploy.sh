#!/bin/bash
# Life OS 一键部署 → 阿里云马来西亚服务器
# 用法：npm run deploy 或 bash scripts/deploy.sh
# 流程：本地构建 → 打包上传 → 服务器装依赖 → pm2 重启 → 健康检查
# 注意：只覆盖代码和 dist，不动服务器上的 .env 和 data.json（线上数据独立）
set -e
SERVER=root@47.250.95.72
REMOTE_DIR=/www/wwwroot/dashboard

echo "[1/5] 本地构建..."
npm run build

echo "[2/5] 打包（服务端代码 + 前端产物 + 依赖清单）..."
tar -czf /tmp/lifeos-deploy.tgz dist package.json package-lock.json \
  server/app.js server/db.js server/scheduler.js server/utils.js server/routes

echo "[3/5] 上传..."
scp -q /tmp/lifeos-deploy.tgz "$SERVER:/tmp/"

echo "[4/5] 服务器解包 + 依赖 + 重启（dist 原子交换，自动清理历史 hash 文件）..."
ssh "$SERVER" "cd $REMOTE_DIR && mkdir -p /tmp/lifeos-new && rm -rf /tmp/lifeos-new/* && \
  tar -xzf /tmp/lifeos-deploy.tgz -C /tmp/lifeos-new && \
  rm -rf dist.bak && mv dist dist.bak && mv /tmp/lifeos-new/dist . && rm -rf dist.bak && \
  cp -f /tmp/lifeos-new/package.json /tmp/lifeos-new/package-lock.json . && \
  cp -rf /tmp/lifeos-new/server/. server/ && rm -rf /tmp/lifeos-new /tmp/lifeos-deploy.tgz && \
  npm install --omit=dev --no-audit --no-fund 2>&1 | tail -1 && \
  pm2 restart life-os"

echo "[5/5] 健康检查..."
sleep 3
curl -s --max-time 10 "http://life.xuuhc.cc.cd/api/health" && echo " ✅ 部署完成"
