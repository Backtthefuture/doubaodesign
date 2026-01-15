// Vercel Serverless Function - 通用获取飞书多维表格记录
// 部署后通过 /api/records?model=gemini3|gpt52|skills 访问
// 优化版：在服务端批量获取所有媒体 URL，减少前端请求次数

const FEISHU_APP_ID = 'cli_a989e0fcbd7f100c';
const FEISHU_APP_TOKEN = 'PTZxbnALPai6Zys0RNYcp9sznWe';

// 多模型表格配置映射
const TABLE_CONFIGS = {
  gemini3: {
    recordsTable: 'tbl3fl3SZd9YxzJ6',
    name: 'Gemini 3'
  },
  gpt52: {
    recordsTable: 'tblGpra2WmGUFXM0',
    name: 'GPT 5.2'
  },
  skills: {
    recordsTable: 'tbl6MNuG7sVaCZp1',
    name: 'Skills'
  }
};

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

async function fetchAllRecords(token, tableId) {
  const allRecords = [];
  let pageToken = null;
  let hasMore = true;

  while (hasMore) {
    let url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${FEISHU_APP_TOKEN}/tables/${tableId}/records?page_size=500`;
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
      // 飞书 API 要求多个 file_token 用 & 分隔的多个参数传递
      const tokenParams = batch.map(t => `file_tokens=${t}`).join('&');
      const url = `https://open.feishu.cn/open-apis/drive/v1/medias/batch_get_tmp_download_url?${tokenParams}`;

      try {
        const response = await fetch(url, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.code === 0 && data.data?.tmp_download_urls) {
          return data.data.tmp_download_urls;
        } else {
          console.error('批量获取媒体 URL 失败, code:', data.code, 'msg:', data.msg);
        }
      } catch (e) {
        console.error('批量获取媒体 URL 异常:', e);
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

  // 获取 model 参数，默认 gemini3
  const model = req.query.model || 'gemini3';

  // 验证 model 参数
  const config = TABLE_CONFIGS[model];
  if (!config) {
    return res.status(400).json({
      code: -1,
      error: `Invalid model: ${model}. Supported: ${Object.keys(TABLE_CONFIGS).join(', ')}`
    });
  }

  const tableId = config.recordsTable;

  try {
    const token = await getAccessToken();
    const records = await fetchAllRecords(token, tableId);

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
          record.fields['_mediaUrl'] = mediaUrlMap[fileToken];
          record.fields['_mediaUrlTimestamp'] = Date.now();
        }
      }
      return record;
    });

    return res.status(200).json({
      code: 0,
      data: {
        items: enrichedRecords,
        total: enrichedRecords.length
      },
      model: model
    });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({
      code: -1,
      error: error.message
    });
  }
}
