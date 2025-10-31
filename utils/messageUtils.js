import { normalizeId } from './formatUtils.js';
import { sendNotification } from './telegramUtil.js'


export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 比较发送者ID和目标ID是否相等
 * @param {any} senderId - 发送者ID，可以是任意类型
 * @param {any} targetId - 目标ID，可以是任意类型
 * @returns {boolean} 返回两个ID是否相等的比较结果
 */
export function compareSenderId(senderId, targetId) {
    // 如果任一ID为空值，则直接返回false
    if (!senderId || !targetId) return false;
    
    // 如果senderId对象有equals方法，则使用该方法进行比较
    if (typeof senderId.equals === 'function') {
        return senderId.equals(targetId);
    }
    
    // 否则将两个ID都转换为字符串后进行严格相等比较
    return senderId.toString() === targetId.toString();
}

/**
 * 从 Telegram 消息对象中提取文本内容
 * 
 * @param {Object} message - Telegram 消息对象
 * @returns {string} 提取出的文本内容，如果未找到则返回空字符串
 */
export function extractMessageText(message) {
    if (!message || typeof message !== 'object') return ''
    
    // 使用可选链操作符安全地提取文本内容
    return message.message ||
           message?.message?.text ||
           message?.message?.caption ||
           message?.caption ||
           message?.media?.title ||
           message?.media?.caption ||
           ''
}

/**
 * 处理消息内容，包括文本和媒体消息
 * @param {Object} message - 消息对象
 * @returns {Object} 处理结果对象
 * @returns {string} returns.text - 提取的原始文本内容
 * @returns {string} returns.displayText - 用于显示的文本内容
 * @returns {boolean} returns.hasMedia - 是否包含媒体内容
 */
// 工具：处理消息内容，包括文本和媒体消息
export function processMessageContent(message) {
    const text = extractMessageText(message);

    // 检查消息是否包含媒体内容
    const hasMedia = !!message?.media || 
                    !!message?.message?.media || 
                    !!(message?.photo || message?.document || message?.video || message?.audio || message?.voice || message?.sticker);

    // 如果消息没有文本内容但包含媒体，则标记为媒体消息
    let displayText = text;
    if (!text) {
        displayText = hasMedia ? '[媒体消息]' : '[无内容消息]';
    }

    return {
        text,
        displayText,
        hasMedia
    };
}

/**
 * 解析抽奖信息文本，提取关键信息如创建时间、奖品、关键词等。
 * 
 * @param {string} messageText - 包含抽奖信息的完整文本内容
 * @param {string} monitorKeywords - 用户设置的监控关键词，多个关键词用逗号分隔
 * @returns {Object|null} 抽奖信息对象，若不包含有效关键词则返回 null
 * 
 * 返回对象包含以下字段：
 * - createTime {string} 抽奖创建时间
 * - prizes {Array<Object>} 奖品列表，每个对象包含 name 和 count
 * - keyword {string} 参与抽奖的关键词或红包口令
 * - creator {string} 创建者信息
 * - autoOpenCount {number} 自动开奖人数
 */
export function parseLotteryMessage(messageText, monitorKeywords) {
    const userKeywords = monitorKeywords?.split(',').map(k => k.trim()) || [];
    const hasUserKeyword = userKeywords.some(keyword => messageText.includes(keyword));
    
    // 如果不是抽奖消息，直接返回null
    if (!hasUserKeyword) {
        return null;
    }

    // 提取抽奖创建时间
    const createTimeMatch = messageText.match(/抽奖创建时间[：:](.+)/);
    const createTime = createTimeMatch ? createTimeMatch[1].trim() : null;

    // 提取奖品信息（使用字符串处理代替复杂的正则表达式）
    let prizes = [];
    const lines = messageText.split('\n');
    let inPrizeSection = false;
    let isRedPacket = messageText.includes('红包活动已创建');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // 检查是否进入奖品部分
        if (/奖品[：:]|总金额[:：]/.test(line)) {
            inPrizeSection = true;

            // 如果是红包消息，直接解析红包信息
            if (isRedPacket) {
                let amount = null;
                let count = null;

                // 从当前位置往后查找红包金额和数量
                for (let j = i; j < lines.length; j++) {
                    const currentLine = lines[j];
                    const amountMatch = currentLine.match(/总金额[:：]\s*(\d+)/);
                    const countMatch = currentLine.match(/数量[:：]\s*(\d+)份/);

                    if (amountMatch) {
                        amount = amountMatch[1];
                    }
                    if (countMatch) {
                        count = countMatch[1];
                    }
                }

                // 若成功提取金额和数量，则构造红包奖品对象
                if (amount !== null && count !== null) {
                    prizes.push({
                        name: `红包 ${amount}`,
                        count: parseInt(count, 10)
                    });
                }
                break;
            }
            continue;
        }

        // 检查是否离开奖品部分
        if (inPrizeSection && (line.includes('参与设置') || line.includes('抽奖设置') || line.trim() === '')) {
            inPrizeSection = false;
            continue;
        }

        // 在奖品部分中提取奖品信息
        if (inPrizeSection) {
            const prizeMatch = line.match(/(\S.*?)\s*[*×x]\s*(\d+)/);
            if (prizeMatch) {
                const countValue = parseInt(prizeMatch[2], 10);
                if (!isNaN(countValue)) {
                    prizes.push({
                        name: prizeMatch[1].trim(),
                        count: countValue
                    });
                }
            }
        }
    }

    // 提取创建者
    const creatorMatch = messageText.match(/创建者[：:](.+)/);
    const creator = creatorMatch ? creatorMatch[1].trim() : null;

    // 提取自动开奖人数
    const autoOpenCountMatch = messageText.match(/自动开奖人数[：:](\d+)/);
    const autoOpenCount = autoOpenCountMatch ? parseInt(autoOpenCountMatch[1], 10) : null;

    // 提取参与关键词
    const keywordMatch = messageText.match(/参与关键词[：:]「(.+?)」/);
    const keyword = keywordMatch ? keywordMatch[1].trim() : null;

    // 如果是红包消息，尝试提取口令
    let redPacketKeyword = null;
    if (isRedPacket) {
        const redPacketKeywordMatch = messageText.match(/发送\s+(.+?)\s+进行领取/);
        redPacketKeyword = redPacketKeywordMatch ? redPacketKeywordMatch[1].trim() : null;
        // 如果没有提取到关键词，使用默认关键词
        if (!redPacketKeyword && keyword) {
            redPacketKeyword = keyword;
        }
    }

    return {
        createTime,
        prizes,
        keyword: redPacketKeyword || keyword,
        creator,
        autoOpenCount
    };
}

/**
 * 判断消息是否可删除
 * @param {Object} msg - 消息对象
 * @returns {boolean} 如果消息可删除返回true，否则返回false
 */
export function isDeletableMessage(msg) {
    // 参数校验，防止 null/undefined 访问错误
    if (!msg) {
        return false;
    }
    
    // 过滤掉系统消息和特殊的 action 消息
    if (msg.className === 'MessageService' || msg.action) {
        return false;
    }
    
    // 确保消息有内容或媒体
    return !!msg.message || !!msg.media;
}

/**
 * 处理 Telegram 消息的核心函数。
 *
 * @param {Object} message - 接收到的原始消息对象。
 * @param {Object} client - Telegram 客户端实例，用于与 Telegram API 交互。
 * @param {Set} processedMessages - 已处理过的消息集合，用于去重。
 * @param {Array<string>} normalizedMonitorIds - 需要监控的聊天 ID 列表。
 * @param {Array<string>} monitorChatIds - 显式指定需要监控的聊天 ID 列表。
 * @param {Array<string>} targetUserIdsNormalized - 目标用户的 ID 列表。
 * @param {Array<string>} userKeywordsNormalized - 用户自定义关键词列表。
 * @param {Array<string>} monitorKeywordsNormalized - 监控关键词列表。
 * @param {string} SELF_USER_ID_NORMALIZED - 当前用户自身的 ID。
 * @param {string} BOT_USER_ID_NORMALIZED - 本机器人的用户 ID。
 * @param {string} NOTIFICATION_CHAT_ID - 发送通知的目标聊天 ID。
 * @param {string} TELEGRAM_BOT_TOKEN - Telegram Bot Token。
 * @param {Array<string>} USER_KEYWORDS - 原始用户关键词列表。
 */
export async function handleMessage(
    message,
    client,
    processedMessages,
    normalizedMonitorIds,
    monitorChatIds,
    targetUserIdsNormalized,
    userKeywordsNormalized,
    monitorKeywordsNormalized,
    SELF_USER_ID_NORMALIZED,
    BOT_USER_ID_NORMALIZED,
    NOTIFICATION_CHAT_ID,
    TELEGRAM_BOT_TOKEN,
    USER_KEYWORDS
) {
    // 1. 跳过私人对话
    if (message.peerId && message.peerId.userId) {
        return;
    }

    // 2. 获取聊天信息
    let chat = null;
    let chatId = null;

    if (message.peerId) {
        try {
            chat = await client.getEntity(message.peerId);

            // 跳过只读频道
            if (chat.className === 'Channel' && chat.broadcast === true) {
                return;
            }

            if (chat) {
                chatId = chat.id.toString();
            }
        } catch (chatError) {
            console.warn('获取聊天实体失败:', chatError.message);
            // 构建 chatId
            if (message.peerId.channelId) {
                chatId = '-100' + message.peerId.channelId.toString();
            } else if (message.peerId.chatId) {
                chatId = '-' + message.peerId.chatId.toString();
            } else if (message.peerId.userId) {
                chatId = message.peerId.userId.toString();
            }
        }
    }

    const normalizedChatId = normalizeId(chatId);
    const normalizedNotifChatId = normalizeId(NOTIFICATION_CHAT_ID);

    // 3. 提取发送者 ID
    const from = message.fromId;
    const rawSenderId = from?.userId?.value ?? from?.userId ?? from;
    const normalizedSenderId = normalizeId(rawSenderId);

    // 4. 循环检测
    if (normalizedChatId === normalizedNotifChatId) {
        // 跳过机器人在通知群组中的消息
        if (normalizedSenderId && BOT_USER_ID_NORMALIZED && normalizedSenderId === BOT_USER_ID_NORMALIZED) {
            return;
        }

        // 跳过自己在通知群组中的消息
        if (normalizedSenderId && normalizedSenderId === SELF_USER_ID_NORMALIZED) {
            return;
        }
    }

    // 5. 检查是否在监控的群组列表中
    let isMonitored =
        normalizedMonitorIds.length === 0 ||
        (normalizedChatId && normalizedMonitorIds.includes(normalizedChatId));

    if (monitorChatIds.length > 0 && !isMonitored) {
        return;
    }

    // 6. 兼容群组迁移
    if (!isMonitored && message.peerId && message.peerId.chatId && message.peerId.channelId) {
        const oldChatId = normalizeId('-' + message.peerId.chatId.toString());
        if (normalizedMonitorIds.includes(oldChatId)) {
            isMonitored = true;
        }
    }

    if (!isMonitored) {
        return;
    }

    const messageContent = processMessageContent(message);
    const { displayText } = messageContent;

    if (!displayText) {
        console.warn('消息内容为空，跳过处理');
        return;
    }

    let chatTitle = 'Unknown Group';
    if (chat) {
        chatTitle = chat.title || (chat.firstName + (chat.lastName ? ' ' + chat.lastName : '')) || 'Unknown Group';
    } else if (message.peerId) {
        if (message.peerId.channelId) {
            chatTitle = 'Channel ' + message.peerId.channelId.toString();
        } else if (message.peerId.chatId) {
            chatTitle = 'Group ' + message.peerId.chatId.toString();
        }
    }

    const textLower = displayText.toLowerCase();
    let isTargetUser = false;
    let hasUserKeyword = false;
    let hasMonitorKeyword = false;

    if (normalizedSenderId && targetUserIdsNormalized.length > 0) {
        isTargetUser = targetUserIdsNormalized.includes(normalizedSenderId);
    }

    const matchKeyword = (keywordList) =>
        keywordList.some((keyword) => {
            if (/[^\w\s]/.test(keyword) || /\s/.test(keyword)) {
                return textLower.includes(keyword);
            }
            const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            return regex.test(textLower);
        });

    if (userKeywordsNormalized.length > 0) {
        hasUserKeyword = matchKeyword(userKeywordsNormalized);
    }

    if (monitorKeywordsNormalized.length > 0) {
        hasMonitorKeyword = matchKeyword(monitorKeywordsNormalized);
    }

    let shouldProcessMessage = false;

    if (isTargetUser && (userKeywordsNormalized.length === 0 || hasUserKeyword)) {
        shouldProcessMessage = true;
    } else if (hasMonitorKeyword) {
        shouldProcessMessage = true;
    } else if (monitorKeywordsNormalized.length === 0 && userKeywordsNormalized.length === 0) {
        shouldProcessMessage = true;
    }

    if (!shouldProcessMessage) {
        return;
    }

    const dedupKey = `${normalizedChatId}:${message.id}`;

    if (processedMessages.has(dedupKey)) {
        const prev = processedMessages.get(dedupKey);
        const elapsedSeconds = Math.round((Date.now() - prev.ts) / 1000);
        console.log(`消息 ${dedupKey} 已在 ${elapsedSeconds}s 内处理过，跳过通知`);
        return;
    }

    processedMessages.set(dedupKey, {
        ts: Date.now(),
        text: displayText,
    });

    if (hasUserKeyword || hasMonitorKeyword) {
        console.log(`${chatTitle} — 检测到关键字`);
    }

    console.log('准备发送通知');
    await sendNotification(message, chat, client, NOTIFICATION_CHAT_ID, TELEGRAM_BOT_TOKEN, USER_KEYWORDS);
}