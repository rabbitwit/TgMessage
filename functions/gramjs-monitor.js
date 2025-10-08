import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { Api } from 'telegram';
import Bot from './bot.js';
import fs from 'fs';

class GramjsMonitor {
  constructor(env) {
    this.env = env;
    
    // 检查必要的环境变量
    this.apiId = parseInt(env.MTPROTO_API_ID);
    this.apiHash = env.MTPROTO_API_HASH;
    
    if (isNaN(this.apiId) || !this.apiHash) {
      throw new Error('Missing or invalid MTPROTO_API_ID or MTPROTO_API_HASH');
    }
    
    console.log('API ID:', this.apiId);
    console.log('API Hash:', this.apiHash);
    
    // 检查是否提供了预生成的 session 字符串
    let sessionString = env.MTPROTO_SESSION || '';
    
    // 如果没有预生成的 session，尝试从文件加载
    if (!sessionString) {
      try {
        if (fs.existsSync('/tmp/gramjs-session.txt')) {
          sessionString = fs.readFileSync('/tmp/gramjs-session.txt', 'utf8');
          console.log('Loaded existing session from file');
        }
      } catch (error) {
        console.log('No existing session found, will create new one');
      }
    } else {
      console.log('Using pre-generated session from environment variable');
    }
    
    // 初始化 TelegramClient
    this.client = new TelegramClient(
      new StringSession(sessionString),
      this.apiId,
      this.apiHash,
      { connectionRetries: 5 }
    );
    
    // 初始化通知机器人
    this.notificationBot = new Bot(env);
  }
  
  async authenticate() {
    // 检查是否已连接
    if (!this.client.connected) {
      await this.client.connect();
    }
    
    // 检查是否已认证
    try {
      await this.client.getMe();
      console.log('Already authenticated');
      return true;
    } catch (error) {
      console.log('Not authenticated, need to authenticate');
    }
    
    // 如果提供了 PHONE_CODE，尝试自动认证
    if (this.env.PHONE_NUMBER && this.env.PHONE_CODE) {
      try {
        console.log('Sending code to', this.env.PHONE_NUMBER);
        const phoneNumber = this.env.PHONE_NUMBER;
        
        // 使用 Api.auth.SendCode 方法
        const sentCode = await this.client.invoke(new Api.auth.SendCode({
          phoneNumber: phoneNumber,
          apiId: this.apiId,
          apiHash: this.apiHash,
          settings: new Api.CodeSettings({})
        }));
        
        console.log('Code sent:', sentCode);
        
        console.log('Signing in with code from environment variable');
        const user = await this.client.invoke(new Api.auth.SignIn({
          phoneNumber: phoneNumber,
          phoneCodeHash: sentCode.phoneCodeHash,
          phoneCode: this.env.PHONE_CODE
        }));
        
        console.log('Signed in as:', user);
        
        // 保存会话
        await this.saveSession();
        return true;
      } catch (error) {
        console.error('Authentication error:', error);
        
        // 如果需要密码
        if (error.errorMessage === 'SESSION_PASSWORD_NEEDED') {
          if (this.env.TWO_FACTOR_PASSWORD) {
            console.log('Two-factor authentication required');
            const user = await this.client.invoke(new Api.auth.CheckPassword({
              password: this.env.TWO_FACTOR_PASSWORD
            }));
            
            console.log('Signed in with password as:', user);
            
            // 保存会话
            await this.saveSession();
            return true;
          } else {
            console.log('TWO_FACTOR_PASSWORD not provided');
            return false;
          }
        }
        
        throw error;
      }
    }
    
    // 否则通过机器人请求验证码
    if (this.env.PHONE_NUMBER) {
      try {
        console.log('Sending code to', this.env.PHONE_NUMBER);
        const phoneNumber = this.env.PHONE_NUMBER;
        
        // 使用 Api.auth.SendCode 方法
        const sentCode = await this.client.invoke(new Api.auth.SendCode({
          phoneNumber: phoneNumber,
          apiId: this.apiId,
          apiHash: this.apiHash,
          settings: new Api.CodeSettings({})
        }));
        
        console.log('Code sent:', sentCode);
        console.log('PHONE_CODE not provided, waiting for manual input via bot');
        await this.requestCodeViaBot(sentCode);
        return false;
      } catch (error) {
        console.error('Authentication error:', error);
        
        // 如果需要密码
        if (error.errorMessage === 'SESSION_PASSWORD_NEEDED') {
          if (this.env.TWO_FACTOR_PASSWORD) {
            console.log('Two-factor authentication required');
            const user = await this.client.invoke(new Api.auth.CheckPassword({
              password: this.env.TWO_FACTOR_PASSWORD
            }));
            
            console.log('Signed in with password as:', user);
            
            // 保存会话
            await this.saveSession();
            return true;
          } else {
            console.log('TWO_FACTOR_PASSWORD not provided');
            return false;
          }
        }
        
        throw error;
      }
    } else {
      console.log('PHONE_NUMBER not provided, cannot authenticate');
      return false;
    }
  }
  
  async saveSession() {
    try {
      const sessionString = this.client.session.save();
      fs.writeFileSync('/tmp/gramjs-session.txt', sessionString, 'utf8');
      console.log('Session saved to file');
      
      // 如果需要，也可以输出 session 字符串供手动保存
      console.log('Session string (for manual saving):', sessionString);
    } catch (error) {
      console.error('Failed to save session:', error);
    }
  }
  
  async requestCodeViaBot(sentCode) {
    this.pendingAuth = {
      phone_number: this.env.PHONE_NUMBER,
      phone_code_hash: sentCode.phoneCodeHash,
      timestamp: Date.now()
    };
    
    if (this.env.ADMIN_CHAT_ID) {
      const message = `
GramJS 监控需要验证码才能登录您的 Telegram 账号。
请回复此消息，格式为: code<空格>验证码
例如: code 123456

如果您已经手动获取了 session 字符串，可以将其设置为 MTPROTO_SESSION 环境变量，这样就不需要手机验证了。
      `.trim();
      
      try {
        await this.notificationBot.sendMessage({
          text: message,
          chat_id: this.env.ADMIN_CHAT_ID
        });
        console.log('Code request sent to admin via bot');
      } catch (error) {
        console.error('Failed to send code request via bot:', error);
      }
    }
  }
  
  async submitCode(phoneCode) {
    if (!this.pendingAuth) {
      console.log('No pending authentication request');
      return false;
    }
    
    if (Date.now() - this.pendingAuth.timestamp > 5 * 60 * 1000) {
      console.log('Authentication request expired');
      this.pendingAuth = null;
      return false;
    }
    
    try {
      console.log('Signing in with manually provided code');
      const user = await this.client.invoke(new Api.auth.SignIn({
        phoneNumber: this.pendingAuth.phone_number,
        phoneCodeHash: this.pendingAuth.phone_code_hash,
        phoneCode: phoneCode
      }));
      
      console.log('Signed in as:', user);
      
      this.pendingAuth = null;
      
      // 保存会话
      await this.saveSession();
      return true;
    } catch (error) {
      console.error('Failed to sign in with provided code:', error);
      
      if (error.errorMessage === 'SESSION_PASSWORD_NEEDED') {
        if (this.env.TWO_FACTOR_PASSWORD) {
          console.log('Two-factor authentication required');
          const user = await this.client.invoke(new Api.auth.CheckPassword({
            password: this.env.TWO_FACTOR_PASSWORD
          }));
          
          console.log('Signed in with password as:', user);
          
          // 保存会话
          await this.saveSession();
          return true;
        } else {
          console.log('TWO_FACTOR_PASSWORD not provided');
          return false;
        }
      }
      
      throw error;
    }
  }
  
  async startMonitoring(keywords, chatIds) {
    // 验证参数
    if (!Array.isArray(keywords) || keywords.length === 0) {
      throw new Error('Keywords must be a non-empty array');
    }
    
    if (!Array.isArray(chatIds) || chatIds.length === 0) {
      throw new Error('Chat IDs must be a non-empty array');
    }
    
    this.keywords = keywords;
    this.chatIds = chatIds;
    
    try {
      console.log('Connecting to Telegram...');
      await this.client.connect();
      console.log('Connected to Telegram successfully');
      
      console.log('Authenticating...');
      const authenticated = await this.authenticate();
      if (!authenticated) {
        console.log('Authentication not completed, some features may not work initially');
      } else {
        console.log('Authentication completed successfully');
      }
      
      // 设置事件处理器
      console.log('Setting up event handlers');
      this.client.addEventHandler(this.handleNewMessage.bind(this));
      
      console.log('Event handlers set up successfully');
      
      console.log('GramJS monitoring started with keywords:', keywords, 'and chat IDs:', chatIds);
    } catch (error) {
      console.error('Failed to start GramJS monitoring:', error);
      throw new Error('Failed to start GramJS monitoring: ' + error.message);
    }
  }
  
  async handleNewMessage(event) {
    try {
      // 处理不同类型的事件
      let message = null;
      if (event.message) {
        message = event.message;
      } else if (event._ === 'updateNewMessage' && event.message) {
        message = event.message;
      } else if (event.className === 'UpdateNewMessage' && event.message) {
        message = event.message;
      } else if (event.className === 'UpdateNewChannelMessage' && event.message) {
        message = event.message;
      }
      
      if (message) {
        // 正确提取消息文本
        const messageText = message.message || message.text || '';
        // 正确提取聊天ID和用户ID
        let chatId = null;
        let userId = null;
        
        // 提取用户ID
        if (message.fromId) {
          if (message.fromId.userId) {
            userId = parseInt(message.fromId.userId.toString());
          } else if (message.fromId.className === 'PeerUser') {
            userId = parseInt(message.fromId.userId.toString());
          }
        }
        
        // 提取聊天ID
        if (message.peerId) {
          if (message.peerId.chatId) {
            chatId = -parseInt(message.peerId.chatId.toString()); // 聊天ID通常为负数
          } else if (message.peerId.channelId) {
            chatId = -1000000000000 - parseInt(message.peerId.channelId.toString()); // 频道ID转换
          } else if (message.peerId.userId) {
            chatId = parseInt(message.peerId.userId.toString());
          }
        }
        
        // 如果peerId是聊天，直接使用
        if (!chatId && message.peerId && message.peerId.className === 'PeerChat') {
          chatId = -parseInt(message.peerId.chatId.toString());
        }
        
        // 如果peerId是频道，进行转换
        if (!chatId && message.peerId && message.peerId.className === 'PeerChannel') {
          chatId = -1000000000000 - parseInt(message.peerId.channelId.toString());
        }
        
        console.log('Processing message:', { messageText, chatId, userId });
        
        // 检查是否是目标聊天室的消息
        if (this.chatIds && 
            !this.chatIds.includes(chatId) && 
            !this.chatIds.includes(userId)) {
          console.log('Message not from target chat, ignoring. Target chat IDs:', this.chatIds, 'Chat ID:', chatId, 'User ID:', userId);
          return;
        }
        
        console.log('Message is from target chat, checking for keywords');
        console.log('Target keywords:', this.keywords);
        
        // 检查是否包含关键词
        if (this.keywords && this.keywords.some(keyword => {
          const contains = messageText.includes(keyword);
          console.log(`Checking keyword "${keyword}" in message: ${contains}`);
          return contains;
        })) {
          console.log('Keyword found in message, sending notification');
          await this.sendNotification(messageText, userId, chatId);
        } else {
          console.log('No keywords found in message');
          console.log('Message text was:', messageText);
        }
      } else {
        console.log('Event has no message content');
      }
    } catch (error) {
      console.error('Error processing message:', error);
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
    
    if (this.env.ADMIN_CHAT_ID) {
      try {
        console.log('Sending message via bot...');
        console.log('ADMIN_CHAT_ID:', this.env.ADMIN_CHAT_ID);
        const result = await this.notificationBot.sendMessage({
          text: notificationText,
          chat_id: this.env.ADMIN_CHAT_ID
        });
        console.log('Notification sent result:', result);
        if (!result.ok) {
          console.error('Failed to send notification:', result.description);
        }
        return result;
      } catch (error) {
        console.error('Failed to send notification:', error);
        // 添加更多调试信息
        console.error('ADMIN_CHAT_ID:', this.env.ADMIN_CHAT_ID);
        console.error('Notification text:', notificationText);
        throw error;
      }
    } else {
      console.log('No ADMIN_CHAT_ID configured, cannot send notification');
    }
  }
}

export default GramjsMonitor;