/**
 * flow-engine.test.ts
 *
 * 极简流转状态机与计算变量单元测试套件
 */

import { QuestionnaireFlowEngine } from './flow-engine';
import type { QuestionItemModel } from '../schema/questionnaire-schema-types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[Assertion Failed] ${message}`);
  }
  console.log(`✓ PASS: ${message}`);
}

const mockQuestions: QuestionItemModel[] = [
  {
    id: 'q1',
    type: 'single_choice',
    title: '职业角色？',
    options: ['高管', '架构', '研发', '学生'],
    jump: [
      { when: { q1: 3 }, to: 'exit' },
      { when: { q1: [0, 1] }, to: 'q2' },
      { else: true, to: 'q5' },
    ],
  },
  {
    id: 'q2',
    type: 'single_choice',
    title: '战略重心？',
    options: ['交付', '成本', 'AI'],
  },
  {
    id: 'q3',
    type: 'single_choice',
    title: '预算规划？',
    options: ['削减', '持平', '追加'],
  },
  {
    id: 'q4',
    type: 'likert_scale',
    title: 'ROI 满意度？',
    options: ['差', '一般', '优'],
    jump: 'q7', // 强制定向汇流回公共题 q7
  },
  {
    id: 'q5',
    type: 'multiple_choice',
    title: '研发痛点？',
    options: ['环境', '需求', '文档'],
  },
  {
    id: 'q6',
    type: 'multiple_choice',
    title: '提效工具？',
    options: ['IDE', '构建', '容器'],
  },
  {
    id: 'q7',
    type: 'single_choice',
    title: '团队规模？',
    options: ['小', '中', '大'],
    set: {
      v1: 'q2 + q3', // 临时计算变量
    },
    jump: [
      { when: { v1: { '>=': 3 }, q7: 2 }, to: 'q9' }, // 多变量综合决策
      { else: true, to: 'q8' },
    ],
  },
  {
    id: 'q8',
    type: 'single_choice',
    title: '常规业务题 (总分: ${v1})',
    options: ['是', '否'],
  },
  {
    id: 'q9',
    type: 'single_choice',
    title: '深入企业专项题 (总分: ${v1})',
    options: ['是', '否'],
  },
];

console.log('\n===== 开始运行 QuestionnaireFlowEngine 测试 =====\n');

// 1. 测试单变量甄别淘汰 (Disqualified)
{
  const engine = new QuestionnaireFlowEngine({ questions: mockQuestions });
  const initial = engine.getCurrentStep();
  assert(initial.currentQuestion?.id === 'q1', '初始游标停在 q1');

  // 选择 3 (在校学生)
  const step = engine.step(3);
  assert(step.status === 'disqualified', 'q1 选 3 正确触发 exit 淘汰');
  assert(step.isTerminal === true, '淘汰态判定为 isTerminal');
}

// 2. 测试管理层分流路径 (q1 -> q2 -> q3 -> q4 -> q7)
{
  const engine = new QuestionnaireFlowEngine({ questions: mockQuestions });
  // q1 选 0 (高管) -> 应跳转 q2
  let step = engine.step(0);
  assert(step.currentQuestion?.id === 'q2', 'q1 选 0 正确分流至 q2');

  // q2 选 1 (自然推进到 q3)
  step = engine.step(1);
  assert(step.currentQuestion?.id === 'q3', 'q2 答完自然递增至 q3');

  // q3 选 2 (自然推进到 q4)
  step = engine.step(2);
  assert(step.currentQuestion?.id === 'q4', 'q3 答完自然递增至 q4');

  // q4 配置了强制定向 jump: "q7" (跨过工程师的 q5, q6)
  step = engine.step(2);
  assert(step.currentQuestion?.id === 'q7', 'q4 答完强制定向跨步至公共题 q7');
}

// 3. 测试工程师分流路径 (q1 -> q5 -> q6 -> q7)
{
  const engine = new QuestionnaireFlowEngine({ questions: mockQuestions });
  // q1 选 2 (研发) -> 命中 else 跳 q5
  let step = engine.step(2);
  assert(step.currentQuestion?.id === 'q5', 'q1 选 2 正确命中 else 分流至 q5');

  // q5 多选 [0, 1] (自然推进至 q6)
  step = engine.step([0, 1]);
  assert(step.currentQuestion?.id === 'q6', 'q5 答完自然递增至 q6');

  // q6 答完自然顺延至 q7
  step = engine.step([1]);
  assert(step.currentQuestion?.id === 'q7', 'q6 答完自然推进至 q7');
}

// 4. 测试临时计算变量 set 与多变量组合 jump
{
  const engine = new QuestionnaireFlowEngine({ questions: mockQuestions });
  engine.step(0); // q1 = 0
  engine.step(2); // q2 = 2
  engine.step(2); // q3 = 2
  engine.step(1); // q4 = 1 (跳到 q7)

  // 此时回答 q7: 选 2 (大团队)
  // q7 配置了 set: { v1: "q2 + q3" } -> v1 应为 2 + 2 = 4
  // 并且 when: { v1: { ">=": 3 }, q7: 2 } 满足条件，应跳 q9！
  const step = engine.step(2);
  const ctx = engine.getContext();
  assert(ctx.variables.v1 === 4, 'set 算式 v1 = q2 + q3 正确算出 4');
  assert(step.currentQuestion?.id === 'q9', '多变量条件 v1>=3 且 q7==2 正确命中跳至 q9');
  assert(Boolean(step.currentQuestion?.title.includes('总分: 4')), '题干动态插值 ${v1} 正确渲染为 4');
}

// 5. 测试目标不存在时的自动降级容错
{
  const faultyQuestions: QuestionItemModel[] = [
    {
      id: 'q1',
      type: 'single_choice',
      title: '第 1 题',
      options: ['A', 'B'],
      jump: 'q_non_existent_typo', // 写错的目标题号
    },
    {
      id: 'q2',
      type: 'single_choice',
      title: '第 2 题',
      options: ['A', 'B'],
    },
  ];

  const engine = new QuestionnaireFlowEngine({ questions: faultyQuestions });
  const step = engine.step(0);
  assert(step.currentQuestion?.id === 'q2', '跳转不存在的错题号时自动降级顺延到 q2，未崩溃');
}

// 6. 测试历史物理回退 (Rollback)
{
  const engine = new QuestionnaireFlowEngine({ questions: mockQuestions });
  engine.step(0); // q1 -> q2
  engine.step(1); // q2 -> q3
  const rollbackStep = engine.rollbackTo('q1');
  assert(rollbackStep.currentQuestion?.id === 'q1', '正确物理回退游标至 q1');
}

console.log('\n===== 所有 QuestionnaireFlowEngine 核心测试全部通过！ =====\n');
