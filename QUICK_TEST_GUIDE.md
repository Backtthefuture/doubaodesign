# 🚀 快速验证指南

## 立即测试

### 1. 等待Vercel部署完成
访问: https://vercel.com/your-project/deployments
等待状态变为 ✅ Ready

### 2. 测试步骤

#### 测试A: 上传图片
1. 打开网页
2. 找到任意Demo行的"备注"列
3. 点击 "📎 选择图片" 按钮
4. 选择一张图片(JPG/PNG/GIF/WebP, <30MB)
5. 点击 "上传" 按钮
6. **预期结果**:
   - Toast提示"上传中..."
   - Toast提示"✓ 上传成功"
   - 缩略图自动显示

#### 测试B: 查看图片
1. 鼠标悬停在缩略图上
2. 点击缩略图
3. **预期结果**:
   - 全屏显示大图
   - 图片清晰可见
   - 按ESC或点击遮罩关闭

#### 测试C: 删除图片
1. 鼠标悬停在缩略图上
2. 点击右上角的 "×" 按钮
3. **预期结果**:
   - 弹出确认对话框
   - 点击"确认"后图片消失
   - Toast提示"✓ 已删除"

### 3. 检查Console

打开浏览器开发者工具(F12) → Console

**预期**:
- ✅ 无500错误
- ✅ 无busboy错误
- ✅ 可能有正常的日志:
  - "Uploading file: xxx.jpg"
  - "Fetching media URLs for tokens: [...]"

**如果有错误**:
- 截图Console错误信息
- 检查Vercel日志

## 🔍 详细检查

### Vercel日志查看

1. 访问: https://vercel.com/your-project/deployments
2. 点击最新部署 → "Functions" tab
3. 查找 `api/upload-image` 和 `api/media`
4. 查看是否有错误日志

### 常见错误排查

#### 错误1: 仍然提示busboy错误
**原因**: Vercel缓存未清除
**解决**:
```bash
# 触发重新部署
git commit --allow-empty -m "trigger redeploy"
git push origin main
```

#### 错误2: 文件太大被拒绝
**原因**: Vercel默认限制4.5MB
**解决**: 创建 `vercel.json`:
```json
{
  "functions": {
    "api/upload-image.js": {
      "maxDuration": 60,
      "memory": 1024
    }
  }
}
```

#### 错误3: 图片URL无法加载
**原因**: 飞书临时URL过期(4小时)
**解决**: 刷新页面,重新获取URL

## ✅ 成功标志

- [x] 能选择图片
- [x] 能上传图片
- [x] 缩略图正常显示
- [x] 点击缩略图能全屏预览
- [x] 删除按钮工作正常
- [x] Console无错误

## 📞 需要帮助?

如果遇到问题,请提供:
1. 浏览器Console截图
2. Vercel部署日志
3. 操作步骤描述
4. 错误信息完整内容

---

**预计部署时间**: 2-3分钟
**测试时间**: 5分钟

祝测试顺利! 🎉
