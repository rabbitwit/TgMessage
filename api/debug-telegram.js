export default async function handler(request, response) {
  console.log('=== Telegram Webhook Debug 收到请求 ===');
  console.log('请求方法:', request.method);
  console.log('请求URL:', request.url);
  console.log('请求头:', request.headers);
  
  // 记录原始请求体
  console.log('原始请求体类型:', typeof request.body);
  if (typeof request.body === 'string') {
    console.log('原始请求体 (前500字符):', request.body.substring(0, 500));
  } else if (request.body) {
    console.log('请求体对象:', JSON.stringify(request.body, null, 2));
  } else {
    console.log('请求体为空');
  }
  
  // 尝试解析请求体
  let updateData = null;
  if (request.body) {
    if (typeof request.body === 'string') {
      try {
        updateData = JSON.parse(request.body);
        console.log('解析后的更新数据:', JSON.stringify(updateData, null, 2));
      } catch (error) {
        console.error('JSON 解析错误:', error);
        console.log('原始数据:', request.body);
      }
    } else {
      updateData = request.body;
      console.log('直接使用请求体对象:', JSON.stringify(updateData, null, 2));
    }
  }
  
  // 如果有更新数据，分析其结构
  if (updateData) {
    console.log('=== 更新数据分析 ===');
    const updateTypes = Object.keys(updateData).filter(key => key !== 'update_id');
    console.log('更新类型:', updateTypes);
    
    // 检查各种可能的消息类型
    const messageTypes = ['message', 'edited_message', 'channel_post', 'edited_channel_post'];
    for (const messageType of messageTypes) {
      if (updateData[messageType]) {
        console.log(`消息类型: ${messageType}`);
        console.log(`${messageType} 内容:`, JSON.stringify(updateData[messageType], null, 2));
        
        // 分析消息结构
        const message = updateData[messageType];
        console.log('消息ID:', message.message_id);
        console.log('消息文本:', message.text);
        console.log('发送者:', message.from ? JSON.stringify(message.from, null, 2) : '未知');
        console.log('聊天信息:', message.chat ? JSON.stringify(message.chat, null, 2) : '未知');
        console.log('时间戳:', message.date);
        
        // 检查是否是机器人发送的消息
        if (message.from && message.from.is_bot) {
          console.log('⚠️ 这是机器人发送的消息，可能会被过滤');
        }
        
        // 检查聊天类型
        if (message.chat) {
          console.log('聊天类型:', message.chat.type);
        }
      }
    }
    
    // 检查其他可能的更新类型
    if (updateData.callback_query) {
      console.log('回调查询内容:', JSON.stringify(updateData.callback_query, null, 2));
    }
    
    if (updateData.inline_query) {
      console.log('内联查询内容:', JSON.stringify(updateData.inline_query, null, 2));
    }
  }
  
  response.status(200).send('OK - Debug信息已记录');
}