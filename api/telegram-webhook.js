import { Bot } from 'grammy';
import { config } from 'dotenv';
import { normalizeId, parseChatIds } from '../utils/formatUtils.js';
import { fetchBotInfo } from '../utils/telegramUtil.js';

// 只在非 Vercel 环境中加载 .env 文件
if (!process.env.VERCEL) {
  config();
}

// 创建 Telegram Bot 实例
let bot;

// 全局变量用于识别机器人和当前账号（规范化后的数字ID）
let BOT_USER_ID_NORMALIZED = '';
let BOT_USERNAME = '';
let isBotInitialized = false;

// 初始化机器人信息
async function initializeBot() {
    try {
        console.log('开始初始化 Telegram Bot...');
        
        if (!process.env.TELEGRAM_BOT_TOKEN) {
            console.error('错误: TELEGRAM_BOT_TOKEN 环境变量未设置');
            return false;
        }
        
        if (isBotInitialized) {
            console.log('Bot 已经初始化');
            return true;
        }
        
        console.log('创建 Bot 实例...');
        bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
        
        console.log('初始化 Bot...');
        // 初始化 bot 信息
        await bot.init();
        isBotInitialized = true;
        
        console.log('获取 Bot 信息...');
        const botInfo = await fetchBotInfo(process.env.TELEGRAM_BOT_TOKEN);
        BOT_USER_ID_NORMALIZED = botInfo.BOT_USER_ID_NORMALIZED;
        BOT_USERNAME = botInfo.BOT_USERNAME;
        console.log('Bot 初始化成功:', BOT_USERNAME);
        
        // 设置处理器
        setupBotHandlers();
        return true;
    } catch (error) {
        console.error('Bot 初始化失败:', error);
        return false;
    }
}

// 处理消息的主函数
function setupBotHandlers() {
    if (!bot) {
        console.error('Bot 实例未初始化，无法设置处理器');
        return;
    }
    
    console.log('设置 Bot 消息处理器...');
    
    // 处理普通消息
    bot.on('message', async (ctx) => {
        await processMessage(ctx, 'message');
    });
    
    // 处理编辑过的消息
    bot.on('edited_message', async (ctx) => {
        await processMessage(ctx, 'edited_message');
    });
    
    // 处理频道消息
    bot.on('channel_post', async (ctx) => {
        await processMessage(ctx, 'channel_post');
    });
    
    // 处理编辑过的频道消息
    bot.on('edited_channel_post', async (ctx) => {
        await processMessage(ctx, 'edited_channel_post');
    });

    // 错误处理
    bot.catch((err) => {
        console.error('Bot 错误:', err);
    });
    
    console.log('Bot 消息处理器设置完成');
}

// 处理不同类型的消息
async function processMessage(ctx, updateType) {
    try {
        console.log(`=== 收到${updateType}更新 ===`);
        console.log('完整更新对象:', JSON.stringify(ctx.update, null, 2));
        
        // 获取消息对象（根据不同更新类型）
        let message = null;
        switch (updateType) {
            case 'message':
                message = ctx.message;
                break;
            case 'edited_message':
                message = ctx.editedMessage;
                break;
            case 'channel_post':
                message = ctx.channelPost;
                break;
            case 'edited_channel_post':
                message = ctx.editedChannelPost;
                break;
        }
        
        if (!message) {
            console.log('无法获取消息对象');
            return;
        }
        
        console.log('消息对象:', JSON.stringify(message, null, 2));
        
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
        const chatId = message.chat.id.toString();
        const normalizedChatId = normalizeId(chatId);
        const fromUserId = message.from ? message.from.id.toString() : null;
        const normalizedFromUserId = fromUserId ? normalizeId(fromUserId) : null;
        
        console.log('消息详情:', {
            chatId,
            chatTitle: message.chat.title,
            normalizedChatId,
            fromUserId,
            normalizedFromUserId,
            botUserId: BOT_USER_ID_NORMALIZED
        });
        
        // 检查是否是机器人自己发送的消息（避免循环）
        if (BOT_USER_ID_NORMALIZED && normalizedFromUserId && normalizedFromUserId === BOT_USER_ID_NORMALIZED) {
            console.log('跳过机器人自己发送的消息');
            return;
        }
        
        // 检查是否在监控列表中
        if (normalizedMonitorIds.length > 0) {
            console.log('检查监控列表:', {
                normalizedMonitorIds,
                normalizedChatId,
                isIncluded: normalizedMonitorIds.includes(normalizedChatId)
            });
            
            if (!normalizedMonitorIds.includes(normalizedChatId)) {
                console.log(`聊天 ${chatId} 不在监控列表中，跳过处理`);
                return;
            }
        } else {
            console.log('未设置监控列表，监控所有聊天');
        }
        
        // 检查是否在排除列表中
        const notMonitorChatIds = parseChatIds(NOT_MONITOR_CHAT_IDS_RAW);
        if (notMonitorChatIds.length > 0) {
            console.log('检查排除列表:', {
                notMonitorChatIds,
                normalizedChatId,
                isExcluded: notMonitorChatIds.includes(normalizedChatId)
            });
            
            if (notMonitorChatIds.includes(normalizedChatId)) {
                console.log(`聊天 ${chatId} 在排除列表中，跳过处理`);
                return;
            }
        } else {
            console.log('未设置排除列表');
        }
        
        // 检查关键词匹配
        const messageText = message.text || '';
        console.log('消息文本:', messageText);
        
        if (monitorKeywordsNormalized.length > 0) {
            console.log('检查关键词匹配:', {
                messageText,
                keywords: monitorKeywordsNormalized
            });
            
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
            
            console.log('✅ 消息包含监控关键词');
        } else {
            console.log('未设置监控关键词');
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
                const chatTitle = message.chat.title || message.chat.first_name || 'Unknown';
                const fromUser = message.from ? (message.from.first_name || message.from.username || 'Unknown') : 'Unknown';
                const messageText = message.text || '[Non-text message]';
                
                console.log('准备发送通知到:', {
                    notificationChatId: NOTIFICATION_CHAT_ID,
                    chatTitle,
                    fromUser,
                    messageText
                });
                
                const result = await ctx.reply(`转发消息来自: ${chatTitle}\n发送者: ${fromUser}\n内容: ${messageText}`, {
                    chat_id: NOTIFICATION_CHAT_ID
                });
                
                console.log('通知发送成功:', JSON.stringify(result, null, 2));
            } catch (error) {
                console.error('发送通知失败:', error);
                console.error('错误详情:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
            }
        } else {
            console.log('缺少发送通知的必要配置:', {
                hasNotificationChatId: !!NOTIFICATION_CHAT_ID,
                hasTelegramBotToken: !!TELEGRAM_BOT_TOKEN
            });
        }
        
        // 响应用户
        try {
            await ctx.reply('消息已收到并处理');
            console.log('用户响应发送成功');
        } catch (error) {
            console.error('发送用户响应失败:', error);
        }
        
        console.log(`=== ${updateType}处理完成 ===`);
    } catch (error) {
        console.error('处理消息时出错:', error);
        console.error('错误堆栈:', error.stack);
    }
}

// 在模块加载时初始化机器人
console.log('模块加载中...');
if (process.env.TELEGRAM_BOT_TOKEN) {
    console.log('检测到 TELEGRAM_BOT_TOKEN');
} else {
    console.log('未检测到 TELEGRAM_BOT_TOKEN，跳过 Bot 初始化');
}

// 导出 Vercel 处理函数
export default async (req, res) => {
    console.log('=== 收到 HTTP 请求 ===');
    console.log('请求详情:', {
        method: req.method,
        url: req.url,
        headers: req.headers
    });
    
    // 处理请求体
    let updateData = null;
    
    // 检查请求体
    if (req.body) {
        console.log('请求体类型:', typeof req.body);
        console.log('请求体内容:', typeof req.body === 'string' ? req.body.substring(0, 200) + '...' : req.body);
        
        if (typeof req.body === 'string') {
            // 如果是字符串，尝试解析 JSON
            try {
                updateData = JSON.parse(req.body);
                console.log('解析后的更新数据:', JSON.stringify(updateData, null, 2));
            } catch (parseError) {
                console.error('JSON 解析失败:', parseError);
                res.status(400).send('Invalid JSON in request body');
                return;
            }
        } else if (typeof req.body === 'object') {
            // 如果已经是对象
            updateData = req.body;
            console.log('更新数据:', JSON.stringify(updateData, null, 2));
        }
    } else {
        console.log('请求体为空');
        res.status(400).send('Request body is empty');
        return;
    }
    
    if (!isBotInitialized) {
        // 如果 bot 还未初始化，尝试初始化
        console.log('Bot 未初始化，尝试初始化...');
        const initSuccess = await initializeBot();
        if (!initSuccess) {
            const errorMsg = 'Bot 初始化失败';
            console.error(errorMsg);
            res.status(500).send(errorMsg);
            return;
        }
        // 给一点时间让处理器设置完成
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    if (req.method === 'POST') {
        try {
            console.log('处理 Telegram Webhook 请求');
            
            // 检查更新数据
            if (!updateData) {
                const errorMsg = '无法解析更新数据';
                console.error(errorMsg);
                res.status(400).send(errorMsg);
                return;
            }
            
            // 处理 Telegram Webhook 请求
            if (bot && isBotInitialized) {
                console.log('调用 bot.handleUpdate');
                await bot.handleUpdate(updateData);
                console.log('更新处理完成');
                res.status(200).send('OK');
            } else {
                const errorMsg = 'Bot 未初始化';
                console.error(errorMsg);
                res.status(500).send(errorMsg);
            }
        } catch (error) {
            console.error('处理更新时出错:', error);
            console.error('错误堆栈:', error.stack);
            res.status(500).send('Error processing update: ' + error.message);
        }
    } else {
        console.log('不支持的 HTTP 方法:', req.method);
        res.status(405).send('Method Not Allowed');
    }
    
    console.log('=== HTTP 请求处理完成 ===');
};