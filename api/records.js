// Vercel Serverless Function - 获取飞书多维表格记录
// 部署后通过 /api/records 访问
// 优化版：在服务端批量获取所有媒体 URL，减少前端请求次数

const FEISHU_APP_ID = 'cli_a989e0fcbd7f100c';
const FEISHU_APP_TOKEN = 'PTZxbnALPai6Zys0RNYcp9sznWe';
const FEISHU_TABLE_ID = 'tbl3fl3SZd9YxzJ6';

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
    let url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${FEISHU_APP_TOKEN}/tables/${FEISHU_TABLE_ID}/records?page_size=100`;
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

// 批量获取媒体临时下载 URL（飞书 API 支持一次最多 50 个）
async function batchGetMediaUrls(token, fileTokens) {
  if (!fileTokens || fileTokens.length === 0) {
    return {};
  }

  const mediaUrlMap = {};

  // 飞书 API 限制每次最多 50 个 file_token，需要分批请求
  const batchSize = 50;
  const batches = [];

  for (let i = 0; i < fileTokens.length; i += batchSize) {
    batches.push(fileTokens.slice(i, i + batchSize));
  }

  // 并行请求所有批次
  const results = await Promise.all(
    batches.map(async (batch) => {
      const tokenParams = batch.join(',');
      const url = `https://open.feishu.cn/open-apis/drive/v1/medias/batch_get_tmp_download_url?file_tokens=${tokenParams}`;

      try {
        const response = await fetch(url, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.code === 0 && data.data?.tmp_download_urls) {
          return data.data.tmp_download_urls;
        }
      } catch (e) {
        console.error('批量获取媒体 URL 失败:', e);
      }
      return [];
    })
  );

  // 合并所有结果到 map
  results.flat().forEach(item => {
    if (item.file_token && item.tmp_download_url) {
      mediaUrlMap[item.file_token] = item.tmp_download_url;
    }
  });

  return mediaUrlMap;
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

    // 收集所有需要获取 URL 的 file_token
    const fileTokens = [];
    records.forEach(record => {
      const previewFile = record.fields['预览文件'];
      if (previewFile && previewFile[0] && previewFile[0].file_token) {
        fileTokens.push(previewFile[0].file_token);
      }
    });

    // 批量获取所有媒体 URL
    const mediaUrlMap = await batchGetMediaUrls(token, fileTokens);

    // 将媒体 URL 注入到记录中
    const enrichedRecords = records.map(record => {
      const previewFile = record.fields['预览文件'];
      if (previewFile && previewFile[0] && previewFile[0].file_token) {
        const fileToken = previewFile[0].file_token;
        if (mediaUrlMap[fileToken]) {
          // 添加预解析的媒体 URL
          record.fields['_mediaUrl'] = mediaUrlMap[fileToken];
        }
      }
      return record;
    });

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
