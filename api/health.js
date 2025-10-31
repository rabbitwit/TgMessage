export default async function handler(request, response) {
  console.log('Health check function called');
  
  response.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    message: 'Health check successful'
  });
}