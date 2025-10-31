import { config } from 'dotenv';
import { createTelegramClient, initializeMonitoring, startCleanupInterval, 
         startHeartbeatInterval, startAutoDeleteInterval } from './core/telegram-monitor.js';
import { deleteExpiredMessages } from './core/message-deleter.js';

config();

const APP_ID = process.env.APP_ID
const APP_API_HASH = process.env.APP_API_HASH
const STRING_SESSION = process.env.STRING_SESSION
const MONITOR_CHAT_IDS_RAW = process.env.MONITOR_CHAT_IDS
const NOT_MONITOR_CHAT_IDS_RAW = process.env.NOT_MONITOR_CHAT_IDS
const MONITOR_KEYWORDS_RAW = process.env.MONITOR_KEYWORDS
const AUTO_DELETE_MINUTES = parseInt(process.env.AUTO_DELETE_MINUTES) || 10
const NOTIFICATION_CHAT_ID = process.env.NOTIFICATION_CHAT_ID  // 通知发送的目标群组ID
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN  // 用于发送通知的机器人Token
const TARGET_USER_IDS_RAW = process.env.TARGET_USER_IDS  // 优先监控的用户ID列表
const USER_KEYWORDS_RAW = process.env.USER_KEYWORDS       // 用户特定关键词
const DEDUP_WINDOW_MINUTES = parseInt(process.env.DEDUP_WINDOW_MINUTES) || Math.max(1, AUTO_DELETE_MINUTES)

if (!APP_ID || !APP_API_HASH || !STRING_SESSION) {
    console.error('请确保在 .env 文件中设置了 APP_ID, APP_API_HASH 和 STRING_SESSION')
    process.exit(1)
}

let cleanupInterval;
let heartbeatInterval;
let deleteInterval;

/**
 * 停止监控服务并清理相关资源。
 * 包括清除定时任务和销毁 Telegram 客户端连接。
 * 
 * @returns {Promise<void>} 返回一个 Promise，在客户端关闭后 resolve。
 */
const stopMonitoring = async () => {
    clearInterval(cleanupInterval);
    clearInterval(heartbeatInterval);
    clearInterval(deleteInterval);
    
    console.log("✅ 监控服务已停止");
};

// 注册系统中断信号处理函数，用于优雅地停止监控
process.on('SIGINT', stopMonitoring);
process.on('SIGTERM', stopMonitoring);

/**
 * 启动 Telegram 监控服务。
 *
 * @returns {Promise<void>} 返回一个 Promise，在监控启动完成或发生错误时 resolve 或 reject。
 */
async function startMonitoring() {
    console.log('正在创建 Telegram 客户端...');

    try {
        // 创建 Telegram 客户端
        const client = createTelegramClient({
            appId: APP_ID,
            apiHash: APP_API_HASH,
            stringSession: STRING_SESSION
        });

        // 初始化监控服务
        const monitoringData = await initializeMonitoring(client, {
            monitorChatIdsRaw: MONITOR_CHAT_IDS_RAW,
            notMonitorChatIdsRaw: NOT_MONITOR_CHAT_IDS_RAW,
            monitorKeywordsRaw: MONITOR_KEYWORDS_RAW,
            autoDeleteMinutes: AUTO_DELETE_MINUTES,
            notificationChatId: NOTIFICATION_CHAT_ID,
            telegramBotToken: TELEGRAM_BOT_TOKEN,
            targetUserIdsRaw: TARGET_USER_IDS_RAW,
            userKeywordsRaw: USER_KEYWORDS_RAW,
            dedupWindowMinutes: DEDUP_WINDOW_MINUTES
        });

        // 启动定时清理任务
        cleanupInterval = startCleanupInterval(monitoringData.cleanupProcessedMessages);
        
        // 启动心跳检测
        heartbeatInterval = startHeartbeatInterval(client);
        
        // 启动自动删除过期间隔
        const intervalMs = Math.max(1, monitoringData.autoDeleteMinutes) * 60 * 1000;
        deleteInterval = startAutoDeleteInterval(client, intervalMs, deleteExpiredMessages);

        console.log('监控已启动，按 Ctrl+C 停止');
    } catch (error) {
        console.error('启动监控时出错:', error);
        await stopMonitoring();
    }
}

// 启动监控
startMonitoring().catch(console.error);
