const https = require('https');
const fs = require('fs');

// 读取配置
const feishuConfig = JSON.parse(fs.readFileSync('.feishu.config.json', 'utf8'));
const geminiConfig = JSON.parse(fs.readFileSync('skills/analyze-demos/config/.gemini.config.json', 'utf8'));

// 读取提示词
const scenePrompt = fs.readFileSync('skills/analyze-demos/prompts/场景分类.md', 'utf8');
const abilityPrompt = fs.readFileSync('skills/analyze-demos/prompts/能力识别.md', 'utf8');
const creativePrompt = fs.readFileSync('skills/analyze-demos/prompts/创意生成_完整版.md', 'utf8');
const scorePrompt = fs.readFileSync('skills/analyze-demos/prompts/评分标准.md', 'utf8');
const painPointPrompt = fs.readFileSync('skills/analyze-demos/prompts/痛点分析.md', 'utf8');
const abilityLeapPrompt = fs.readFileSync('skills/analyze-demos/prompts/能力跃迁.md', 'utf8');

console.log('配置加载完成');
console.log('模型:', geminiConfig.model_id);
console.log('API:', geminiConfig.base_url + geminiConfig.endpoint);

// ============ Token 管理器（解决2小时过期问题）============
class TokenManager {
    constructor() {
        this.token = null;
        this.tokenExpireTime = 0;
        this.TOKEN_REFRESH_BUFFER = 5 * 60 * 1000; // 提前5分钟刷新
        this.TOKEN_VALIDITY = 2 * 60 * 60 * 1000; // 2小时有效期
    }

    async getToken() {
        const now = Date.now();
        // 如果Token不存在或即将过期，刷新Token
        if (!this.token || now >= this.tokenExpireTime - this.TOKEN_REFRESH_BUFFER) {
            await this.refreshToken();
        }
        return this.token;
    }

    async refreshToken() {
        console.log('  [Token] 刷新飞书Token...');
        this.token = await this._fetchNewToken();
        this.tokenExpireTime = Date.now() + this.TOKEN_VALIDITY;
        console.log('  [Token] 刷新成功，有效期至:', new Date(this.tokenExpireTime).toLocaleTimeString());
    }

    async _fetchNewToken() {
        return new Promise((resolve, reject) => {
            const data = JSON.stringify({
                app_id: feishuConfig.app_id,
                app_secret: feishuConfig.app_secret
            });
            const req = https.request({
                hostname: 'open.feishu.cn',
                path: '/open-apis/auth/v3/tenant_access_token/internal',
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
            }, res => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    try {
                        const result = JSON.parse(body);
                        result.code === 0 ? resolve(result.tenant_access_token) : reject(new Error(result.msg));
                    } catch (e) {
                        reject(e);
                    }
                });
            });
            req.on('error', reject);
            req.write(data);
            req.end();
        });
    }

    // 检测Token过期错误并自动重试
    isTokenExpiredError(error) {
        const msg = error.message || '';
        return msg.includes('Invalid access token') ||
               msg.includes('token expired') ||
               msg.includes('access_token is expired');
    }
}

const tokenManager = new TokenManager();

// 获取记录（支持分页，获取全部数据）
async function getAllRecords() {
    const token = await tokenManager.getToken();
    let allRecords = [];
    let pageToken = null;
    let pageNum = 1;

    do {
        const records = await new Promise((resolve, reject) => {
            let path = `/open-apis/bitable/v1/apps/${feishuConfig.app_token}/tables/${feishuConfig.table_id}/records?page_size=500`;
            if (pageToken) {
                path += `&page_token=${pageToken}`;
            }

            const req = https.request({
                hostname: 'open.feishu.cn',
                path: path,
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            }, res => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    try {
                        const result = JSON.parse(body);
                        if (result.code === 0) {
                            resolve({
                                items: result.data.items || [],
                                pageToken: result.data.page_token,
                                hasMore: result.data.has_more
                            });
                        } else {
                            reject(new Error(result.msg));
                        }
                    } catch (e) {
                        reject(e);
                    }
                });
            });
            req.on('error', reject);
            req.end();
        });

        allRecords = allRecords.concat(records.items);
        pageToken = records.pageToken;
        console.log(`  分页 ${pageNum}: 获取 ${records.items.length} 条，累计 ${allRecords.length} 条`);
        pageNum++;

        if (records.hasMore && pageToken) {
            await sleep(500); // 分页间隔
        } else {
            break;
        }
    } while (true);

    return allRecords;
}

// 调用 Gemini API
function callGemini(prompt) {
    return new Promise((resolve, reject) => {
        const url = new URL(geminiConfig.base_url + geminiConfig.endpoint);
        const data = JSON.stringify({
            model: geminiConfig.model_id,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 2048
        });

        const req = https.request({
            hostname: url.hostname,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${geminiConfig.api_key}`,
                'Content-Length': Buffer.byteLength(data)
            }
        }, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(body);
                    if (result.choices && result.choices[0]) {
                        resolve(result.choices[0].message.content);
                    } else {
                        reject(new Error('API响应异常: ' + JSON.stringify(result).substring(0, 200)));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(120000, () => {
            req.destroy();
            reject(new Error('请求超时'));
        });
        req.write(data);
        req.end();
    });
}

// 更新飞书记录（带Token自动刷新）
async function updateRecord(recordId, fields, retryCount = 0) {
    const token = await tokenManager.getToken();

    try {
        return await new Promise((resolve, reject) => {
            const data = JSON.stringify({ fields });
            const req = https.request({
                hostname: 'open.feishu.cn',
                path: `/open-apis/bitable/v1/apps/${feishuConfig.app_token}/tables/${feishuConfig.table_id}/records/${recordId}`,
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data)
                }
            }, res => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    try {
                        const result = JSON.parse(body);
                        if (result.code === 0) {
                            resolve(result);
                        } else {
                            reject(new Error(result.msg));
                        }
                    } catch (e) {
                        reject(e);
                    }
                });
            });
            req.on('error', reject);
            req.write(data);
            req.end();
        });
    } catch (error) {
        // 如果是Token过期错误，刷新Token后重试
        if (tokenManager.isTokenExpiredError(error) && retryCount < 2) {
            console.log('  [Token] 检测到过期，正在刷新...');
            await tokenManager.refreshToken();
            return updateRecord(recordId, fields, retryCount + 1);
        }
        throw error;
    }
}

// 延迟函数
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// 带重试的 Gemini 调用
async function callGeminiWithRetry(prompt, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await callGemini(prompt);
        } catch (e) {
            console.log(`  [重试 ${i + 1}/${maxRetries}] ${e.message}`);
            if (i < maxRetries - 1) await sleep(2000);
        }
    }
    throw new Error('Gemini API 调用失败');
}

// 有效场景列表
const VALID_SCENES = [
    '一句话生成App', '一句话做网站', '一句话造游戏', '一句话出3D',
    '一句话写系统', '一句话搞特效', '图生万物', '视频秒懂',
    '文档秒读', 'AI替你干活', '一句话出图', '一句话做PPT',
    '一句话做表格', '写作助手', 'AI当老师', 'AI陪聊',
    '视觉考AI', '奇葩挑战'
];

// 场景映射
const SCENE_MAPPING = {
    '看图知一切': '图生万物',
    '图片理解': '图生万物',
    '视频理解': '视频秒懂',
    '文档处理': '文档秒读',
    'Agent': 'AI替你干活',
    '代码生成': '一句话生成App'
};

// 验证并修正场景
function validateScene(scene) {
    if (!scene) return '一句话生成App';
    scene = scene.trim();
    if (VALID_SCENES.includes(scene)) return scene;
    if (SCENE_MAPPING[scene]) return SCENE_MAPPING[scene];
    for (const valid of VALID_SCENES) {
        if (scene.includes(valid) || valid.includes(scene)) return valid;
    }
    return '一句话生成App';
}

// 解析JSON，支持多种格式
function parseJSON(text, defaultValue = {}) {
    try {
        // 尝试提取JSON块
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        // 尝试直接解析
        return JSON.parse(text.trim());
    } catch (e) {
        return defaultValue;
    }
}

// 解析数组
function parseArray(text, defaultValue = []) {
    try {
        const arrayMatch = text.match(/\[[\s\S]*?\]/);
        if (arrayMatch) {
            return JSON.parse(arrayMatch[0]);
        }
        return defaultValue;
    } catch (e) {
        return defaultValue;
    }
}

// 处理单条记录
async function processRecord(record, index, total) {
    const f = record.fields;
    const name = f['Demo名称'] || '未命名';
    const prompt = f['Prompt描述'] || '';

    console.log(`\n[${index + 1}/${total}] 处理: ${name}`);

    const result = {
        scene: null,
        abilities: null,
        title: null,
        description: null,
        tags: null,
        examplePrompt: null,
        steps: null,
        interestingScore: null,
        usefulScore: null,
        painPoint: null,
        abilityLeap: null
    };

    try {
        // 1. 场景分类
        console.log('  → 场景分类...');
        const sceneResult = await callGeminiWithRetry(scenePrompt + '\n\n输入: ' + prompt);
        result.scene = validateScene(sceneResult.trim());
        console.log('    场景:', result.scene);

        // 2. 能力识别
        console.log('  → 能力识别...');
        const abilityResult = await callGeminiWithRetry(abilityPrompt + '\n\n输入: ' + prompt);
        result.abilities = parseArray(abilityResult, ['代码狂魔']);
        console.log('    能力:', result.abilities.join(', '));

        // 3. 创意生成（完整版：标题+描述+标签+示例Prompt+实现步骤）
        console.log('  → 创意生成（完整版）...');
        const creativeResult = await callGeminiWithRetry(creativePrompt + '\n\n输入: ' + prompt);
        const creative = parseJSON(creativeResult, {});

        result.title = creative.title || name;
        result.description = creative.description || prompt;
        result.tags = creative.tags || '';
        result.examplePrompt = creative.example_prompt || '';

        // 处理steps：可能是数组或字符串
        if (Array.isArray(creative.steps)) {
            result.steps = creative.steps.join('\n');
        } else if (typeof creative.steps === 'string') {
            result.steps = creative.steps;
        } else {
            result.steps = '';
        }

        console.log('    标题:', result.title);
        console.log('    示例Prompt:', result.examplePrompt ? '✓' : '✗');
        console.log('    实现步骤:', result.steps ? '✓' : '✗');

        // 4. 评分（基于豆包创意标题和描述）
        console.log('  → 评分...');
        const scoreInput = `- 豆包创意标题：${result.title}\n- 豆包创意描述：${result.description}`;
        const scoreResult = await callGeminiWithRetry(scorePrompt + '\n\n输入:\n' + scoreInput);
        const scores = parseJSON(scoreResult, {});
        result.interestingScore = Math.min(50, Math.max(1, parseInt(scores.interesting_score) || 25));
        result.usefulScore = Math.min(50, Math.max(1, parseInt(scores.useful_score) || 25));
        console.log('    评分: 趣味', result.interestingScore, '实用', result.usefulScore);

        // 5. 痛点分析（基于场景和Prompt描述）
        console.log('  → 痛点分析...');
        const painPointInput = `输入场景：${result.scene}\n输入描述：${prompt}`;
        const painPointResult = await callGeminiWithRetry(painPointPrompt + '\n\n' + painPointInput);
        result.painPoint = painPointResult.trim() || '传统方式需要大量时间和专业技能，效率低且容易出错。';
        console.log('    痛点:', result.painPoint.substring(0, 30) + '...');

        // 6. 能力跃迁（基于能力标签和Prompt描述）
        console.log('  → 能力跃迁...');
        const abilityLeapInput = `输入能力：${JSON.stringify(result.abilities)}\n输入描述：${prompt}`;
        const abilityLeapResult = await callGeminiWithRetry(abilityLeapPrompt + '\n\n' + abilityLeapInput);
        result.abilityLeap = abilityLeapResult.trim() || '1.8凭借原生多模态和增强的Agent能力，可以更高效地完成此类任务。';
        console.log('    跃迁:', result.abilityLeap.substring(0, 30) + '...');

        // 7. 写入飞书（使用带Token刷新的版本）
        console.log('  → 写入飞书...');
        await updateRecord(record.record_id, {
            '所属场景': result.scene,
            '模型能力': result.abilities,
            '豆包创意标题': result.title,
            '豆包创意描述': result.description,
            '豆包标签': result.tags,
            '示例Prompt': result.examplePrompt,
            '实现步骤': result.steps,
            '趣味分': result.interestingScore,
            '实用分': result.usefulScore,
            '用户痛点': result.painPoint,
            '能力跃迁': result.abilityLeap
        });
        console.log('  ✓ 完成');

        return { success: true, name };
    } catch (e) {
        console.log('  ✗ 失败:', e.message);
        return { success: false, name, error: e.message };
    }
}

async function main() {
    console.log('\n========== Demo 分析开始 ==========\n');

    // 读取命令行参数：限制处理数量
    const limitCount = process.argv[2] ? parseInt(process.argv[2]) : null;
    if (limitCount) {
        console.log(`限制处理数量: ${limitCount} 条\n`);
    }

    // 初始化Token
    await tokenManager.getToken();
    console.log('飞书Token获取成功');

    console.log('正在获取所有记录（分页加载）...');
    const records = await getAllRecords();
    console.log(`\n共获取到 ${records.length} 条记录`);

    // 筛选未完成记录（增加用户痛点和能力跃迁的检查）
    let incomplete = records.filter(r => {
        const f = r.fields;
        return !f['所属场景'] ||
               !f['模型能力'] || f['模型能力'].length === 0 ||
               !f['豆包创意标题'] ||
               !f['豆包创意描述'] ||
               !f['示例Prompt'] ||
               !f['实现步骤'] ||
               !f['趣味分'] ||
               !f['实用分'] ||
               !f['用户痛点'] ||
               !f['能力跃迁'];
    });

    const completed = records.length - incomplete.length;
    console.log(`未完成: ${incomplete.length} 条, 已完成: ${completed} 条`);

    if (incomplete.length === 0) {
        console.log('\n所有记录已完成，无需处理');
        return;
    }

    // 如果指定了限制数量，则只取前N条
    if (limitCount && incomplete.length > limitCount) {
        console.log(`只处理前 ${limitCount} 条未完成记录`);
        incomplete = incomplete.slice(0, limitCount);
    }

    // 处理每条记录
    const results = [];
    for (let i = 0; i < incomplete.length; i++) {
        const result = await processRecord(incomplete[i], i, incomplete.length);
        results.push(result);
        // 每条记录间隔1秒，避免API限流
        if (i < incomplete.length - 1) await sleep(1000);
    }

    // 统计结果
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log('\n========== Demo 分析完成 ==========');
    console.log('\n处理统计:');
    console.log(`- 总记录数: ${records.length}`);
    console.log(`- 成功: ${successCount}`);
    console.log(`- 失败: ${failCount}`);
    console.log(`- 跳过（已完成）: ${completed}`);

    if (failCount > 0) {
        console.log('\n失败记录:');
        results.filter(r => !r.success).forEach(r => {
            console.log(`- ${r.name}: ${r.error}`);
        });
    }
}

main().catch(e => console.error('执行错误:', e.message));
