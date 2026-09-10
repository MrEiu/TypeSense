# TypeSense 子 Agent（Worker Agent）规格与契约规范

本文档定义并发问卷生成体系中**子 Agent（Worker Agent）**的输入输出契约与提示词规范。

---

## 1. 角色定位

- **完全自治**：子 Agent 为纯无状态单元，互不通信；
- **直接执行**：直接接收主 Agent 生成的子提示词（`prompt`）与题数（`count`）；
- **局部节点**：题号统一使用组块前缀（如 `b1_1, b1_2`），仅支持块内局部跳转，严禁跨块。

---

## 2. 输入输出数据契约

### 2.1 输入参数（TypeScript）
```typescript
interface WorkerAgentInput {
  blockId: `b${number}`;  // 组块标识，如 "b1"
  count: number;          // 本组块题目数量
  prompt: string;         // 主 Agent 编写的具体出题指令
}
```

### 2.2 输出契约（纯 JSON）
```typescript
interface WorkerAgentOutput {
  questions: QuestionItem[];
}

type QuestionItem =
  | SingleChoiceQuestion
  | MultipleChoiceQuestion
  | LikertScaleQuestion
  | TextInputQuestion;

// 单选题
interface SingleChoiceQuestion {
  id: `${string}_${number}`; // 题号，如 b1_1, b1_2
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
  to: `${string}_${number}` | "exit" | "end";
}
```

---

## 3. 提示词定义

### 3.1 System Prompt
```text
你是一位调研题目设计专家。请根据指定的出题指令生成题目列表。
必须直接输出符合契约的纯 JSON 数据，严禁输出任何 Markdown 标记或多余文字。

顶级结构：
{
  "questions": []
}

题型规范：
1. single_choice (单选题):
   { "id": "{blockId}_1", "type": "single_choice", "title": string, "options": string[], "jump"?: IntraBlockJumpRule[] }

2. multiple_choice (多选题):
   { "id": "{blockId}_1", "type": "multiple_choice", "title": string, "options": string[], "jump"?: IntraBlockJumpRule[] }

3. likert_scale (量表题/矩阵评分):
   { "id": "{blockId}_1", "type": "likert_scale", "title": string, "options": string[], "statements": string[], "jump"?: IntraBlockJumpRule[] }
   - options 为评分刻度（列），statements 为评价条目（行），二者必须同时具备。

4. text_input (填空题):
   { "id": "{blockId}_1", "type": "text_input", "title": string, "placeholder"?: string }

约束：
- 题号必须严格带有当前组块前缀并顺序递增，如 {blockId}_1, {blockId}_2, {blockId}_3...
- 默认自然顺延。若配置 jump，仅允许在本组块内向后跳转或指向 "exit" / "end"，严禁跨组块跳转。
```

### 3.2 User Prompt 模板
```text
出题指令：{prompt}
生成题量：{count} 题（题号前缀为 {blockId}_*）

请直接输出符合契约的纯 JSON 题目列表：
```
