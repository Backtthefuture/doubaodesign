---
name: analyze-demos
description: "自动分析飞书多维表格中的 Gemini Demo 记录，生成场景分类、模型能力、豆包创意内容（标题/描述/标签/示例Prompt/实现步骤）、评分、用户痛点和能力跃迁分析。当用户使用 /analyze-demos 命令或要求分析 Demo 表格、填充缺失字段、批量生成 Demo 元数据时触发。"
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
| 豆包创意标题 | 文本 | 6-12字标题 |
| 豆包创意描述 | 文本 | 40-80字描述 |
| 豆包标签 | 文本 | 2-3个标签，逗号分隔 |
| 示例Prompt | 文本 | 20-50字用户示例输入 |
| 实现步骤 | 文本 | 7-8步实现流程 |
| 趣味分 | 数字 | 1-50 |
| 实用分 | 数字 | 1-50 |
| **用户痛点** | 文本 | 40-80字，没有AI时用户面临的核心痛点 |
| **能力跃迁** | 文本 | 60-120字，1.6局限→1.8突破的对比分析 |

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
  "app_id": "cli_a989e0fcbd7f100c",
  "app_secret": "xxx",
  "app_token": "PTZxbnALPai6Zys0RNYcp9sznWe",
  "table_id": "tblGpra2WmGUFXM0"
}
```

### Gemini 配置
读取 `skills/analyze-demos/config/.gemini.config.json`：
```json
{
  "api_key": "xxx",
  "base_url": "https://yunwu.ai",
  "model_id": "gemini-3-pro-preview",
  "endpoint": "/v1/chat/completions"
}
```

---

## 执行工作流

### Phase 1: 初始化
1. 读取飞书配置文件 `.feishu.config.json`
2. 读取 Gemini 配置文件 `config/.gemini.config.json`
3. 读取提示词文件
4. 获取飞书 Access Token

### Phase 2: 数据获取
1. 调用飞书 API 获取所有表格记录
2. 筛选未完成记录（任意生成字段为空的记录）
3. 如果指定了数量限制 N，则只取前 N 条
4. 如果没有未完成记录，直接报告"所有记录已完成"

### Phase 3: 批量处理
对每条未完成记录执行以下步骤（共6次API调用）：

#### 调用 1 - 场景分类
- 读取 `prompts/场景分类.md` 获取提示词模板
- 输入：Prompt描述
- 输出：所属场景（18选1）

#### 调用 2 - 能力识别
- 读取 `prompts/能力识别.md` 获取提示词模板
- 输入：Prompt描述
- 输出：模型能力（JSON数组，1-3个）

#### 调用 3 - 创意生成（完整版，一次返回5个字段）
- 读取 `prompts/创意生成_完整版.md` 获取提示词模板
- 输入：Prompt描述
- 输出：JSON对象，包含：
  - `title` → 豆包创意标题
  - `description` → 豆包创意描述
  - `tags` → 豆包标签
  - `example_prompt` → 示例Prompt
  - `steps` → 实现步骤（数组）

#### 调用 4 - 评分
- 读取 `prompts/评分标准.md` 获取提示词模板
- 输入：豆包创意标题 + 豆包创意描述（来自调用3的结果）
- 输出：JSON对象 `{interesting_score, useful_score}`

#### 调用 5 - 痛点分析 ⭐ 新增
- 读取 `prompts/痛点分析.md` 获取提示词模板
- 输入：Prompt描述 + 所属场景（来自调用1的结果）
- 输出：用户痛点（40-80字文本）

#### 调用 6 - 能力跃迁 ⭐ 新增
- 读取 `prompts/能力跃迁.md` 获取提示词模板
- 参考 `prompts/豆包能力参考.md` 知识库
- 输入：Prompt描述 + 模型能力（来自调用2的结果）
- 输出：能力跃迁分析（60-120字文本）

#### 写入飞书
调用飞书 API 更新记录，写入以下11个字段：
```javascript
{
  '所属场景': scene,
  '模型能力': abilities,
  '豆包创意标题': title,
  '豆包创意描述': description,
  '豆包标签': tags,
  '示例Prompt': examplePrompt,
  '实现步骤': steps.join('\n'),
  '趣味分': interestingScore,
  '实用分': usefulScore,
  '用户痛点': painPoint,
  '能力跃迁': abilityLeap
}
```

### Phase 4: 结果汇报
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

### 数据异常默认值
| 异常情况 | 默认值 |
|----------|--------|
| 场景无法判断 | "一句话生成App" |
| 能力无法判断 | ["代码狂魔"] |
| 标题解析失败 | 使用Demo名称 |
| 描述解析失败 | 使用Prompt描述 |
| 评分解析失败 | 趣味分25, 实用分25 |
| JSON 解析失败 | 使用正则提取关键信息 |
| **痛点分析失败** | "传统方式需要大量时间和专业技能，效率低且容易出错。" |
| **能力跃迁失败** | "1.8凭借原生多模态和增强的Agent能力，可以更高效地完成此类任务。" |

### 原则
- **Log & Continue**: 记录错误日志，继续处理下一条
- **Never Ask**: 不要因为单条失败而中断整个流程
- **Retry Once**: 失败记录自动重试3次

---

## Gemini API 调用模板

### 请求格式（OpenAI兼容格式）
```javascript
const response = await fetch(`${BASE_URL}${ENDPOINT}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${API_KEY}`
  },
  body: JSON.stringify({
    model: 'gemini-3-pro-preview',
    messages: [{ role: 'user', content: promptTemplate + '\n\n输入: ' + promptDesc }],
    temperature: 0.7,
    max_tokens: 2048
  })
});
```

### 响应解析
```javascript
const result = response.choices[0].message.content;
// 提取JSON对象
const jsonMatch = result.match(/\{[\s\S]*\}/);
const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
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

### 获取记录（分页获取全部数据）
```javascript
// 支持分页，获取超过100条的全部记录
async function getAllRecords(token) {
  let allRecords = [];
  let pageToken = null;

  do {
    let url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records?page_size=500`;
    if (pageToken) url += `&page_token=${pageToken}`;

    const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    const { data } = await response.json();

    allRecords = allRecords.concat(data.items || []);
    pageToken = data.page_token;

    if (!data.has_more) break;
  } while (true);

  return allRecords;
}
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
        "示例Prompt": examplePrompt,
        "实现步骤": steps,
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

[1/15] 处理: 虚拟主播
  → 场景分类...完成 (一句话生成App)
  → 能力识别...完成 (多模态输入, 代码狂魔)
  → 创意生成（完整版）...完成
    标题: 虚拟主播实时驱动系统
    示例Prompt: ✓
    实现步骤: ✓
  → 评分...完成 (趣味38, 实用22)
  → 写入飞书...✓ 完成

[2/15] 处理: 3D乐高编辑器
  → 场景分类...完成 (一句话出3D)
  ...

=== Demo 分析完成 ===

处理统计：
- 总记录数：15
- 成功：14
- 失败：1
- 跳过（已完成）：0

失败记录：
- 智能助手Demo: Gemini API 超时

所有结果已写入飞书表格。
```

### Anti-Pattern: 禁止的中断行为

❌ **错误示例 1 - 询问是否继续**:
```
我发现有 15 条未完成的记录，是否需要我处理它们？
```

❌ **错误示例 2 - 逐条询问**:
```
已完成"虚拟主播"的分析，是否继续处理下一条？
```

✅ **正确做法**: 不询问，直接处理所有记录，最后统一汇报结果。

---

## 提示词文件引用

执行时需读取以下提示词文件：

| 文件 | 用途 | 路径 |
|------|------|------|
| 场景分类.md | 判断所属场景（18选1） | `prompts/场景分类.md` |
| 能力识别.md | 识别模型能力（1-3个） | `prompts/能力识别.md` |
| 创意生成_完整版.md | 生成标题/描述/标签/示例Prompt/实现步骤 | `prompts/创意生成_完整版.md` |
| 评分标准.md | 计算趣味分/实用分 | `prompts/评分标准.md` |
| **痛点分析.md** | 分析用户在无AI时的核心痛点 | `prompts/痛点分析.md` |
| **能力跃迁.md** | 分析1.6局限→1.8突破 | `prompts/能力跃迁.md` |
| **豆包能力参考.md** | 1.6/1.8能力差异知识库（供能力跃迁参考） | `prompts/豆包能力参考.md` |

---

## 执行脚本

本技能对应的执行脚本为项目根目录的 `analyze-demos-runner.js`，可通过以下命令运行：

```bash
node analyze-demos-runner.js
```

---

## 限制与边界

### 本技能适用于
- 飞书多维表格中的 Gemini Demo 数据（表格ID: tblGpra2WmGUFXM0）
- 批量生成缺失的11个元数据字段
- 使用 Gemini 3 Pro 进行分析

### 本技能不适用于
- 手动逐条编辑记录
- 删除或重置已有数据
- 非飞书多维表格的数据源
- 豆包Demo创意表的分析（使用 /doubao-demos）
