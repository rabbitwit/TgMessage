export default async function handler(request, response) {
  console.log('=== Debug Request 函数被调用 ===');
  console.log('请求方法:', request.method);
  console.log('请求URL:', request.url);
  console.log('请求头:', request.headers);
  
  // 检查 body 是否存在
  console.log('body 类型:', typeof request.body);
  console.log('body 内容:', request.body);
  
  // 如果 body 是字符串，尝试解析它
  if (typeof request.body === 'string') {
    console.log('body 是字符串，尝试解析 JSON');
    try {
      const parsedBody = JSON.parse(request.body);
      console.log('解析后的 body:', parsedBody);
    } catch (error) {
      console.error('JSON 解析失败:', error);
      console.log('原始 body 内容:', request.body);
    }
  }
  
  // 检查原始数据
  console.log('检查 request 对象的其他属性:');
  for (const key in request) {
    if (typeof request[key] !== 'function') {
      console.log(`  ${key}:`, typeof request[key]);
    }
  }
  
  response.status(200).send({
    success: true,
    message: '请求调试完成',
    timestamp: new Date().toISOString(),
    bodyInfo: {
      type: typeof request.body,
      hasBody: !!request.body
    }
  });
}