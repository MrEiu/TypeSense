/**
 * server/ai/generator/prompt-builder.ts
 *
 * Prompt construction templates for direct and concurrent survey generation.
 */

export class GeneratorPromptBuilder {
  /**
   * Build system prompt for direct lean survey generation
   */
  public static buildDirectSurveySystemPrompt(
    targetCount: number,
    docText: string,
    enableJump: boolean
  ): string {
    const logicInstruction = enableJump
      ? `逻辑跳转规则：在有明确分流需要时（如特定选项筛选、不同受众分类）配置关键节点单向向前跳转（jump 字段）。`
      : `逻辑跳转规则：本次调研无需条件分支跳转逻辑，请采用线性自然推进流程（严禁在任何题目中生成 jump 字段）。`;

    const docInstruction = docText
      ? `- 核心资料约束（最高优先级）：用户提供了核心参考资料/文档。你必须严格以该参考资料的内容作为问卷设计的核心依据与知识来源，从中提取、归纳与转化题目、选项、评价维度和流转逻辑，严禁脱离参考资料凭空编造无关领域的问卷！若用户需求简短或仅为补充要求，以参考资料为主要出题事实依据。`
      : '';

    return `你是一位调研设计专家。请根据用户需求${docText ? '与核心参考资料文档' : ''}生成结构化问卷 JSON。
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

规则与规范：
${docInstruction ? `${docInstruction}\n` : ''}${logicInstruction}
- 题号必须严格从 q1 顺序递增到 q${targetCount}。
- 量表题（likert_scale）：为多维度矩阵评分题型，必须同时包含 options（横向评分刻度，如 ["非常不满意","不满意","一般","满意","非常满意"]）与 statements（纵向被评价的 3~6 个具体维度/子条目，如 ["功能完备度", "界面易用性", "系统稳定性"]），严禁遗漏 statements 字段！`;
  }

  /**
   * Build user prompt for direct lean survey generation
   */
  public static buildDirectSurveyUserPrompt(
    prompt: string,
    targetCount: number,
    docText: string,
    templateContext: string
  ): string {
    const userPromptParts: string[] = [];
    if (docText) {
      if (prompt) {
        userPromptParts.push(`调研需求与补充指示：${prompt}`);
      } else {
        userPromptParts.push(`调研需求：请严格根据下方核心参考资料的内容，提炼并转化为专业、结构化的调研问卷。`);
      }
      userPromptParts.push(`目标题量：约 ${targetCount} 题`);
      userPromptParts.push(`【核心参考资料文档（出题必须严格以此为依据）】：\n${docText}`);
    } else {
      userPromptParts.push(`调研需求：${prompt || '用户综合体验与满意度调研'}`);
      userPromptParts.push(`目标题量：约 ${targetCount} 题`);
    }

    if (templateContext) {
      userPromptParts.push(`参考逻辑模板：\n${templateContext}`);
    }
    userPromptParts.push('请直接输出符合契约的纯 JSON 问卷数据：');

    return userPromptParts.join('\n\n');
  }

  /**
   * Build system prompt for Dispatcher Agent in concurrent pipeline
   */
  public static buildDispatcherSystemPrompt(): string {
    return `你是一位调研设计架构师。请根据用户的调研诉求，将问卷拆解为 4~6 个并发子任务。
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
2. prompt 必须为直接给子 Agent 的出题指令，严禁添加多余描述性套话。`;
  }

  /**
   * Build user prompt for Dispatcher Agent in concurrent pipeline
   */
  public static buildDispatcherUserPrompt(
    prompt: string,
    targetCount: number,
    relevantDoc: string,
    templateContext: string
  ): string {
    return [
      `调研诉求：${prompt || '用户综合体验与满意度调研'}`,
      `目标题数：约 ${targetCount} 题`,
      relevantDoc ? `参考资料：\n${relevantDoc}` : '',
      templateContext ? `参考逻辑模板：\n${templateContext}` : '',
      '请直接输出符合契约的纯 JSON 任务计划数据：',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  /**
   * Build system prompt for Worker Agent generating questions for a chunk
   */
  public static buildWorkerSystemPrompt(blockId: string): string {
    return `你是一位调研题目设计专家。请根据指定的出题指令生成题目列表。
必须直接输出符合契约的纯 JSON 数据，严禁输出任何 Markdown 标记或多余文字。

顶级结构：
{
  "questions": []
}

题型规范：
1. single_choice (单选题):
   { "id": "${blockId}_1", "type": "single_choice", "title": string, "options": string[], "jump"?: IntraBlockJumpRule[] }

2. multiple_choice (多选题):
   { "id": "${blockId}_1", "type": "multiple_choice", "title": string, "options": string[], "jump"?: IntraBlockJumpRule[] }

3. likert_scale (量表题/矩阵评分):
   { "id": "${blockId}_1", "type": "likert_scale", "title": string, "options": string[], "statements": string[], "jump"?: IntraBlockJumpRule[] }
   - options 为评分刻度（列），statements 为评价条目（行），二者必须同时具备。

4. text_input (填空题):
   { "id": "${blockId}_1", "type": "text_input", "title": string, "placeholder"?: string }

约束：
- 题号必须严格带有当前组块前缀并顺序递增，如 ${blockId}_1, ${blockId}_2, ${blockId}_3...
- 默认自然顺延。若配置 jump，仅允许在本组块内向后跳转或指向 "exit" / "end"，严禁跨组块跳转。`;
  }

  /**
   * Build user prompt for Worker Agent
   */
  public static buildWorkerUserPrompt(prompt: string, count: number, blockId: string): string {
    return [
      `出题指令：${prompt}`,
      `生成题量：${count} 题（题号前缀为 ${blockId}_*）`,
      '请直接输出符合契约的纯 JSON 题目列表：',
    ].join('\n\n');
  }
}
