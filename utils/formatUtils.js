/**
 * 转义Markdown V2特殊字符
 * 
 * @param {string} text - 需要转义的文本
 * @returns {string} 转义后的文本
 */
export function escapeMarkdownV2(text) {
    if (!text || typeof text !== 'string') return '';
    
    // 先转义反斜杠，避免双重转义
    return text
        .replace(/\\/g, '\\\\')
        // 然后转义其他特殊字符
        .replace(/([_*\[\]()~`>#+=|{}.!\-])/g, '\\$1');
}

/**
 * 标准化ID格式
 * 将输入的原始ID转换为标准格式，去除空格和其他无效字符，只保留数字部分
 * @param {*} raw - 原始ID值，可以是任意类型
 * @returns {string} 标准化后的ID字符串，如果输入为空则返回空字符串
 */
export function normalizeId(raw) {
    // 处理空值情况：如果raw为null或undefined但不包括0，直接返回空字符串
    if (raw == null && raw !== 0) return ''
    
    // 转换为字符串并移除所有空白字符
    const str = String(raw).replace(/\s+/g, '')
    
    // 使用正则表达式提取ID中的数字部分
    // 匹配模式：可选的负号和100前缀，捕获数字部分
    return str.replace(/^(?:-?100|-)?(\d*)?.*/, '$1')
}

/**
 * 解析聊天ID字符串，将其转换为标准化的ID数组
 * @param {string} chatIds - 包含聊天ID的字符串，多个ID用逗号分隔
 * @param {boolean} validateNumeric - 是否验证ID必须为纯数字格式
 * @returns {Array<string>} 标准化后的ID数组
 */
export function parseChatIds(chatIds, validateNumeric = false) {
    if (!chatIds) return [];
    if (typeof chatIds !== 'string') return [];

    let result = chatIds
        .split(',')
        .map(id => id.trim())
        .filter(Boolean)
        .map(id => {
            // 精确移除 Telegram 群组 ID 的 -100 前缀，只保留数字部分
            return id.replace(/^-100/, '');
        });
    
    // 如需要，添加数字格式验证
    if (validateNumeric) {
        result = result.filter(id => /^\d+$/.test(id));
    }
    
    return result;
}


/**
 * 构建格式化的消息文本，用于发送抽奖红包提醒通知或显示普通消息内容。
 *
 * @param {string|null|undefined} chatTitle - 群组标题
 * @param {string|null|undefined} chatId - 群组 ID
 * @param {string|null|undefined} fromId - 消息来源 ID（通常为消息 ID）
 * @param {Object|null|undefined} lotteryInfo - 抽奖信息对象，包含创建者、时间、参与人数、口令和奖品等信息
 * @param {string|null|undefined} displayText - 当 lotteryInfo 不存在时显示的普通消息内容
 * @returns {string} 格式化后的消息文本，使用 Markdown V2 格式
 */
export function buildFormattedMessage(chatTitle, chatId, fromId, lotteryInfo, displayText) {
    try {
        // 处理参数默认值，防止 null 或 undefined 导致错误
        const safeChatTitle = chatTitle ?? '';
        const safeChatId = chatId ?? '';
        const safeFromId = fromId ?? '';

        // 对群组标题和 ID 进行 Markdown 转义处理
        const escapedChatTitle = escapeMarkdownV2(safeChatTitle);
        const escapedChatId = escapeMarkdownV2(safeChatId);

        let messageParts = [];

        // 如果存在抽奖信息且为对象类型，则构建抽奖通知消息
        if (lotteryInfo && typeof lotteryInfo === 'object') {
            messageParts.push(`🔔 *抽奖红包提醒通知*\n\n`);
            messageParts.push(`🚩 *群　组：* ${escapedChatTitle} \\(ID: ${escapedChatId}\\)\n`);

            if (lotteryInfo.creator !== undefined && lotteryInfo.creator !== null) {
                messageParts.push(`👑 *财　神：* ${escapeMarkdownV2(lotteryInfo.creator)}\n`);
            }

            if (lotteryInfo.createTime !== undefined && lotteryInfo.createTime !== null) {
                messageParts.push(`🕖 *时　间：* ${escapeMarkdownV2(lotteryInfo.createTime)}\n`);
            }

            if (typeof lotteryInfo.autoOpenCount === 'number') {
                messageParts.push(`👩‍👧‍👧 *参　与：* ${lotteryInfo.autoOpenCount} 人\n`);
            }

            if (lotteryInfo.keyword !== undefined && lotteryInfo.keyword !== null) {
                messageParts.push(`©️ *口　令：* \`${lotteryInfo.keyword}\`  \\(点击可复制\\)\n`);
            }

            // 奖品列表
            if (Array.isArray(lotteryInfo.prizes) && lotteryInfo.prizes.length > 0) {
                messageParts.push(`🎁 *奖　品：*\n`);

                for (let i = 0; i < lotteryInfo.prizes.length; i++) {
                    const prize = lotteryInfo.prizes[i];
                    if (!prize || typeof prize !== 'object') continue;

                    const escapedPrizeName = escapeMarkdownV2(prize.name ?? '');
                    messageParts.push(`               ${escapedPrizeName} × ${prize.count ?? 0}\n`);
                }
            }

            messageParts.push(`📝 *链　接：* https://t\\.me/c/${escapedChatId}/${safeFromId}`);
        } else {
            // 否则显示普通消息内容
            const safeDisplayText = displayText ?? '';
            messageParts.push(`\n*消息内容:*\n${escapeMarkdownV2(safeDisplayText)}`);
        }

        return messageParts.join('');
    } catch (error) {
        console.error("Error building formatted message:", error);
        return ""; // 返回空字符串避免中断流程
    }
}