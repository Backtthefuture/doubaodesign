const https = require('https');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('.feishu.config.json', 'utf8'));

// 获取 Token
function getToken() {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            app_id: config.app_id,
            app_secret: config.app_secret
        });
        const req = https.request({
            hostname: 'open.feishu.cn',
            path: '/open-apis/auth/v3/tenant_access_token/internal',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                const result = JSON.parse(body);
                resolve(result.tenant_access_token);
            });
        });
        req.write(data);
        req.end();
    });
}

// 获取记录
async function getRecords(tableId) {
    const token = await getToken();
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'open.feishu.cn',
            path: `/open-apis/bitable/v1/apps/${config.app_token}/tables/${tableId}/records?page_size=500`,
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        }, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                const result = JSON.parse(body);
                resolve(result.data.items);
            });
        });
        req.end();
    });
}

// 获取 tblyEaRH1YpwAPxQ 的数据并转换格式
getRecords('tblyEaRH1YpwAPxQ').then(records => {
    console.log(`获取到 ${records.length} 条豆包 Demo 记录`);

    // 按"能力分类"分组
    const grouped = {};
    records.forEach(record => {
        const ability = record.fields['能力分类'] || '其他';
        if (!grouped[ability]) {
            grouped[ability] = [];
        }

        const steps = (record.fields['操作步骤'] || '').split('\n').filter(s => s.trim());

        grouped[ability].push({
            name: record.fields['Demo名称'] || '',
            subtitle: record.fields['副标题'] || '',
            scene: record.fields['使用场景'] || '',
            steps: steps,
            coreDisplay: record.fields['核心展示'] || '',
            expectedEffect: record.fields['预期效果'] || ''
        });
    });

    // 转换为 abilities 数组
    const abilityIcons = {
        '更强Agent能力': '💡',
        '原生多模态': '🎨',
        '更强LLM能力': '🧠'
    };

    const abilityColors = {
        '更强Agent能力': '#6366f1',
        '原生多模态': '#ec4899',
        '更强LLM能力': '#10b981'
    };

    const abilities = Object.entries(grouped).map(([name, demos]) => ({
        id: name.toLowerCase().replace(/\s+/g, '-'),
        name: name,
        icon: abilityIcons[name] || '⭐',
        color: abilityColors[name] || '#6366f1',
        tags: [],
        demos: demos
    }));

    const output = { abilities };
    fs.writeFileSync('skills-doubao18.json', JSON.stringify(output, null, 2));
    console.log(`✓ 已创建 skills-doubao18.json，共 ${abilities.length} 个能力分类`);
}).catch(err => console.error('错误:', err.message));
