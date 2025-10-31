export default async function handler(request, response) {
  console.log('=== Telegram Webhook Debug 收到请求 ===');
  console.log('请求方法:', request.method);
  console.log('请求URL:', request.url);
  console.log('请求头:', request.headers);
  
  // 记录原始请求体
  console.log('原始请求体类型:', typeof request.body);
  if (typeof request.body === 'string') {
    console.log('原始请求体 (前200字符):', request.body.substring(0, 200));
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
    console.log('更新类型:', Object.keys(updateData).filter(key => key !== 'update_id'));
    
    // 检查是否有 message
    if (updateData.message) {
      console.log('消息类型: message');
      console.log('消息内容:', JSON.stringify(updateData.message, null, 2));
      
      // 分析消息结构
      const message = updateData.message;
      console.log('消息ID:', message.message_id);
      console.log('消息文本:', message.text);
      console.log('发送者:', message.from ? JSON.stringify(message.from, null, 2) : '未知');
      console.log('聊天信息:', message.chat ? JSON.stringify(message.chat, null, 2) : '未知');
      console.log('时间戳:', message.date);
    }
    
    // 检查是否有 edited_message
    if (updateData.edited_message) {
      console.log('消息类型: edited_message');
      console.log('编辑消息内容:', JSON.stringify(updateData.edited_message, null, 2));
    }
    
    // 检查是否有 channel_post
    if (updateData.channel_post) {
      console.log('消息类型: channel_post');
      console.log('频道消息内容:', JSON.stringify(updateData.channel_post, null, 2));
    }
    
    // 检查是否有 edited_channel_post
    if (updateData.edited_channel_post) {
      console.log('消息类型: edited_channel_post');
      console.log('编辑频道消息内容:', JSON.stringify(updateData.edited_channel_post, null, 2));
    }
  }
  
  response.status(200).send('OK - Debug信息已记录');
}