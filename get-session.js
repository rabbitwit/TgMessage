// get-session.js - 用于获取 Telegram session 字符串的脚本
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';  // 修复导入路径
import input from 'input';

// 请替换为您的实际凭证
const apiId = parseInt('') || 0;  // 替换为您的 API ID
const apiHash = '' || '';      // 替换为您的 API Hash
const phoneNumber = '' || '';      // 替换为您的手机号码

async function getSession() {
    console.log('Available environment variables:');
    console.log('MTPROTO_API_ID:', process.env.MTPROTO_API_ID);
    console.log('MTPROTO_API_HASH:', process.env.MTPROTO_API_HASH);
    console.log('PHONE_NUMBER:', process.env.PHONE_NUMBER);
    
    if (!apiId || !apiHash || !phoneNumber) {
        console.log('请设置以下环境变量:');
        console.log('MTPROTO_API_ID - 您的 Telegram API ID');
        console.log('MTPROTO_API_HASH - 您的 Telegram API Hash');
        console.log('PHONE_NUMBER - 您的手机号码');
        return;
    }

    console.log('API ID:', apiId);
    console.log('API Hash:', apiHash);
    console.log('Phone Number:', phoneNumber);

    // 创建客户端
    const client = new TelegramClient(
        new StringSession(""),  // 空的 session 字符串
        apiId,
        apiHash,
        { connectionRetries: 5 }
    );

    await client.start({
        phoneNumber: async () => phoneNumber,
        password: async () => await input.text('请输入您的两步验证密码: '),
        phoneCode: async () => await input.text('请输入您收到的验证码: '),
        onError: (err) => console.error(err),
    });

    console.log('您已成功登录!');
    console.log('这是您的 session 字符串:');
    const sessionString = client.session.save();
    console.log(sessionString);
    
    // 保存到文件
    const fs = await import('fs');
    fs.writeFileSync('session.txt', sessionString, 'utf8');
    console.log('Session 字符串已保存到 session.txt 文件中');
    
    await client.destroy();
}

getSession();