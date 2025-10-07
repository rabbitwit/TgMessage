import MTProtoMonitor from '../../functions/mtproto-monitor.js';

export default async function startMonitor(request, context) {
    console.log('Start Monitor function called');
    console.log('Request URL:', request.url);
    console.log('Request method:', request.method);
    
    // 检查请求方法
    if (request.method !== 'GET') {
        return new Response(JSON.stringify({ code: 405, message: 'Method Not Allowed' }), {
            headers: { 'Content-Type': 'application/json' },
            status: 405
        });
    }
    
    // 获取环境变量
    const env = context.env || process.env || {};
    console.log('Env keys:', Object.keys(env));
    
    // 检查认证密钥
    const url = new URL(request.url, 'http://localhost');
    const key = url.searchParams.get('key');
    
    console.log('Key from URL:', key);
    const envKey = env.key || process.env?.key;
    console.log('Expected key:', envKey);
    
    if (key !== envKey) {
        return new Response(JSON.stringify({ code: 401, message: 'Unauthorized' }), {
            headers: { 'Content-Type': 'application/json' },
            status: 401
        });
    }
    
    // 检查必要的 MTProto 环境变量
    const MTPROTO_API_ID = env.MTPROTO_API_ID || process.env?.MTPROTO_API_ID;
    const MTPROTO_API_HASH = env.MTPROTO_API_HASH || process.env?.MTPROTO_API_HASH;
    
    console.log('MTPROTO_API_ID exists:', !!MTPROTO_API_ID);
    console.log('MTPROTO_API_HASH exists:', !!MTPROTO_API_HASH);
    
    if (!MTPROTO_API_ID || !MTPROTO_API_HASH) {
        return new Response(JSON.stringify({ 
            code: 400, 
            message: 'Missing MTPROTO_API_ID or MTPROTO_API_HASH in environment variables' 
        }), {
            headers: { 'Content-Type': 'application/json' },
            status: 400
        });
    }
    
    // 检查手机号码（必须提供）
    const PHONE_NUMBER = env.PHONE_NUMBER || process.env?.PHONE_NUMBER;
    if (!PHONE_NUMBER) {
        return new Response(JSON.stringify({ 
            code: 400, 
            message: 'Missing PHONE_NUMBER in environment variables. You need to provide your phone number to log into your Telegram account.' 
        }), {
            headers: { 'Content-Type': 'application/json' },
            status: 400
        });
    }
    
    try {
        // 获取参数（优先从环境变量获取，其次从查询参数获取）
        let keywords = [];
        const monitorKeywords = env.MONITOR_KEYWORDS || process.env?.MONITOR_KEYWORDS;
        const keywordsParam = url.searchParams.get('keywords');
        
        if (monitorKeywords) {
            keywords = monitorKeywords.split(',');
            console.log('Keywords from env:', keywords);
        } else if (keywordsParam) {
            keywords = keywordsParam.split(',');
            console.log('Keywords from URL:', keywords);
        }
        
        let chatIds = [];
        const monitorChatIds = env.MONITOR_CHAT_IDS || process.env?.MONITOR_CHAT_IDS;
        const chatIdsParam = url.searchParams.get('chat_ids');
        
        if (monitorChatIds) {
            chatIds = monitorChatIds.split(',').map(id => {
                const parsed = parseInt(id);
                console.log(`Parsing chat ID: ${id} -> ${parsed}`);
                return parsed;
            });
            console.log('Chat IDs from env:', chatIds);
        } else if (chatIdsParam) {
            chatIds = chatIdsParam.split(',').map(id => {
                const parsed = parseInt(id);
                console.log(`Parsing chat ID: ${id} -> ${parsed}`);
                return parsed;
            });
            console.log('Chat IDs from URL:', chatIds);
        }
        
        // 检查参数
        if (keywords.length === 0) {
            return new Response(JSON.stringify({ 
                code: 400, 
                message: 'Keywords parameter is required (either in env.MONITOR_KEYWORDS or query parameter)' 
            }), {
                headers: { 'Content-Type': 'application/json' },
                status: 400
            });
        }
        
        if (chatIds.length === 0) {
            return new Response(JSON.stringify({ 
                code: 400, 
                message: 'Chat IDs parameter is required (either in env.MONITOR_CHAT_IDS or query parameter)' 
            }), {
                headers: { 'Content-Type': 'application/json' },
                status: 400
            });
        }
        
        // 创建 MTProto 监控实例
        console.log('Creating MTProtoMonitor instance');
        const monitor = new MTProtoMonitor({...env, ...process.env});
        
        // 开始监控
        console.log('Starting monitoring');
        await monitor.startMonitoring(keywords, chatIds);
        
        console.log('Monitoring started successfully');
        // 注意：这里我们不立即返回响应，因为监控需要持续运行
        // 但在无服务器环境中，函数会在处理完后终止
        return new Response(JSON.stringify({ 
            code: 200, 
            message: 'MTProto monitoring started successfully',
            keywords: keywords,
            chat_ids: chatIds
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
        
    } catch (error) {
        console.error('Failed to start MTProto monitoring:', error);
        
        return new Response(JSON.stringify({ 
            code: 500, 
            message: 'Failed to start MTProto monitoring: ' + error.message,
            error: error.message
        }), {
            headers: { 'Content-Type': 'application/json' },
            status: 500
        });
    }
}