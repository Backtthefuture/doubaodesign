// 添加用户痛点、能力跃迁字段到飞书表格
// 运行方式: node add-missing-fields.js

const fs = require('fs');
const https = require('https');

// 读取配置
const feishuConfig = JSON.parse(fs.readFileSync('.feishu.config.json', 'utf8'));

async function addFields() {
    console.log('正在获取飞书 Access Token...');

    // 获取 token
    const token = await new Promise((resolve, reject) => {
        const data = JSON.stringify({
            app_id: feishuConfig.app_id,
            app_secret: feishuConfig.app_secret
        });

        const req = https.request({
            hostname: 'open.feishu.cn',
            path: '/open-apis/auth/v3/tenant_access_token/internal',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        }, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                const result = JSON.parse(body);
                if (result.code === 0) {
                    resolve(result.tenant_access_token);
                } else {
                    reject(new Error(result.msg));
                }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });

    console.log('Token 获取成功\n');

    // 要添加的字段
    const fields = [
        { field_name: '用户痛点', type: 1 },  // 文本类型
        { field_name: '能力跃迁', type: 1 }   // 文本类型
    ];

    console.log('开始添加字段到表格...\n');

    for (const field of fields) {
        try {
            const result = await new Promise((resolve, reject) => {
                const data = JSON.stringify(field);

                const req = https.request({
                    hostname: 'open.feishu.cn',
                    path: `/open-apis/bitable/v1/apps/${feishuConfig.app_token}/tables/${feishuConfig.table_id}/fields`,
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(data)
                    }
                }, res => {
                    let body = '';
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => {
                        resolve(JSON.parse(body));
                    });
                });
                req.on('error', reject);
                req.write(data);
                req.end();
            });

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
