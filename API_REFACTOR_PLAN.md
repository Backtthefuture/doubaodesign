# API 重构方案 - 合并为通用 API

## 一、问题分析

### 当前状态
- **API 文件数量**: 13 个
- **Vercel Hobby 限制**: 最多 12 个 Serverless Functions
- **部署错误**: `No more than 12 Serverless Functions can be added to a Deployment`

### 现有 API 列表
```
api/
├── records.js                    # Gemini3 竞品 Demo (tbl3fl3SZd9YxzJ6)
├── gpt52-records.js              # GPT5.2 竞品 Demo (tblGpra2WmGUFXM0)
├── skills-records.js             # Skills 竞品 Demo (tbl6MNuG7sVaCZp1)
├── doubao-records.js             # Gemini3 豆包 Demo (tblj14LfBtbNpSNR)
├── gpt52-doubao-records.js       # GPT5.2 豆包 Demo (tbltvxTCco9qZZyj)
├── skills-doubao-records.js      # Skills 豆包 Demo (tblyEaRH1YpwAPxQ)
├── update-record.js              # Gemini3 更新竞品
├── gpt52-update-record.js        # GPT5.2 更新竞品
├── skills-update-record.js       # Skills 更新竞品
├── update-doubao-record.js       # Gemini3 更新豆包
├── gpt52-update-doubao-record.js # GPT5.2 更新豆包
├── media.js                      # 媒体文件处理
└── upload-image.js               # 图片上传
```

---

## 二、重构方案设计

### 目标
将 13 个 API 合并为 6 个通用 API，通过查询参数 `?model=xxx` 区分不同模型。

### 重构后的 API 结构
```
api/
├── records.js              # 通用：获取竞品 Demo 记录 (?model=gemini3|gpt52|skills)
├── doubao-records.js       # 通用：获取豆包 Demo 记录 (?model=gemini3|gpt52|skills)
├── update-record.js        # 通用：更新竞品记录 (?model=gemini3|gpt52|skills)
├── update-doubao-record.js # 通用：更新豆包记录 (?model=gemini3|gpt52|skills)
├── media.js                # 媒体文件处理（保持不变）
└── upload-image.js         # 图片上传（保持不变）
```

**API 数量**: 6 个 ✅ (远低于 12 个限制)

---

## 三、配置映射设计

### 3.1 表格配置映射

在每个通用 API 中添加配置对象：

```javascript
const TABLE_CONFIGS = {
    gemini3: {
        recordsTable: 'tbl3fl3SZd9YxzJ6',    // 竞品 Demo 表
        doubaoTable: 'tblj14LfBtbNpSNR',     // 豆包 Demo 表
        name: 'Gemini 3'
    },
    gpt52: {
        recordsTable: 'tblGpra2WmGUFXM0',    // 竞品 Demo 表
        doubaoTable: 'tbltvxTCco9qZZyj',     // 豆包 Demo 表
        name: 'GPT 5.2'
    },
    skills: {
        recordsTable: 'tbl6MNuG7sVaCZp1',    // 竞品 Demo 表
        doubaoTable: 'tblyEaRH1YpwAPxQ',     // 豆包 Demo 表
        name: 'Skills'
    }
    // 未来可以继续添加新模型，无需创建新 API 文件
};
```

### 3.2 API 调用方式

**旧方式**:
```javascript
GET /api/gpt52-records
GET /api/skills-records
```

**新方式**:
```javascript
GET /api/records?model=gpt52
GET /api/records?model=skills
```

---

## 四、实施步骤

### Phase 1: 创建通用 API 文件（备份旧文件）

#### 步骤 1.1: 创建通用 `records.js`
- 基于现有 `records.js` 修改
- 添加 `TABLE_CONFIGS` 配置映射
- 从 URL 查询参数获取 `model`
- 根据 `model` 选择对应的 `tableId`

#### 步骤 1.2: 创建通用 `doubao-records.js`
- 基于现有 `doubao-records.js` 修改
- 添加配置映射和 model 参数处理
- 保留 `transformDoubaoRecords` 数据转换逻辑

#### 步骤 1.3: 创建通用 `update-record.js`
- 基于现有 `update-record.js` 修改
- 支持通过 POST body 传递 `model` 参数

#### 步骤 1.4: 创建通用 `update-doubao-record.js`
- 基于现有 `update-doubao-record.js` 修改
- 支持通过 POST body 传递 `model` 参数

### Phase 2: 更新前端 API 调用路径

#### 修改 `index.html` 中的 MODEL_CONFIGS

**旧配置**:
```javascript
gemini3: {
    api: {
        records: '/api/records',
        doubaoRecords: '/api/doubao-records',
        updateRecord: '/api/update-record',
        updateDoubaoRecord: '/api/update-doubao-record'
    }
},
gpt52: {
    api: {
        records: '/api/gpt52-records',
        doubaoRecords: '/api/gpt52-doubao-records',
        updateRecord: '/api/gpt52-update-record',
        updateDoubaoRecord: '/api/gpt52-update-doubao-record'
    }
},
skills: {
    api: {
        records: '/api/skills-records',
        doubaoRecords: '/api/skills-doubao-records',
        updateRecord: '/api/skills-update-record',
        updateDoubaoRecord: '/api/skills-update-doubao-record'
    }
}
```

**新配置**:
```javascript
gemini3: {
    api: {
        records: '/api/records?model=gemini3',
        doubaoRecords: '/api/doubao-records?model=gemini3',
        updateRecord: '/api/update-record?model=gemini3',
        updateDoubaoRecord: '/api/update-doubao-record?model=gemini3'
    }
},
gpt52: {
    api: {
        records: '/api/records?model=gpt52',
        doubaoRecords: '/api/doubao-records?model=gpt52',
        updateRecord: '/api/update-record?model=gpt52',
        updateDoubaoRecord: '/api/update-doubao-record?model=gpt52'
    }
},
skills: {
    api: {
        records: '/api/records?model=skills',
        doubaoRecords: '/api/doubao-records?model=skills',
        updateRecord: '/api/update-record?model=skills',
        updateDoubaoRecord: '/api/update-doubao-record?model=skills'
    }
}
```

### Phase 3: 测试验证

#### 3.1 本地测试
- 测试 Gemini3 标签页数据加载
- 测试 GPT5.2 标签页数据加载
- 测试 Skills 标签页数据加载
- 测试编辑功能（更新记录）

#### 3.2 API 回退测试
- 测试 API 失败时 mock 数据回退
- 验证错误提示信息

### Phase 4: 删除旧 API 文件

删除以下 9 个旧 API 文件：
```bash
rm api/gpt52-records.js
rm api/skills-records.js
rm api/gpt52-doubao-records.js
rm api/skills-doubao-records.js
rm api/gpt52-update-record.js
rm api/skills-update-record.js
rm api/gpt52-update-doubao-record.js
# update-doubao-record.js 需要检查是否有 skills 版本
```

### Phase 5: 提交和部署

```bash
git add .
git commit -m "refactor: 合并 API 为通用接口，解决 Vercel 12 个 Function 限制"
git push origin main
```

---

## 五、关键代码示例

### 5.1 通用 `records.js` 核心逻辑

```javascript
const TABLE_CONFIGS = {
    gemini3: { recordsTable: 'tbl3fl3SZd9YxzJ6', name: 'Gemini 3' },
    gpt52: { recordsTable: 'tblGpra2WmGUFXM0', name: 'GPT 5.2' },
    skills: { recordsTable: 'tbl6MNuG7sVaCZp1', name: 'Skills' }
};

export default async function handler(req, res) {
    // 获取 model 参数
    const model = req.query.model || 'gemini3';

    // 验证 model 参数
    const config = TABLE_CONFIGS[model];
    if (!config) {
        return res.status(400).json({
            code: -1,
            error: `Invalid model: ${model}. Supported: ${Object.keys(TABLE_CONFIGS).join(', ')}`
        });
    }

    // 使用对应的 tableId
    const tableId = config.recordsTable;

    // ... 其余逻辑保持不变
}
```

### 5.2 通用 `update-record.js` 核心逻辑

```javascript
export default async function handler(req, res) {
    const { model, recordId, fields } = req.body;

    const config = TABLE_CONFIGS[model];
    if (!config) {
        return res.status(400).json({
            code: -1,
            error: `Invalid model: ${model}`
        });
    }

    const tableId = config.recordsTable;

    // ... 更新逻辑
}
```

---

## 六、优势分析

### 6.1 解决 Vercel 限制
- ✅ API 数量从 13 个减少到 6 个
- ✅ 远低于 12 个限制，留有扩展空间

### 6.2 可扩展性
- ✅ 添加新模型只需修改配置，无需创建新 API
- ✅ 未来可以无限扩展模型数量

### 6.3 代码维护性
- ✅ 代码复用，减少重复代码
- ✅ 修改一处即可影响所有模型
- ✅ 统一的错误处理和日志记录

### 6.4 性能影响
- ⚠️ 无性能影响，只是参数传递方式改变
- ✅ Token 缓存、分页等优化保持不变

---

## 七、风险评估

### 7.1 兼容性风险
- **风险**: 前端 API 路径改变可能导致旧版本不兼容
- **缓解**: 一次性修改所有前端配置，确保同步部署

### 7.2 测试风险
- **风险**: 需要测试所有模型的所有功能
- **缓解**: 按照测试清单逐项验证

### 7.3 回滚风险
- **风险**: 如果出现问题需要快速回滚
- **缓解**: 保留旧 API 文件备份，可以快速恢复

---

## 八、时间估算

- **Phase 1**: 创建通用 API - 30 分钟
- **Phase 2**: 更新前端配置 - 10 分钟
- **Phase 3**: 测试验证 - 20 分钟
- **Phase 4**: 删除旧文件 - 5 分钟
- **Phase 5**: 提交部署 - 5 分钟

**总计**: 约 70 分钟

---

## 九、验证清单

### 功能验证
- [ ] Gemini3 标签页数据加载正常
- [ ] GPT5.2 标签页数据加载正常
- [ ] Skills 标签页数据加载正常
- [ ] 豆包展示区渲染正常
- [ ] 编辑功能正常（更新竞品记录）
- [ ] 编辑功能正常（更新豆包记录）
- [ ] 筛选功能正常
- [ ] 排序功能正常
- [ ] API 失败时 mock 回退正常

### 部署验证
- [ ] Vercel 部署成功（无 12 个 Function 限制错误）
- [ ] 生产环境所有功能正常
- [ ] 控制台无错误日志

---

## 十、后续优化建议

1. **添加 API 版本控制**: 支持 `/api/v1/records` 和 `/api/v2/records`
2. **添加请求日志**: 记录每个 model 的请求次数和响应时间
3. **添加缓存层**: 使用 Vercel Edge Config 缓存热点数据
4. **添加监控告警**: 监控 API 错误率和响应时间

---

## 十一、总结

本方案通过合并相似 API 为通用接口，彻底解决了 Vercel Hobby 计划的 12 个 Function 限制问题，同时提升了代码的可维护性和可扩展性。实施后，无论添加多少个新模型标签页，API 数量都将保持在 6 个，为未来扩展留下充足空间。
