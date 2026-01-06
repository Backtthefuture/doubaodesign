// Vercel Serverless Function - 上传图片到飞书云文档
// 部署后通过 POST /api/upload-image 访问

const FEISHU_APP_ID = 'cli_a989e0fcbd7f100c';
const FEISHU_APP_TOKEN = 'PTZxbnALPai6Zys0RNYcp9sznWe';

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

// 上传图片到飞书云文档
async function uploadImageToFeishu(token, imageBuffer, fileName, fileSize) {
  const FormData = (await import('formdata-node')).FormData;
  const { Blob } = await import('buffer');

  const formData = new FormData();
  formData.append('file_name', fileName);
  formData.append('parent_type', 'bitable_image');
  formData.append('parent_node', FEISHU_APP_TOKEN);
  formData.append('size', fileSize.toString());
  formData.append('file', new Blob([imageBuffer]), fileName);

  const response = await fetch(
    'https://open.feishu.cn/open-apis/drive/v1/medias/upload_all',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    }
  );

  const data = await response.json();

  if (data.code === 0) {
    return data.data;
  }

  throw new Error('上传图片失败: ' + (data.msg || JSON.stringify(data)));
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
    return res.status(405).json({ code: -1, error: 'Method not allowed' });
  }

  try {
    // 解析 multipart/form-data
    const contentType = req.headers['content-type'] || '';

    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({
        code: -1,
        error: 'Content-Type must be multipart/form-data'
      });
    }

    // 使用 busboy 解析表单数据
    const busboy = require('busboy');
    const bb = busboy({ headers: req.headers });

    let imageBuffer = null;
    let fileName = '';
    let fileSize = 0;
    let mimeType = '';

    bb.on('file', (fieldname, file, info) => {
      const { filename, encoding, mimeType: mime } = info;
      fileName = filename;
      mimeType = mime;

      const chunks = [];
      file.on('data', (data) => {
        chunks.push(data);
      });
      file.on('end', () => {
        imageBuffer = Buffer.concat(chunks);
        fileSize = imageBuffer.length;
      });
    });

    await new Promise((resolve, reject) => {
      bb.on('finish', resolve);
      bb.on('error', reject);
      req.pipe(bb);
    });

    if (!imageBuffer) {
      return res.status(400).json({
        code: -1,
        error: 'No image file found in request'
      });
    }

    // 验证文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(mimeType)) {
      return res.status(400).json({
        code: -1,
        error: 'Invalid file type. Only JPG, PNG, GIF, WebP are allowed'
      });
    }

    // 验证文件大小 (30MB)
    const maxSize = 30 * 1024 * 1024;
    if (fileSize > maxSize) {
      return res.status(400).json({
        code: -1,
        error: `File too large. Maximum size is 30MB, got ${(fileSize / 1024 / 1024).toFixed(2)}MB`
      });
    }

    // 获取 token
    const token = await getAccessToken();

    // 上传到飞书
    const uploadResult = await uploadImageToFeishu(token, imageBuffer, fileName, fileSize);

    return res.status(200).json({
      code: 0,
      data: {
        file_token: uploadResult.file_token,
        name: fileName,
        size: fileSize,
        type: mimeType
      }
    });

  } catch (error) {
    console.error('Upload Image API Error:', error);
    return res.status(500).json({
      code: -1,
      error: error.message
    });
  }
}
