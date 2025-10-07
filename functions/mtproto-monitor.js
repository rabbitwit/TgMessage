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

  async authenticate() {
    // 检查是否已经认证
    try {
      const auth = await this.mtproto.call('users.getFullUser', {
        id: { _: 'inputUserSelf' }
      });
      console.log('Already authenticated:', auth);
      return true;
    } catch (error) {
      console.log('Not authenticated, need to authenticate');
    }
    
    // 进行认证
    if (this.env.PHONE_NUMBER) {
      try {
        console.log('Sending code to', this.env.PHONE_NUMBER);
        const sentCode = await this.mtproto.call('auth.sendCode', {
          phone_number: this.env.PHONE_NUMBER,
          api_id: parseInt(this.env.MTPROTO_API_ID),
          api_hash: this.env.MTPROTO_API_HASH,
          settings: {
            _: 'codeSettings',
          },
        });
        console.log('Code sent:', sentCode);
        
        if (this.env.PHONE_CODE) {
          console.log('Signing in with code');
          const signInResult = await this.mtproto.call('auth.signIn', {
            phone_number: this.env.PHONE_NUMBER,
            phone_code: this.env.PHONE_CODE,
            phone_code_hash: sentCode.phone_code_hash,
          });
          console.log('Sign in result:', signInResult);
          return true;
        } else {
          console.log('PHONE_CODE not provided, waiting for manual input');
          return false;
        }
      } catch (error) {
        console.error('Authentication error:', error);
        
        // 处理数据中心迁移
        if (error.error_message && error.error_message.startsWith('PHONE_MIGRATE_')) {
          const dcNumber = parseInt(error.error_message.split('_')[2]);
          console.log(`Phone number requires migration to DC ${dcNumber}`);
          
          // 更新客户端连接到正确的数据中心
          await this.mtproto.setDefaultDc(dcNumber);
          
          // 重试发送验证码
          try {
            const sentCode = await this.mtproto.call('auth.sendCode', {
              phone_number: this.env.PHONE_NUMBER,
              api_id: parseInt(this.env.MTPROTO_API_ID),
              api_hash: this.env.MTPROTO_API_HASH,
              settings: {
                _: 'codeSettings',
              },
            });
            console.log('Code sent after migration:', sentCode);
            
            if (this.env.PHONE_CODE) {
              console.log('Signing in with code after migration');
              const signInResult = await this.mtproto.call('auth.signIn', {
                phone_number: this.env.PHONE_NUMBER,
                phone_code: this.env.PHONE_CODE,
                phone_code_hash: sentCode.phone_code_hash,
              });
              console.log('Sign in result after migration:', signInResult);
              return true;
            } else {
              console.log('PHONE_CODE not provided, waiting for manual input');
              return false;
            }
          } catch (retryError) {
            console.error('Authentication error after migration:', retryError);
            throw retryError;
          }
        }
        
        // 如果需要密码
        if (error.error_message === 'SESSION_PASSWORD_NEEDED') {
          if (this.env.TWO_FACTOR_PASSWORD) {
            console.log('Two-factor authentication required');
            const passwordResult = await this.mtproto.call('auth.checkPassword', {
              password: {
                _: 'inputCheckPasswordSRP',
                ...await this.mtproto.call('account.getPassword'),
              },
            });
            console.log('Password check result:', passwordResult);
            return true;
          } else {
            console.log('TWO_FACTOR_PASSWORD not provided');
            return false;
          }
        }
        throw error;
      }
    } else {
      console.log('PHONE_NUMBER not provided, cannot authenticate. You need to provide your phone number to log into your Telegram account.');
      return false;
    }
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

    // 连接到 Telegram 并进行认证
    try {
      console.log('Connecting to Telegram...');
      await this.mtproto.call('help.getNearestDc', {});
      console.log('Connected to Telegram successfully');
      
      // 尝试认证
      console.log('Authenticating...');
      const authenticated = await this.authenticate();
      if (!authenticated) {
        console.log('Authentication not completed, some features may not work');
      } else {
        console.log('Authentication completed successfully');
      }
    } catch (error) {
      console.error('Failed to connect to Telegram:', error);
      throw new Error('Failed to connect to Telegram: ' + error.message);
    }
    
    // 设置事件处理器（避免重复绑定）
    if (!this.isListening) {
      console.log('Setting up event handlers');
      
      // 监听所有可能的更新事件
      this.mtproto.updates.on('updateShortMessage', this.handleNewMessage.bind(this));
      this.mtproto.updates.on('updateShortChatMessage', this.handleNewChatMessage.bind(this));
      this.mtproto.updates.on('updates', this.handleUpdates.bind(this));
      this.mtproto.updates.on('updateNewMessage', this.handleNewMessageUpdate.bind(this));
      this.mtproto.updates.on('any', this.handleAnyUpdate.bind(this));
      
      this.isListening = true;
      console.log('Event handlers set up successfully');
    }

    console.log('MTProto monitoring started with keywords:', keywords, 'and chat IDs:', chatIds);
    
    // 主动获取更新
    this.getUpdates();
  }
  
  async getUpdates() {
    try {
      console.log('Getting updates...');
      const updates = await this.mtproto.call('updates.getState');
      console.log('Current updates state:', JSON.stringify(updates, null, 2));
    } catch (error) {
      console.error('Failed to get updates state:', error);
    }
  }

  async handleAnyUpdate(update) {
    console.log('Received any update:', JSON.stringify(update, null, 2));
  }

  async handleNewMessageUpdate(update) {
    console.log('Received updateNewMessage:', JSON.stringify(update, null, 2));
    if (update.message) {
      await this.processMessage(update.message.message, update.message.from_id, update.message.to_id);
    }
  }

  async handleNewMessage(update) {
    console.log('Received updateShortMessage:', JSON.stringify(update, null, 2));
    await this.processMessage(update.message, update.user_id);
  }

  async handleNewChatMessage(update) {
    console.log('Received updateShortChatMessage:', JSON.stringify(update, null, 2));
    await this.processMessage(update.message, update.from_id, update.chat_id);
  }

  async handleUpdates(updates) {
    console.log('Received updates:', JSON.stringify(updates, null, 2));
    if (updates.updates) {
      for (const update of updates.updates) {
        if (update._ === 'updateNewMessage' && update.message) {
          const message = update.message;
          console.log('Processing updateNewMessage:', JSON.stringify(message, null, 2));
          await this.processMessage(message.message, message.from_id, message.to_id);
        }
      }
    }
  }

  async processMessage(messageText, fromId, chatId) {
    console.log('Processing message:', { messageText, fromId, chatId });
    
    // 检查是否是目标聊天室的消息
    if (this.chatIds && !this.chatIds.includes(fromId) && !this.chatIds.includes(chatId)) {
      console.log('Message not from target chat, ignoring. Target chat IDs:', this.chatIds, 'From ID:', fromId, 'Chat ID:', chatId);
      return;
    }

    console.log('Message is from target chat, checking for keywords');
    console.log('Target keywords:', this.keywords);
    console.log('Target chat IDs:', this.chatIds);
    
    // 检查是否包含关键词
    if (this.keywords && this.keywords.some(keyword => {
      const contains = messageText.includes(keyword);
      console.log(`Checking keyword "${keyword}" in message: ${contains}`);
      return contains;
    })) {
      console.log('Keyword found in message, sending notification');
      // 发送通知
      await this.sendNotification(messageText, fromId, chatId);
    } else {
      console.log('No keywords found in message');
    }
  }

  async sendNotification(messageText, fromId, chatId) {
    console.log('Sending notification for message:', { messageText, fromId, chatId });
    
    const targetChatId = chatId !== undefined ? chatId : fromId;
    const notificationText = `
🚨 Keyword Alert 🚨
Chat: ${targetChatId}
Message: ${messageText}
    `.trim();

    console.log('Admin chat ID:', this.env.ADMIN_CHAT_ID);
    
    // 发送给管理员
    if (this.env.ADMIN_CHAT_ID) {
      try {
        console.log('Sending message via bot...');
        const result = await this.notificationBot.sendMessage({
          text: notificationText,
          chat_id: this.env.ADMIN_CHAT_ID
        });
        console.log('Notification sent successfully:', result);
      } catch (error) {
        console.error('Failed to send notification:', error);
      }
    } else {
      console.log('No ADMIN_CHAT_ID configured, cannot send notification');
    }
  }
}

export default MTProtoMonitor;