# TypeSense 多 Agent 并发生成提示词与数据契约规范

本文档定义基于 **Map-Reduce 范式（任务拆解 - 并发出题 - 逻辑连线）** 的多 Agent 提示词规范与输入输出契约。

---

## 阶段一：系统统筹与任务拆解（Dispatcher Agent）

负责将全局调研诉求拆解为各组块的**直接执行提示词（Sub-Prompts）**。

### 1. 契约定义（Schema）

```typescript
interface SurveyTaskPlan {
  title: string;          // 问卷全局标题
  tasks: SurveyTask[];    // 子任务列表
}

interface SurveyTask {
  id: `b${number}`;       // 顺序编号：b1, b2, b3...
  count: number;          // 分配给该子 Agent 的出题数量
  prompt: string;         // 直接发给该子 Agent 的出题指令（清晰指明要问什么、不要问什么）
}
```

### 2. Stage 1 System Prompt

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

### 3. Stage 1 User Prompt 模板

```text
调研诉求：{prompt}
目标题数：{target_count}
参考资料：{document_context}
参考逻辑模板：{template_context}

请直接输出符合契约的纯 JSON 任务计划数据：
```

---

## 阶段二：组块独立并发出题（Worker Agent）

各 Worker Agent 并发运行，直接读取对应任务的 `prompt` 独立生成题目，使用带组块前缀的局部题号。

### 1. 契约定义（Schema）

```typescript
interface BlockQuestionsOutput {
  questions: QuestionItem[];
}

type QuestionItem =
  | SingleChoiceQuestion
  | MultipleChoiceQuestion
  | LikertScaleQuestion
  | TextInputQuestion;

// 单选题
interface SingleChoiceQuestion {
  id: `${string}_${number}`; // 局部命名空间题号，如 b1_1, b1_2
  type: "single_choice";
  title: string;
  options: string[];
  jump?: IntraBlockJumpRule[];
}

// 多选题
interface MultipleChoiceQuestion {
  id: `${string}_${number}`;
  type: "multiple_choice";
  title: string;
  options: string[];
  jump?: IntraBlockJumpRule[];
}

// 量表题（矩阵评分）
interface LikertScaleQuestion {
  id: `${string}_${number}`;
  type: "likert_scale";
  title: string;
  options: string[];         // 评分刻度（列）
  statements: string[];      // 评价条目（行）
  jump?: IntraBlockJumpRule[];
}

// 填空题
interface TextInputQuestion {
  id: `${string}_${number}`;
  type: "text_input";
  title: string;
  placeholder?: string;
}

// 块内局部跳转规则（严禁跨块）
interface IntraBlockJumpRule {
  when?: Record<string, number | { has: number } | { "<=": number } | { ">=": number }>;
  else?: boolean;
  to: `${string}_${number}` | "exit" | "end"; // 仅限本组块内题号或终态
}
```

### 2. Stage 2 System Prompt

```text
你是一位调研题目设计专家。请根据指定的出题指令生成题目列表。
必须直接输出符合契约的纯 JSON 数据，严禁输出任何 Markdown 标记或多余文字。

顶级结构：
{
  "questions": []
}

契约定义：
1. single_choice (单选题):
   { "id": "{blockId}_1", "type": "single_choice", "title": string, "options": string[], "jump"?: IntraBlockJumpRule[] }

2. multiple_choice (多选题):
   { "id": "{blockId}_1", "type": "multiple_choice", "title": string, "options": string[], "jump"?: IntraBlockJumpRule[] }

3. likert_scale (量表题/矩阵评分):
   { "id": "{blockId}_1", "type": "likert_scale", "title": string, "options": string[], "statements": string[], "jump"?: IntraBlockJumpRule[] }
   - options 为评分刻度（列），statements 为评价条目（行），二者必须同时具备。

4. text_input (填空题):
   { "id": "{blockId}_1", "type": "text_input", "title": string, "placeholder"?: string }

规范：
- 题号必须严格带有当前组块前缀并顺序递增，如 {blockId}_1, {blockId}_2, {blockId}_3...
- 默认自然顺延。若配置 jump，仅允许在本组块内向后跳转或指向 "exit" / "end"，严禁跨组块跳转。
```

### 3. Stage 2 User Prompt 模板

```text
出题指令：{task_prompt}
生成题量：{count} 题（题号前缀为 {block_id}_*）

请直接输出符合契约的纯 JSON 题目列表：
```

