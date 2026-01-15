const APP_ID = 'cli_a989e0fcbd7f100c';
const APP_TOKEN = 'PTZxbnALPai6Zys0RNYcp9sznWe';
const TABLE_ID = 'tblj14LfBtbNpSNR';

async function main() {
  // 获取 token
  const tokenRes = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: APP_ID,
      app_secret: process.env.FEISHU_APP_SECRET
    })
  });
  const tokenData = await tokenRes.json();
  const token = tokenData.tenant_access_token;
  
  if (!token) {
    console.error('获取 token 失败:', tokenData);
    return;
  }

  // 获取所有记录
  const recordsRes = await fetch(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records?page_size=100`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  const recordsData = await recordsRes.json();
  
  console.log(JSON.stringify(recordsData, null, 2));
}

main().catch(console.error);
