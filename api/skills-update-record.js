// Vercel Serverless Function - 更新 Skills Demo 记录
// 部署后通过 /api/skills-update-record 访问

const FEISHU_APP_ID = 'cli_a989e0fcbd7f100c';
const FEISHU_APP_TOKEN = 'PTZxbnALPai6Zys0RNYcp9sznWe';
const SKILLS_TABLE_ID = 'tbl6MNuG7sVaCZp1';

// Token 缓存
let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  const appSecret = process.env.FEISHU_APP_SECRET;
  if (!appSecret) {
    throw new Error('FEISHU_APP_SECRET 环境变量未配置');
  }

  const response = await fetch(
    'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: FEISHU_APP_ID,
        app_secret: appSecret
      })
    }
  );

  const data = await response.json();

  if (data.code === 0) {
    cachedToken = data.tenant_access_token;
    tokenExpiry = Date.now() + (data.expire - 60) * 1000;
    return cachedToken;
  }

  throw new Error('获取 access token 失败: ' + (data.msg || 'Unknown error'));
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      code: -1,
      error: 'Method not allowed'
    });
  }

  try {
    const { recordId, fields } = req.body;

    if (!recordId || !fields) {
      return res.status(400).json({
        code: -1,
        error: 'Missing recordId or fields'
      });
    }

    const token = await getAccessToken();

    const response = await fetch(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${FEISHU_APP_TOKEN}/tables/${SKILLS_TABLE_ID}/records/${recordId}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields })
      }
    );

    const data = await response.json();

    if (data.code === 0) {
      return res.status(200).json({
        code: 0,
        data: data.data
      });
    } else {
      throw new Error('更新记录失败: ' + (data.msg || 'Unknown error'));
    }
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({
      code: -1,
      error: error.message
    });
  }
}
