---
name: doubao-demo-generator
description: "基于豆包大模型的优势能力，生成对标竞品的Demo案例，同时输出JSON文件并写入飞书多维表格。当用户需要生成豆包Demo对标方案、创建豆包能力展示数据时触发。支持 /doubao-demos 命令启动。"
license: MIT
---

# 豆包Demo生成技能

## 概述

此技能用于基于豆包大模型（如豆包1.8）的优势能力，生成对标竞品（如Gemini 3）的Demo案例方案，**同时**：
1. 输出为JSON文件供前端展示使用
2. 直接写入飞书多维表格（豆包Demo创意表）

## 触发条件

### 主触发器
- `/doubao-demos` - 生成豆包Demo案例并写入飞书

### 语义触发
- "生成豆包Demo"
- "创建豆包对标方案"
- "豆包能力Demo"

---

## 静默执行协议

执行本技能时必须遵守以下规则：
1. **直接生成完整的18个Demo**，不要询问是否继续
2. 按照指定的JSON格式输出
3. 文件命名规则：`{竞品模型}-{对标模型}.json`，如 `gemini3-doubao18.json`
4. **同时将数据写入飞书多维表格**
5. 生成完成后告知用户文件路径和飞书写入结果

---

## 飞书配置

### 豆包Demo创意表配置
| 配置项 | 值 | 说明 |
|--------|-----|------|
| APP_ID | `cli_a989e0fcbd7f100c` | 飞书应用ID |
| APP_TOKEN | `PTZxbnALPai6Zys0RNYcp9sznWe` | 多维表格Token |
| DOUBAO_TABLE_ID | `tblj14LfBtbNpSNR` | 豆包Demo创意表ID |

**环境变量**: 需要 `FEISHU_APP_SECRET` 环境变量

### 飞书表格字段映射
| JSON字段 | 飞书字段名 | 类型 |
|----------|-----------|------|
| name | Demo名称 | 文本 |
| subtitle | 副标题 | 文本 |
| scene | 使用场景 | 文本 |
| steps | 操作步骤 | 文本 |
| coreDisplay | 核心展示 | 文本 |
| expectedEffect | 预期效果 | 文本 |
| ability.name | 所属能力 | 单选 |
| ability.icon | 能力图标 | 文本 |

---

## 豆包1.8 三大核心能力参考

### 1. Agent能力（OS Agent / 屏幕操作智能体）

**核心能力**
- 能"看见"屏幕并直接与界面交互，像真人一样操作电脑/手机
- 在 BrowseComp-en 基准测试得分 **67.6**，超过 Gemini-3-Pro
- Agent与工具调用能力从28.6%飙升至 **63.1%**
- 在 ScreenSpot-Pro 基准测试中达到 **73.1分**，超过 Gemini 3 Pro（72.7）和 Claude Sonnet 4.5（36.2）

**具体场景案例**
| 场景 | 描述 |
|------|------|
| **智能比价** | 用户说"对比苹果官网和Amazon上iPhone16的价格"，Agent自动打开浏览器→访问两个网站→提取价格→对比反馈，全程无需手动操作 |
| **自动邮件处理+报告生成** | 登录邮箱→筛选特定邮件→下载PDF附件→解析内容→评估项目契合度→生成HTML汇报页面 |
| **自动写公众号并发布** | 根据主题自动搜索资料→生成图文内容→配图→登录公众号后台→发布文章 |
| **跨平台内容发布** | 在豆包APP生成内容后，自动发布到今日头条/小红书等平台 |
| **云手机自动订票** | 通过云手机在APP上完成机票/火车票预订，自动填写乘客信息、选座、支付 |
| **批量投递简历** | 自动打开招聘网站→筛选职位→填写申请表→提交简历 |

**适用于无API的老旧系统**：银行ERP、公司内网系统等传统Agent无法接入的场景

---

### 2. 多模态能力（视觉理解 + 视频理解）

**核心能力**
- 视觉推理 ZeroBench 得分 **11.0**，超越 Gemini-3-Pro（10.0）
- 单次视频理解 **1280帧**（约20分钟视频）
- 支持"低帧率扫视全局 + 高帧率聚焦关键"的协同理解
- MathVista 得分 **87.7**，MathVision 得分 **81.3**，LogicVista 得分 **78.3**

**具体场景案例**
| 场景 | 描述 |
|------|------|
| **拍照解题** | 拍摄数学/物理/生物题目（含图形），识别文字和图形→分步解析→给出答案+同类题练习 |
| **作文智能批改** | 上传作文图片→识别手写内容→从审题、结构、遣词造句多维度点评→给出评分和优化建议（如"开头建议用疑问句引发兴趣"） |
| **超长视频理解** | 理解1小时监控视频→定位事故画面→分析肇事车辆和时间 |
| **产品质检** | 对生产线视频进行实时分析→识别缺陷产品→自动标记异常帧 |
| **安全巡检** | 分析安防监控→识别异常行为（闯入、打架、跌倒）→实时预警 |
| **在线教育视频分析** | 以1秒1帧精度理解20分钟课程视频→定位学生困惑知识点→生成答疑摘要 |
| **门店巡检** | 分析门店监控→检查货架陈列是否规范→检测是否有顾客等待过久 |

---

### 3. LLM能力（推理 + 长上下文 + 高效率）

**核心能力**
- 推理与数学能力从65.7%提升至 **74.4%**
- 支持 **256K 超长上下文**（约20万字）
- Token效率领先：5K Token达到1.6版本15K Token的智力水平
- 金融领域准确率从80.6%提升至 **86.0%**

**具体场景案例**
| 场景 | 描述 |
|------|------|
| **超长文档分析** | 一次性读取200页合同/招股书→提取关键条款→对比多份文档差异→生成摘要 |
| **复杂项目管理流程解读** | 理解企业项目管理流程图→找到关键节点→回答具体问题 |
| **金融报告分析** | 分析财报数据→进行财务指标计算→给出投资建议 |
| **多轮复杂对话** | 在超长对话中智能清除低价值历史信息→确保复杂任务不"断档" |
| **代码理解与生成** | Coding能力显著增强，支持大型代码库的上下文理解 |
| **知识库问答** | 结合企业知识库进行精准问答，支持多步推理 |

---

### 评测数据汇总

| 评测项 | 豆包1.8得分 | 对比 |
|--------|------------|------|
| BrowseComp-en | 67.6 | 超过 Gemini-3-Pro |
| ScreenSpot-Pro | 73.1 | 超过 Gemini 3 Pro (72.7) |
| ZeroBench | 11.0 | 超过 Gemini-3-Pro (10.0) |
| MathVista | 87.7 | - |
| MathVision | 81.3 | - |
| VideoHolmes | 65.5 | - |
| MotionBench | 70.6 | - |
| Agent工具调用 | 63.1% | 较之前提升34.5个百分点 |
| 推理与数学 | 74.4% | 较之前提升8.7个百分点 |

---

## 输出JSON格式

文件命名：`gemini3-doubao18.json`

```json
{
  "abilities": [
    {
      "id": "agent",
      "name": "更强Agent能力",
      "icon": "💡",
      "color": "#6366f1",
      "tags": ["工具调用", "复杂指令遵循", "OS Agent能力", "GUI Agent", "BrowserComp全球领先"],
      "demos": [
        {
          "name": "Demo标题（简洁有力，如：全网比价+一键下单）",
          "subtitle": "展示什么能力（如：展示GUI Agent能力 + 十余工具串联调用）",
          "scene": "使用场景描述（2-3句话说明用户痛点和场景）",
          "steps": [
            "① 第一步操作描述",
            "② 第二步操作描述",
            "③ 第三步操作描述"
          ],
          "coreDisplay": "核心展示：该Demo展示的核心能力点",
          "expectedEffect": "预期效果：Demo演示后的预期展示效果（1-2句话）"
        }
      ]
    },
    {
      "id": "multimodal",
      "name": "更强多模态能力",
      "icon": "👁️",
      "color": "#06b6d4",
      "tags": ["视觉推理", "视频理解", "1280帧", "ZeroBench全球领先"],
      "demos": []
    },
    {
      "id": "llm",
      "name": "更强LLM能力",
      "icon": "🧠",
      "color": "#f59e0b",
      "tags": ["推理与数学", "256K超长上下文", "Token效率领先"],
      "demos": []
    }
  ]
}
```

---

## Demo设计原则

1. **差异化**：突出豆包1.8相比竞品（如Gemini 3）的独特优势
2. **可演示**：Demo必须是可以实际录屏演示的，不是纯概念
3. **有冲击力**：选择让观众"哇"的场景，而非平淡的功能展示
4. **贴近真实**：场景要贴近用户真实痛点，不要太学术化
5. **步骤清晰**：每个步骤都要具体可执行，不要模糊描述

---

## 每个能力方向的Demo数量

- Agent能力：6个Demo
- 多模态能力：6个Demo
- LLM能力：6个Demo

共计：18个Demo

---

## 执行步骤

### Phase 1: 生成Demo数据
1. 基于上述豆包1.8的三大能力优势，设计18个Demo
2. 按上述JSON格式组织数据

### Phase 2: 输出JSON文件
3. 输出到项目根目录的 `gemini3-doubao18.json` 文件

### Phase 3: 写入飞书多维表格
4. 获取飞书 Access Token（使用 FEISHU_APP_SECRET 环境变量）
5. 遍历所有Demo，逐条写入飞书豆包Demo创意表
6. 记录成功/失败状态

### Phase 4: 结果汇报
7. 告知用户：
   - JSON文件路径
   - 飞书写入结果（成功数/失败数）
   - 失败记录详情（如有）

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

### 批量创建记录
```javascript
// 将Demo数据转换为飞书记录格式
function convertToFeishuRecord(demo, ability) {
  return {
    fields: {
      "Demo名称": demo.name,
      "副标题": demo.subtitle,
      "使用场景": demo.scene,
      "操作步骤": Array.isArray(demo.steps) ? demo.steps.join('\n') : demo.steps,
      "核心展示": demo.coreDisplay,
      "预期效果": demo.expectedEffect,
      "所属能力": ability.name,
      "能力图标": ability.icon
    }
  };
}

// 批量创建记录（飞书支持一次最多500条）
await fetch(
  `https://open.feishu.cn/open-apis/bitable/v1/apps/PTZxbnALPai6Zys0RNYcp9sznWe/tables/tblj14LfBtbNpSNR/records/batch_create`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      records: allRecords
    })
  }
);
```

### 清空表格（可选，用于重新生成）
```javascript
// 先获取所有记录ID
const records = await fetch(
  `https://open.feishu.cn/open-apis/bitable/v1/apps/PTZxbnALPai6Zys0RNYcp9sznWe/tables/tblj14LfBtbNpSNR/records?page_size=100`,
  { headers: { 'Authorization': `Bearer ${token}` } }
);

// 批量删除
await fetch(
  `https://open.feishu.cn/open-apis/bitable/v1/apps/PTZxbnALPai6Zys0RNYcp9sznWe/tables/tblj14LfBtbNpSNR/records/batch_delete`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      records: recordIds
    })
  }
);
```

---

## 示例

### Good Case: 一步到位的完整执行

**用户输入**: `/doubao-demos`

**Claude 执行**:
```
正在生成豆包Demo案例...

[生成中] Agent能力Demo 1/6: 全网比价+一键下单
[生成中] Agent能力Demo 2/6: 企业ERP无API自动化
...
[生成中] LLM能力Demo 6/6: 超长对话不断档

✓ JSON文件已生成: gemini3-doubao18.json

正在写入飞书多维表格...
[写入中] 1/18: 全网比价+一键下单 ✓
[写入中] 2/18: 企业ERP无API自动化 ✓
...
[写入中] 18/18: 超长对话不断档 ✓

=== 豆包Demo生成完成 ===

输出结果：
- JSON文件：gemini3-doubao18.json（18个Demo）
- 飞书写入：成功 18 条，失败 0 条

下一步：运行 /score-doubao-demos all 为所有Demo评分
```

---

## 错误处理

### 飞书写入失败
| 错误类型 | 处理方式 |
|----------|----------|
| Token过期 | 自动刷新Token后重试 |
| 字段不存在 | 记录警告，跳过该字段 |
| 网络超时 | 自动重试3次 |
| 权限不足 | 报错并提示检查飞书应用权限 |

### 原则
- JSON文件始终生成（即使飞书写入失败）
- 飞书写入失败不影响其他记录
- 最后统一汇报成功/失败数量

---

## 限制与边界

### 本技能适用于
- 生成豆包大模型对标竞品的Demo案例
- 输出前端可用的JSON数据文件
- **直接写入飞书多维表格**
- 基于豆包能力优势设计展示方案

### 本技能不适用于
- 分析飞书多维表格数据（请使用 analyze-demos 技能）
- 修改现有Demo记录（会创建新记录）
- 非豆包模型的Demo生成
- 为Demo评分（请使用 score-doubao-demos 技能）
