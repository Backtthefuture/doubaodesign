/**
 * 豆包Demo数据迁移脚本
 * 将 gemini3-doubao18.json 数据导入飞书多维表格
 *
 * 运行方式: FEISHU_APP_SECRET=xxx node migrate-doubao-data.js
 */

const fs = require('fs');

const FEISHU_APP_ID = 'cli_a989e0fcbd7f100c';
const FEISHU_APP_TOKEN = 'PTZxbnALPai6Zys0RNYcp9sznWe';
const DOUBAO_TABLE_ID = 'tblj14LfBtbNpSNR';

async function getAccessToken() {
    const appSecret = process.env.FEISHU_APP_SECRET;
    if (!appSecret) {
        throw new Error('请设置环境变量 FEISHU_APP_SECRET');
    }

    const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: FEISHU_APP_ID, app_secret: appSecret })
    });
    const data = await response.json();

    if (data.code !== 0) {
        throw new Error(`获取Token失败: ${data.msg}`);
    }

    return data.tenant_access_token;
}

async function createTableFields(token) {
    console.log('正在创建表格字段...');

    const fields = [
        { field_name: 'Demo名称', type: 1 },  // 1 = 文本
        {
            field_name: '能力分类',
            type: 3,  // 3 = 单选
            property: {
                options: [
                    { name: 'agent' },
                    { name: 'multimodal' },
                    { name: 'llm' }
                ]
            }
        },
        { field_name: '副标题', type: 1 },
        { field_name: '使用场景', type: 1 },
        { field_name: '操作步骤', type: 1 },
        { field_name: '核心展示', type: 1 },
        { field_name: '预期效果', type: 1 },
        { field_name: '排序权重', type: 2 },  // 2 = 数字
        { field_name: '备注', type: 1 }
    ];

    for (const field of fields) {
        try {
            const response = await fetch(
                `https://open.feishu.cn/open-apis/bitable/v1/apps/${FEISHU_APP_TOKEN}/tables/${DOUBAO_TABLE_ID}/fields`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(field)
                }
            );
            const result = await response.json();

            if (result.code === 0) {
                console.log(`  ✓ 创建字段: ${field.field_name}`);
            } else if (result.code === 1254043) {
                // 字段已存在
                console.log(`  - 字段已存在: ${field.field_name}`);
            } else {
                console.log(`  ✗ 创建字段失败 ${field.field_name}: ${result.msg}`);
            }
        } catch (e) {
            console.log(`  ✗ 创建字段异常 ${field.field_name}: ${e.message}`);
        }
    }
}

async function migrate() {
    console.log('========================================');
    console.log('豆包Demo数据迁移工具');
    console.log('========================================\n');

    // 1. 获取access_token
    console.log('Step 1: 获取飞书Access Token...');
    const token = await getAccessToken();
    console.log('  ✓ Token获取成功\n');

    // 2. 创建表格字段
    console.log('Step 2: 创建表格字段...');
    await createTableFields(token);
    console.log('');

    // 3. 读取JSON数据
    console.log('Step 3: 读取本地JSON数据...');
    const jsonPath = './gemini3-doubao18.json';
    if (!fs.existsSync(jsonPath)) {
        throw new Error(`文件不存在: ${jsonPath}`);
    }
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    console.log(`  ✓ 读取成功，共${jsonData.abilities.length}个能力分类\n`);

    // 4. 转换为飞书记录格式
    console.log('Step 4: 转换数据格式...');
    const records = [];
    jsonData.abilities.forEach((ability, abilityIndex) => {
        ability.demos.forEach((demo, demoIndex) => {
            records.push({
                fields: {
                    'Demo名称': demo.name,
                    '能力分类': ability.id,
                    '副标题': demo.subtitle,
                    '使用场景': demo.scene,
                    '操作步骤': demo.steps.join('\n'),
                    '核心展示': demo.coreDisplay,
                    '预期效果': demo.expectedEffect,
                    '排序权重': (3 - abilityIndex) * 100 + (100 - demoIndex),
                    '备注': ''
                }
            });
        });
    });
    console.log(`  ✓ 转换完成，共${records.length}条记录\n`);

    // 5. 批量创建记录
    console.log('Step 5: 批量导入记录到飞书...');
    const response = await fetch(
        `https://open.feishu.cn/open-apis/bitable/v1/apps/${FEISHU_APP_TOKEN}/tables/${DOUBAO_TABLE_ID}/records/batch_create`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ records })
        }
    );

    const result = await response.json();

    if (result.code === 0) {
        console.log(`  ✓ 成功导入 ${result.data.records.length} 条记录\n`);
        console.log('========================================');
        console.log('迁移完成！');
        console.log(`表格ID: ${DOUBAO_TABLE_ID}`);
        console.log(`记录数: ${result.data.records.length}`);
        console.log('========================================');
    } else {
        console.log(`  ✗ 导入失败: ${result.msg}`);
        console.log('详细信息:', JSON.stringify(result, null, 2));
    }
}

migrate().catch(err => {
    console.error('\n迁移失败:', err.message);
    process.exit(1);
});
