---
name: analyze-demos
description: "自动分析飞书多维表格中的 Gemini Demo 记录，生成场景分类、模型能力、豆包创意内容和评分。当用户使用 /analyze-demos 命令或要求分析 Demo 表格、填充缺失字段、批量生成 Demo 元数据时触发。"
license: MIT
---

# Gemini Demo 自动分析技能

## 静默执行协议 (Silent Execution Protocol)

**CRITICAL - 执行本技能时必须遵守以下规则：**

1. **DO NOT** ask for confirmation to proceed. Execute the full workflow automatically.
2. **DO NOT** ask "是否继续？" or "需要我处理吗？" - just proceed.
3. **DO NOT** stop to explain intermediate steps. Complete all processing first, then report.
4. **Generate the full output in one go.** Process all records before responding to user.
5. **If data is missing, use the defined defaults** (see Error Handling section).
6. **If API calls fail, retry automatically** before reporting errors.
7. **NEVER interrupt the workflow** - log issues and continue to the next record.

---

## 概述

本技能用于自动化分析飞书多维表格中的 Gemini Demo 记录，通过调用 Gemini 3 Pro API 生成以下字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| 所属场景 | 单选 | 18个预设场景之一 |
| 模型能力 | 多选 | 1-3个能力标签 |
| 豆包创意标题 | 文本 | 4-10字标题 |
| 豆包创意描述 | 文本 | 1-2句话描述 |
| 豆包标签 | 文本 | 2-3个标签，逗号分隔 |
| 趣味分 | 数字 | 1-100 |
| 实用分 | 数字 | 1-100 |

---

## 触发条件

### 主触发器
- `/analyze-demos` - 处理所有未完成记录
- `/analyze-demos N` - 只处理前 N 条未完成记录

### 语义触发
- "分析一下这个 Demo 表格"
- "帮我填充缺失的字段"
- "批量生成 Demo 的评分和标签"
- "处理未完成的 Demo 记录"

---

## 配置文件

### 飞书配置
读取项目根目录的 `.feishu.config.json`：
```json
{
  "app_id": "xxx",
  "app_secret": "xxx",
  "app_token": "xxx",
  "table_id": "xxx"
}
```

### Gemini 配置
读取 `skills/analyze-demos/config/.gemini.config.json`：
```json
{
  "api_key": "xxx",
  "base_url": "https://yunwu.ai",
  "model_id": "gemini-3-pro-preview",
  "endpoint": "/v1beta/models/gemini-3-pro-preview:generateContent"
}
```

---

## 执行工作流

### Phase 1: 初始化
1. 读取飞书配置文件 `.feishu.config.json`
2. 读取 Gemini 配置文件 `config/.gemini.config.json`
3. 验证配置完整性（如缺失则报错并停止）
4. 获取飞书 Access Token

### Phase 2: 数据获取
1. 调用飞书 API 获取所有表格记录
2. 筛选未完成记录（任意生成字段为空的记录）
3. 如果指定了数量限制 N，则只取前 N 条
4. 如果没有未完成记录，直接报告"所有记录已完成"

### Phase 3: 批量处理
对每条未完成记录执行以下步骤：

#### Step 3.1: 获取输入数据
```
输入数据 = {
  demo_name: record.Demo名称,
  prompt_desc: record.Prompt描述,
  preview_file: record.预览文件 (可选),
  is_video: record.是否视频
}
```

#### Step 3.2: 获取预览文件（如有）
- 如果有预览文件，获取临时下载 URL
- 如果获取失败，记录日志并继续（仅用 Prompt 描述分析）

#### Step 3.3: 调用 Gemini API（4次分步调用）

**调用 1 - 场景分类**
- 读取 `prompts/场景分类.md` 获取提示词模板
- 构建请求：Prompt描述 + 预览文件（如有）+ 提示词
- 解析响应获取：所属场景

**调用 2 - 能力识别**
- 读取 `prompts/能力识别.md` 获取提示词模板
- 构建请求：Prompt描述 + 预览文件（如有）+ 提示词
- 解析响应获取：模型能力[]

**调用 3 - 创意生成**
- 读取 `prompts/创意生成.md` 获取提示词模板
- 构建请求：Prompt描述 + 预览文件（如有）+ 提示词
- 解析响应获取：豆包创意标题, 豆包创意描述, 豆包标签

**调用 4 - 评分**
- 读取 `prompts/评分标准.md` 获取提示词模板
- 构建请求：Prompt描述 + 预览文件（如有）+ 提示词
- 解析响应获取：趣味分, 实用分

#### Step 3.4: 写入飞书
- 调用飞书 API 更新记录
- 记录成功/失败状态

### Phase 4: 重试机制
- 收集所有失败的记录
- 对失败记录统一重试一次
- 记录最终状态

### Phase 5: 结果汇报
输出处理统计表：

```
=== Demo 分析完成 ===

处理统计：
- 总记录数：XX
- 成功：XX
- 失败：XX
- 跳过（已完成）：XX

失败记录：
- [Demo名称]: [错误原因]
```

---

## 错误处理策略

### API 调用失败
| 错误类型 | 处理方式 |
|----------|----------|
| 超时 | 自动重试3次，间隔2秒 |
| 401 未授权 | 刷新 Token 后重试 |
| 429 限流 | 等待5秒后重试 |
| 500 服务错误 | 记录错误，跳过该记录 |

### 场景名称校验与映射
执行脚本会自动校验场景名称是否在有效的18选1列表中：

**有效场景列表**：
- 一句话生成App, 一句话做网站, 一句话造游戏, 一句话出3D
- 一句话写系统, 一句话搞特效, 图生万物, 视频秒懂
- 文档秒读, AI替你干活, 一句话出图, 一句话做PPT
- 一句话做表格, 写作助手, AI当老师, AI陪聊
- 视觉考AI, 奇葩挑战

**自动映射规则**（处理历史数据中的非标准名称）：
| 原名称 | 映射到 |
|--------|--------|
| 看图知一切 | 图生万物 |
| 图片理解 | 图生万物 |
| 视频理解 | 视频秒懂 |
| 文档处理 | 文档秒读 |
| Agent | AI替你干活 |
| 代码生成 | 一句话生成App |

如果已有场景名可以直接映射，则不调用 API，直接使用映射值。

### 数据异常
| 异常情况 | 默认值 |
|----------|--------|
| 预览文件获取失败 | 仅用 Prompt描述 分析 |
| 场景无法判断 | "一句话生成App" |
| 能力无法判断 | ["代码狂魔"] |
| JSON 解析失败 | 使用正则提取关键信息 |

### 原则
- **Log & Continue**: 记录错误日志，继续处理下一条
- **Never Ask**: 不要因为单条失败而中断整个流程
- **Retry Once**: 失败记录在最后统一重试一次

---

## Gemini API 调用模板

### 请求格式
```javascript
const response = await fetch(`${BASE_URL}${ENDPOINT}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${API_KEY}`
  },
  body: JSON.stringify({
    contents: [{
      parts: [
        { text: promptTemplate + "\n\n输入：" + promptDesc },
        // 如果有预览文件（图片/视频），添加：
        { inline_data: { mime_type: "video/mp4", data: base64Data } }
      ]
    }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1024
    }
  })
});
```

### 响应解析
```javascript
const result = response.data.candidates[0].content.parts[0].text;
// 去除可能的 markdown 代码块标记
const cleanJson = result.replace(/```json\n?|\n?```/g, '').trim();
const parsed = JSON.parse(cleanJson);
```

---

## 飞书 API 调用模板

### 获取 Access Token
```javascript
const tokenResponse = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET })
});
const { tenant_access_token } = await tokenResponse.json();
```

### 获取记录
```javascript
const records = await fetch(
  `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records`,
  { headers: { 'Authorization': `Bearer ${token}` } }
);
```

### 更新记录
```javascript
await fetch(
  `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records/${recordId}`,
  {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      fields: {
        "所属场景": scene,
        "模型能力": abilities,
        "豆包创意标题": title,
        "豆包创意描述": description,
        "豆包标签": tags,
        "趣味分": interestingScore,
        "实用分": usefulScore
      }
    })
  }
);
```

---

## 示例

### Good Case: 一步到位的完整执行

**用户输入**: `/analyze-demos`

**Claude 执行**:
```
正在分析 Demo 表格...

[处理中] 虚拟主播 - 调用场景分类...完成
[处理中] 虚拟主播 - 调用能力识别...完成
[处理中] 虚拟主播 - 调用创意生成...完成
[处理中] 虚拟主播 - 调用评分...完成
[处理中] 虚拟主播 - 写入飞书...完成

[处理中] 3D乐高编辑器 - 调用场景分类...完成
...

=== Demo 分析完成 ===

处理统计：
- 总记录数：15
- 成功：14
- 失败：1
- 跳过（已完成）：0

失败记录：
- 智能助手Demo: Gemini API 超时，已记录

所有结果已写入飞书表格。
```

### Anti-Pattern: 禁止的中断行为

❌ **错误示例 1 - 询问是否继续**:
```
我发现有 15 条未完成的记录，是否需要我处理它们？
```

❌ **错误示例 2 - 逐条询问**:
```
已完成"虚拟主播"的分析，生成结果如下：
- 所属场景：一句话生成App
- 模型能力：多模态输入, 代码狂魔
...
是否继续处理下一条？
```

❌ **错误示例 3 - 遇到错误就停止**:
```
在处理"3D乐高编辑器"时遇到 API 超时错误。
请问是否需要重试？
```

✅ **正确做法**: 不询问，直接处理所有记录，最后统一汇报结果。

---

## 提示词文件引用

执行时需读取以下提示词文件：

| 文件 | 用途 | 路径 |
|------|------|------|
| 场景分类.md | 判断所属场景 | `prompts/场景分类.md` |
| 能力识别.md | 识别模型能力 | `prompts/能力识别.md` |
| 创意生成.md | 生成标题/描述/标签 | `prompts/创意生成.md` |
| 评分标准.md | 计算趣味分/实用分 | `prompts/评分标准.md` |

---

## 限制与边界

### 本技能适用于
- 飞书多维表格中的 Gemini Demo 数据
- 批量生成缺失的元数据字段
- 使用 Gemini 3 Pro 进行多模态分析

### 本技能不适用于
- 手动逐条编辑记录
- 删除或重置已有数据
- 非飞书多维表格的数据源
- 其他 AI 模型的 Demo 分析
