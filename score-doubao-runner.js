const https = require('https');
const fs = require('fs');

// 读取配置
const feishuConfig = JSON.parse(fs.readFileSync('.feishu.config.json', 'utf8'));
const geminiConfig = JSON.parse(fs.readFileSync('skills/analyze-demos/config/.gemini.config.json', 'utf8'));
const DOUBAO_TABLE_ID = 'tblyEaRH1YpwAPxQ';

// 读取评分标准
const scorePromptTemplate = fs.readFileSync('skills/score-doubao-demos/prompts/豆包评分标准.md', 'utf8');

console.log('脚本已启动');
console.log('配置加载完成');
console.log(`模型: ${geminiConfig.model_id}`);
console.log(`API: ${geminiConfig.base_url}${geminiConfig.endpoint}`);

// 构建评分提示词
function buildScorePrompt(demoInfo) {
    return `${scorePromptTemplate}

---

## 待评分Demo

${demoInfo}

请根据以上评分标准，给出差异化的评分。直接输出JSON，不要解释：`;
}

// Token管理器
class TokenManager {
    constructor() {
        this.token = null;
        this.tokenExpireTime = 0;
    }

    async getToken() {
        const now = Date.now();
        if (!this.token || now >= this.tokenExpireTime - 5 * 60 * 1000) {
            await this.refreshToken();
        }
        return this.token;
    }

    async refreshToken() {
        console.log('  [Token] 刷新飞书Token...');
        this.token = await this._fetchNewToken();
        this.tokenExpireTime = Date.now() + 2 * 60 * 60 * 1000;
        console.log(`  [Token] 刷新成功，有效期至: ${new Date(this.tokenExpireTime).toLocaleTimeString()}`);
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
                    const result = JSON.parse(body);
                    result.code === 0 ? resolve(result.tenant_access_token) : reject(new Error(result.msg));
                });
            });
            req.on('error', reject);
            req.write(data);
            req.end();
        });
    }
}

const tokenManager = new TokenManager();

// 调用Gemini API
async function callGemini(prompt) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            model: geminiConfig.model_id,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 2048
        });

        const urlParts = new URL(geminiConfig.base_url + geminiConfig.endpoint);
        const req = https.request({
            hostname: urlParts.hostname,
            path: urlParts.pathname,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${geminiConfig.api_key}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        }, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(body);
                    if (result.choices && result.choices[0]) {
                        const msg = result.choices[0].message;
                        // 优先使用content，如果为空则尝试从reasoning_content提取
                        let content = msg.content || '';
                        if (!content && msg.reasoning_content) {
                            content = msg.reasoning_content;
                        }
                        resolve(content);
                    } else {
                        reject(new Error('无效响应'));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(60000, () => reject(new Error('超时')));
        req.write(data);
        req.end();
    });
}

// 解析评分JSON - 支持多种格式
function parseScoreJson(text) {
    if (!text) return { interesting_score: 25, useful_score: 25 };

    try {
        // 先清理markdown代码块
        const cleanText = text.replace(/```json\n?|\n?```/g, '').trim();

        // 尝试匹配JSON格式
        const jsonMatches = cleanText.match(/\{"interesting_score"\s*:\s*(\d+)\s*,\s*"useful_score"\s*:\s*(\d+)\s*\}/);
        if (jsonMatches) {
            return {
                interesting_score: Math.min(50, Math.max(1, parseInt(jsonMatches[1]))),
                useful_score: Math.min(50, Math.max(1, parseInt(jsonMatches[2])))
            };
        }

        // 尝试匹配任意JSON对象
        const jsonMatch = text.match(/\{[^{}]*"interesting_score"[^{}]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                interesting_score: Math.min(50, Math.max(1, parseInt(parsed.interesting_score) || 25)),
                useful_score: Math.min(50, Math.max(1, parseInt(parsed.useful_score) || 25))
            };
        }

        // 尝试从文本中提取数字（趣味XX，实用XX格式）
        const interestMatch = text.match(/趣味[：:]\s*(\d+)/);
        const usefulMatch = text.match(/实用[：:]\s*(\d+)/);
        if (interestMatch && usefulMatch) {
            return {
                interesting_score: Math.min(50, Math.max(1, parseInt(interestMatch[1]))),
                useful_score: Math.min(50, Math.max(1, parseInt(usefulMatch[1])))
            };
        }

        // 最后尝试提取任意两个连续数字
        const numbers = text.match(/\b(\d{1,2})\b/g);
        if (numbers && numbers.length >= 2) {
            const filtered = numbers.filter(n => parseInt(n) >= 1 && parseInt(n) <= 50);
            if (filtered.length >= 2) {
                return {
                    interesting_score: parseInt(filtered[0]),
                    useful_score: parseInt(filtered[1])
                };
            }
        }
    } catch (e) {}

    return { interesting_score: 25, useful_score: 25 };
}

// 获取所有记录
async function getAllRecords(token) {
    let allRecords = [];
    let pageToken = null;

    console.log('正在获取所有记录（分页加载）...');
    do {
        const records = await new Promise((resolve, reject) => {
            let path = `/open-apis/bitable/v1/apps/${feishuConfig.app_token}/tables/${DOUBAO_TABLE_ID}/records?page_size=100`;
            if (pageToken) path += `&page_token=${pageToken}`;

            const req = https.request({
                hostname: 'open.feishu.cn',
                path,
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            }, res => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    const result = JSON.parse(body);
                    result.code === 0 ? resolve(result.data) : reject(new Error(result.msg));
                });
            });
            req.on('error', reject);
            req.end();
        });

        allRecords = allRecords.concat(records.items || []);
        pageToken = records.page_token;
        console.log(`  分页 ${Math.ceil(allRecords.length / 100)}: 获取 ${records.items?.length || 0} 条，累计 ${allRecords.length} 条`);
    } while (pageToken);

    return allRecords;
}

// 更新记录
async function updateRecord(token, recordId, fields) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({ fields });
        const req = https.request({
            hostname: 'open.feishu.cn',
            path: `/open-apis/bitable/v1/apps/${feishuConfig.app_token}/tables/${DOUBAO_TABLE_ID}/records/${recordId}`,
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
                const result = JSON.parse(body);
                result.code === 0 ? resolve(result) : reject(new Error(result.msg));
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

// 主函数
async function main() {
    // 检查命令行参数
    const forceAll = process.argv.includes('--all') || process.argv.includes('all');

    console.log('\n========== 豆包Demo评分开始 ==========\n');
    if (forceAll) console.log('模式: 强制重新评分所有记录\n');

    const token = await tokenManager.getToken();
    console.log('飞书Token获取成功');

    const allRecords = await getAllRecords(token);
    console.log(`\n共获取到 ${allRecords.length} 条记录`);

    // 筛选需要评分的记录
    let recordsToScore;
    if (forceAll) {
        recordsToScore = allRecords;
    } else {
        recordsToScore = allRecords.filter(r => {
            const f = r.fields;
            return !f['趣味分'] || !f['实用分'] || f['趣味分'] === 0 || f['实用分'] === 0;
        });
    }

    const scored = allRecords.length - recordsToScore.length;
    console.log(`待处理: ${recordsToScore.length} 条, 已评分: ${scored} 条`);

    if (recordsToScore.length === 0) {
        console.log('\n所有记录已评分，无需处理');
        return;
    }

    let successCount = 0;
    let failCount = 0;
    const failedRecords = [];
    const results = [];

    for (let i = 0; i < recordsToScore.length; i++) {
        const record = recordsToScore[i];
        const fields = record.fields;
        const name = fields['Demo名称'] || '未命名';

        console.log(`\n[${i + 1}/${recordsToScore.length}] 处理: ${name}`);

        try {
            // 构建Demo信息
            const demoInfo = `- 名称: ${name}
- 副标题: ${fields['副标题'] || ''}
- 使用场景: ${fields['使用场景'] || ''}
- 操作步骤: ${fields['操作步骤'] || ''}
- 核心展示: ${fields['核心展示'] || ''}
- 预期效果: ${fields['预期效果'] || ''}
- 能力分类: ${fields['能力分类'] || ''}`;

            // 调用Gemini评分
            console.log('  → 调用Gemini评分...');
            const prompt = buildScorePrompt(demoInfo);
            const response = await callGemini(prompt);
            const scores = parseScoreJson(response);
            console.log(`    评分: 趣味 ${scores.interesting_score} 实用 ${scores.useful_score}`);

            // 写入飞书
            console.log('  → 写入飞书...');
            const currentToken = await tokenManager.getToken();
            await updateRecord(currentToken, record.record_id, {
                '趣味分': scores.interesting_score,
                '实用分': scores.useful_score
            });
            console.log('  ✓ 完成');

            successCount++;
            results.push({
                name,
                interesting: scores.interesting_score,
                useful: scores.useful_score,
                total: scores.interesting_score + scores.useful_score
            });

            // 避免API限流
            await new Promise(r => setTimeout(r, 1000));

        } catch (e) {
            console.log(`  ✗ 失败: ${e.message}`);
            failCount++;
            failedRecords.push({ name, error: e.message });
        }
    }

    // 输出统计
    console.log('\n========== 豆包Demo评分完成 ==========\n');
    console.log('处理统计:');
    console.log(`- 总记录数: ${allRecords.length}`);
    console.log(`- 成功: ${successCount}`);
    console.log(`- 失败: ${failCount}`);
    console.log(`- 跳过（已评分）: ${scored}`);

    if (results.length > 0) {
        console.log('\n评分结果:');
        console.log('| Demo名称 | 趣味分 | 实用分 | 总分 |');
        console.log('|----------|--------|--------|------|');
        results.forEach(r => {
            console.log(`| ${r.name.substring(0, 12).padEnd(12)} | ${String(r.interesting).padStart(6)} | ${String(r.useful).padStart(6)} | ${String(r.total).padStart(4)} |`);
        });
    }

    if (failedRecords.length > 0) {
        console.log('\n失败记录:');
        failedRecords.forEach(r => console.log(`- ${r.name}: ${r.error}`));
    }
}

main().catch(e => console.error('执行错误:', e.message));
