export default async function handler(request, response) {
  console.log('=== Diagnose Function Called ===');
  console.log('Request Method:', request.method);
  console.log('Request URL:', request.url);
  console.log('Request Headers:', request.headers);
  
  // 检查环境变量
  console.log('=== Environment Variables Check ===');
  console.log('TELEGRAM_BOT_TOKEN set:', !!process.env.TELEGRAM_BOT_TOKEN);
  console.log('MONITOR_CHAT_IDS:', process.env.MONITOR_CHAT_IDS || 'Not set');
  console.log('MONITOR_KEYWORDS:', process.env.MONITOR_KEYWORDS || 'Not set');
  console.log('NOTIFICATION_CHAT_ID:', process.env.NOTIFICATION_CHAT_ID || 'Not set');
  console.log('CRON_AUTH_TOKEN:', process.env.CRON_AUTH_TOKEN || 'Not set');
  
  // 检查请求体
  if (request.body) {
    console.log('Request Body Type:', typeof request.body);
    if (typeof request.body === 'string') {
      console.log('Request Body (first 200 chars):', request.body.substring(0, 200));
    } else {
      console.log('Request Body:', JSON.stringify(request.body, null, 2));
    }
  } else {
    console.log('No request body');
  }
  
  response.status(200).json({
    success: true,
    message: 'Diagnose function executed successfully',
    timestamp: new Date().toISOString(),
    environment: {
      telegramBotTokenSet: !!process.env.TELEGRAM_BOT_TOKEN,
      monitorChatIds: process.env.MONITOR_CHAT_IDS || null,
      monitorKeywords: process.env.MONITOR_KEYWORDS || null,
      notificationChatId: process.env.NOTIFICATION_CHAT_ID || null
    }
  });
}