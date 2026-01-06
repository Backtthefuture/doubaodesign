// Vercel Serverless Function - 获取飞书媒体文件临时下载 URL
// 部署后通过 /api/media?token=xxx 访问

const FEISHU_APP_ID = 'cli_a989e0fcbd7f100c';

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // 支持两种参数格式: token 或 file_tokens
  const fileTokens = req.query.file_tokens || req.query.token;

  if (!fileTokens) {
    return res.status(400).json({
      code: -1,
      error: 'Missing file_tokens parameter'
    });
  }

  try {
    const accessToken = await getAccessToken();

    // file_tokens 可能是字符串或数组
    const tokens = Array.isArray(fileTokens) ? fileTokens : [fileTokens];
    const tokenParams = tokens.map(t => `file_tokens=${encodeURIComponent(t)}`).join('&');

    console.log('Fetching media URLs for tokens:', tokens);

    const response = await fetch(
      `https://open.feishu.cn/open-apis/drive/v1/medias/batch_get_tmp_download_url?${tokenParams}`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );

    const data = await response.json();

    if (data.code !== 0) {
      console.error('Feishu API Error:', data);
      throw new Error('获取媒体 URL 失败: ' + (data.msg || JSON.stringify(data)));
    }

    // 确保返回格式正确
    return res.status(200).json({
      code: 0,
      data: {
        tmp_download_urls: data.data?.tmp_download_urls || []
      }
    });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({
      code: -1,
      error: error.message
    });
  }
}
