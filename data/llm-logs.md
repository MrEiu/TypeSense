# TypeSense LLM 交互链路审计日志
> 自动记录系统所有发送给大模型的 Prompt 内容与大模型的完整原始响应。

---

## [2026/9/9 12:58:06] 测试连通性 (✅ 成功响应)

- **模型**: `test-model`
- **耗时**: `50 ms`

### 📥 传给 LLM 的请求内容
#### 💬 [USER]
```text
hello
```

### 📤 LLM 产出内容
#### 🤖 LLM 原始返回
```json
world
```

---

## [2026/9/9 13:02:33] 极速直出全卷 (generateDirectSurvey) (❌ 异常失败)

- **模型**: `deepseek-v4-flash`
- **耗时**: `60748 ms`
- **附加元信息**: `{"targetCount":25,"enableJumpLogic":true}`

### 📥 传给 LLM 的请求内容
#### 💬 [SYSTEM]
```text
你是一位资深调研设计专家。请根据用户的调研诉求生成一份高质量的问卷。
必须直接输出纯 JSON，严禁输出任何 Markdown 标记、代码块或多余解释，结构严格如下：

{
  "title": "问卷标题",
  "description": "问卷说明与背景",
  "questions": [
    {
      "id": "q1",
      "type": "single_choice",
      "title": "题目题干",
      "options": ["选项0", "选项1"],
      "required": true,
      "jump": [
        { "when": { "q1": 0 }, "to": "exit" }
      ]
    }
  ]
}

契约规范：
1. id 严格为 q1, q2, q3... 顺序递增。
2. type 仅限：single_choice（单选题）、multiple_choice（多选题）、likert_scale（量表题）、text_input（填空题）。
3. 除 text_input 外必须提供 options 字符串数组；text_input 必须省略 options 并可提供 placeholder。
4. jump（按需配置）：跳转目标为题号 "qK"、"end"（正常完成）或 "exit"（提前甄别终止）。普通无跳转的题目必须完全省略 jump。
5. 变量与流转机制：每道题目的答题结果自动作为变量（以题号如 q1, q2 直接命名与引用），无需额外注册变量。跳转条件可直接根据前序题号判断（如 { "q1": 0 } 或 { "q2": { ">=": 3 } }）。除非确实需要复合数学计算，否则无需生成 set 字段；未被使用的变量注册将在生成后自动清除。
6. 自由度：根据实际调研场景与目标领域，完全自主决定题型组合、题干用词与题目流向。
```

#### 💬 [USER]
```text
调研需求：无
目标题目数量：25 题左右
参考逻辑模板与跳转范式：
【参考逻辑拓扑模板：筛选分流模板 (Screen & Route)】
设计意图：入口前置甄别，根据选项分流至主流程或提前结束
拓扑结构范式：
  - [q1] (single_choice) 题干: "问题", 选项: [选项A, 选项B] -> 条件跳转: [{"when":{"q1":0},"to":"q2"},{"when":{"q1":1},"to":"exit"}]
  - [q2] (single_choice) 题干: "问题", 选项: [选项A, 选项B, 选项C]
  - [q3] (single_choice) 题干: "问题", 选项: [选项A, 选项B]

【参考逻辑拓扑模板：分层深入模板 (Progressive Drill-down)】
设计意图：一级主分类，按选项分流至各自专属子题，最后汇合公共题
拓扑结构范式：
  - [q1] (single_choice) 题干: "问题", 选项: [选项A, 选项B, 选项C] -> 条件跳转: [{"when":{"q1":0},"to":"q2"},{"when":{"q1":1},"to":"q3"},{"when":{"q1":2},"to":"q4"}]
  - [q2] (single_choice) 题干: "问题", 选项: [选项A, 选项B] -> 跳转目标: q5
  - [q3] (single_choice) 题干: "问题", 选项: [选项A, 选项B] -> 跳转目标: q5
  - [q4] (single_choice) 题干: "问题", 选项: [选项A, 选项B] -> 跳转目标: q5
  - [q5] (single_choice) 题干: "问题", 选项: [选项A, 选项B, 选项C]

【参考逻辑拓扑模板：条件追问模板 (Conditional Follow-up)】
设计意图：常规回答顺延主流程，特殊或异常选项临时插入追问后回流
拓扑结构范式：
  - [q1] (single_choice) 题干: "问题", 选项: [选项A, 选项B, 选项C] -> 条件跳转: [{"when":{"q1":2},"to":"q3"},{"else":true,"to":"q2"}]
  - [q2] (single_choice) 题干: "问题", 选项: [选项A, 选项B] -> 跳转目标: q4
  - [q3] (single_choice) 题干: "问题", 选项: [选项A, 选项B] -> 跳转目标: q4
  - [q4] (single_choice) 题干: "问题", 选项: [选项A, 选项B, 选项C]

【参考逻辑拓扑模板：等级分流模板 (Measure & Route)】
设计意图：通过关键测定题目将受访者划分不同等级，并分流至不同后续路线
拓扑结构范式：
  - [q1] (single_choice) 题干: "问题", 选项: [选项A, 选项B, 选项C] -> 条件跳转: [{"when":{"q1":0},"to":"q2"},{"when":{"q1":1},"to":"q3"},{"when":{"q1":2},"to":"q4"}]
  - [q2] (single_choice) 题干: "问题", 选项: [选项A, 选项B] -> 跳转目标: end
  - [q3] (single_choice) 题干: "问题", 选项: [选项A, 选项B] -> 跳转目标: end
  - [q4] (single_choice) 题干: "问题", 选项: [选项A, 选项B] -> 跳转目标: end
（请吸收参考上述模板中的跳转拓扑结构构建题目流向）
参考资料：
医院常用问卷内容分类——第一部分：就诊前 / 分诊类

用途说明：本部分整理医院在患者进入正式诊疗前常见的问卷内容，可作为问卷生成系统的基础内容模板与 Agent 示例数据。

1. 患者基本信息登记

姓名、年龄、性别、联系方式

身份证 / 医保相关信息

紧急联系人及联系方式

就诊基本信息

2. 就诊原因 / 主诉

本次就诊的主要原因

不适或症状的具体部位

症状开始时间

症状持续时间及变化情况

症状严重程度

是否曾经出现过类似症状

3. 预检分诊问卷

体温

疼痛程度

是否存在呼吸困难

意识状态是否正常

是否存在明显出血等紧急情况

是否具有发热、咳嗽等感染相关症状

是否存在其他需要优先处理的情况

4. 既往史

既往是否患有慢性疾病

既往重大疾病史

既往手术史

既往住院史

家族疾病史

其他与本次就诊相关的既往病史

5. 过敏史

是否存在药物过敏

过敏药物名称

过敏反应表现

是否存在食物过敏

是否存在其他过敏

过敏史的补充说明



适合问卷 Agent 抽象的典型逻辑：

是否有相关症状 → 有 → 进入症状详细采集；无 → 跳过相关问题

是否有既往病史 → 有 → 展开疾病信息；无 → 继续下一部分

是否存在药物过敏 → 有 → 采集药物名称及过敏反应；无 → 跳过

是否存在紧急症状 → 是 → 进入优先分诊 / 风险提示；否 → 正常进入后续问卷
```

### 📤 LLM 产出内容
#### ⚠️ 错误详情
```text
terminated
```

---

## [2026/9/9 23:53:14] 极速直出全卷 (generateDirectSurvey) (❌ 异常失败)

- **模型**: `deepseek-v4-flash`
- **耗时**: `60609 ms`
- **附加元信息**: `{"targetCount":25,"enableJumpLogic":true}`

### 📥 传给 LLM 的请求内容
#### 💬 [SYSTEM]
```text
你是一位资深调研设计专家。请根据用户的调研诉求生成一份高质量的问卷。
必须直接输出纯 JSON，严禁输出任何 Markdown 标记、代码块或多余解释，结构严格如下：

{
  "title": "问卷标题",
  "description": "问卷说明与背景",
  "questions": [
    {
      "id": "q1",
      "type": "single_choice",
      "title": "题目题干",
      "options": ["选项0", "选项1"],
      "required": true,
      "jump": [
        { "when": { "q1": 0 }, "to": "exit" }
      ]
    }
  ]
}

契约规范：
1. id 严格为 q1, q2, q3... 顺序递增。
2. type 仅限：single_choice（单选题）、multiple_choice（多选题）、likert_scale（量表题）、text_input（填空题）。
3. 除 text_input 外必须提供 options 字符串数组；text_input 必须省略 options 并可提供 placeholder。
4. jump（按需配置）：跳转目标为题号 "qK"、"end"（正常完成）或 "exit"（提前甄别终止）。普通无跳转的题目必须完全省略 jump。
5. 变量与流转机制：每道题目的答题结果自动作为变量（以题号如 q1, q2 直接命名与引用），无需额外注册变量。跳转条件可直接根据前序题号判断（如 { "q1": 0 } 或 { "q2": { ">=": 3 } }）。除非确实需要复合数学计算，否则无需生成 set 字段；未被使用的变量注册将在生成后自动清除。
6. 自由度：根据实际调研场景与目标领域，完全自主决定题型组合、题干用词与题目流向。
```

#### 💬 [USER]
```text
调研需求：用户综合体验与满意度调研
目标题目数量：25 题左右
参考逻辑模板与跳转范式：
【参考逻辑流转模板：筛选分流模板 (Screen & Route)】（文件: 01-screen-and-route.json）
设计意图说明：入口前置甄别，根据选项分流至主流程或提前结束
模板完整 JSON 原文：
```json
{
  "id": "screen_and_route",
  "name": "筛选分流模板 (Screen & Route)",
  "description": "入口前置甄别，根据选项分流至主流程或提前结束",
  "questions": [
    {
      "id": "q1",
      "type": "single_choice",
      "title": "问题",
      "options": ["选项A", "选项B"],
      "required": true,
      "jump": [
        { "when": { "q1": 0 }, "to": "q2" },
        { "when": { "q1": 1 }, "to": "exit" }
      ]
    },
    {
      "id": "q2",
      "type": "single_choice",
      "title": "问题",
      "options": ["选项A", "选项B", "选项C"],
      "required": true
    },
    {
      "id": "q3",
      "type": "single_choice",
      "title": "问题",
      "options": ["选项A", "选项B"],
      "required": true
    }
  ]
}
```

【参考逻辑流转模板：分层深入模板 (Progressive Drill-down)】（文件: 02-progressive-drilldown.json）
设计意图说明：一级主分类，按选项分流至各自专属子题，最后汇合公共题
模板完整 JSON 原文：
```json
{
  "id": "progressive_drilldown",
  "name": "分层深入模板 (Progressive Drill-down)",
  "description": "一级主分类，按选项分流至各自专属子题，最后汇合公共题",
  "questions": [
    {
      "id": "q1",
      "type": "single_choice",
      "title": "问题",
      "options": ["选项A", "选项B", "选项C"],
      "required": true,
      "jump": [
        { "when": { "q1": 0 }, "to": "q2" },
        { "when": { "q1": 1 }, "to": "q3" },
        { "when": { "q1": 2 }, "to": "q4" }
      ]
    },
    {
      "id": "q2",
      "type": "single_choice",
      "title": "问题",
      "options": ["选项A", "选项B"],
      "required": true,
      "jump": "q5"
    },
    {
      "id": "q3",
      "type": "single_choice",
      "title": "问题",
      "options": ["选项A", "选项B"],
      "required": true,
      "jump": "q5"
    },
    {
      "id": "q4",
      "type": "single_choice",
      "title": "问题",
      "options": ["选项A", "选项B"],
      "required": true,
      "jump": "q5"
    },
    {
      "id": "q5",
      "type": "single_choice",
      "title": "问题",
      "options": ["选项A", "选项B", "选项C"],
      "required": true
    }
  ]
}
```

【参考逻辑流转模板：针对性评价模板 (Select & Evaluate)】（文件: 03-select-and-evaluate.json）
设计意图说明：选择主体对象后定向跳转至针对该对象的专属评价题
模板完整 JSON 原文：
```json
{
  "id": "select_and_evaluate",
  "name": "针对性评价模板 (Select & Evaluate)",
  "description": "选择主体对象后定向跳转至针对该对象的专属评价题",
  "questions": [
    {
      "id": "q1",
      "type": "single_choice",
      "title": "问题",
      "options": ["选项A", "选项B"],
      "required": true,
      "jump": [
        { "when": { "q1": 0 }, "to": "q2" },
        { "when": { "q1": 1 }, "to": "q3" }
      ]
    },
    {
      "id": "q2",
      "type": "single_choice",
      "title": "问题",
      "options": ["选项A", "选项B", "选项C"],
      "required": true,
      "jump": "q4"
    },
    {
      "id": "q3",
      "type": "single_choice",
      "title": "问题",
      "options": ["选项A", "选项B", "选项C"],
      "required": true,
      "jump": "q4"
    },
    {
      "id": "q4",
      "type": "single_choice",
      "title": "问题",
      "options": ["选项A", "选项B"],
      "required": true
    }
  ]
}
```

【参考逻辑流转模板：条件追问模板 (Conditional Follow-up)】（文件: 04-conditional-followup.json）
设计意图说明：常规回答顺延主流程，特殊或异常选项临时插入追问后回流
模板完整 JSON 原文：
```json
{
  "id": "conditional_followup",
  "name": "条件追问模板 (Conditional Follow-up)",
  "description": "常规回答顺延主流程，特殊或异常选项临时插入追问后回流",
  "questions": [
    {
      "id": "q1",
      "type": "single_choice",
      "title": "问题",
      "options": ["选项A", "选项B", "选项C"],
      "required": true,
      "jump": [
        { "when": { "q1": 2 }, "to": "q3" },
        { "else": true, "to": "q2" }
      ]
    },
    {
      "id": "q2",
      "type": "single_choice",
      "title": "问题",
      "options": ["选项A", "选项B"],
      "required": true,
      "jump": "q4"
    },
    {
      "id": "q3",
      "type": "single_choice",
      "title": "问题",
      "options": ["选项A", "选项B"],
      "required": true,
      "jump": "q4"
    },
    {
      "id": "q4",
      "type": "single_choice",
      "title": "问题",
      "options": ["选项A", "选项B", "选项C"],
      "required": true
    }
  ]
}
```

【参考逻辑流转模板：等级分流模板 (Measure & Route)】（文件: 05-measure-and-route.json）
设计意图说明：通过关键测定题目将受访者划分不同等级，并分流至不同后续路线
模板完整 JSON 原文：
```json
{
  "id": "measure_and_route",
  "name": "等级分流模板 (Measure & Route)",
  "description": "通过关键测定题目将受访者划分不同等级，并分流至不同后续路线",
  "questions": [
    {
      "id": "q1",
      "type": "single_choice",
      "title": "问题",
      "options": ["选项A", "选项B", "选项C"],
      "required": true,
      "jump": [
        { "when": { "q1": 0 }, "to": "q2" },
        { "when": { "q1": 1 }, "to": "q3" },
        { "when": { "q1": 2 }, "to": "q4" }
      ]
    },
    {
      "id": "q2",
      "type": "single_choice",
      "title": "问题",
      "options": ["选项A", "选项B"],
      "required": true,
      "jump": "end"
    },
    {
      "id": "q3",
      "type": "single_choice",
      "title": "问题",
      "options": ["选项A", "选项B"],
      "required": true,
      "jump": "end"
    },
    {
      "id": "q4",
      "type": "single_choice",
      "title": "问题",
      "options": ["选项A", "选项B"],
      "required": true,
      "jump": "end"
    }
  ]
}
```
（请吸收参考上述模板中的跳转拓扑结构构建题目流向）
参考资料：
医院常用问卷内容分类——第一部分：就诊前 / 分诊类

用途说明：本部分整理医院在患者进入正式诊疗前常见的问卷内容，可作为问卷生成系统的基础内容模板与 Agent 示例数据。

1. 患者基本信息登记

姓名、年龄、性别、联系方式

身份证 / 医保相关信息

紧急联系人及联系方式

就诊基本信息

2. 就诊原因 / 主诉

本次就诊的主要原因

不适或症状的具体部位

症状开始时间

症状持续时间及变化情况

症状严重程度

是否曾经出现过类似症状

3. 预检分诊问卷

体温

疼痛程度

是否存在呼吸困难

意识状态是否正常

是否存在明显出血等紧急情况

是否具有发热、咳嗽等感染相关症状

是否存在其他需要优先处理的情况

4. 既往史

既往是否患有慢性疾病

既往重大疾病史

既往手术史

既往住院史

家族疾病史

其他与本次就诊相关的既往病史

5. 过敏史

是否存在药物过敏

过敏药物名称

过敏反应表现

是否存在食物过敏

是否存在其他过敏

过敏史的补充说明



适合问卷 Agent 抽象的典型逻辑：

是否有相关症状 → 有 → 进入症状详细采集；无 → 跳过相关问题

是否有既往病史 → 有 → 展开疾病信息；无 → 继续下一部分

是否存在药物过敏 → 有 → 采集药物名称及过敏反应；无 → 跳过

是否存在紧急症状 → 是 → 进入优先分诊 / 风险提示；否 → 正常进入后续问卷
```

### 📤 LLM 产出内容
#### ⚠️ 错误详情
```text
terminated
```

---

## [2026/9/10 00:24:48] 极速直出全卷 (generateDirectSurvey) (✅ 成功响应)

- **模型**: `deepseek-v4-flash`
- **耗时**: `69455 ms`
- **附加元信息**: `{"targetCount":10,"enableJumpLogic":true}`

### 📥 传给 LLM 的请求内容
#### 💬 [SYSTEM]
```text
你是一位资深调研设计专家。请根据用户的调研诉求生成一份高质量的问卷。
必须直接输出纯 JSON，严禁输出任何 Markdown 标记、代码块或多余解释，结构严格如下：

{
  "title": "问卷标题",
  "description": "问卷说明与背景",
  "questions": [
    {
      "id": "q1",
      "type": "single_choice",
      "title": "题目题干",
      "options": ["选项0", "选项1"],
      "required": true,
      "jump": [
        { "when": { "q1": 0 }, "to": "exit" }
      ]
    }
  ]
}

契约规范：
1. id 严格为 q1, q2, q3... 顺序递增。
2. type 仅限：single_choice（单选题）、multiple_choice（多选题）、likert_scale（量表题）、text_input（填空题）。
3. 除 text_input 外必须提供 options 字符串数组；text_input 必须省略 options 并可提供 placeholder。
4. jump（按需配置）：跳转目标为题号 "qK"、"end"（正常完成）或 "exit"（提前甄别终止）。普通无跳转的题目必须完全省略 jump。
5. 变量与流转机制：每道题目的答题结果自动作为变量（以题号如 q1, q2 直接命名与引用），无需额外注册变量。跳转条件可直接根据前序题号判断（如 { "q1": 0 } 或 { "q2": { ">=": 3 } }）。除非确实需要复合数学计算，否则无需生成 set 字段；未被使用的变量注册将在生成后自动清除。
6. 自由度：根据实际调研场景与目标领域，完全自主决定题型组合、题干用词与题目流向。
```

#### 💬 [USER]
```text
调研需求：用户综合体验与满意度调研
目标题目数量：10 题左右
参考逻辑模板与跳转范式：
【参考逻辑流转模板：分层深入模板 (Progressive Drill-down)】（文件: 02-progressive-drilldown.json）
设计意图说明：一级主分类，按选项分流至各自专属子题，最后汇合公共题
模板完整 JSON 原文：
```json
{
  "id": "progressive_drilldown",
  "name": "分层深入模板 (Progressive Drill-down)",
  "description": "一级主分类，按选项分流至各自专属子题，最后汇合公共题",
  "questions": [
    {
      "id": "q1",
      "type": "single_choice",
      "title": "问题",
      "options": ["选项A", "选项B", "选项C"],
      "required": true,
      "jump": [
        { "when": { "q1": 0 }, "to": "q2" },
        { "when": { "q1": 1 }, "to": "q3" },
        { "when": { "q1": 2 }, "to": "q4" }
      ]
    },
    {
      "id": "q2",
      "type": "single_choice",
      "title": "问题",
      "options": ["选项A", "选项B"],
      "required": true,
      "jump": "q5"
    },
    {
      "id": "q3",
      "type": "single_choice",
      "title": "问题",
      "options": ["选项A", "选项B"],
      "required": true,
      "jump": "q5"
    },
    {
      "id": "q4",
      "type": "single_choice",
      "title": "问题",
      "options": ["选项A", "选项B"],
      "required": true,
      "jump": "q5"
    },
    {
      "id": "q5",
      "type": "single_choice",
      "title": "问题",
      "options": ["选项A", "选项B", "选项C"],
      "required": true
    }
  ]
}
```
（请吸收参考上述模板中的跳转拓扑结构构建题目流向）
参考资料：
医院常用问卷内容分类——第一部分：就诊前 / 分诊类

用途说明：本部分整理医院在患者进入正式诊疗前常见的问卷内容，可作为问卷生成系统的基础内容模板与 Agent 示例数据。

1. 患者基本信息登记

姓名、年龄、性别、联系方式

身份证 / 医保相关信息

紧急联系人及联系方式

就诊基本信息

2. 就诊原因 / 主诉

本次就诊的主要原因

不适或症状的具体部位

症状开始时间

症状持续时间及变化情况

症状严重程度

是否曾经出现过类似症状

3. 预检分诊问卷

体温

疼痛程度

是否存在呼吸困难

意识状态是否正常

是否存在明显出血等紧急情况

是否具有发热、咳嗽等感染相关症状

是否存在其他需要优先处理的情况

4. 既往史

既往是否患有慢性疾病

既往重大疾病史

既往手术史

既往住院史

家族疾病史

其他与本次就诊相关的既往病史

5. 过敏史

是否存在药物过敏

过敏药物名称

过敏反应表现

是否存在食物过敏

是否存在其他过敏

过敏史的补充说明



适合问卷 Agent 抽象的典型逻辑：

是否有相关症状 → 有 → 进入症状详细采集；无 → 跳过相关问题

是否有既往病史 → 有 → 展开疾病信息；无 → 继续下一部分

是否存在药物过敏 → 有 → 采集药物名称及过敏反应；无 → 跳过

是否存在紧急症状 → 是 → 进入优先分诊 / 风险提示；否 → 正常进入后续问卷
```

### 📤 LLM 产出内容
#### 🤖 LLM 原始返回
```json
{
  "title": "医院用户综合体验与满意度调研",
  "description": "您好！为了不断提升我院的医疗服务品质，为您提供更优质的就医体验，特邀您参与本次满意度调研。本问卷采用匿名形式，资料仅用于改进服务，恳请您根据真实感受作答。感谢您的配合与支持！",
  "questions": [
    {
      "id": "q1",
      "type": "single_choice",
      "title": "请问您本次接受的是哪种类型的医院服务？",
      "options": ["门诊服务", "急诊服务", "住院服务"],
      "required": true,
      "jump": [
        { "when": { "q1": 0 }, "to": "q2" },
        { "when": { "q1": 1 }, "to": "q3" },
        { "when": { "q1": 2 }, "to": "q4" }
      ]
    },
    {
      "id": "q2",
      "type": "single_choice",
      "title": "您对门诊的挂号、候诊及就医流程效率体验是否满意？",
      "options": ["非常不满意", "不满意", "一般", "满意", "非常满意"],
      "required": true,
      "jump": "q5"
    },
    {
      "id": "q3",
      "type": "single_choice",
      "title": "您对急诊的分诊速度、响应时间及处置安排是否满意？",
      "options": ["非常不满意", "不满意", "一般", "满意", "非常满意"],
      "required": true,
      "jump": "q5"
    },
    {
      "id": "q4",
      "type": "single_choice",
      "title": "您对住院期间的环境、膳食及日常照护服务是否满意？",
      "options": ["非常不满意", "不满意", "一般", "满意", "非常满意"],
      "required": true,
      "jump": "q5"
    },
    {
      "id": "q5",
      "type": "single_choice",
      "title": "总体来看，您对本次医院服务体验的满意程度如何？",
      "options": ["非常不满意", "不满意", "一般", "满意", "非常满意"],
      "required": true,
      "jump": [
        { "when": { "q5": { ">=": 3 } }, "to": "q7" }
      ]
    },
    {
      "id": "q6",
      "type": "multiple_choice",
      "title": "您给出上述评价（一般/不满意/非常不满意）的主要原因集中在哪些方面？",
      "options": [
        "服务流程繁杂 / 等待时间过长",
        "医务人员服务态度不够热情",
        "医疗技术或治疗效果未达预期",
        "环境卫生、病房或公共设施较差",
        "费用不透明或收费偏高",
        "其他（可在最后补充说明）"
      ],
      "required": true,
      "jump": "q7"
    },
    {
      "id": "q7",
      "type": "single_choice",
      "title": "如果亲友需要就医，您是否愿意推荐本院？",
      "options": ["非常愿意", "比较愿意", "一般", "不太愿意", "非常不愿意"],
      "required": true
    },
    {
      "id": "q8",
      "type": "single_choice",
      "title": "您对医院的环境卫生、设施布局及导引标识的满意度如何？",
      "options": ["非常不满意", "不满意", "一般", "满意", "非常满意"],
      "required": true
    },
    {
      "id": "q9",
      "type": "multiple_choice",
      "title": "您认为医院在下列哪些方面还需要进一步改进？",
      "options": ["医疗技术", "服务态度", "就医流程", "环境设施", "费用管理", "医患沟通", "其他"],
      "required": true
    },
    {
      "id": "q10",
      "type": "text_input",
      "title": "您对本次就医体验还有其他意见或建议吗？",
      "required": false,
      "placeholder": "请输入您的补充意见或建议（选填）"
    }
  ]
}
```

---

## [2026/9/15 08:51:40] Dispatcher Agent: 任务拆解 (planTasks) (✅ 成功响应)

- **模型**: `deepseek-v4-flash`
- **耗时**: `5219 ms`
- **附加元信息**: `{"targetCount":10,"templateIds":["screen_and_route"]}`

### 📥 传给 LLM 的请求内容
#### 💬 [SYSTEM]
```text
你是一位调研设计架构师。请根据用户的调研诉求，将问卷拆解为 4~6 个并发子任务。
你必须为每个任务直接编写清晰、明确的出题提示词（prompt），指明核心考点与禁止涉及的内容，杜绝子任务之间撞题。

输出要求：
必须直接输出纯 JSON，严禁输出任何 Markdown 标记或多余文字。

顶级结构：
{
  "title": "问卷标题",
  "tasks": [
    {
      "id": "b1",
      "count": 4,
      "prompt": "考察用户的个人身份与核心使用场景，不要涉及具体功能打分与竞品对比。"
    }
  ]
}

契约约束：
1. 每个 task 的 id 严格为 b1, b2, b3... 顺序递增。
2. prompt 必须为直接给子 Agent 的出题指令，严禁添加多余描述性套话。
```

#### 💬 [USER]
```text
调研诉求：用户综合体验与满意度调研

目标题数：约 10 题

参考资料：
医院常用问卷内容分类——第一部分：就诊前 / 分诊类

用途说明：本部分整理医院在患者进入正式诊疗前常见的问卷内容，可作为问卷生成系统的基础内容模板与 Agent 示例数据。

1. 患者基本信息登记

姓名、年龄、性别、联系方式

身份证 / 医保相关信息

紧急联系人及联系方式

就诊基本信息

2. 就诊原因 / 主诉

本次就诊的主要原因

不适或症状的具体部位

症状开始时间

症状持续时间及变化情况

症状严重程度

是否曾经出现过类似症状

3. 预检分诊问卷

体温

疼痛程度

是否存在呼吸困难

意识状态是否正常

是否存在明显出血等紧急情况

是否具有发热、咳嗽等感染相关症状

是否存在其他需要优先处理的情况

4. 既往史

既往是否患有慢性疾病

既往重大疾病史

既往手术史

既往住院史

家族疾病史

其他与本次就诊相关的既往病史

5. 过敏史

是否存在药物过敏

过敏药物名称

过敏反应表现

是否存在食物过敏

是否存在其他过敏

过敏史的补充说明



适合问卷 Agent 抽象的典型逻辑：

是否有相关症状 → 有 → 进入症状详细采集；无 → 跳过相关问题

是否有既往病史 → 有 → 展开疾病信息；无 → 继续下一部分

是否存在药物过敏 → 有 → 采集药物名称及过敏反应；无 → 跳过

是否存在紧急症状 → 是 → 进入优先分诊 / 风险提示；否 → 正常进入后续问卷

参考逻辑模板：
【参考逻辑流转模板：筛选分流模板 (Screen & Route)】（文件: 01-screen-and-route.json）
设计意图说明：入口前置甄别，根据选项分流至主流程或提前结束
模板完整 JSON 原文：
```json
{
  "id": "screen_and_route",
  "name": "筛选分流模板 (Screen & Route)",
  "description": "入口前置甄别，根据选项分流至主流程或提前结束",
  "questions": [
    {
      "id": "q1",
      "type": "single_choice",
      "title": "问题",
      "options": ["选项A", "选项B"],
      "required": true,
      "jump": [
        { "when": { "q1": 0 }, "to": "q2" },
        { "when": { "q1": 1 }, "to": "exit" }
      ]
    },
    {
      "id": "q2",
      "type": "single_choice",
      "title": "问题",
      "options": ["选项A", "选项B", "选项C"],
      "required": true
    },
    {
      "id": "q3",
      "type": "single_choice",
      "title": "问题",
      "options": ["选项A", "选项B"],
      "required": true
    }
  ]
}
```

请直接输出符合契约的纯 JSON 任务计划数据：
```

### 📤 LLM 产出内容
#### 🤖 LLM 原始返回
```json
{"title":"患者就医综合体验与满意度调研","tasks":[{"id":"b1","count":2,"prompt":"考察受访者的个人身份属性与本次就医的基本场景，例如年龄段、本次就诊科室类型或就诊性质（初诊/复诊）。禁止涉及任何服务环节的满意度打分、医护态度评价以及竞品或同类医院对比。"},{"id":"b2","count":2,"prompt":"考察就诊前的预约与挂号环节体验，包括预约渠道的选择与便捷性、挂号流程耗时与信息指引清晰度。禁止涉及现场候诊过程、医生诊疗沟通以及院内环境设施的题目。"},{"id":"b3","count":2,"prompt":"考察到院后分诊、候诊与检查检验环节的体验，例如预检分诊效率、实际候诊等待时长感受、检查排队与结果获取的顺畅度。禁止涉及预约挂号渠道、医护人员沟通态度以及费用支付相关题目。"},{"id":"b4","count":2,"prompt":"考察医护人员服务过程体验，包括问诊沟通的充分性、对病情与治疗方案的讲解清晰度、隐私保护与尊重感受。禁止涉及候诊时长、院内环境设施、缴费与取药流程的题目。"},{"id":"b5","count":2,"prompt":"考察院内环境设施与配套服务体验，例如诊区标识指引、卫生与舒适度、缴费取药等流程的便利性。禁止涉及医护人员的沟通态度与专业水平、预约挂号渠道的评价。"},{"id":"b6","count":2,"prompt":"考察整体就医满意度与后续行为意愿，例如总体满意度评价、是否愿意再次就诊或向他人推荐、最希望改进的方向。禁止重复询问任何单一环节的具体评分细项（如候诊时长、医生态度、环境整洁度等）。"}]}
```

---

## [2026/9/15 08:51:43] Worker Agent [b1]: 组块出题 (✅ 成功响应)

- **模型**: `deepseek-v4-flash`
- **耗时**: `2804 ms`
- **附加元信息**: `{"blockId":"b1","count":2}`

### 📥 传给 LLM 的请求内容
#### 💬 [SYSTEM]
```text
你是一位调研题目设计专家。请根据指定的出题指令生成题目列表。
必须直接输出符合契约的纯 JSON 数据，严禁输出任何 Markdown 标记或多余文字。

顶级结构：
{
  "questions": []
}

题型规范：
1. single_choice (单选题):
   { "id": "b1_1", "type": "single_choice", "title": string, "options": string[], "jump"?: IntraBlockJumpRule[] }

2. multiple_choice (多选题):
   { "id": "b1_1", "type": "multiple_choice", "title": string, "options": string[], "jump"?: IntraBlockJumpRule[] }

3. likert_scale (量表题/矩阵评分):
   { "id": "b1_1", "type": "likert_scale", "title": string, "options": string[], "statements": string[], "jump"?: IntraBlockJumpRule[] }
   - options 为评分刻度（列），statements 为评价条目（行），二者必须同时具备。

4. text_input (填空题):
   { "id": "b1_1", "type": "text_input", "title": string, "placeholder"?: string }

约束：
- 题号必须严格带有当前组块前缀并顺序递增，如 b1_1, b1_2, b1_3...
- 默认自然顺延。若配置 jump，仅允许在本组块内向后跳转或指向 "exit" / "end"，严禁跨组块跳转。
```

#### 💬 [USER]
```text
出题指令：考察受访者的个人身份属性与本次就医的基本场景，例如年龄段、本次就诊科室类型或就诊性质（初诊/复诊）。禁止涉及任何服务环节的满意度打分、医护态度评价以及竞品或同类医院对比。

生成题量：2 题（题号前缀为 b1_*）

请直接输出符合契约的纯 JSON 题目列表：
```

### 📤 LLM 产出内容
#### 🤖 LLM 原始返回
```json
{"questions":[{"id":"b1_1","type":"single_choice","title":"您的年龄段是？","options":["18岁及以下","19-30岁","31-45岁","46-60岁","61岁及以上"]},{"id":"b1_2","type":"single_choice","title":"您本次就医的性质是？","options":["初诊（首次因该问题来本院就诊）","复诊（因同一问题再次来本院就诊）","其他"]}]}
```

---

## [2026/9/15 08:51:45] Worker Agent [b3]: 组块出题 (✅ 成功响应)

- **模型**: `deepseek-v4-flash`
- **耗时**: `4364 ms`
- **附加元信息**: `{"blockId":"b3","count":2}`

### 📥 传给 LLM 的请求内容
#### 💬 [SYSTEM]
```text
你是一位调研题目设计专家。请根据指定的出题指令生成题目列表。
必须直接输出符合契约的纯 JSON 数据，严禁输出任何 Markdown 标记或多余文字。

顶级结构：
{
  "questions": []
}

题型规范：
1. single_choice (单选题):
   { "id": "b3_1", "type": "single_choice", "title": string, "options": string[], "jump"?: IntraBlockJumpRule[] }

2. multiple_choice (多选题):
   { "id": "b3_1", "type": "multiple_choice", "title": string, "options": string[], "jump"?: IntraBlockJumpRule[] }

3. likert_scale (量表题/矩阵评分):
   { "id": "b3_1", "type": "likert_scale", "title": string, "options": string[], "statements": string[], "jump"?: IntraBlockJumpRule[] }
   - options 为评分刻度（列），statements 为评价条目（行），二者必须同时具备。

4. text_input (填空题):
   { "id": "b3_1", "type": "text_input", "title": string, "placeholder"?: string }

约束：
- 题号必须严格带有当前组块前缀并顺序递增，如 b3_1, b3_2, b3_3...
- 默认自然顺延。若配置 jump，仅允许在本组块内向后跳转或指向 "exit" / "end"，严禁跨组块跳转。
```

#### 💬 [USER]
```text
出题指令：考察到院后分诊、候诊与检查检验环节的体验，例如预检分诊效率、实际候诊等待时长感受、检查排队与结果获取的顺畅度。禁止涉及预约挂号渠道、医护人员沟通态度以及费用支付相关题目。

生成题量：2 题（题号前缀为 b3_*）

请直接输出符合契约的纯 JSON 题目列表：
```

### 📤 LLM 产出内容
#### 🤖 LLM 原始返回
```json
{"questions":[{"id":"b3_1","type":"single_choice","title":"您到院后完成预检分诊（如测量体温、症状问询、分诊科室指引等）大约等待了多久？","options":["无需等待，立即完成","5分钟以内","5-10分钟","10-20分钟","20分钟以上"]},{"id":"b3_2","type":"likert_scale","title":"请根据您本次到院后的实际感受，对以下候诊与检查检验环节进行评价：","options":["非常不同意","不同意","一般","同意","非常同意"],"statements":["预检分诊后，候诊等待叫号的时间在可接受范围内","候诊区的秩序和环境让我能够安心等待","检查（如化验、影像等）的排队安排合理有序","检查结果的获取方便、及时（如自助打印、线上推送、窗口领取等）","从候诊到完成检查检验的整体流程衔接顺畅"]}]}
```

---

## [2026/9/15 08:51:46] Worker Agent [b2]: 组块出题 (✅ 成功响应)

- **模型**: `deepseek-v4-flash`
- **耗时**: `5208 ms`
- **附加元信息**: `{"blockId":"b2","count":2}`

### 📥 传给 LLM 的请求内容
#### 💬 [SYSTEM]
```text
你是一位调研题目设计专家。请根据指定的出题指令生成题目列表。
必须直接输出符合契约的纯 JSON 数据，严禁输出任何 Markdown 标记或多余文字。

顶级结构：
{
  "questions": []
}

题型规范：
1. single_choice (单选题):
   { "id": "b2_1", "type": "single_choice", "title": string, "options": string[], "jump"?: IntraBlockJumpRule[] }

2. multiple_choice (多选题):
   { "id": "b2_1", "type": "multiple_choice", "title": string, "options": string[], "jump"?: IntraBlockJumpRule[] }

3. likert_scale (量表题/矩阵评分):
   { "id": "b2_1", "type": "likert_scale", "title": string, "options": string[], "statements": string[], "jump"?: IntraBlockJumpRule[] }
   - options 为评分刻度（列），statements 为评价条目（行），二者必须同时具备。

4. text_input (填空题):
   { "id": "b2_1", "type": "text_input", "title": string, "placeholder"?: string }

约束：
- 题号必须严格带有当前组块前缀并顺序递增，如 b2_1, b2_2, b2_3...
- 默认自然顺延。若配置 jump，仅允许在本组块内向后跳转或指向 "exit" / "end"，严禁跨组块跳转。
```

#### 💬 [USER]
```text
出题指令：考察就诊前的预约与挂号环节体验，包括预约渠道的选择与便捷性、挂号流程耗时与信息指引清晰度。禁止涉及现场候诊过程、医生诊疗沟通以及院内环境设施的题目。

生成题量：2 题（题号前缀为 b2_*）

请直接输出符合契约的纯 JSON 题目列表：
```

### 📤 LLM 产出内容
#### 🤖 LLM 原始返回
```json
{"questions":[{"id":"b2_1","type":"single_choice","title":"您本次就诊前主要通过以下哪种渠道进行预约挂号？","options":["医院官方APP或微信小程序","医院官方网站","电话预约（含114等）","第三方医疗服务平台（如健康之路、微医等）","现场窗口或自助机","其他"]},{"id":"b2_2","type":"likert_scale","title":"请根据您本次就诊前的预约挂号体验，对以下方面进行评价","options":["非常不满意","不满意","一般","满意","非常满意"],"statements":["预约挂号渠道容易找到且操作便捷","预约时可选择的号源信息（医生、时段等）清晰明确","挂号流程整体耗时短、效率高","挂号操作步骤的指引清晰易懂","预约成功后的通知和就诊提醒清晰及时"]}]}
```

---

## [2026/9/15 08:51:47] Worker Agent [b4]: 组块出题 (✅ 成功响应)

- **模型**: `deepseek-v4-flash`
- **耗时**: `3933 ms`
- **附加元信息**: `{"blockId":"b4","count":2}`

### 📥 传给 LLM 的请求内容
#### 💬 [SYSTEM]
```text
你是一位调研题目设计专家。请根据指定的出题指令生成题目列表。
必须直接输出符合契约的纯 JSON 数据，严禁输出任何 Markdown 标记或多余文字。

顶级结构：
{
  "questions": []
}

题型规范：
1. single_choice (单选题):
   { "id": "b4_1", "type": "single_choice", "title": string, "options": string[], "jump"?: IntraBlockJumpRule[] }

2. multiple_choice (多选题):
   { "id": "b4_1", "type": "multiple_choice", "title": string, "options": string[], "jump"?: IntraBlockJumpRule[] }

3. likert_scale (量表题/矩阵评分):
   { "id": "b4_1", "type": "likert_scale", "title": string, "options": string[], "statements": string[], "jump"?: IntraBlockJumpRule[] }
   - options 为评分刻度（列），statements 为评价条目（行），二者必须同时具备。

4. text_input (填空题):
   { "id": "b4_1", "type": "text_input", "title": string, "placeholder"?: string }

约束：
- 题号必须严格带有当前组块前缀并顺序递增，如 b4_1, b4_2, b4_3...
- 默认自然顺延。若配置 jump，仅允许在本组块内向后跳转或指向 "exit" / "end"，严禁跨组块跳转。
```

#### 💬 [USER]
```text
出题指令：考察医护人员服务过程体验，包括问诊沟通的充分性、对病情与治疗方案的讲解清晰度、隐私保护与尊重感受。禁止涉及候诊时长、院内环境设施、缴费与取药流程的题目。

生成题量：2 题（题号前缀为 b4_*）

请直接输出符合契约的纯 JSON 题目列表：
```

### 📤 LLM 产出内容
#### 🤖 LLM 原始返回
```json
{"questions":[{"id":"b4_1","type":"likert_scale","title":"请根据您本次就医的体验，对以下医护人员的服务过程进行评价","options":["非常不同意","不同意","一般","同意","非常同意"],"statements":["医生在问诊时给了我充分的时间描述病情和担忧","医护人员用我能理解的方式清晰讲解了病情和治疗方案","医护人员在诊疗过程中注意保护我的隐私（如拉帘、遮挡、低声交流等）","我在诊疗过程中感受到了医护人员的尊重与关怀"]},{"id":"b4_2","type":"single_choice","title":"总体而言，您对本次诊疗过程中医护人员与您沟通的充分性和尊重感受如何评价？","options":["非常满意","比较满意","一般","不太满意","非常不满意"]}]}
```

---

## [2026/9/15 08:51:48] Worker Agent [b5]: 组块出题 (✅ 成功响应)

- **模型**: `deepseek-v4-flash`
- **耗时**: `3577 ms`
- **附加元信息**: `{"blockId":"b5","count":2}`

### 📥 传给 LLM 的请求内容
#### 💬 [SYSTEM]
```text
你是一位调研题目设计专家。请根据指定的出题指令生成题目列表。
必须直接输出符合契约的纯 JSON 数据，严禁输出任何 Markdown 标记或多余文字。

顶级结构：
{
  "questions": []
}

题型规范：
1. single_choice (单选题):
   { "id": "b5_1", "type": "single_choice", "title": string, "options": string[], "jump"?: IntraBlockJumpRule[] }

2. multiple_choice (多选题):
   { "id": "b5_1", "type": "multiple_choice", "title": string, "options": string[], "jump"?: IntraBlockJumpRule[] }

3. likert_scale (量表题/矩阵评分):
   { "id": "b5_1", "type": "likert_scale", "title": string, "options": string[], "statements": string[], "jump"?: IntraBlockJumpRule[] }
   - options 为评分刻度（列），statements 为评价条目（行），二者必须同时具备。

4. text_input (填空题):
   { "id": "b5_1", "type": "text_input", "title": string, "placeholder"?: string }

约束：
- 题号必须严格带有当前组块前缀并顺序递增，如 b5_1, b5_2, b5_3...
- 默认自然顺延。若配置 jump，仅允许在本组块内向后跳转或指向 "exit" / "end"，严禁跨组块跳转。
```

#### 💬 [USER]
```text
出题指令：考察院内环境设施与配套服务体验，例如诊区标识指引、卫生与舒适度、缴费取药等流程的便利性。禁止涉及医护人员的沟通态度与专业水平、预约挂号渠道的评价。

生成题量：2 题（题号前缀为 b5_*）

请直接输出符合契约的纯 JSON 题目列表：
```

### 📤 LLM 产出内容
#### 🤖 LLM 原始返回
```json
{"questions":[{"id":"b5_1","type":"likert_scale","title":"请根据您在本次就诊过程中的实际感受，对以下院内环境与配套服务方面进行评价。","options":["非常不满意","不满意","一般","满意","非常满意"],"statements":["诊区标识与指引清晰易懂，能方便找到目的地","候诊区整体卫生整洁，环境干净","卫生间清洁状况良好","候诊座椅及休息区域舒适度良好","院内缴费流程便捷顺畅","院内取药流程便捷顺畅","院内各楼层、科室之间的通行与引导方便"]},{"id":"b5_2","type":"multiple_choice","title":"在院内办理缴费、取药等手续时，您遇到过以下哪些不便？（可多选）","options":["窗口排队等候时间较长","缴费或取药窗口位置不易找到","自助设备操作不够方便","可用的缴费方式较少","取药等候时间较长","需要在不同窗口之间来回往返","未遇到明显不便","其他"]}]}
```

---

## [2026/9/15 08:51:55] Worker Agent [b6]: 组块出题 (✅ 成功响应)

- **模型**: `deepseek-v4-flash`
- **耗时**: `9000 ms`
- **附加元信息**: `{"blockId":"b6","count":2}`

### 📥 传给 LLM 的请求内容
#### 💬 [SYSTEM]
```text
你是一位调研题目设计专家。请根据指定的出题指令生成题目列表。
必须直接输出符合契约的纯 JSON 数据，严禁输出任何 Markdown 标记或多余文字。

顶级结构：
{
  "questions": []
}

题型规范：
1. single_choice (单选题):
   { "id": "b6_1", "type": "single_choice", "title": string, "options": string[], "jump"?: IntraBlockJumpRule[] }

2. multiple_choice (多选题):
   { "id": "b6_1", "type": "multiple_choice", "title": string, "options": string[], "jump"?: IntraBlockJumpRule[] }

3. likert_scale (量表题/矩阵评分):
   { "id": "b6_1", "type": "likert_scale", "title": string, "options": string[], "statements": string[], "jump"?: IntraBlockJumpRule[] }
   - options 为评分刻度（列），statements 为评价条目（行），二者必须同时具备。

4. text_input (填空题):
   { "id": "b6_1", "type": "text_input", "title": string, "placeholder"?: string }

约束：
- 题号必须严格带有当前组块前缀并顺序递增，如 b6_1, b6_2, b6_3...
- 默认自然顺延。若配置 jump，仅允许在本组块内向后跳转或指向 "exit" / "end"，严禁跨组块跳转。
```

#### 💬 [USER]
```text
出题指令：考察整体就医满意度与后续行为意愿，例如总体满意度评价、是否愿意再次就诊或向他人推荐、最希望改进的方向。禁止重复询问任何单一环节的具体评分细项（如候诊时长、医生态度、环境整洁度等）。

生成题量：2 题（题号前缀为 b6_*）

请直接输出符合契约的纯 JSON 题目列表：
```

### 📤 LLM 产出内容
#### 🤖 LLM 原始返回
```json
{
  "questions": [
    {
      "id": "b6_1",
      "type": "single_choice",
      "title": "总体而言，您对本次就医体验的满意度如何？",
      "options": [
        "非常满意",
        "比较满意",
        "一般",
        "比较不满意",
        "非常不满意"
      ]
    },
    {
      "id": "b6_2",
      "type": "multiple_choice",
      "title": "基于本次就医体验，您接下来的意愿或期望是？（可多选）",
      "options": [
        "愿意再次来本院就诊",
        "愿意向亲友推荐本院",
        "希望医院改善就医流程效率",
        "希望医院改善医护人员沟通与服务态度",
        "希望医院改善环境与设施",
        "希望医院提高医疗费用透明度",
        "暂时没有特别意愿",
        "其他（请注明）"
      ]
    }
  ]
}
```

---

## [2026/9/15 09:02:47] 极速直出全卷 (generateDirectSurvey) (✅ 成功响应)

- **模型**: `deepseek-v4-flash`
- **耗时**: `14414 ms`
- **附加元信息**: `{"targetCount":10,"enableJumpLogic":true}`

### 📥 传给 LLM 的请求内容
#### 💬 [SYSTEM]
```text
你是一位调研设计专家。请根据用户需求生成结构化问卷 JSON。
必须直接输出符合以下 TypeScript 契约的纯 JSON 数据，严禁输出任何 Markdown 标记或多余文字。

数据契约定义：
interface QuestionnaireOutput {
  title: string;
  description: string;
  questions: QuestionItem[];
}

type QuestionItem =
  | SingleChoiceQuestion
  | MultipleChoiceQuestion
  | LikertScaleQuestion
  | TextInputQuestion;

// 单选题
interface SingleChoiceQuestion {
  id: string;          // 题号 "q1", "q2"...
  type: "single_choice";
  title: string;
  options: string[];   // 选项文本
  jump?: JumpRule[];
}

// 多选题
interface MultipleChoiceQuestion {
  id: string;
  type: "multiple_choice";
  title: string;
  options: string[];   // 选项文本
  jump?: JumpRule[];
}

// 量表题（矩阵评分）
interface LikertScaleQuestion {
  id: string;
  type: "likert_scale";
  title: string;
  options: string[];   // 评分刻度（列）
  statements: string[];// 评价条目（行）
  jump?: JumpRule[];
}

// 填空题
interface TextInputQuestion {
  id: string;
  type: "text_input";
  title: string;
  placeholder?: string;
}

// 跳转规则（仅在关键节点使用）
interface JumpRule {
  when?: Record<string, number | { has: number } | { "<=": number } | { ">=": number }>;
  else?: boolean;
  to: string;          // 目标题号 "qK"、正常完成 "end" 或淘汰退出 "exit"
}

逻辑规则：
逻辑跳转规则：在有明确分流需要时（如特定选项筛选、不同受众分类）配置关键节点单向向前跳转（jump 字段）。
- 题号必须严格从 q1 顺序递增到 q10。
```

#### 💬 [USER]
```text
调研需求：企业业务综合满意度与全流程体验调研

目标题量：约 10 题

参考资料：
医院常用问卷内容分类——第一部分：就诊前 / 分诊类

用途说明：本部分整理医院在患者进入正式诊疗前常见的问卷内容，可作为问卷生成系统的基础内容模板与 Agent 示例数据。

1. 患者基本信息登记

姓名、年龄、性别、联系方式

身份证 / 医保相关信息

紧急联系人及联系方式

就诊基本信息

2. 就诊原因 / 主诉

本次就诊的主要原因

不适或症状的具体部位

症状开始时间

症状持续时间及变化情况

症状严重程度

是否曾经出现过类似症状

3. 预检分诊问卷

体温

疼痛程度

是否存在呼吸困难

意识状态是否正常

是否存在明显出血等紧急情况

是否具有发热、咳嗽等感染相关症状

是否存在其他需要优先处理的情况

4. 既往史

既往是否患有慢性疾病

既往重大疾病史

既往手术史

既往住院史

家族疾病史

其他与本次就诊相关的既往病史

5. 过敏史

是否存在药物过敏

过敏药物名称

过敏反应表现

是否存在食物过敏

是否存在其他过敏

过敏史的补充说明



适合问卷 Agent 抽象的典型逻辑：

是否有相关症状 → 有 → 进入症状详细采集；无 → 跳过相关问题

是否有既往病史 → 有 → 展开疾病信息；无 → 继续下一部分

是否存在药物过敏 → 有 → 采集药物名称及过敏反应；无 → 跳过

是否存在紧急症状 → 是 → 进入优先分诊 / 风险提示；否 → 正常进入后续问卷

参考逻辑模板：
【参考逻辑流转模板：条件追问模板 (Conditional Follow-up)】（文件: 04-conditional-followup.json）
设计意图说明：常规回答顺延主流程，特殊或异常选项临时插入追问后回流
模板完整 JSON 原文：
```json
{
  "id": "conditional_followup",
  "name": "条件追问模板 (Conditional Follow-up)",
  "description": "常规回答顺延主流程，特殊或异常选项临时插入追问后回流",
  "questions": [
    {
      "id": "q1",
      "type": "single_choice",
      "title": "问题",
      "options": ["选项A", "选项B", "选项C"],
      "required": true,
      "jump": [
        { "when": { "q1": 2 }, "to": "q3" },
        { "else": true, "to": "q2" }
      ]
    },
    {
      "id": "q2",
      "type": "single_choice",
      "title": "问题",
      "options": ["选项A", "选项B"],
      "required": true,
      "jump": "q4"
    },
    {
      "id": "q3",
      "type": "single_choice",
      "title": "问题",
      "options": ["选项A", "选项B"],
      "required": true,
      "jump": "q4"
    },
    {
      "id": "q4",
      "type": "single_choice",
      "title": "问题",
      "options": ["选项A", "选项B", "选项C"],
      "required": true
    }
  ]
}
```

请直接输出符合契约的纯 JSON 问卷数据：
```

### 📤 LLM 产出内容
#### 🤖 LLM 原始返回
```json
{
  "title": "企业业务综合满意度与全流程体验调研",
  "description": "感谢您参与本次调研。本问卷约10题，预计用时3-5分钟。您的反馈将帮助我们优化售前、签约、交付、售后及续约等全流程服务体验。所有数据仅用于内部分析，感谢您的支持！",
  "questions": [
    {
      "id": "q1",
      "type": "single_choice",
      "title": "贵企业与我方合作或使用我方业务/产品的时间为？",
      "options": [
        "1年以内",
        "1-3年",
        "3-5年",
        "5年以上"
      ]
    },
    {
      "id": "q2",
      "type": "single_choice",
      "title": "您在企业中主要承担的角色是？",
      "options": [
        "企业决策者/管理层",
        "业务使用部门负责人或员工",
        "采购/财务/合规",
        "IT/技术/运维",
        "其他"
      ]
    },
    {
      "id": "q3",
      "type": "multiple_choice",
      "title": "您参与或体验过我方哪些业务环节？",
      "options": [
        "售前咨询与方案沟通",
        "签约与开通",
        "实施交付与培训",
        "日常使用与技术支持",
        "售后维护与客户成功服务",
        "续约与增购",
        "投诉与争议处理"
      ]
    },
    {
      "id": "q4",
      "type": "likert_scale",
      "title": "请根据您的实际体验，对以下全流程环节进行满意度评分",
      "options": [
        "非常不满意",
        "不满意",
        "一般",
        "满意",
        "非常满意"
      ],
      "statements": [
        "售前咨询响应速度",
        "方案与需求的匹配度",
        "签约与开通流程便捷性",
        "实施交付质量与效率",
        "培训与上手支持",
        "售后响应速度",
        "问题解决效率",
        "客户成功服务的主动性"
      ]
    },
    {
      "id": "q5",
      "type": "single_choice",
      "title": "总体而言，您对我方业务与服务的满意度是？",
      "options": [
        "非常不满意",
        "不满意",
        "一般",
        "满意",
        "非常满意"
      ],
      "jump": [
        {
          "when": {
            "q5": 0
          },
          "to": "q6"
        },
        {
          "when": {
            "q5": 1
          },
          "to": "q6"
        },
        {
          "else": true,
          "to": "q7"
        }
      ]
    },
    {
      "id": "q6",
      "type": "multiple_choice",
      "title": "您认为最需要优先改进的环节有哪些？",
      "options": [
        "售前咨询与需求理解",
        "签约与开通流程",
        "实施交付与培训",
        "产品功能与适配性",
        "系统稳定性与性能",
        "售后响应与问题解决",
        "投诉与争议处理",
        "价格与商务政策",
        "客户成功与持续运营支持",
        "其他"
      ]
    },
    {
      "id": "q7",
      "type": "single_choice",
      "title": "未来一年，您是否愿意继续续约或增购我方产品/服务？",
      "options": [
        "肯定会",
        "可能会",
        "不确定",
        "可能不会",
        "肯定不会"
      ],
      "jump": [
        {
          "when": {
            "q7": 3
          },
          "to": "q8"
        },
        {
          "when": {
            "q7": 4
          },
          "to": "q8"
        },
        {
          "else": true,
          "to": "q9"
        }
      ]
    },
    {
      "id": "q8",
      "type": "multiple_choice",
      "title": "影响您续约或增购的主要因素有哪些？",
      "options": [
        "价格与预算限制",
        "产品功能不足",
        "系统稳定性或性能问题",
        "实施效果未达预期",
        "服务响应慢或问题解决不及时",
        "行业方案与业务匹配度不足",
        "内部组织或流程变动",
        "考虑更换供应商",
        "其他"
      ]
    },
    {
      "id": "q9",
      "type": "likert_scale",
      "title": "请评价以下因素对您企业业务体验的重要程度",
      "options": [
        "非常不重要",
        "不重要",
        "一般",
        "重要",
        "非常重要"
      ],
      "statements": [
        "售前团队的专业度",
        "方案定制与行业理解能力",
        "实施交付效率与质量",
        "售后响应速度",
        "问题解决与闭环能力",
        "客户成功支持与主动服务",
        "产品稳定性与持续迭代",
        "商务合作灵活性与透明度"
      ]
    },
    {
      "id": "q10",
      "type": "text_input",
      "title": "您还有其他意见或建议吗？",
      "placeholder": "请填写您对业务全流程体验的意见或建议（选填）"
    }
  ]
}
```

---
