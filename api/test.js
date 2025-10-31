export default async function handler(request, response) {
  console.log('Test function called:', {
    method: request.method,
    url: request.url,
    headers: request.headers,
    query: request.query,
    body: request.body
  });
  
  response.status(200).send({
    success: true,
    message: 'Test function executed successfully',
    timestamp: new Date().toISOString(),
    requestDetails: {
      method: request.method,
      url: request.url,
      query: request.query
    }
  });
}