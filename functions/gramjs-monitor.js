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
    
    // 尝试从文件加载会话
    let sessionString = '';
    try {
      if (fs.existsSync('/tmp/gramjs-session.txt')) {
        sessionString = fs.readFileSync('/tmp/gramjs-session.txt', 'utf8');
        console.log('Loaded existing session from file');
      }
    } catch (error) {
      console.log('No existing session found, will create new one');
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
        
        if (this.env.PHONE_CODE) {
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
        } else {
          console.log('PHONE_CODE not provided, waiting for manual input via bot');
          await this.requestCodeViaBot(sentCode);
          return false;
        }
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
      if (event.message) {
        const messageText = event.message.text || '';
        const chatId = event.message.chatId ? event.message.chatId.valueOf() : null;
        const userId = event.message.senderId ? event.message.senderId.valueOf() : null;
        
        console.log('Processing message:', { messageText, chatId, userId });
        
        // 检查是否是目标聊天室的消息
        if (this.chatIds && 
            !this.chatIds.includes(chatId) && 
            !this.chatIds.includes(userId)) {
          console.log('Message not from target chat, ignoring.');
          return;
        }
        
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
        }
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

export default GramjsMonitor;