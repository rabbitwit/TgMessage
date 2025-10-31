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
    
    // 删除 webhook
    await bot.api.deleteWebhook();
    
    response.status(200).send({
      success: true,
      message: 'Webhook successfully deleted'
    });
  } catch (error) {
    console.error('Error deleting webhook:', error);
    response.status(500).send({
      success: false,
      message: 'Failed to delete webhook',
      error: error.message
    });
  }
}