---
name: score-doubao-demos
description: "自动为豆包Demo创意表格中的记录评分。当用户使用 /score-doubao-demos 命令时触发。"
license: MIT
---

# 豆包Demo自动评分技能

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

本技能用于自动化评分飞书多维表格中的豆包Demo记录，通过调用 Gemini API 生成以下评分字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| 趣味分 | 数字 | 1-50 |
| 实用分 | 数字 | 1-50 |

---

## 触发条件

### 主触发器
- `/score-doubao-demos` - 处理所有未评分记录
- `/score-doubao-demos N` - 只处理前 N 条未评分记录
- `/score-doubao-demos all` - 强制重新评分所有记录（覆盖已有评分）

### 语义触发
- "给豆包Demo评分"
- "为豆包创意打分"
- "评估豆包Demo的趣味性和实用性"

---

## 配置文件

### Gemini 配置
读取 `skills/analyze-demos/config/.gemini.config.json`（复用现有配置）：
```json
{
  "api_key": "xxx",
  "base_url": "https://yunwu.ai",
  "model_id": "gemini-3-pro-preview",
  "endpoint": "/v1beta/models/gemini-3-pro-preview:generateContent"
}
```

### 飞书配置
| 配置项 | 值 |
|--------|-----|
| APP_ID | cli_a989e0fcbd7f100c |
| APP_TOKEN | PTZxbnALPai6Zys0RNYcp9sznWe |
| DOUBAO_TABLE_ID | tblj14LfBtbNpSNR |

---

## 执行工作流

### Phase 1: 初始化
1. 读取 Gemini 配置文件 `skills/analyze-demos/config/.gemini.config.json`
2. 获取飞书 Access Token（需要 FEISHU_APP_SECRET 环境变量）
3. 验证配置完整性

### Phase 2: 数据获取
1. 调用飞书 API 获取豆包Demo表格所有记录
2. 筛选未评分记录（趣味分或实用分为空/0的记录）
3. 如果指定了数量限制 N，则只取前 N 条
4. 如果指定了 `all`，则处理所有记录（覆盖已有评分）
5. 如果没有未评分记录，直接报告"所有记录已评分"

### Phase 3: 批量评分
对每条未评分记录执行以下步骤：

#### Step 3.1: 构建评分输入
```
输入数据 = {
  name: record.Demo名称,
  subtitle: record.副标题,
  scene: record.使用场景,
  steps: record.操作步骤,
  coreDisplay: record.核心展示,
  expectedEffect: record.预期效果
}
```

#### Step 3.2: 调用 Gemini API 评分
- 读取 `prompts/豆包评分标准.md` 获取提示词模板
- 构建请求：Demo信息 + 提示词
- 解析响应获取：interesting_score, useful_score

#### Step 3.3: 写入飞书
- 调用 `/api/update-doubao-record` 更新记录
- 记录成功/失败状态

### Phase 4: 重试机制
- 收集所有失败的记录
- 对失败记录统一重试一次
- 记录最终状态

### Phase 5: 结果汇报
输出处理统计表：

```
=== 豆包Demo评分完成 ===

处理统计：
- 总记录数：XX
- 成功：XX
- 失败：XX
- 跳过（已评分）：XX

评分结果：
| Demo名称 | 趣味分 | 实用分 | 总分 |
|----------|--------|--------|------|
| 智能助手 | 35 | 42 | 77 |
| ... | ... | ... | ... |

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

### 数据异常
| 异常情况 | 默认值 |
|----------|--------|
| JSON 解析失败 | 使用正则提取关键信息 |
| 评分超出范围 | 限制在 1-50 范围内 |
| 缺少必要字段 | 跳过该记录并记录错误 |

### 原则
- **Log & Continue**: 记录错误日志，继续处理下一条
- **Never Ask**: 不要因为单条失败而中断整个流程
- **Retry Once**: 失败记录在最后统一重试一次

---

## Gemini API 调用模板

### 请求格式
```javascript
const prompt = `
你是一个Demo评分专家。请根据以下Demo信息给出趣味分和实用分。

## Demo信息
- 名称：${demo.name}
- 副标题：${demo.subtitle}
- 使用场景：${demo.scene}
- 操作步骤：${demo.steps}
- 核心展示：${demo.coreDisplay}
- 预期效果：${demo.expectedEffect}

${评分标准提示词}

## 输出格式
以JSON格式输出：
{"interesting_score": 35, "useful_score": 28}
`;

const response = await fetch(`${BASE_URL}${ENDPOINT}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${API_KEY}`
  },
  body: JSON.stringify({
    contents: [{
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 256
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
// 验证分数范围
const interestingScore = Math.min(50, Math.max(1, parsed.interesting_score));
const usefulScore = Math.min(50, Math.max(1, parsed.useful_score));
```

---

## 飞书 API 调用模板

### 获取 Access Token
```javascript
const tokenResponse = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    app_id: 'cli_a989e0fcbd7f100c',
    app_secret: process.env.FEISHU_APP_SECRET
  })
});
const { tenant_access_token } = await tokenResponse.json();
```

### 获取豆包Demo记录
```javascript
const records = await fetch(
  `https://open.feishu.cn/open-apis/bitable/v1/apps/PTZxbnALPai6Zys0RNYcp9sznWe/tables/tblj14LfBtbNpSNR/records?page_size=100`,
  { headers: { 'Authorization': `Bearer ${token}` } }
);
```

### 更新记录评分
```javascript
await fetch(
  `https://open.feishu.cn/open-apis/bitable/v1/apps/PTZxbnALPai6Zys0RNYcp9sznWe/tables/tblj14LfBtbNpSNR/records/${recordId}`,
  {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      fields: {
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

**用户输入**: `/score-doubao-demos`

**Claude 执行**:
```
正在评分豆包Demo...

[处理中] 智能日程助手 - 调用Gemini评分...完成
[处理中] 智能日程助手 - 写入飞书...完成

[处理中] 多模态文档理解 - 调用Gemini评分...完成
[处理中] 多模态文档理解 - 写入飞书...完成
...

=== 豆包Demo评分完成 ===

处理统计：
- 总记录数：18
- 成功：18
- 失败：0
- 跳过（已评分）：0

评分结果：
| Demo名称 | 趣味分 | 实用分 | 总分 |
|----------|--------|--------|------|
| 智能日程助手 | 37 | 45 | 82 |
| 多模态文档理解 | 35 | 40 | 75 |
| ... | ... | ... | ... |

所有评分已写入飞书表格。
```

### Anti-Pattern: 禁止的中断行为

❌ **错误示例 1 - 询问是否继续**:
```
我发现有 18 条未评分的记录，是否需要我处理它们？
```

❌ **错误示例 2 - 逐条询问**:
```
已完成"智能日程助手"的评分：趣味分37，实用分45
是否继续处理下一条？
```

✅ **正确做法**: 不询问，直接处理所有记录，最后统一汇报结果。

---

## 提示词文件引用

执行时需读取以下提示词文件：

| 文件 | 用途 | 路径 |
|------|------|------|
| 豆包评分标准.md | 评分提示词 | `prompts/豆包评分标准.md` |

---

## 限制与边界

### 本技能适用于
- 飞书多维表格中的豆包Demo数据（表格ID: tblj14LfBtbNpSNR）
- 批量生成趣味分和实用分
- 使用 Gemini API 进行评分

### 本技能不适用于
- 竞品Demo分析表格的评分（使用 /analyze-demos）
- 手动逐条编辑评分
- 非飞书多维表格的数据源
