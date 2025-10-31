import { Bot } from 'grammy';

export default async function handler(request, response) {
  console.log('收到设置 Webhook 的请求:', {
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
    // 检查 TELEGRAM_BOT_TOKEN 是否设置
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      const errorMsg = 'TELEGRAM_BOT_TOKEN 环境变量未设置';
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    
    console.log('创建 Telegram Bot 实例...');
    // 创建 Telegram Bot 实例
    const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
    
    // 获取当前部署的 URL
    const DEPLOYMENT_URL = process.env.DEPLOYMENT_URL || process.env.VERCEL_URL;
    console.log('部署 URL:', DEPLOYMENT_URL);
    
    if (!DEPLOYMENT_URL) {
      const errorMsg = '未设置 DEPLOYMENT_URL 或 VERCEL_URL 环境变量';
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    
    // 构建 webhook URL
    const webhookUrl = `https://${DEPLOYMENT_URL}/api/telegram-webhook`;
    console.log('Webhook URL:', webhookUrl);
    
    // 设置 webhook
    console.log('正在设置 Webhook...');
    await bot.api.setWebhook(webhookUrl);
    console.log('Webhook 设置成功');
    
    response.status(200).send({
      success: true,
      message: `Webhook successfully set to: ${webhookUrl}`
    });
  } catch (error) {
    console.error('设置 Webhook 时出错:', error);
    response.status(500).send({
      success: false,
      message: 'Failed to set webhook',
      error: error.message
    });
  }
}