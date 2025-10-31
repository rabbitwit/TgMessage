# Telegram Message Monitor

这是一个 Telegram 消息监控和自动删除工具，支持本地运行和 Vercel 部署。

## 功能特性

- 监控指定群组的消息
- 根据关键词过滤消息
- 自动删除过期消息
- 转发重要消息到通知群组
- 支持本地和 Vercel 部署

## 环境变量配置

### 必需配置
- `APP_ID`: Telegram 应用 ID (从 https://my.telegram.org 获取)
- `APP_API_HASH`: Telegram 应用 API Hash (从 https://my.telegram.org 获取)
- `STRING_SESSION`: Telegram 字符串会话 (通过本地脚本生成)
- `TELEGRAM_BOT_TOKEN`: Telegram Bot Token (用于发送通知和 Webhook)

### 可选配置
- `MONITOR_CHAT_IDS`: 监控的聊天 ID 列表（用逗号分隔）
- `NOT_MONITOR_CHAT_IDS`: 不监控的聊天 ID 列表（用逗号分隔）
- `MONITOR_KEYWORDS`: 监控关键词（用逗号分隔）
- `AUTO_DELETE_MINUTES`: 自动删除消息的时间阈值（分钟）
- `NOTIFICATION_CHAT_ID`: 通知发送的目标群组 ID
- `TARGET_USER_IDS`: 优先监控的用户 ID 列表
- `USER_KEYWORDS`: 用户特定关键词
- `DEDUP_WINDOW_MINUTES`: 去重窗口（分钟）
- `NOTIFICATION_WEBHOOK_URL`: 通知 Webhook URL
- `CRON_AUTH_TOKEN`: Cron 认证 Token (保护你的 cron 端点)
- `DEPLOYMENT_URL`: 部署 URL (Vercel 部署时使用，如果未设置将自动使用 VERCEL_URL)

## 本地运行

1. 安装依赖:
   ```bash
   npm install
   ```

2. 配置环境变量:
   ```bash
   cp .env.example .env
   # 编辑 .env 文件填入你的配置
   ```

3. 启动监控:
   ```bash
   npm start
   ```

## Vercel 部署 (Webhook 模式)

1. 部署到 Vercel

2. 在 Vercel 项目设置中配置环境变量

3. 设置 Webhook:
   访问 `https://your-deployment-url.vercel.app/api/set-webhook?token=your_cron_auth_token`
   
   注意：如果未设置 DEPLOYMENT_URL 环境变量，系统会自动使用 VERCEL_URL

4. 验证 Webhook:
   ```bash
   curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo
   ```

## 工具脚本

- `npm run delete-all-history`: 删除所有历史消息
- `npm run list-groups`: 列出所有群组

## API 端点

### Vercel 部署时可用

- `POST /api/telegram-webhook`: Telegram Webhook 端点
- `GET /api/set-webhook`: 设置 Telegram Webhook
- `GET /api/delete-webhook`: 删除 Telegram Webhook

## Webhook 管理命令

### 检查当前 Webhook 状态
```bash
curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo
```

### 删除当前 Webhook
```bash
curl -X POST https://api.telegram.org/bot<YOUR_BOT_TOKEN>/deleteWebhook
```

### 设置新的 Webhook
```bash
curl -X POST https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=<YOUR_WEBHOOK_URL>
```

## Vercel 部署检查清单

1. 确保所有必需的环境变量都已在 Vercel 中配置
2. 确保 DEPLOYMENT_URL 或 VERCEL_URL 环境变量可用
3. 部署后通过访问 `/api/set-webhook?token=your_cron_auth_token` 设置 Webhook
4. 检查 Vercel 日志确认没有错误

## 常见问题排查

1. **程序无响应**: 检查环境变量是否正确配置
2. **Webhook 设置失败**: 确保 DEPLOYMENT_URL 或 VERCEL_URL 正确设置
3. **无法接收消息**: 检查 Webhook 是否正确设置，使用 `getWebhookInfo` 验证
4. **循环消息**: 系统已内置防护机制，检查 NOTIFICATION_CHAT_ID 是否正确设置

## 注意事项

1. 当部署到 Vercel 时，使用 Webhook 模式实现实时消息处理
2. 本地运行时，使用持续监听模式
3. 确保环境变量配置正确
4. 避免 Webhook 循环处理，系统已内置防护机制
5. 可以随时通过删除 Webhook 来停止消息处理