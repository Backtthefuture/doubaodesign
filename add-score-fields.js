// 添加趣味分、实用分字段到飞书豆包Demo表格
// 运行方式: FEISHU_APP_SECRET=xxx node add-score-fields.js

const FEISHU_APP_ID = 'cli_a989e0fcbd7f100c';
const FEISHU_APP_TOKEN = 'PTZxbnALPai6Zys0RNYcp9sznWe';
const DOUBAO_TABLE_ID = 'tblj14LfBtbNpSNR';

async function addFields() {
    const appSecret = process.env.FEISHU_APP_SECRET;
    if (!appSecret) {
        console.error('错误: 请设置 FEISHU_APP_SECRET 环境变量');
        console.error('用法: FEISHU_APP_SECRET=xxx node add-score-fields.js');
        process.exit(1);
    }

    console.log('正在获取飞书 Access Token...');

    // 获取 token
    const tokenResp = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: FEISHU_APP_ID, app_secret: appSecret })
    });
    const tokenData = await tokenResp.json();

    if (tokenData.code !== 0) {
        console.error('获取 Token 失败:', tokenData.msg);
        process.exit(1);
    }

    const token = tokenData.tenant_access_token;
    console.log('Token 获取成功');

    // 要添加的字段
    const fields = [
        { field_name: '趣味分', type: 2 },  // 数字类型
        { field_name: '实用分', type: 2 }   // 数字类型
    ];

    console.log('\n开始添加字段到表格...');

    for (const field of fields) {
        try {
            const resp = await fetch(
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
            const result = await resp.json();

            if (result.code === 0) {
                console.log(`✓ 字段 "${field.field_name}" 创建成功`);
            } else if (result.code === 1254043) {
                console.log(`- 字段 "${field.field_name}" 已存在，跳过`);
            } else {
                console.log(`✗ 字段 "${field.field_name}" 创建失败:`, result.msg);
            }
        } catch (error) {
            console.error(`✗ 字段 "${field.field_name}" 创建异常:`, error.message);
        }
    }

    console.log('\n字段添加完成！');
}

addFields().catch(err => {
    console.error('执行失败:', err);
    process.exit(1);
});
