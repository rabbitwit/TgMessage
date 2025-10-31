import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'
import { normalizeId } from '../utils/formatUtils.js'
import { fetchBotInfo } from '../utils/telegramUtil.js'
import { handleMessage } from '../utils/messageUtils.js'

// 已处理消息缓存 Map<dedupKey, { ts: number, text: string }>
const processedMessages = new Map()

/**
 * 创建 Telegram 客户端
 * @param {Object} config - 配置对象
 * @returns {TelegramClient} Telegram 客户端实例
 */
export function createTelegramClient(config) {
    const {
        appId,
        apiHash,
        stringSession
    } = config;

    return new TelegramClient(
        new StringSession(stringSession),
        parseInt(appId, 10),
        apiHash,
        {
            connectionRetries: 10,
            timeout: 30000,
            retryDelay: 3000,
            autoReconnect: true,
            useWSS: true,
            floodSleepThreshold: 60,
            requestRetries: 5,
            downloadRetries: 5,
            maxConcurrentDownloads: 1
        }
    );
}

/**
 * 初始化监控服务
 * @param {TelegramClient} client - Telegram 客户端
 * @param {Object} config - 配置对象
 */
export async function initializeMonitoring(client, config) {
    const {
        monitorChatIdsRaw,
        notMonitorChatIdsRaw,
        monitorKeywordsRaw,
        autoDeleteMinutes,
        notificationChatId,
        telegramBotToken,
        targetUserIdsRaw,
        userKeywordsRaw,
        dedupWindowMinutes
    } = config;

    // 解析并规范化监控配置
    const monitorChatIds = monitorChatIdsRaw ? monitorChatIdsRaw.split(',').map(id => id.trim()).filter(Boolean) : []
    const normalizedMonitorIds = monitorChatIds.map(id => normalizeId(id)).filter(Boolean)
    const monitorKeywords = monitorKeywordsRaw ? monitorKeywordsRaw.split(',').map(kw => kw.trim()).filter(Boolean) : []
    const monitorKeywordsNormalized = monitorKeywords.map(k => k.toLowerCase()).filter(Boolean)
    
    // 解析新增配置并规范化
    const targetUserIds = targetUserIdsRaw ? targetUserIdsRaw.split(',').map(id => id.trim()).filter(Boolean) : []
    const targetUserIdsNormalized = targetUserIds.map(id => normalizeId(id)).filter(Boolean)
    const userKeywords = userKeywordsRaw ? userKeywordsRaw.split(',').map(kw => kw.trim()).filter(Boolean) : []
    const userKeywordsNormalized = userKeywords.map(k => k.toLowerCase()).filter(Boolean)
    
    // 去重窗口（分钟）
    const DEDUP_WINDOW_MINUTES = parseInt(dedupWindowMinutes) || Math.max(1, autoDeleteMinutes)

    // 全局变量用于识别机器人和当前账号（规范化后的数字ID）
    let BOT_USER_ID_NORMALIZED = ''
    let BOT_USERNAME = ''
    let SELF_USER_ID_NORMALIZED = ''

    console.log('=== 运行环境检测 ===')
    console.log('Node版本:', process.version)
    console.log('当前工作目录:', process.cwd())
    console.log('终端程序:', process.env.TERM_PROGRAM || '未知')

    // 连接到 Telegram（使用已有的 StringSession）
    await client.connect();
    console.log('✅ Telegram 客户端已连接');
    console.log('ℹ️ 系统时钟偏移已自动校正，无需担心');

    const me = await client.getMe();
    if (!me || !me.id) {
        throw new Error("无法获取当前用户的 ID，请检查会话有效性");
    }

    SELF_USER_ID_NORMALIZED = normalizeId(me.id);
    console.log('当前登录账号 ID (规范化):', SELF_USER_ID_NORMALIZED);

    // 尝试通过 Bot API 获取机器人信息（如果配置了 TELEGRAM_BOT_TOKEN）
    const botInfo = await fetchBotInfo(telegramBotToken);
    BOT_USER_ID_NORMALIZED = botInfo.BOT_USER_ID_NORMALIZED;
    BOT_USERNAME = botInfo.BOT_USERNAME;

    console.log('成功连接到 Telegram!');
    console.log('开始实时监控消息...');

    // 检查是否设置了 AUTO_DELETE_MINUTES 环境变量且大于0
    const autoDeleteMinutesNum = Number(autoDeleteMinutes);
    if (autoDeleteMinutesNum && autoDeleteMinutesNum > 0) {
        console.log(`检测到 AUTO_DELETE_MINUTES=${autoDeleteMinutesNum}，启用自动删除功能`);
    }

    // 定义需要处理的消息类型集合
    const validMessageTypes = new Set([
        'UpdateNewMessage',
        'UpdateNewChannelMessage',
        'UpdateEditMessage',
        'UpdateEditChannelMessage'
    ]);

    // 使用事件处理器监听所有更新
    client.addEventHandler(async (update) => {
        // 忽略连接状态变更通知
        if (update.className === 'UpdateConnectionState') {
            console.log('连接状态变化:', update);
            return;
        }

        try {
            // 处理有效的消息更新事件
            if (validMessageTypes.has(update.className) && update.message) {
                await handleMessage(update.message, client, processedMessages,
                    normalizedMonitorIds, monitorChatIds, targetUserIdsNormalized, userKeywordsNormalized,
                    monitorKeywordsNormalized, SELF_USER_ID_NORMALIZED, BOT_USER_ID_NORMALIZED,
                    notificationChatId, telegramBotToken, userKeywordsRaw);
            }
        } catch (error) {
            console.error('处理消息时出错:', error);
            console.error('错误堆栈:', error.stack);
            console.log('='.repeat(50));
        }
    });

    // 返回监控所需的数据
    return {
        client,
        autoDeleteMinutes: autoDeleteMinutesNum,
        dedupWindowMinutes: DEDUP_WINDOW_MINUTES,
        processedMessages,
        cleanupProcessedMessages: () => cleanupProcessedMessages(processedMessages, DEDUP_WINDOW_MINUTES)
    };
}

/**
 * 清理已处理消息的函数
 * 
 * 该函数会遍历processedMessages集合，删除超过去重时间窗口的消息记录，
 * 以避免内存泄漏和保持集合大小在合理范围内。
 * 
 * @param {Map} processedMessages - 已处理消息缓存
 * @param {number} dedupWindowMinutes - 去重窗口分钟数
 * @returns {void} 无返回值
 */
function cleanupProcessedMessages(processedMessages, dedupWindowMinutes) {
    try {
        const now = Date.now()
        const ttl = dedupWindowMinutes * 60 * 1000
        const keysToDelete = []
        
        // 遍历已处理消息集合，收集超过生存时间的消息键
        for (const [key, value] of processedMessages) {
            if (now - value.ts > ttl) {
                keysToDelete.push(key)
            }
        }
        
        // 批量删除过期的消息记录
        for (const key of keysToDelete) {
            processedMessages.delete(key)
        }
    } catch (error) {
        console.error('清理已处理消息时发生错误:', error)
    }
}

/**
 * 启动定时清理任务
 * @param {Function} cleanupFn - 清理函数
 * @returns {NodeJS.Timeout} 定时器ID
 */
export function startCleanupInterval(cleanupFn) {
    // 启动定时清理，1分钟一次
    return setInterval(cleanupFn, 60 * 1000);
}

/**
 * 启动心跳检测
 * @param {TelegramClient} client - Telegram 客户端
 * @returns {NodeJS.Timeout} 定时器ID
 */
export function startHeartbeatInterval(client) {
    // 定期发送心跳以维持与服务器的连接
    return setInterval(async () => {
        try {
            await client.getMe();
            console.log('保持连接活跃...');
        } catch (error) {
            console.error('心跳检测失败:', error);
        }
    }, 60000); // 每分钟一次
}

/**
 * 启动自动删除过期间隔
 * @param {TelegramClient} client - Telegram 客户端
 * @param {number} intervalMs - 间隔毫秒数
 * @param {Function} deleteFn - 删除函数
 * @returns {NodeJS.Timeout} 定时器ID
 */
export function startAutoDeleteInterval(client, intervalMs, deleteFn) {
    // 如果启用了自动删除功能，则定期执行删除操作
    if (intervalMs && intervalMs > 0) {
        console.log(`启用定期删除过期消息功能，检查间隔: ${intervalMs / (60 * 1000)} 分钟`);
        return setInterval(async () => {
            try {
                console.log('开始定期检查并删除过期消息...');
                await deleteFn(client);
            } catch (error) {
                console.error('定期删除过期消息时出错:', error);
            }
        }, intervalMs);
    }
    return null;
}