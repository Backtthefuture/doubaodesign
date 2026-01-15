// 豆包Demo自动评分脚本
// 运行方式: FEISHU_APP_SECRET=xxx node score-doubao-demos.js [N|all]
// 参数:
//   无参数 - 只处理未评分记录
//   N - 只处理前N条未评分记录
//   all - 强制重新评分所有记录

const fs = require('fs');
const path = require('path');

// 飞书配置
const FEISHU_APP_ID = 'cli_a989e0fcbd7f100c';
const FEISHU_APP_TOKEN = 'PTZxbnALPai6Zys0RNYcp9sznWe';
const DOUBAO_TABLE_ID = 'tblj14LfBtbNpSNR';

// 加载Gemini配置
const geminiConfigPath = path.join(__dirname, 'skills/analyze-demos/config/.gemini.config.json');
let geminiConfig;
try {
    geminiConfig = JSON.parse(fs.readFileSync(geminiConfigPath, 'utf8'));
} catch (e) {
    console.error('错误: 无法读取Gemini配置文件:', geminiConfigPath);
    process.exit(1);
}

// 加载评分提示词
const promptPath = path.join(__dirname, 'skills/score-doubao-demos/prompts/豆包评分标准.md');
let scorePrompt;
try {
    scorePrompt = fs.readFileSync(promptPath, 'utf8');
} catch (e) {
    console.error('错误: 无法读取评分提示词文件:', promptPath);
    process.exit(1);
}

// 获取飞书Access Token
async function getAccessToken() {
    const appSecret = process.env.FEISHU_APP_SECRET;
    if (!appSecret) {
        throw new Error('请设置 FEISHU_APP_SECRET 环境变量');
    }

    const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: FEISHU_APP_ID, app_secret: appSecret })
    });
    const data = await response.json();

    if (data.code !== 0) {
        throw new Error('获取飞书Token失败: ' + data.msg);
    }
    return data.tenant_access_token;
}

// 获取所有豆包Demo记录
async function fetchAllRecords(token) {
    const allRecords = [];
    let pageToken = null;
    let hasMore = true;

    while (hasMore) {
        let url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${FEISHU_APP_TOKEN}/tables/${DOUBAO_TABLE_ID}/records?page_size=100`;
        if (pageToken) {
            url += `&page_token=${pageToken}`;
        }

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.code !== 0) {
            throw new Error('获取记录失败: ' + data.msg);
        }

        const validRecords = (data.data.items || []).filter(
            item => item.fields && item.fields['Demo名称']
        );
        allRecords.push(...validRecords);

        hasMore = data.data.has_more;
        pageToken = data.data.page_token;
    }

    return allRecords;
}

// 调用Gemini API评分
async function scoreWithGemini(demo) {
    const prompt = `
你是一个Demo评分专家。请根据以下Demo信息给出趣味分和实用分。

## Demo信息
- 名称：${demo.name}
- 副标题：${demo.subtitle}
- 使用场景：${demo.scene}
- 操作步骤：${demo.steps}
- 核心展示：${demo.coreDisplay}
- 预期效果：${demo.expectedEffect}

${scorePrompt}
`;

    const response = await fetch(`${geminiConfig.base_url}${geminiConfig.endpoint}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${geminiConfig.api_key}`
        },
        body: JSON.stringify({
            model: 'gemini-2.0-flash',  // 使用flash模型，响应更快
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 512
        })
    });

    const data = await response.json();

    // 调试输出
    if (!data.choices || !data.choices[0]) {
        console.log('\nAPI响应:', JSON.stringify(data).substring(0, 500));
        throw new Error('Gemini API响应异常');
    }

    const resultText = data.choices[0].message.content;

    // 解析JSON响应 - 尝试多种格式
    let parsed;
    try {
        // 尝试直接解析
        const jsonMatch = resultText.match(/\{[\s\S]*?"interesting_score"[\s\S]*?"useful_score"[\s\S]*?\}/);
        if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
        } else {
            // 尝试解析整个响应
            const cleanText = resultText.replace(/```json\n?|\n?```/g, '').trim();
            parsed = JSON.parse(cleanText);
        }
    } catch (e) {
        // 尝试用正则提取数字
        const interestingMatch = resultText.match(/interesting_score["\s:]+(\d+)/i);
        const usefulMatch = resultText.match(/useful_score["\s:]+(\d+)/i);
        if (interestingMatch && usefulMatch) {
            parsed = {
                interesting_score: parseInt(interestingMatch[1]),
                useful_score: parseInt(usefulMatch[1])
            };
        } else {
            throw new Error('无法解析评分结果: ' + resultText.substring(0, 200));
        }
    }

    // 验证并限制分数范围
    return {
        interestingScore: Math.min(50, Math.max(1, parseInt(parsed.interesting_score) || 25)),
        usefulScore: Math.min(50, Math.max(1, parseInt(parsed.useful_score) || 25))
    };
}

// 更新飞书记录
async function updateRecord(token, recordId, interestingScore, usefulScore) {
    const response = await fetch(
        `https://open.feishu.cn/open-apis/bitable/v1/apps/${FEISHU_APP_TOKEN}/tables/${DOUBAO_TABLE_ID}/records/${recordId}`,
        {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fields: {
                    '趣味分': interestingScore,
                    '实用分': usefulScore
                }
            })
        }
    );

    const data = await response.json();
    if (data.code !== 0) {
        throw new Error('更新记录失败: ' + data.msg);
    }
    return true;
}

// 延迟函数
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 主函数
async function main() {
    const args = process.argv.slice(2);
    const forceAll = args.includes('all');
    const limit = !forceAll && args[0] ? parseInt(args[0]) : null;

    console.log('=== 豆包Demo自动评分 ===\n');

    // 获取Token
    console.log('正在获取飞书Token...');
    const token = await getAccessToken();
    console.log('✓ Token获取成功\n');

    // 获取所有记录
    console.log('正在获取豆包Demo记录...');
    const allRecords = await fetchAllRecords(token);
    console.log(`✓ 获取到 ${allRecords.length} 条记录\n`);

    // 筛选需要评分的记录
    let recordsToScore = allRecords;
    if (!forceAll) {
        recordsToScore = allRecords.filter(r => {
            const interesting = r.fields['趣味分'];
            const useful = r.fields['实用分'];
            return !interesting || !useful || interesting === 0 || useful === 0;
        });
    }

    if (limit && limit > 0) {
        recordsToScore = recordsToScore.slice(0, limit);
    }

    if (recordsToScore.length === 0) {
        console.log('✓ 所有记录已评分，无需处理');
        return;
    }

    console.log(`需要评分: ${recordsToScore.length} 条记录\n`);

    // 评分统计
    const results = [];
    let successCount = 0;
    let failCount = 0;

    // 批量评分
    for (let i = 0; i < recordsToScore.length; i++) {
        const record = recordsToScore[i];
        const fields = record.fields;
        const demoName = fields['Demo名称'];

        const demo = {
            name: demoName,
            subtitle: fields['副标题'] || '',
            scene: fields['使用场景'] || '',
            steps: fields['操作步骤'] || '',
            coreDisplay: fields['核心展示'] || '',
            expectedEffect: fields['预期效果'] || ''
        };

        process.stdout.write(`[${i + 1}/${recordsToScore.length}] ${demoName} - 评分中...`);

        try {
            // 调用Gemini评分
            const scores = await scoreWithGemini(demo);

            // 写入飞书
            await updateRecord(token, record.record_id, scores.interestingScore, scores.usefulScore);

            const total = scores.interestingScore + scores.usefulScore;
            console.log(` ✓ 趣味${scores.interestingScore} 实用${scores.usefulScore} 总分${total}`);

            results.push({
                name: demoName,
                interesting: scores.interestingScore,
                useful: scores.usefulScore,
                total: total
            });
            successCount++;

            // 避免API限流
            await sleep(1000);
        } catch (error) {
            console.log(` ✗ 失败: ${error.message}`);
            results.push({
                name: demoName,
                error: error.message
            });
            failCount++;
        }
    }

    // 输出汇总
    console.log('\n=== 评分完成 ===\n');
    console.log('处理统计:');
    console.log(`- 总记录数: ${allRecords.length}`);
    console.log(`- 成功: ${successCount}`);
    console.log(`- 失败: ${failCount}`);
    console.log(`- 跳过（已评分）: ${allRecords.length - recordsToScore.length}`);

    if (successCount > 0) {
        console.log('\n评分结果:');
        console.log('| Demo名称 | 趣味分 | 实用分 | 总分 |');
        console.log('|----------|--------|--------|------|');
        results
            .filter(r => !r.error)
            .sort((a, b) => b.total - a.total)
            .forEach(r => {
                console.log(`| ${r.name.substring(0, 15).padEnd(15)} | ${r.interesting.toString().padStart(6)} | ${r.useful.toString().padStart(6)} | ${r.total.toString().padStart(4)} |`);
            });
    }

    if (failCount > 0) {
        console.log('\n失败记录:');
        results
            .filter(r => r.error)
            .forEach(r => {
                console.log(`- ${r.name}: ${r.error}`);
            });
    }

    console.log('\n所有评分已写入飞书表格。');
}

main().catch(err => {
    console.error('\n执行失败:', err.message);
    process.exit(1);
});
