import { Bot } from 'grammy';
import { config } from 'dotenv';

config();

async function testBot() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    
    if (!token) {
        console.error('请在 .env 文件中设置 TELEGRAM_BOT_TOKEN');
        process.exit(1);
    }
    
    const bot = new Bot(token);
    
    // 测试获取 bot 信息
    try {
        const botInfo = await bot.api.getMe();
        console.log('Bot 信息:', botInfo);
    } catch (error) {
        console.error('获取 Bot 信息失败:', error.message);
        process.exit(1);
    }
    
    // 测试发送消息到指定聊天
    const testChatId = process.env.NOTIFICATION_CHAT_ID;
    if (testChatId) {
        try {
            const result = await bot.api.sendMessage(testChatId, '这是一个测试消息，来自 Telegram Bot 测试脚本');
            console.log('消息发送成功:', result);
        } catch (error) {
            console.error('发送消息失败:', error.message);
            console.error('请确保 Bot 已经添加到目标聊天，并且有发送消息的权限');
        }
    } else {
        console.log('未设置 NOTIFICATION_CHAT_ID，跳过发送测试消息');
    }
    
    console.log('Bot 测试完成');
}

testBot().catch(console.error);