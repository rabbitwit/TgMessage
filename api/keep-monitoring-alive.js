import GramjsMonitor from '../functions/gramjs-monitor.js';

// 存储 GramjsMonitor 实例
let monitorInstance = null;

export default async function keepMonitoringAlive(request, context) {
    console.log('Keep monitoring alive function called');
    
    // 只有在GET请求时才执行
    if (request.method !== 'GET') {
        return new Response(JSON.stringify({ 
            code: 405, 
            message: 'Method Not Allowed' 
        }, null, 2), {
            headers: { 'Content-Type': 'application/json' },
            status: 405
        });
    }
    
    // 获取环境变量
    const env = context.env || process.env || {};
    
    try {
        // 检查必要的 MTProto 环境变量
        const MTPROTO_API_ID = env.MTPROTO_API_ID || process.env?.MTPROTO_API_ID;
        const MTPROTO_API_HASH = env.MTPROTO_API_HASH || process.env?.MTPROTO_API_HASH;
        const PHONE_NUMBER = env.PHONE_NUMBER || process.env?.PHONE_NUMBER;
        
        if (!MTPROTO_API_ID || !MTPROTO_API_HASH || !PHONE_NUMBER) {
            return new Response(JSON.stringify({ 
                code: 400, 
                message: 'Missing required environment variables: MTPROTO_API_ID, MTPROTO_API_HASH, or PHONE_NUMBER' 
            }, null, 2), {
                headers: { 'Content-Type': 'application/json' },
                status: 400
            });
        }
        
        // 获取监控参数
        const monitorKeywords = env.MONITOR_KEYWORDS || process.env?.MONITOR_KEYWORDS;
        const monitorChatIds = env.MONITOR_CHAT_IDS || process.env?.MONITOR_CHAT_IDS;
        
        if (!monitorKeywords || !monitorChatIds) {
            return new Response(JSON.stringify({ 
                code: 400, 
                message: 'Missing required environment variables: MONITOR_KEYWORDS or MONITOR_CHAT_IDS' 
            }, null, 2), {
                headers: { 'Content-Type': 'application/json' },
                status: 400
            });
        }
        
        // 解析参数
        const keywords = monitorKeywords.split(',');
        const chatIds = monitorChatIds.split(',').map(id => parseInt(id));
        
        // 创建或重用 GramjsMonitor 实例
        console.log('Creating or reusing GramjsMonitor instance');
        if (!monitorInstance) {
            console.log('Creating new GramjsMonitor instance');
            monitorInstance = new GramjsMonitor({...env, ...process.env});
        }
        
        // 检查是否已经连接
        let isConnected = false;
        try {
            if (monitorInstance.client && monitorInstance.client.connected) {
                // 尝试发送一个简单请求来检查连接是否仍然有效
                await monitorInstance.client.getMe();
                isConnected = true;
                console.log('Already connected to Telegram');
            }
        } catch (error) {
            console.log('Connection check failed, will reconnect:', error.message);
            isConnected = false;
        }
        
        if (!isConnected) {
            console.log('Starting or restarting monitoring');
            // 启动监控
            await monitorInstance.startMonitoring(keywords, chatIds);
        } else {
            console.log('Monitoring is already active');
        }
        
        return new Response(JSON.stringify({ 
            code: 200, 
            message: 'Monitoring is active',
            connected: isConnected,
            timestamp: new Date().toISOString()
        }, null, 2), {
            headers: { 'Content-Type': 'application/json' }
        });
        
    } catch (error) {
        console.error('Failed to keep monitoring alive:', error);
        
        return new Response(JSON.stringify({ 
            code: 500, 
            message: 'Failed to keep monitoring alive: ' + error.message,
            error: error.message
        }, null, 2), {
            headers: { 'Content-Type': 'application/json' },
            status: 500
        });
    }
}