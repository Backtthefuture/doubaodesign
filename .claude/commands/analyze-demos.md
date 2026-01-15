# 分析飞书多维表格中的 Gemini Demo 记录

## 静默执行协议
- 不要询问确认，直接执行
- 不要中途停顿，一次性完成所有处理
- 遇到错误时记录并继续，不要中断
- 使用默认值填充缺失数据

## 任务
自动分析飞书多维表格中未完成的 Demo 记录，生成以下字段：
- 所属场景（单选）
- 模型能力（多选）
- 豆包创意标题
- 豆包创意描述
- 豆包标签
- 趣味分（1-100）
- 实用分（1-100）

## 执行步骤

### 1. 读取配置
读取以下配置文件：
- `.feishu.config.json` - 飞书 API 配置
- `skills/analyze-demos/config/.gemini.config.json` - Gemini API 配置

### 2. 获取飞书数据
1. 调用飞书 API 获取 access token
2. 获取多维表格所有记录
3. 筛选未完成记录（任意生成字段为空的记录）

### 3. 处理每条记录
对每条未完成记录，依次调用 Gemini API：

**调用 1 - 场景分类**
- 读取 `skills/analyze-demos/prompts/场景分类.md`
- 输入：Prompt描述
- 输出：所属场景（18选1）

**调用 2 - 能力识别**
- 读取 `skills/analyze-demos/prompts/能力识别.md`
- 输入：Prompt描述
- 输出：模型能力（JSON数组）

**调用 3 - 创意生成（完整版）**
- 读取 `skills/analyze-demos/prompts/创意生成_完整版.md`
- 输入：Prompt描述
- 输出：JSON {title, description, tags, example_prompt, steps}

**调用 4 - 评分**
- 读取 `skills/analyze-demos/prompts/评分标准.md`
- 输入：豆包创意标题 + 豆包创意描述（来自调用3的结果）
- 输出：JSON {interesting_score, useful_score}

### 4. 写入飞书
调用飞书 API 更新记录字段

### 5. 输出统计
```
=== Demo 分析完成 ===
处理统计：
- 总记录数：XX
- 成功：XX
- 失败：XX
- 跳过（已完成）：XX
```

## Gemini API 调用模板
```python
import requests

def call_gemini(prompt):
    config = json.load(open("skills/analyze-demos/config/.gemini.config.json"))
    resp = requests.post(
        f"{config['base_url']}/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {config['api_key']}",
            "Content-Type": "application/json"
        },
        json={
            "model": config["model_id"],
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.7,
            "max_tokens": 1024
        },
        timeout=60
    )
    return resp.json()["choices"][0]["message"]["content"]
```

## 飞书 API 调用模板
```python
def get_feishu_token(config):
    resp = requests.post(
        "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
        json={"app_id": config["app_id"], "app_secret": config["app_secret"]}
    )
    return resp.json()["tenant_access_token"]

def update_record(token, config, record_id, fields):
    resp = requests.put(
        f"https://open.feishu.cn/open-apis/bitable/v1/apps/{config['app_token']}/tables/{config['table_id']}/records/{record_id}",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"fields": fields}
    )
    return resp.json()
```

## 错误处理
| 错误 | 处理方式 |
|------|----------|
| API 超时 | 重试3次，间隔2秒 |
| JSON 解析失败 | 使用默认值 |
| 飞书写入失败 | 记录错误，继续下一条 |

## 默认值
| 字段 | 默认值 |
|------|--------|
| 所属场景 | 一句话生成App |
| 模型能力 | ["代码狂魔"] |
| 趣味分 | 50 |
| 实用分 | 50 |

$ARGUMENTS
