import MTProto from '@mtproto/core';
import Bot from './bot.js';

class MTProtoMonitor {
  constructor(env) {
    this.env = env;
    
    // 初始化 MTProto 客户端
    const apiId = parseInt(env.MTPROTO_API_ID);
    if (isNaN(apiId)) {
      throw new Error('Invalid MTPROTO_API_ID: must be a number');
    }
    
    this.mtproto = new MTProto({
      api_id: apiId,
      api_hash: env.MTPROTO_API_HASH,
      storageOptions: {
        path: '/tmp/mtproto-session.json',
      },
    });

    // 初始化通知机器人
    this.notificationBot = new Bot(env);
    
    // 标记事件监听器是否已绑定
    this.isListening = false;
  }

  async startMonitoring(keywords, chatIds) {
    // 验证输入参数
    if (!Array.isArray(keywords) || keywords.length === 0) {
      throw new Error('Keywords must be a non-empty array');
    }
    
    if (!Array.isArray(chatIds) || chatIds.length === 0) {
      throw new Error('Chat IDs must be a non-empty array');
    }
    
    // 存储关键词和聊天ID用于匹配
    this.keywords = keywords;
    this.chatIds = chatIds;

    // 连接到 Telegram
    try {
      await this.mtproto.call('help.getNearestDc', {});
    } catch (error) {
      console.error('Failed to connect to Telegram:', error);
      throw new Error('Failed to connect to Telegram: ' + error.message);
    }
    
    // 设置事件处理器（避免重复绑定）
    if (!this.isListening) {
      this.mtproto.updates.on('updateShortMessage', this.handleNewMessage.bind(this));
      this.mtproto.updates.on('updateShortChatMessage', this.handleNewChatMessage.bind(this));
      this.mtproto.updates.on('updates', this.handleUpdates.bind(this));
      this.isListening = true;
    }

    console.log('MTProto monitoring started');
  }

  async handleNewMessage(update) {
    await this.processMessage(update.message, update.user_id);
  }

  async handleNewChatMessage(update) {
    await this.processMessage(update.message, update.from_id, update.chat_id);
  }

  async handleUpdates(updates) {
    if (updates.updates) {
      for (const update of updates.updates) {
        if (update._ === 'updateNewMessage' && update.message) {
          const message = update.message;
          await this.processMessage(message.message, message.from_id, message.to_id);
        }
      }
    }
  }

  async processMessage(messageText, fromId, chatId) {
    // 检查是否是目标聊天室的消息
    if (this.chatIds && !this.chatIds.includes(fromId) && !this.chatIds.includes(chatId)) {
      return;
    }

    // 检查是否包含关键词
    if (this.keywords && this.keywords.some(keyword => messageText.includes(keyword))) {
      // 发送通知
      await this.sendNotification(messageText, fromId, chatId);
    }
  }

  async sendNotification(messageText, fromId, chatId) {
    const targetChatId = chatId !== undefined ? chatId : fromId;
    const notificationText = `
🚨 Keyword Alert 🚨
Chat: ${targetChatId}
Message: ${messageText}
    `.trim();

    // 发送给管理员
    if (this.env.ADMIN_CHAT_ID) {
      try {
        await this.notificationBot.sendMessage({
          text: notificationText,
          chat_id: this.env.ADMIN_CHAT_ID
        });
      } catch (error) {
        console.error('Failed to send notification:', error);
      }
    }
  }
}

export default MTProtoMonitor;