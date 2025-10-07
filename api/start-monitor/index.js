import MTProtoMonitor from '../../functions/mtproto-monitor.js';

export default async function startMonitor(request, env) {
    // 检查认证密钥
    const url = new URL(request.url);
    const key = url.searchParams.get('key');
    
    if (key !== env.key) {
        return new Response(JSON.stringify({ code: 401, message: 'Unauthorized' }), {
            headers: { 'Content-Type': 'application/json' },
            status: 401
        });
    }
    
    // 检查必要的 MTProto 环境变量
    if (!env.MTPROTO_API_ID || !env.MTPROTO_API_HASH) {
        return new Response(JSON.stringify({ 
            code: 400, 
            message: 'Missing MTPROTO_API_ID or MTPROTO_API_HASH in environment variables' 
        }), {
            headers: { 'Content-Type': 'application/json' },
            status: 400
        });
    }
    
    try {
        // 获取参数（优先从环境变量获取，其次从查询参数获取）
        let keywords = [];
        if (env.MONITOR_KEYWORDS) {
            keywords = env.MONITOR_KEYWORDS.split(',');
        } else {
            const keywordsParam = url.searchParams.get('keywords');
            if (keywordsParam) {
                keywords = keywordsParam.split(',');
            }
        }
        
        let chatIds = [];
        if (env.MONITOR_CHAT_IDS) {
            chatIds = env.MONITOR_CHAT_IDS.split(',').map(id => parseInt(id));
        } else {
            const chatIdsParam = url.searchParams.get('chat_ids');
            if (chatIdsParam) {
                chatIds = chatIdsParam.split(',').map(id => parseInt(id));
            }
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
        const monitor = new MTProtoMonitor(env);
        
        // 开始监控
        await monitor.startMonitoring(keywords, chatIds);
        
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