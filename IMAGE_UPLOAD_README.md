# 图片上传功能实现文档

## 功能概述

在备注列下方添加了图片上传功能,支持:
- 选择图片文件 (JPG/PNG/GIF/WebP, 最大30MB)
- 上传到飞书多维表格的"附件"字段
- 显示图片缩略图
- 点击缩略图全屏预览(Lightbox)
- 删除图片(带二次确认)

## 实现文件

### 1. 后端API

**文件**: `api/upload-image.js`
- 接收前端上传的图片文件
- 验证文件类型和大小
- 上传到飞书云文档
- 返回 file_token

**需要的环境变量**:
```
FEISHU_APP_SECRET=你的应用密钥
```

### 2. 前端修改

**文件**: `index.html`

#### CSS样式 (第744-875行)
- `.image-upload-section` - 上传区域样式
- `.image-preview-section` - 预览区域样式
- `.image-thumb-wrapper` - 缩略图容器
- `.image-delete-btn` - 删除按钮

#### HTML结构 (第2212-2235行)
在备注列(`col-notes`)添加:
1. 图片上传区域 (`image-upload-section`)
2. 图片预览区域 (`image-preview-section`)

#### JavaScript函数 (第2453-2648行)
- `handleImageSelect()` - 选择图片,验证类型和大小
- `uploadImage()` - 上传图片到飞书
- `batchGetImageUrls()` - 批量获取图片临时URL
- `renderImageThumbnails()` - 渲染缩略图
- `deleteImage()` - 删除图片(带二次确认)
- `openImageLightbox()` - 打开全屏预览
- `showLightboxImage()` - 显示Lightbox图片

### 3. 飞书多维表格字段

**字段名称**: 附件
**字段ID**: fldzfol2ah
**字段类型**: 17 (Attachment)

## 使用流程

### 上传图片
1. 点击"📎 选择图片"按钮
2. 选择图片文件 (会自动验证类型和大小)
3. 显示已选文件信息
4. 点击"上传"按钮
5. 等待上传完成,缩略图自动显示

### 查看图片
1. 鼠标悬停在缩略图上会显示删除按钮
2. 点击缩略图进入全屏预览
3. Lightbox显示大图 (max-width: 90vw, max-height: 85vh)
4. 点击遮罩或ESC键关闭

### 删除图片
1. 鼠标悬停在缩略图上
2. 点击右上角的"×"删除按钮
3. 弹出确认对话框:"⚠️ 确定要删除这张图片吗?"
4. 确认后删除,自动刷新缩略图列表

## 技术细节

### 文件验证
- **允许类型**: image/jpeg, image/png, image/gif, image/webp
- **最大大小**: 30MB
- 前端验证后端也会验证(双重保险)

### 图片显示
- 缩略图尺寸: 60×60px (object-fit: cover)
- 全屏预览约束:
  - max-width: 90vw
  - max-height: 85vh
  - object-fit: contain (保持原比例)
- 显示文件大小(MB)

### 飞书API调用
1. **上传**: `POST /drive/v1/medias/upload_all`
2. **获取URL**: `GET /drive/v1/medias/batch_get_tmp_download_url`
3. **更新记录**: `PUT /bitable/v1/apps/{app_token}/tables/{table_id}/records/{record_id}`

### 临时URL说明
- 飞书返回的下载URL有效期约4小时
- 页面刷新或重新渲染时会重新获取URL
- 批量请求优化性能

## 注意事项

1. ⚠️ **环境变量**: Vercel部署时需要配置 `FEISHU_APP_SECRET`
2. ⚠️ **CORS**: API已配置CORS头,允许跨域请求
3. ⚠️ **文件大小**: 建议提前告知用户30MB限制
4. ⚠️ **网络**: 上传大文件时可能需要等待,已添加"上传中..."提示
5. ⚠️ **兼容性**: 需要浏览器支持 FormData 和 async/await

## 测试清单

- [ ] 选择合法图片文件 (JPG/PNG/GIF/WebP)
- [ ] 选择超大文件 (>30MB) 应提示错误
- [ ] 选择非图片文件应提示错误
- [ ] 上传成功后缩略图正常显示
- [ ] 点击缩略图能全屏预览
- [ ] Lightbox显示正确(max-width: 90vw, max-height: 85vh)
- [ ] 删除按钮悬停显示
- [ ] 删除时弹出二次确认对话框
- [ ] 确认删除后缩略图更新
- [ ] 取消删除不执行删除操作
- [ ] 多张图片正常排列
- [ ] 文件大小正确显示

## 部署步骤

1. 确保飞书多维表格有"附件"字段
2. 上传 `api/upload-image.js` 到Vercel
3. 配置Vercel环境变量 `FEISHU_APP_SECRET`
4. 部署前端 `index.html`
5. 测试完整流程

## 已知问题

无

## 未来优化

- [ ] 支持拖拽上传
- [ ] 图片压缩(减小文件大小)
- [ ] 上传进度条
- [ ] 多图选择同时上传
- [ ] 图片编辑功能(裁剪/旋转)
