import fetch from 'node-fetch';

// 使用您的实际群组 ID 之一
const CHAT_ID = -1003111490132; // 请替换为您的实际群组 ID

async function sendTestUpdate() {
    try {
        const testUpdate = {
            "update_id": 123456,
            "message": {
                "message_id": 123,
                "from": {
                    "id": 123456789,
                    "first_name": "Test",
                    "username": "testuser",
                    "is_bot": false
                },
                "chat": {
                    "id": CHAT_ID,
                    "title": "Test Group",
                    "type": "supergroup"
                },
                "date": Math.floor(Date.now() / 1000),
                "text": "这是一个抽奖活动测试消息"
            }
        };

        console.log('Sending test update to Telegram webhook...');
        console.log('Update data:', JSON.stringify(testUpdate, null, 2));

        const response = await fetch('https://tg-message-tau.vercel.app/api/telegram-webhook', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(testUpdate)
        });

        console.log('Response Status:', response.status);
        console.log('Response Headers:', response.headers.raw());
        
        const responseBody = await response.text();
        console.log('Response Body:', responseBody);
        
    } catch (error) {
        console.error('Error sending test update:', error);
    }
}

sendTestUpdate();