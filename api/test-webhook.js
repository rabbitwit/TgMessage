export default async function handler(request, response) {
  console.log('测试 Webhook 函数被调用');
  console.log('请求方法:', request.method);
  console.log('请求头:', request.headers);
  
  if (request.body) {
    console.log('请求体类型:', typeof request.body);
    console.log('请求体内容:', JSON.stringify(request.body, null, 2));
    
    // 尝试解析请求体
    try {
      const update = request.body;
      console.log('Update 对象:', update);
      
      if (update.message) {
        console.log('消息内容:', update.message);
        console.log('消息文本:', update.message.text);
      }
    } catch (error) {
      console.error('解析请求体时出错:', error);
    }
  } else {
    console.log('请求体为空');
  }
  
  response.status(200).send({
    success: true,
    message: '测试成功',
    timestamp: new Date().toISOString()
  });
}