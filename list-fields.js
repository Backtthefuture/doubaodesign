// 查询飞书多维表格的所有字段
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('.feishu.config.json', 'utf8'));

const FEISHU_APP_ID = config.app_id;
const FEISHU_APP_SECRET = config.app_secret;
const FEISHU_APP_TOKEN = config.app_token;
const FEISHU_TABLE_ID = config.table_id;

async function getAccessToken() {
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
  return data.tenant_access_token;
}

async function listFields(token) {
  const response = await fetch(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${FEISHU_APP_TOKEN}/tables/${FEISHU_TABLE_ID}/fields`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );

  const data = await response.json();

  if (data.code === 0) {
    console.log('✓ 当前表格字段列表:\n');
    data.data.items.forEach((field, index) => {
      console.log(`${index + 1}. ${field.field_name} (${field.field_id}) - 类型: ${field.type}`);
    });

    const attachmentField = data.data.items.find(f => f.field_name === '附件');
    if (attachmentField) {
      console.log('\n✓ "附件"字段已存在:');
      console.log(JSON.stringify(attachmentField, null, 2));
    }
  } else {
    console.error('错误:', data);
  }
}

async function main() {
  const token = await getAccessToken();
  await listFields(token);
}

main();
