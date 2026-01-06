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
async function uploadImageToFeishu(token, imageBuffer, fileName, mimeType) {
  // 使用原生 FormData (Node.js 18+)
  const { FormData, Blob } = await import('node:buffer');

  const formData = new FormData();
  formData.append('file_name', fileName);
  formData.append('parent_type', 'bitable_image');
  formData.append('parent_node', FEISHU_APP_TOKEN);
  formData.append('size', imageBuffer.length.toString());
  formData.append('file', new Blob([imageBuffer], { type: mimeType }), fileName);

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

// 解析 multipart/form-data (简化版,不依赖外部库)
async function parseMultipartFormData(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on('data', chunk => {
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const buffer = Buffer.concat(chunks);
        const contentType = req.headers['content-type'] || '';
        const boundary = contentType.split('boundary=')[1];

        if (!boundary) {
          return reject(new Error('No boundary found in Content-Type'));
        }

        // 简单解析 multipart (只处理单个文件)
        const boundaryBuffer = Buffer.from(`--${boundary}`);
        const parts = [];
        let start = 0;

        while (true) {
          const boundaryIndex = buffer.indexOf(boundaryBuffer, start);
          if (boundaryIndex === -1) break;

          const nextBoundaryIndex = buffer.indexOf(boundaryBuffer, boundaryIndex + boundaryBuffer.length);
          if (nextBoundaryIndex === -1) break;

          parts.push(buffer.slice(boundaryIndex + boundaryBuffer.length, nextBoundaryIndex));
          start = nextBoundaryIndex;
        }

        // 查找文件部分
        for (const part of parts) {
          const partStr = part.toString('utf8', 0, 500); // 只读取前500字节查找header

          if (partStr.includes('Content-Type:') && partStr.includes('filename=')) {
            // 提取文件名
            const filenameMatch = partStr.match(/filename="([^"]+)"/);
            const filename = filenameMatch ? filenameMatch[1] : 'unknown.jpg';

            // 提取Content-Type
            const contentTypeMatch = partStr.match(/Content-Type:\s*([^\r\n]+)/i);
            const mimeType = contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream';

            // 找到文件数据起始位置 (两个\r\n\r\n之后)
            const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
            if (headerEnd === -1) continue;

            const fileData = part.slice(headerEnd + 4, part.length - 2); // 去掉末尾的\r\n

            return resolve({
              filename,
              mimeType,
              buffer: fileData,
              size: fileData.length
            });
          }
        }

        reject(new Error('No file found in request'));
      } catch (error) {
        reject(error);
      }
    });

    req.on('error', reject);
  });
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

    // 解析上传的文件
    const fileData = await parseMultipartFormData(req);

    if (!fileData || !fileData.buffer) {
      return res.status(400).json({
        code: -1,
        error: 'No image file found in request'
      });
    }

    // 验证文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/jpg'];
    if (!allowedTypes.includes(fileData.mimeType)) {
      return res.status(400).json({
        code: -1,
        error: `Invalid file type: ${fileData.mimeType}. Only JPG, PNG, GIF, WebP are allowed`
      });
    }

    // 验证文件大小 (30MB)
    const maxSize = 30 * 1024 * 1024;
    if (fileData.size > maxSize) {
      return res.status(400).json({
        code: -1,
        error: `File too large. Maximum size is 30MB, got ${(fileData.size / 1024 / 1024).toFixed(2)}MB`
      });
    }

    console.log('Uploading file:', fileData.filename, 'Size:', fileData.size, 'Type:', fileData.mimeType);

    // 获取 token
    const token = await getAccessToken();

    // 上传到飞书
    const uploadResult = await uploadImageToFeishu(token, fileData.buffer, fileData.filename, fileData.mimeType);

    return res.status(200).json({
      code: 0,
      data: {
        file_token: uploadResult.file_token,
        name: fileData.filename,
        size: fileData.size,
        type: fileData.mimeType
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

// 禁用body parser,让我们手动处理
export const config = {
  api: {
    bodyParser: false,
  },
};
