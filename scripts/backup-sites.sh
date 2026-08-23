#!/bin/bash
# 每日备份 life-os 与 family-cinema 数据（保留最近 7 天）
# crontab: 30 4 * * * /root/backup-sites.sh >> /www/backup/sites/backup.log 2>&1
DEST=/www/backup/sites
mkdir -p "$DEST"
STAMP=$(date +%Y%m%d_%H%M%S)

# life-os：业务数据 + 密钥配置（server 目录排除 node_modules）
tar -czf "$DEST/lifeos_${STAMP}.tar.gz" \
  -C /www/wwwroot/dashboard \
  --exclude='server/node_modules' \
  .env server/data.json server/steam_cache.json server 2>/dev/null

# family-cinema：全部 JSON 状态 + 代码（排除 node_modules）
tar -czf "$DEST/familycinema_${STAMP}.tar.gz" \
  -C /www/wwwroot/family-cinema \
  --exclude='node_modules' \
  . 2>/dev/null

# 各保留最近 7 份
ls -1t "$DEST"/lifeos_*.tar.gz 2>/dev/null | tail -n +8 | xargs -r rm -f
ls -1t "$DEST"/familycinema_*.tar.gz 2>/dev/null | tail -n +8 | xargs -r rm -f

echo "[$(date '+%F %T')] backup ok: $(ls -1 "$DEST"/*.tar.gz 2>/dev/null | wc -l) files"
