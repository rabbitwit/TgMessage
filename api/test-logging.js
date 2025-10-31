export default async function handler(request, response) {
  console.log('=== Test Logging Function Called ===');
  console.log('Request Method:', request.method);
  console.log('Request URL:', request.url);
  console.log('Request Headers:', request.headers);
  console.log('Timestamp:', new Date().toISOString());
  
  // 生成一个随机数以确保响应是新鲜的
  const randomNumber = Math.floor(Math.random() * 1000);
  
  console.log('Generated random number:', randomNumber);
  
  response.status(200).json({
    success: true,
    message: 'Test logging function executed successfully',
    timestamp: new Date().toISOString(),
    randomNumber: randomNumber,
    note: 'Check Vercel logs for detailed logging output'
  });
}