// Vercel Serverless Function - 获取 Skills Demo 记录
// 部署后通过 /api/skills-records 访问

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

async function fetchAllRecords(token) {
  const allRecords = [];
  let pageToken = null;
  let hasMore = true;

  while (hasMore) {
    let url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${FEISHU_APP_TOKEN}/tables/${SKILLS_TABLE_ID}/records?page_size=500`;
    if (pageToken) {
      url += `&page_token=${pageToken}`;
    }

    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await response.json();

    if (data.code !== 0) {
      throw new Error('获取记录失败: ' + (data.msg || 'Unknown error'));
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

// 提取文件 token
function extractFileTokens(records) {
  const tokens = new Set();
  records.forEach(record => {
    const mediaField = record.fields['媒体素材'];
    if (Array.isArray(mediaField)) {
      mediaField.forEach(item => {
        if (item.file_token) {
          tokens.add(item.file_token);
        }
      });
    }
  });
  return Array.from(tokens);
}

// 批量获取媒体 URL
async function batchGetMediaUrls(token, fileTokens) {
  if (fileTokens.length === 0) return {};

  const urlMap = {};
  const batchSize = 50;

  for (let i = 0; i < fileTokens.length; i += batchSize) {
    const batch = fileTokens.slice(i, i + batchSize);

    await Promise.all(batch.map(async (fileToken) => {
      try {
        const response = await fetch(
          `https://open.feishu.cn/open-apis/drive/v1/medias/${fileToken}/download`,
          {
            headers: { 'Authorization': `Bearer ${token}` }
          }
        );

        if (response.ok) {
          urlMap[fileToken] = response.url;
        }
      } catch (error) {
        console.error(`获取媒体 URL 失败 (${fileToken}):`, error.message);
      }
    }));
  }

  return urlMap;
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    const token = await getAccessToken();
    const records = await fetchAllRecords(token);

    // 批量获取媒体 URL
    const fileTokens = extractFileTokens(records);
    const mediaUrlMap = await batchGetMediaUrls(token, fileTokens);

    // 增强记录数据
    const enrichedRecords = records.map(record => ({
      ...record,
      fields: {
        ...record.fields,
        _mediaUrl: getMediaUrl(record, mediaUrlMap),
        _mediaUrlTimestamp: Date.now()
      }
    }));

    return res.status(200).json({
      code: 0,
      data: {
        items: enrichedRecords,
        total: enrichedRecords.length
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

// 获取媒体 URL
function getMediaUrl(record, mediaUrlMap) {
  const mediaField = record.fields['媒体素材'];
  if (Array.isArray(mediaField) && mediaField.length > 0) {
    const firstMedia = mediaField[0];
    if (firstMedia.file_token && mediaUrlMap[firstMedia.file_token]) {
      return mediaUrlMap[firstMedia.file_token];
    }
  }
  return null;
}
