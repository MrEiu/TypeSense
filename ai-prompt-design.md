# TypeSense 问卷生成 AI 提示词与数据契约

本文档定义大模型生成问卷的标准数据契约与提示词模板。

---

## 1. 数据契约定义

模型输出为纯 JSON，顶层结构：

```typescript
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
```

---

## 2. 逻辑模板与拓扑注入

系统通过逻辑模板为 AI 提供结构流向参考：

- **拓扑骨架**：模板定义关键节点的跳转分支与流转规则（如前置筛选、深度追问等）；
- **语义填充**：AI 遵循模板的流转网络，结合用户的具体调研需求，生成对应的题干、选项及评价维度；
- **缺省行为**：未选用模板时，AI 默认采用线性自然推进，仅在有明确分流需要时自主配置关键节点。

---

## 3. User Prompt（用户提示词模板）

```text
调研需求：{prompt}
目标题量：约 {target_count} 题
参考资料：{document_context}
参考逻辑模板：{template_context}

请直接输出符合契约的纯 JSON 问卷数据：
```
