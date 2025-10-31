// 简单的内存存储工具，用于在 Vercel Serverless 函数之间共享数据
// 注意：Vercel 的 Serverless 函数实例不是持久的，这种内存存储仅用于演示目的
// 在生产环境中，建议使用外部数据库如 Redis、MongoDB 或 PostgreSQL

export const memoryHistory = {
  messages: [],
  lastCheck: null,
  
  addMessage(message) {
    this.messages.push({
      ...message,
      id: Date.now(),
      timestamp: new Date().toISOString()
    })
    
    // 保持消息历史记录较小
    if (this.messages.length > 100) {
      this.messages = this.messages.slice(-50)
    }
    
    this.lastCheck = new Date().toISOString()
  },
  
  getMessages(since) {
    if (!since) {
      return this.messages
    }
    
    return this.messages.filter(msg => new Date(msg.timestamp) > new Date(since))
  },
  
  getLastCheck() {
    return this.lastCheck
  }
}