import MTProtoMonitor from '../../functions/mtproto-monitor.js';

// 存储 MTProtoMonitor 实例
let monitorInstance = null;

export default async function startMonitor(request, context) {
    console.log('Start Monitor function called');
    console.log('Request URL:', request.url);
    console.log('Request method:', request.method);
    
    // 解析请求
    const url = new URL(request.url, 'http://localhost');
    const key = url.searchParams.get('key');
    const action = url.searchParams.get('action') || 'start';
    
    // 获取环境变量
    const env = context.env || process.env || {};
    console.log('Env keys:', Object.keys(env));
    
    // 检查认证密钥
    console.log('Key from URL:', key);
    const envKey = env.key || process.env?.key;
    console.log('Expected key:', envKey);
    
    if (key !== envKey) {
        return new Response(JSON.stringify({ code: 401, message: 'Unauthorized' }, null, 2), {
            headers: { 'Content-Type': 'application/json' },
            status: 401
        });
    }
    
    try {
        // 根据 action 参数处理不同操作
        switch (action) {
            case 'start':
                return await handleStartMonitoring(request, context);
            case 'code':
                const phoneCode = url.searchParams.get('code');
                if (!phoneCode) {
                    return new Response(JSON.stringify({ 
                        code: 400, 
                        message: 'Missing code parameter' 
                    }, null, 2), {
                        headers: { 'Content-Type': 'application/json' },
                        status: 400
                    });
                }
                return await handleSubmitCode(phoneCode);
            default:
                return new Response(JSON.stringify({ 
                    code: 400, 
                    message: 'Invalid action parameter. Use "start" or "code"' 
                }, null, 2), {
                    headers: { 'Content-Type': 'application/json' },
                    status: 400
                });
        }
    } catch (error) {
        console.error('Failed to process MTProto monitoring request:', error);
        
        return new Response(JSON.stringify({ 
            code: 500, 
            message: 'Failed to process MTProto monitoring request: ' + error.message,
            error: error.message
        }, null, 2), {
            headers: { 'Content-Type': 'application/json' },
            status: 500
        });
    }
}

async function handleStartMonitoring(request, context) {
    // 获取环境变量
    const env = context.env || process.env || {};
    
    // 检查请求方法
    if (request.method !== 'GET') {
        return new Response(JSON.stringify({ code: 405, message: 'Method Not Allowed' }, null, 2), {
            headers: { 'Content-Type': 'application/json' },
            status: 405
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
        }, null, 2), {
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
        }, null, 2), {
            headers: { 'Content-Type': 'application/json' },
            status: 400
        });
    }
    
    // 解析URL参数
    const url = new URL(request.url, 'http://localhost');
    
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
        }, null, 2), {
            headers: { 'Content-Type': 'application/json' },
            status: 400
        });
    }
    
    if (chatIds.length === 0) {
        return new Response(JSON.stringify({ 
            code: 400, 
            message: 'Chat IDs parameter is required (either in env.MONITOR_CHAT_IDS or query parameter)' 
        }, null, 2), {
            headers: { 'Content-Type': 'application/json' },
            status: 400
        });
    }
    
    try {
        // 创建或重用 MTProto 监控实例
        console.log('Creating or reusing MTProtoMonitor instance');
        if (!monitorInstance) {
            monitorInstance = new MTProtoMonitor({...env, ...process.env});
        }
        
        // 启动监控（在后台运行）
        console.log('Starting monitoring in background');
        // 不等待 startMonitoring 完成，直接返回响应
        monitorInstance.startMonitoring(keywords, chatIds).catch(error => {
            console.error('Background monitoring error:', error);
        });
        
        console.log('Monitoring start request processed');
        return new Response(JSON.stringify({ 
            code: 200, 
            message: 'MTProto monitoring start request received. Authentication may require code submission via bot.',
            keywords: keywords,
            chat_ids: chatIds,
            instructions: 'If authentication is required, you will receive a message via the bot with instructions on how to provide the verification code.'
        }, null, 2), {
            headers: { 'Content-Type': 'application/json' }
        });
        
    } catch (error) {
        console.error('Failed to start MTProto monitoring:', error);
        
        return new Response(JSON.stringify({ 
            code: 500, 
            message: 'Failed to start MTProto monitoring: ' + error.message,
            error: error.message
        }, null, 2), {
            headers: { 'Content-Type': 'application/json' },
            status: 500
        });
    }
}

async function handleSubmitCode(phoneCode) {
    if (!monitorInstance) {
        return new Response(JSON.stringify({ 
            code: 400, 
            message: 'No monitoring instance found. Please start monitoring first.' 
        }, null, 2), {
            headers: { 'Content-Type': 'application/json' },
            status: 400
        });
    }
    
    try {
        console.log('Submitting code:', phoneCode);
        const result = await monitorInstance.submitCode(phoneCode);
        
        if (result) {
            return new Response(JSON.stringify({ 
                code: 200, 
                message: 'Code submitted successfully. Authentication completed.' 
            }, null, 2), {
                headers: { 'Content-Type': 'application/json' }
            });
        } else {
            return new Response(JSON.stringify({ 
                code: 400, 
                message: 'Failed to authenticate with provided code.' 
            }, null, 2), {
                headers: { 'Content-Type': 'application/json' },
                status: 400
            });
        }
    } catch (error) {
        console.error('Failed to submit code:', error);
        
        return new Response(JSON.stringify({ 
            code: 500, 
            message: 'Failed to submit code: ' + error.message,
            error: error.message
        }, null, 2), {
            headers: { 'Content-Type': 'application/json' },
            status: 500
        });
    }
}