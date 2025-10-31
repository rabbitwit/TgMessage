import { Bot } from 'grammy';

export default async function handler(request, response) {
  // 验证认证令牌
  if (request.query.token !== process.env.CRON_AUTH_TOKEN) {
    response.status(401).send('Not authorized :(');
    return;
  }

  try {
    // 创建 Telegram Bot 实例
    const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
    
    // 获取当前部署的 URL
    const DEPLOYMENT_URL = process.env.DEPLOYMENT_URL;
    if (!DEPLOYMENT_URL) {
      throw new Error('DEPLOYMENT_URL or VERCEL_URL environment variable is not set');
    }
    
    // 构建 webhook URL
    const webhookUrl = `https://${DEPLOYMENT_URL}/api/telegram-webhook`;
    
    // 设置 webhook
    await bot.api.setWebhook(webhookUrl);
    
    response.status(200).send({
      success: true,
      message: `Webhook successfully set to: ${webhookUrl}`
    });
  } catch (error) {
    console.error('Error setting webhook:', error);
    response.status(500).send({
      success: false,
      message: 'Failed to set webhook',
      error: error.message
    });
  }
}