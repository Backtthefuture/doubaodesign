#!/usr/bin/env python3
"""
/analyze-demos 完整执行脚本
"""
import json
import requests
import time
import sys
import os

os.chdir("/Users/superhuang/Documents/Gemini3_Demo_分享包")

# ========== 静默执行协议 ==========
# - 不询问确认，直接执行
# - 不中途停顿，一次性完成
# - 遇到错误记录并继续
# - 使用默认值填充缺失数据

print("=" * 60)
print("  /analyze-demos 执行中...")
print("=" * 60)

# ========== Phase 1: 读取配置 ==========
print("\n[Phase 1] 读取配置文件...")

with open(".feishu.config.json", "r") as f:
    feishu_config = json.load(f)
print(f"  ✓ 飞书配置: app_id={feishu_config['app_id'][:10]}...")

with open("skills/analyze-demos/config/.gemini.config.json", "r") as f:
    gemini_config = json.load(f)
print(f"  ✓ Gemini配置: model={gemini_config['model_id']}")

# 加载提示词
prompts = {}
for name in ["场景分类", "能力识别", "创意生成", "评分标准"]:
    with open(f"skills/analyze-demos/prompts/{name}.md", "r") as f:
        prompts[name] = f.read()
print(f"  ✓ 提示词: {len(prompts)} 个已加载")

# ========== Phase 2: 获取飞书数据 ==========
print("\n[Phase 2] 获取飞书数据...")

# 获取 token
token_resp = requests.post(
    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
    json={"app_id": feishu_config["app_id"], "app_secret": feishu_config["app_secret"]}
)
token = token_resp.json().get("tenant_access_token")
print(f"  ✓ Access Token: {token[:20]}...")

# 获取所有记录
records = []
page_token = None
while True:
    url = f"https://open.feishu.cn/open-apis/bitable/v1/apps/{feishu_config['app_token']}/tables/{feishu_config['table_id']}/records?page_size=100"
    if page_token:
        url += f"&page_token={page_token}"
    resp = requests.get(url, headers={"Authorization": f"Bearer {token}"})
    data = resp.json().get("data", {})
    records.extend(data.get("items", []))
    if not data.get("has_more"):
        break
    page_token = data.get("page_token")

print(f"  ✓ 总记录数: {len(records)}")

# 筛选未完成记录
GENERATED_FIELDS = ["所属场景", "模型能力", "豆包创意标题", "豆包创意描述", "豆包标签", "示例Prompt", "实现步骤", "趣味分", "实用分"]

# 有效场景列表（18选1）
VALID_SCENES = [
    "一句话生成App", "一句话做网站", "一句话造游戏", "一句话出3D",
    "一句话写系统", "一句话搞特效", "图生万物", "视频秒懂",
    "文档秒读", "AI替你干活", "一句话出图", "一句话做PPT",
    "一句话做表格", "写作助手", "AI当老师", "AI陪聊",
    "视觉考AI", "奇葩挑战"
]

# 场景名称映射（处理历史数据中的非标准名称）
SCENE_MAPPING = {
    "看图知一切": "图生万物",
    "图片理解": "图生万物",
    "视频理解": "视频秒懂",
    "文档处理": "文档秒读",
    "Agent": "AI替你干活",
    "代码生成": "一句话生成App",
}

incomplete = []
for r in records:
    fields = r.get("fields", {})
    missing = [f for f in GENERATED_FIELDS if not fields.get(f)]

    # 检查场景是否有效（如果已有场景但不在有效列表中，也需要重新处理）
    existing_scene = fields.get("所属场景")
    if existing_scene:
        if existing_scene in SCENE_MAPPING:
            # 需要映射到正确名称
            if "所属场景" not in missing:
                missing.append("所属场景")
        elif existing_scene not in VALID_SCENES:
            # 非有效场景，需要重新分类
            if "所属场景" not in missing:
                missing.append("所属场景")

    if missing:
        incomplete.append((r, missing))

print(f"  ✓ 未完成记录: {len(incomplete)}")

if not incomplete:
    print("\n" + "=" * 60)
    print("  所有记录已完成，无需处理")
    print("=" * 60)
    sys.exit(0)

# ========== Phase 3: 调用 Gemini 生成字段 ==========
print("\n[Phase 3] 处理未完成记录...")

def call_gemini(prompt, max_retries=3, temperature=0.3, max_tokens=2048):
    """调用 Gemini API"""
    for attempt in range(max_retries):
        try:
            resp = requests.post(
                f"{gemini_config['base_url']}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {gemini_config['api_key']}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": gemini_config["model_id"],
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": temperature,
                    "max_tokens": max_tokens
                },
                timeout=120  # pro模型需要更长超时
            )
            if resp.status_code == 200:
                content = resp.json()["choices"][0]["message"]["content"]
                return content
            elif resp.status_code == 429:
                print(f"[Rate limited, waiting...]", end=" ", flush=True)
                time.sleep(10)
            else:
                print(f"[API error {resp.status_code}]", end=" ", flush=True)
        except requests.exceptions.Timeout:
            print(f"[Timeout, retry {attempt+1}]", end=" ", flush=True)
        except Exception as e:
            print(f"[Error: {str(e)[:30]}]", end=" ", flush=True)
        if attempt < max_retries - 1:
            time.sleep(3)
    return None

def parse_json(text, default=None):
    """解析 JSON，失败返回默认值"""
    if not text:
        return default
    try:
        clean = text.strip()
        # 处理 markdown 代码块
        if "```json" in clean:
            clean = clean.split("```json")[1].split("```")[0].strip()
        elif "```" in clean:
            clean = clean.split("```")[1].split("```")[0].strip()
        # 处理 <think> 标签（推理模型可能返回）
        if "<think>" in clean:
            clean = clean.split("</think>")[-1].strip()
        # 尝试找到 JSON 对象或数组
        if clean.startswith("{") or clean.startswith("["):
            pass  # 已经是 JSON
        else:
            # 尝试找到第一个 { 或 [
            for i, c in enumerate(clean):
                if c in "{[":
                    clean = clean[i:]
                    break
        # 找到匹配的结束括号
        if clean.startswith("{"):
            depth = 0
            for i, c in enumerate(clean):
                if c == "{": depth += 1
                elif c == "}": depth -= 1
                if depth == 0:
                    clean = clean[:i+1]
                    break
        elif clean.startswith("["):
            depth = 0
            for i, c in enumerate(clean):
                if c == "[": depth += 1
                elif c == "]": depth -= 1
                if depth == 0:
                    clean = clean[:i+1]
                    break
        return json.loads(clean)
    except Exception as e:
        print(f"[JSON解析失败: {str(e)[:20]}]", end=" ", flush=True)
        return default

success = []
failed = []

for i, (record, missing) in enumerate(incomplete):
    fields = record.get("fields", {})
    demo_name = fields.get("Demo名称", "未知")
    prompt_desc = fields.get("Prompt描述", "")
    record_id = record.get("record_id")

    print(f"\n[{i+1}/{len(incomplete)}] {demo_name}")
    print(f"  缺失: {missing}")

    results = {}

    try:
        # Step 1: 场景分类
        if "所属场景" in missing:
            existing_scene = fields.get("所属场景")
            # 先检查是否可以直接映射
            if existing_scene and existing_scene in SCENE_MAPPING:
                results["所属场景"] = SCENE_MAPPING[existing_scene]
                print(f"  [1/4] 场景映射... → {results['所属场景']} (从 {existing_scene})")
            else:
                print("  [1/4] 场景分类...", end=" ", flush=True)
                result = call_gemini(prompts["场景分类"] + f'\n\n**输入**: "{prompt_desc}"\n**输出**:')
                scene = result.strip().replace('"', '').replace("'", "") if result else "一句话生成App"
                # 验证并映射
                if scene in SCENE_MAPPING:
                    scene = SCENE_MAPPING[scene]
                elif scene not in VALID_SCENES:
                    scene = "一句话生成App"  # 默认值
                results["所属场景"] = scene
                print(f"→ {results['所属场景']}")

        # Step 2: 能力识别
        if "模型能力" in missing:
            print("  [2/4] 能力识别...", end=" ", flush=True)
            result = call_gemini(prompts["能力识别"] + f'\n\n**输入**: "{prompt_desc}"\n**输出**:')
            abilities = parse_json(result, ["代码狂魔"])
            results["模型能力"] = abilities if isinstance(abilities, list) else ["代码狂魔"]
            print(f"→ {results['模型能力']}")

        # Step 3: 创意生成 (第一部分：标题、描述、标签、豆包标签)
        if any(f in missing for f in ["豆包创意标题", "豆包创意描述", "豆包标签"]):
            print("  [3/6] 创意生成(标题/描述/标签)...", end=" ", flush=True)
            # 创意生成使用稍高温度
            result = call_gemini(prompts["创意生成"].split("# 示例Prompt生成")[0] + f'\n\n输入: "{prompt_desc}"\n输出:', temperature=0.5, max_tokens=2048)
            creative = parse_json(result, {})
            if "豆包创意标题" in missing:
                results["豆包创意标题"] = creative.get("title", demo_name)
            if "豆包创意描述" in missing:
                results["豆包创意描述"] = creative.get("description", prompt_desc[:50])
            if "豆包标签" in missing:
                results["豆包标签"] = creative.get("doubao_tags", creative.get("tags", "AI生成"))
            print(f"→ {results.get('豆包创意标题', 'OK')}")

        # Step 4: 示例Prompt生成
        if "示例Prompt" in missing:
            print("  [4/6] 示例Prompt生成...", end=" ", flush=True)
            # 获取已生成或当前的标题和描述
            title = results.get("豆包创意标题") or fields.get("豆包创意标题", demo_name)
            description = results.get("豆包创意描述") or fields.get("豆包创意描述", prompt_desc[:50])

            prompt_gen_section = prompts["创意生成"].split("# 示例Prompt生成")[1].split("---")[0]
            # 示例Prompt使用稍高温度获得更自然的表达
            result = call_gemini(prompt_gen_section + f'\n\nDemo标题: {title}\nDemo描述: {description}\nDemo原始描述: {prompt_desc}\n\n输出:', temperature=0.6, max_tokens=1024)
            if result:
                # 清理可能的引号和换行
                example_prompt = result.strip().replace('"', '').replace("'", "").split('\n')[0]
                results["示例Prompt"] = example_prompt
                print(f"→ {example_prompt[:30]}...")
            else:
                results["示例Prompt"] = f"帮我{demo_name}"
                print(f"→ 使用默认值")

        # Step 5: 实现步骤生成
        if "实现步骤" in missing:
            print("  [5/6] 实现步骤生成...", end=" ", flush=True)
            # 获取已生成或当前的相关字段
            title = results.get("豆包创意标题") or fields.get("豆包创意标题", demo_name)
            description = results.get("豆包创意描述") or fields.get("豆包创意描述", prompt_desc[:50])
            example_prompt = results.get("示例Prompt") or fields.get("示例Prompt", f"帮我{demo_name}")

            steps_section = prompts["创意生成"].split("# 实现步骤生成")[1]
            # 实现步骤需要更大的 token 限制
            result = call_gemini(steps_section + f'\n\nDemo标题: {title}\nDemo描述: {description}\nDemo原始描述: {prompt_desc}\n示例Prompt: {example_prompt}\n\n输出:', temperature=0.4, max_tokens=3000)
            steps = parse_json(result, [])
            if isinstance(steps, list) and len(steps) > 0:
                # 将步骤数组转换为带序号的文本
                steps_text = "\n".join([f"{i+1}. {step}" for i, step in enumerate(steps)])
                results["实现步骤"] = steps_text
                print(f"→ {len(steps)}个步骤")
            else:
                results["实现步骤"] = f"1. 用户输入需求\n2. AI分析并执行\n3. 生成结果"
                print(f"→ 使用默认值")

        # Step 6: 评分
        if any(f in missing for f in ["趣味分", "实用分"]):
            print("  [6/6] 评分...", end=" ", flush=True)
            result = call_gemini(prompts["评分标准"] + f'\n\n**输入**: "{prompt_desc}"\n**输出**:')
            scores = parse_json(result, {})
            if "趣味分" in missing:
                results["趣味分"] = min(100, max(1, int(scores.get("interesting_score", 50))))
            if "实用分" in missing:
                results["实用分"] = min(100, max(1, int(scores.get("useful_score", 50))))
            print(f"→ 趣味={results.get('趣味分', '-')}, 实用={results.get('实用分', '-')}")

        # ========== Phase 4: 写入飞书 ==========
        print("  [写入] 更新飞书...", end=" ", flush=True)
        update_resp = requests.put(
            f"https://open.feishu.cn/open-apis/bitable/v1/apps/{feishu_config['app_token']}/tables/{feishu_config['table_id']}/records/{record_id}",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"fields": results}
        )
        if update_resp.json().get("code") == 0:
            print("✓ 成功")
            success.append(demo_name)
        else:
            print(f"✗ 失败: {update_resp.json().get('msg')}")
            failed.append((demo_name, update_resp.json().get("msg")))

    except Exception as e:
        print(f"  ✗ 异常: {e}")
        failed.append((demo_name, str(e)))

# ========== Phase 5: 输出统计 ==========
print("\n" + "=" * 60)
print("  Demo 分析完成")
print("=" * 60)
print(f"\n处理统计：")
print(f"  - 总记录数：{len(records)}")
print(f"  - 已完成：{len(records) - len(incomplete)}")
print(f"  - 本次处理：{len(incomplete)}")
print(f"  - 成功：{len(success)}")
print(f"  - 失败：{len(failed)}")

if failed:
    print("\n失败记录：")
    for name, reason in failed:
        print(f"  - {name}: {reason}")

if success:
    print("\n成功记录：")
    for name in success:
        print(f"  ✓ {name}")

print("\n所有结果已写入飞书表格。")
