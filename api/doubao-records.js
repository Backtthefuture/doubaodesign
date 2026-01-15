// Vercel Serverless Function - 通用获取豆包Demo记录
// 部署后通过 /api/doubao-records?model=gemini3|gpt52|skills 访问

const FEISHU_APP_ID = 'cli_a989e0fcbd7f100c';
const FEISHU_APP_TOKEN = 'PTZxbnALPai6Zys0RNYcp9sznWe';

// 多模型表格配置映射
const TABLE_CONFIGS = {
  gemini3: {
    doubaoTable: 'tblj14LfBtbNpSNR',
    name: 'Gemini 3'
  },
  gpt52: {
    doubaoTable: 'tbltvxTCco9qZZyj',
    name: 'GPT 5.2'
  },
  skills: {
    doubaoTable: 'tblyEaRH1YpwAPxQ',
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

// 转换为 abilities 格式（用于 skills 模型）
function transformDoubaoRecords(records) {
  const grouped = {};

  records.forEach(record => {
    const ability = record.fields['能力分类'] || '其他';
    if (!grouped[ability]) {
      grouped[ability] = [];
    }

    const steps = (record.fields['操作步骤'] || '').split('\n').filter(s => s.trim());

    grouped[ability].push({
      name: record.fields['Demo名称'] || '',
      subtitle: record.fields['副标题'] || '',
      scene: record.fields['使用场景'] || '',
      steps: steps,
      coreDisplay: record.fields['核心展示'] || '',
      expectedEffect: record.fields['预期效果'] || ''
    });
  });

  const abilityIcons = {
    '更强Agent能力': '💡',
    '原生多模态': '🎨',
    '更强多模态能力': '🎨',
    '更强LLM能力': '🧠'
  };

  const abilityColors = {
    '更强Agent能力': '#6366f1',
    '原生多模态': '#ec4899',
    '更强多模态能力': '#ec4899',
    '更强LLM能力': '#10b981'
  };

  const abilities = Object.entries(grouped).map(([name, demos]) => ({
    id: name.toLowerCase().replace(/\s+/g, '-'),
    name: name,
    icon: abilityIcons[name] || '⭐',
    color: abilityColors[name] || '#6366f1',
    tags: [],
    demos: demos
  }));

  return { abilities };
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

  const tableId = config.doubaoTable;

  try {
    const token = await getAccessToken();
    const records = await fetchAllRecords(token, tableId);

    // 对于 skills 模型，额外返回 abilities 格式
    const response = {
      code: 0,
      data: {
        items: records,
        total: records.length
      },
      model: model
    };

    // skills 模型需要 abilities 格式
    if (model === 'skills') {
      const transformedData = transformDoubaoRecords(records);
      response.abilities = transformedData.abilities;
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({
      code: -1,
      error: error.message
    });
  }
}
