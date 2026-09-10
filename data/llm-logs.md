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
