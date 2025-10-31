export default async function handler(request, response) {
  console.log('=== Timezone Test Function ===');
  
  // 检查服务器时间
  const serverTime = new Date();
  console.log('Server Time (UTC):', serverTime.toISOString());
  console.log('Server Time (Local):', serverTime.toString());
  console.log('Server Time (Asia/Shanghai):', new Date(serverTime.getTime() + (8 * 60 * 60 * 1000)).toISOString());
  
  // 检查时区信息
  console.log('Timezone offset (minutes):', serverTime.getTimezoneOffset());
  console.log('Process timezone:', process.env.TZ || 'Not set');
  
  // 检查环境变量
  console.log('=== Environment Variables ===');
  console.log('TELEGRAM_BOT_TOKEN set:', !!process.env.TELEGRAM_BOT_TOKEN);
  console.log('MONITOR_CHAT_IDS:', process.env.MONITOR_CHAT_IDS || 'Not set');
  console.log('MONITOR_KEYWORDS:', process.env.MONITOR_KEYWORDS || 'Not set');
  console.log('USER_KEYWORDS:', process.env.USER_KEYWORDS || 'Not set');
  console.log('NOTIFICATION_CHAT_ID:', process.env.NOTIFICATION_CHAT_ID || 'Not set');
  console.log('TARGET_USER_IDS:', process.env.TARGET_USER_IDS || 'Not set');
  
  // 测试时间处理
  const testTimestamp = 1640995200; // 这是一个测试时间戳
  const testDate = new Date(testTimestamp * 1000);
  console.log('Test timestamp:', testTimestamp);
  console.log('Test date (UTC):', testDate.toISOString());
  console.log('Test date (Local):', testDate.toString());
  
  // 计算北京时间
  const beijingTime = new Date(testDate.getTime() + (8 * 60 * 60 * 1000));
  console.log('Test date (Beijing):', beijingTime.toISOString());
  
  response.status(200).json({
    success: true,
    serverTime: {
      utc: serverTime.toISOString(),
      local: serverTime.toString(),
      beijing: new Date(serverTime.getTime() + (8 * 60 * 60 * 1000)).toISOString(),
      timezoneOffset: serverTime.getTimezoneOffset()
    },
    environment: {
      timezone: process.env.TZ || 'Not set',
      telegramBotTokenSet: !!process.env.TELEGRAM_BOT_TOKEN,
      monitorChatIds: process.env.MONITOR_CHAT_IDS || null,
      monitorKeywords: process.env.MONITOR_KEYWORDS || null,
      userKeywords: process.env.USER_KEYWORDS || null,
      targetUserIds: process.env.TARGET_USER_IDS || null,
      notificationChatId: process.env.NOTIFICATION_CHAT_ID || null
    },
    testDate: {
      timestamp: testTimestamp,
      utc: testDate.toISOString(),
      local: testDate.toString(),
      beijing: beijingTime.toISOString()
    }
  });
}