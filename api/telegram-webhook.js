import { Bot } from 'grammy';
import { config } from 'dotenv';
import { normalizeId, parseChatIds } from '../utils/formatUtils.js';
import { fetchBotInfo } from '../utils/telegramUtil.js';

// 只在非 Vercel 环境中加载 .env 文件
if (!process.env.VERCEL) {
  config();
}

// 已处理消息缓存 Map<dedupKey, { ts: number, text: string }>
const processedMessages = new Map();
const DEDUP_WINDOW_MINUTES = parseInt(process.env.DEDUP_WINDOW_MINUTES) || 10;

/**
 * 清理已处理消息的函数
 */
function cleanupProcessedMessages() {
    try {
        const now = Date.now();
        const ttl = DEDUP_WINDOW_MINUTES * 60 * 1000;
        const keysToDelete = [];
        
        // 遍历已处理消息集合，收集超过生存时间的消息键
        for (const [key, value] of processedMessages) {
            if (now - value.ts > ttl) {
                keysToDelete.push(key);
            }
        }
        
        // 批量删除过期的消息记录
        for (const key of keysToDelete) {
            processedMessages.delete(key);
        }
    } catch (error) {
        console.error('清理已处理消息时发生错误:', error);
    }
}

// 启动定时清理，1分钟一次
setInterval(cleanupProcessedMessages, 60 * 1000);

// 创建 Telegram Bot 实例
let bot;

// 全局变量用于识别机器人和当前账号（规范化后的数字ID）
let BOT_USER_ID_NORMALIZED = '';
let BOT_USERNAME = '';

// 初始化机器人信息
async function initializeBot() {
    try {
        console.log('开始初始化 Telegram Bot...');
        
        if (!process.env.TELEGRAM_BOT_TOKEN) {
            console.error('错误: TELEGRAM_BOT_TOKEN 环境变量未设置');
            return;
        }
        
        console.log('创建 Bot 实例...');
        bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
        
        console.log('获取 Bot 信息...');
        const botInfo = await fetchBotInfo(process.env.TELEGRAM_BOT_TOKEN);
        BOT_USER_ID_NORMALIZED = botInfo.BOT_USER_ID_NORMALIZED;
        BOT_USERNAME = botInfo.BOT_USERNAME;
        console.log('Bot 初始化成功:', BOT_USERNAME);
    } catch (error) {
        console.error('Bot 初始化失败:', error);
    }
}

// 处理消息的主函数
function setupBotHandlers() {
    if (!bot) {
        console.error('Bot 实例未初始化，无法设置处理器');
        return;
    }
    
    console.log('设置 Bot 消息处理器...');
    
    bot.on('message', async (ctx) => {
        try {
            console.log('收到消息:', JSON.stringify(ctx.message, null, 2));
            
            // 获取环境变量配置
            const MONITOR_CHAT_IDS_RAW = process.env.MONITOR_CHAT_IDS;
            const NOT_MONITOR_CHAT_IDS_RAW = process.env.NOT_MONITOR_CHAT_IDS;
            const MONITOR_KEYWORDS_RAW = process.env.MONITOR_KEYWORDS;
            const NOTIFICATION_CHAT_ID = process.env.NOTIFICATION_CHAT_ID;
            const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
            const TARGET_USER_IDS_RAW = process.env.TARGET_USER_IDS;
            const USER_KEYWORDS_RAW = process.env.USER_KEYWORDS;
            
            console.log('环境变量配置:', {
                hasMonitorChatIds: !!MONITOR_CHAT_IDS_RAW,
                hasNotMonitorChatIds: !!NOT_MONITOR_CHAT_IDS_RAW,
                hasMonitorKeywords: !!MONITOR_KEYWORDS_RAW,
                hasNotificationChatId: !!NOTIFICATION_CHAT_ID,
                hasTelegramBotToken: !!TELEGRAM_BOT_TOKEN,
                hasTargetUserIds: !!TARGET_USER_IDS_RAW,
                hasUserKeywords: !!USER_KEYWORDS_RAW
            });
            
            // 解析并规范化监控配置
            const monitorChatIds = MONITOR_CHAT_IDS_RAW ? MONITOR_CHAT_IDS_RAW.split(',').map(id => id.trim()).filter(Boolean) : [];
            const normalizedMonitorIds = monitorChatIds.map(id => normalizeId(id)).filter(Boolean);
            const monitorKeywords = MONITOR_KEYWORDS_RAW ? MONITOR_KEYWORDS_RAW.split(',').map(kw => kw.trim()).filter(Boolean) : [];
            const monitorKeywordsNormalized = monitorKeywords.map(k => k.toLowerCase()).filter(Boolean);
            
            // 解析新增配置并规范化
            const targetUserIds = TARGET_USER_IDS_RAW ? TARGET_USER_IDS_RAW.split(',').map(id => id.trim()).filter(Boolean) : [];
            const targetUserIdsNormalized = targetUserIds.map(id => normalizeId(id)).filter(Boolean);
            const userKeywords = USER_KEYWORDS_RAW ? USER_KEYWORDS_RAW.split(',').map(kw => kw.trim()).filter(Boolean) : [];
            const userKeywordsNormalized = userKeywords.map(k => k.toLowerCase()).filter(Boolean);
            
            // 处理消息
            // 注意：由于 Webhook 模式限制，我们无法完全复用原有的 handleMessage 函数
            // 需要实现适合 Webhook 的简化版本
            
            const chatId = ctx.chat.id.toString();
            const normalizedChatId = normalizeId(chatId);
            const fromUserId = ctx.from.id.toString();
            const normalizedFromUserId = normalizeId(fromUserId);
            
            console.log('消息详情:', {
                chatId,
                normalizedChatId,
                fromUserId,
                normalizedFromUserId,
                botUserId: BOT_USER_ID_NORMALIZED
            });
            
            // 检查是否是机器人自己发送的消息（避免循环）
            if (BOT_USER_ID_NORMALIZED && normalizedFromUserId === BOT_USER_ID_NORMALIZED) {
                console.log('跳过机器人自己发送的消息');
                return;
            }
            
            // 检查是否在监控列表中
            if (normalizedMonitorIds.length > 0 && !normalizedMonitorIds.includes(normalizedChatId)) {
                console.log(`聊天 ${chatId} 不在监控列表中，跳过处理`);
                return;
            }
            
            // 检查是否在排除列表中
            const notMonitorChatIds = parseChatIds(NOT_MONITOR_CHAT_IDS_RAW);
            if (notMonitorChatIds.includes(normalizedChatId)) {
                console.log(`聊天 ${chatId} 在排除列表中，跳过处理`);
                return;
            }
            
            // 检查关键词匹配
            if (monitorKeywordsNormalized.length > 0) {
                const messageText = ctx.message.text || '';
                const hasKeyword = monitorKeywordsNormalized.some(keyword => 
                    messageText.toLowerCase().includes(keyword)
                );
                
                console.log('关键词匹配结果:', {
                    messageText,
                    keywords: monitorKeywordsNormalized,
                    hasKeyword
                });
                
                if (!hasKeyword) {
                    console.log('消息不包含任何监控关键词，跳过处理');
                    return;
                }
            }
            
            // 检查是否是通知群组中的消息，避免循环
            const normalizedNotificationChatId = normalizeId(NOTIFICATION_CHAT_ID);
            if (normalizedNotificationChatId && normalizedChatId === normalizedNotificationChatId) {
                console.log('跳过来自通知群组的消息以避免循环');
                return;
            }
            
            // 发送通知
            if (NOTIFICATION_CHAT_ID && TELEGRAM_BOT_TOKEN) {
                try {
                    const chatTitle = ctx.chat.title || ctx.chat.first_name || 'Unknown';
                    const fromUser = ctx.from.first_name || ctx.from.username || 'Unknown';
                    const messageText = ctx.message.text || '[Non-text message]';
                    
                    console.log('发送通知到:', NOTIFICATION_CHAT_ID);
                    await ctx.reply(`转发消息来自: ${chatTitle}\n发送者: ${fromUser}\n内容: ${messageText}`, {
                        chat_id: NOTIFICATION_CHAT_ID
                    });
                    console.log('通知发送成功');
                } catch (error) {
                    console.error('发送通知失败:', error);
                }
            }
            
            // 响应用户
            await ctx.reply('消息已收到并处理');
            console.log('消息处理完成');
        } catch (error) {
            console.error('处理消息时出错:', error);
            // 不向用户发送错误信息，避免循环
        }
    });

    // 错误处理
    bot.catch((err) => {
        console.error('Bot 错误:', err);
    });
    
    console.log('Bot 消息处理器设置完成');
}

// 在模块加载时初始化机器人
console.log('模块加载中...');
if (process.env.TELEGRAM_BOT_TOKEN) {
    console.log('检测到 TELEGRAM_BOT_TOKEN，开始初始化 Bot...');
    initializeBot().then(() => {
        setupBotHandlers();
    }).catch(console.error);
} else {
    console.log('未检测到 TELEGRAM_BOT_TOKEN，跳过 Bot 初始化');
}

// 导出 Vercel 处理函数
export default async (req, res) => {
    console.log('收到 HTTP 请求:', {
        method: req.method,
        url: req.url,
        headers: req.headers
    });
    
    if (!bot) {
        // 如果 bot 还未初始化，尝试初始化
        console.log('Bot 未初始化，尝试初始化...');
        await initializeBot();
        setupBotHandlers();
    }
    
    if (req.method === 'POST') {
        try {
            console.log('处理 Telegram Webhook 请求，更新内容:', JSON.stringify(req.body, null, 2));
            // 处理 Telegram Webhook 请求
            if (bot) {
                await bot.handleUpdate(req.body);
                console.log('更新处理完成');
                res.status(200).send('OK');
            } else {
                console.error('Bot 未初始化');
                res.status(500).send('Bot not initialized');
            }
        } catch (error) {
            console.error('处理更新时出错:', error);
            res.status(500).send('Error processing update');
        }
    } else {
        console.log('不支持的 HTTP 方法:', req.method);
        res.status(405).send('Method Not Allowed');
    }
};