import { normalizeId, parseChatIds } from '../utils/formatUtils.js';
import { isDeletableMessage, compareSenderId, sleep } from '../utils/messageUtils.js';
import { safeGetMe, safeGetEntity } from '../utils/telegramUtil.js';
import { Api } from 'telegram';

/**
 * 删除过期消息
 * @param {TelegramClient} client - Telegram 客户端
 */
export async function deleteExpiredMessages(client) {
    try {
        console.log('='.repeat(50));
        console.log('开始定期删除过期消息...');
        
        // 获取当前用户信息并验证有效性
        const me = await safeGetMe(client);
        if (!me || !me.id) {
            throw new Error("无法获取当前用户信息");
        }

        const fullUser = await safeGetEntity(client, me.id);
        if (!fullUser) {
            throw new Error("无法获取完整用户实体");
        }

        const userName = `${fullUser.firstName || ''} ${fullUser.lastName || ''}`.trim();
        console.log(`当前用户: ${userName} (ID: ${fullUser.id})`);

        const autoDeleteMinutes = parseInt(process.env.AUTO_DELETE_MINUTES) || 10;
        const nowTimestamp = Math.floor(Date.now() / 1000);
        const cutoffTime = nowTimestamp - (autoDeleteMinutes * 60);
        const cutoffDate = new Date(cutoffTime * 1000);
        console.log(`当前时间: ${new Date(nowTimestamp * 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
        console.log(`过期阈值: ${cutoffDate.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
        console.log(`AUTO_DELETE_MINUTES: ${autoDeleteMinutes} 分钟\n`);

        // 计算今天凌晨时间戳
        const now = new Date();
        const shanghaiTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
        const todayStart = new Date(shanghaiTime);
        todayStart.setHours(0, 0, 0, 0);
        const todayStartTimestamp = Math.floor(todayStart.getTime() / 1000);

        // ✅ 解析不监控群组列表
        const notMonitorChatIdsRaw = process.env.NOT_MONITOR_CHAT_IDS;
        const notMonitorChatIds = parseChatIds(notMonitorChatIdsRaw);

        // 获取所有对话并筛选群组
        const dialogs = await client.getDialogs();

        // ✅ 应用群组过滤逻辑（只过滤 NOT_MONITOR_CHAT_IDS）
        const groupDialogs = dialogs.filter(dialog => {
            const chat = dialog.entity;

            // 排除私人对话
            if (chat.className === 'User') return false;

            // 排除广播频道
            if (chat.className === 'Channel' && chat.broadcast === true) return false;

            // ✅ 安全地提取 chatId 并标准化
            const chatId = normalizeId(chat.id);
            if (!chatId) return false;

            // ✅ 检查是否在不监控列表中
            if (notMonitorChatIds.includes(chatId)) {
                console.log(`⏭️  跳过不监控的群组: ${chat.title || 'Unknown'} (ID: ${chat.id})`);
                return false;
            }

            return true;
        });

        // ✅ 显示过滤信息
        console.log('');
        if (notMonitorChatIds.length > 0) {
            console.log(`🚫 不监控的群组数量: ${notMonitorChatIds.length} 个`);
        } else {
            console.log(`🌐 处理所有群组（无排除列表）`);
        }

        console.log(`✅ 共 ${groupDialogs.length} 个群组需要检查\n`);

        // 如果没有群组需要处理，提前退出
        if (groupDialogs.length === 0) {
            console.log('⚠️  没有符合条件的群组需要处理\n');
            return;
        }

        // 方法1：使用 getMessages 获取最近的消息（实时，但慢）
        async function getRecentMessagesRealtime(client, chat, myUserId, cutoffTime) {
            const recentMessages = [];
            const RECENT_LIMIT = 200;
            try {
                const messages = await client.getMessages(chat, { limit: RECENT_LIMIT });
                if (!messages || messages.length === 0) return [];

                for (const msg of messages) {
                    // 只处理最近10分钟内的消息
                    if (msg.date < nowTimestamp - 600) break;

                    // 过滤系统消息
                    if (!isDeletableMessage(msg)) continue;

                    let isMyMessage = false;
                    try {
                        isMyMessage = compareSenderId(msg.senderId, myUserId);
                    } catch (e) {
                        isMyMessage = false;
                    }

                    if (isMyMessage && msg.date < cutoffTime) {
                        recentMessages.push(msg);
                    }
                }
                return recentMessages;
            } catch (error) {
                console.error(`  ⚠️  getMessages 失败: ${error.message}`);
                return [];
            }
        }

        // 方法2：使用 search 获取更早的消息（高效，但有延迟）
        async function searchOlderMessages(client, chat, userId, userAccessHash, cutoffTime, todayStartTimestamp) {
            const olderMessages = [];
            let offsetId = 0;
            const pageSize = 100;
            const maxPages = 10;
            let pageNum = 0;
            const searchMaxDate = nowTimestamp - 600;
            try {
                while (pageNum < maxPages) {
                    const result = await client.invoke(
                        new Api.messages.Search({
                            peer: chat,
                            q: '',
                            filter: new Api.InputMessagesFilterEmpty({}),
                            fromId: new Api.InputPeerUser({
                                userId: userId,
                                accessHash: userAccessHash
                            }),
                            minDate: todayStartTimestamp,
                            maxDate: searchMaxDate,
                            limit: pageSize,
                            offsetId: offsetId,
                            addOffset: 0,
                            maxId: 0,
                            minId: 0,
                            hash: BigInt(0)
                        })
                    );

                    const messages = Array.isArray(result.messages) ? result.messages : (result?.messages || []);
                    if (messages.length === 0) break;

                    pageNum++;

                    // 过滤出可删除且过期的消息
                    const expiredOnes = messages.filter(msg =>
                        isDeletableMessage(msg) && msg.date < cutoffTime
                    );
                    olderMessages.push(...expiredOnes);

                    offsetId = messages[messages.length - 1]?.id || 0;
                    if (messages.length < pageSize) break;

                    await sleep(200); // 控制速率
                }
                return olderMessages;
            } catch (error) {
                console.error(`  ⚠️  search 失败: ${error.message}`);
                return [];
            }
        }

        // 串行处理群组
        const results = [];
        for (let i = 0; i < groupDialogs.length; i++) {
            const dialog = groupDialogs[i];
            const chat = dialog.entity;
            const chatTitle = chat.title || (chat.firstName + (chat.lastName ? ' ' + chat.lastName : '')) || 'Unknown';

            try {
                console.log(`📍 [${i + 1}/${groupDialogs.length}] 群组: ${chatTitle}`);

                const [recentExpired, olderExpired] = await Promise.all([
                    getRecentMessagesRealtime(client, chat, fullUser.id, cutoffTime),
                    searchOlderMessages(client, chat, fullUser.id, fullUser.accessHash, cutoffTime, todayStartTimestamp)
                ]);

                // 合并结果并去重
                const allExpiredIds = new Set();
                const allExpiredMessages = [];
                for (const msg of [...recentExpired, ...olderExpired]) {
                    if (!allExpiredIds.has(msg.id)) {
                        allExpiredIds.add(msg.id);
                        allExpiredMessages.push(msg);
                    }
                }

                if (allExpiredMessages.length > 0) {
                    console.log(`  ✓ 找到 ${allExpiredMessages.length} 条过期消息 (最近: ${recentExpired.length}, 历史: ${olderExpired.length})`);
                    allExpiredMessages.slice(0, 3).forEach(msg => {
                        const msgTime = new Date(msg.date * 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
                        const msgType = msg.message ? '文本' : msg.media ? '媒体' : '其他';
                        console.log(`    · ID: ${msg.id}, 时间: ${msgTime}, 类型: ${msgType}`);
                    });
                    if (allExpiredMessages.length > 3) {
                        console.log(`    · ... 还有 ${allExpiredMessages.length - 3} 条`);
                    }
                } else {
                    console.log(`  · 无过期消息`);
                }

                results.push({
                    chat,
                    chatTitle,
                    expiredMessages: allExpiredMessages
                });
            } catch (error) {
                console.error(`  ❌ 处理失败: ${error.message}`);
                results.push({ chat, chatTitle: chatTitle, expiredMessages: [] });
            }

            await sleep(300); // 控制速率
        }

        console.log('\n' + '-'.repeat(50));
        console.log('开始删除过期消息...\n');

        // 按群组删除消息
        let totalDeleted = 0;
        let failedCount = 0;
        for (const result of results) {
            const { chat, chatTitle, expiredMessages } = result;
            if (expiredMessages.length === 0) continue;

            try {
                const BATCH_SIZE = 100;
                const messageIds = expiredMessages.map(msg => msg.id);
                for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
                    const batch = messageIds.slice(i, i + BATCH_SIZE);
                    try {
                        await client.deleteMessages(chat, batch, { revoke: true });
                        totalDeleted += batch.length;
                    } catch (deleteError) {
                        console.log(`    ⚠️  删除部分消息失败: ${deleteError.message}`);
                        failedCount += batch.length;
                    }
                    if (i + BATCH_SIZE < messageIds.length) {
                        await sleep(200);
                    }
                }
                console.log(`✅ 群组 ${chatTitle}: 成功删除 ${messageIds.length} 条消息`);
            } catch (error) {
                console.error(`❌ 群组 ${chatTitle}: 删除失败 - ${error.message}`);
            }
        }

        console.log('\n' + '='.repeat(50));
        console.log(`✨ 删除完成！成功: ${totalDeleted} 条${failedCount > 0 ? `, 失败: ${failedCount} 条` : ''}`);
        console.log('='.repeat(50) + '\n');
    } catch (error) {
        console.error('❌ 删除过期消息时出错:', error);
        console.error(error.stack);
    }
}