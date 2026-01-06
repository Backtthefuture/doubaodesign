// 在飞书多维表格中添加"附件"字段
const fs = require('fs');

// 从配置文件读取
const config = JSON.parse(fs.readFileSync('.feishu.config.json', 'utf8'));

const FEISHU_APP_ID = config.app_id;
const FEISHU_APP_SECRET = config.app_secret;
const FEISHU_APP_TOKEN = config.app_token;
const FEISHU_TABLE_ID = config.table_id;

async function getAccessToken() {
  if (!FEISHU_APP_SECRET) {
    throw new Error('配置文件中缺少 app_secret');
  }

  const response = await fetch(
    'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: FEISHU_APP_ID,
        app_secret: FEISHU_APP_SECRET
      })
    }
  );

  const data = await response.json();

  if (data.code === 0) {
    return data.tenant_access_token;
  }

  throw new Error('获取 access token 失败: ' + (data.msg || 'Unknown error'));
}

async function addAttachmentField(token) {
  console.log('正在添加"附件"字段...');

  const response = await fetch(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${FEISHU_APP_TOKEN}/tables/${FEISHU_TABLE_ID}/fields`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        field_name: '附件',
        type: 17 // 附件类型,不需要 property 参数
      })
    }
  );

  const data = await response.json();

  if (data.code === 0) {
    console.log('✓ 成功添加"附件"字段');
    console.log('字段信息:', JSON.stringify(data.data, null, 2));
    return data.data;
  } else {
    throw new Error('添加字段失败: ' + (data.msg || JSON.stringify(data)));
  }
}

async function main() {
  try {
    console.log('=== 开始添加飞书多维表格"附件"字段 ===\n');

    const token = await getAccessToken();
    console.log('✓ 获取 access token 成功\n');

    const field = await addAttachmentField(token);

    console.log('\n=== 完成! ===');
    console.log('字段ID:', field.field_id);
    console.log('字段名称:', field.field_name);
    console.log('字段类型:', field.type);
  } catch (error) {
    console.error('\n❌ 错误:', error.message);
    process.exit(1);
  }
}

main();
