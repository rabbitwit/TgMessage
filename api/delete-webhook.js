import { Bot } from 'grammy';

export default async function handler(request, response) {
  console.log('收到删除 Webhook 的请求:', {
    method: request.method,
    query: request.query,
    headers: request.headers
  });
  
  // 验证认证令牌
  if (request.query.token !== process.env.CRON_AUTH_TOKEN) {
    console.log('认证失败，令牌不匹配');
    response.status(401).send('Not authorized :(');
    return;
  }

  try {
    console.log('检查 TELEGRAM_BOT_TOKEN 是否设置...');
    // 检查 TELEGRAM_BOT_TOKEN 是否设置
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      const errorMsg = 'TELEGRAM_BOT_TOKEN 环境变量未设置';
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    
    console.log('创建 Telegram Bot 实例...');
    // 创建 Telegram Bot 实例
    const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
    
    // 删除 webhook
    console.log('正在删除 Webhook...');
    await bot.api.deleteWebhook();
    console.log('Webhook 删除成功');
    
    response.status(200).send({
      success: true,
      message: 'Webhook successfully deleted'
    });
  } catch (error) {
    console.error('删除 Webhook 时出错:', error);
    response.status(500).send({
      success: false,
      message: 'Failed to delete webhook',
      error: error.message
    });
  }
}