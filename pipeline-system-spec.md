# TypeSense 并发流水线系统调度与运行时规范

本文档定义并发问卷生成在**系统调度层（Backend Runtime & Orchestrator）**的具体工程实现规范，涵盖并发控制、缓存管理、SSE 流式通信与装配落盘。

---

## 1. 调度层整体架构

系统调度器（`ConcurrentPipelineOrchestrator`）作为中枢，负责串联主 Agent、调度子 Agent 并发池、管理中间缓存并向前端广播事件：

```
[前端请求] ──> GET /api/ai/concurrent-stream (建立 SSE 连接)
                    │
                    ▼
       ┌────────────────────────┐
       │ 1. 调用 Dispatcher     │ ── 产出 SurveyTaskPlan (4~6个子任务)
       └───────────┬────────────┘
                   │
                   ▼ SSE 推送 `plan_ready`
       ┌────────────────────────┐
       │ 2. 并发池调度器 (Pool) │ ── 限制最大 3 个并行 Worker
       └───────────┬────────────┘
                   │
                   ├───> Worker b1 ──> 写入 cache[b1] ──> SSE `block_done`
                   ├───> Worker b2 ──> 写入 cache[b2] ──> SSE `block_done`
                   └───> Worker b3 ──> 写入 cache[b3] ──> SSE `block_done`
                   │
                   ▼ （全组块完成）
       ┌────────────────────────┐
       │ 3. 确定性顺序装配与重排 │ ── 映射为 q1..qN，平移块内跳转
       └───────────┬────────────┘
                   │
                   ▼ SSE 推送 `survey_ready`
       ┌────────────────────────┐
       │ 4. 写入 SQLite 持久化   │ ── 调用 SurveyService 落库
       └────────────────────────┘
```

---

## 2. 并发池调度与超时控制

### 2.1 并发度限制（Rate Limiting）
大模型 API 存在并发上限（RPM/TPM），严禁无限制 `Promise.all`：
- **最大并发数**：固定为 3（可配置于 `config-service`）；
- **调度机制**：采用轻量队列（或 `p-limit`），一个 Worker 完成后自动取下一个任务执行。

### 2.2 超时与单块重试
- **单块超时**：每个 Worker 设置 30 秒硬超时（AbortController）；
- **失败隔离**：单个 Worker 出现网络异常、超时或 JSON 解析错误时，系统**仅重试该组块 1 次**，其余正常完成的组块保留在缓存中，绝不推翻重跑。

---

## 3. 内存缓存模型（Cache Management）

生成过程中的中间数据缓存在服务端内存 Map 中，任务结束并落库后自动销毁（TTL: 10 分钟）：

### 3.1 缓存数据结构
```typescript
interface PipelineSession {
  surveyId: string;
  title: string;
  createdAt: number;
  tasks: {
    id: `b${number}`;
    count: number;
    prompt: string;
    status: 'pending' | 'running' | 'done' | 'failed';
  }[];
  blockResults: Map<string, QuestionItem[]>; // key 为 blockId (如 "b1")
}

const activeSessions = new Map<string, PipelineSession>();
```

---

## 4. SSE（Server-Sent Events）流式协议

为了提供流畅的用户体验，前后端通过 SSE 保持单向流式推送，前端根据事件动态上屏：

### 4.1 事件定义

| 事件名 (`event`) | 数据负载 (`data`) | 触发时机与前端动作 |
| :--- | :--- | :--- |
| `plan_ready` | `{ title: string, tasks: Array<{ id, count }> }` | Dispatcher 完成，前端展示大纲与骨架占位。 |
| `block_progress` | `{ blockId: string, questions: QuestionItem[] }` | 单个组块生成成功，前端直接将该组块题目展开上屏。 |
| `survey_ready` | `{ surveyId: string, questions: QuestionItem[] }` | 全量顺序拼装与全局编号完成，问卷进入最终可用状态。 |
| `error` | `{ message: string, blockId?: string }` | 某组块或全局发生不可恢复的错误。 |

---

## 5. 确定性顺序装配算法（Deterministic Re-indexing）

所有组块就绪后，由纯 TypeScript 代码执行严格的无损映射：

```typescript
function assembleQuestions(session: PipelineSession): QuestionItem[] {
  const orderedQuestions: QuestionItem[] = [];
  const idMap = new Map<string, string>(); // "b1_1" -> "q1"

  // 1. 按照任务规划顺序铺平，建立全局映射表
  let globalIndex = 1;
  for (const task of session.tasks) {
    const blockQs = session.blockResults.get(task.id) || [];
    for (const q of blockQs) {
      const globalId = `q${globalIndex++}`;
      idMap.set(q.id, globalId);
      orderedQuestions.push({ ...q });
    }
  }

  // 2. 批量平移题目自身的 ID 与块内跳转引用
  for (const q of orderedQuestions) {
    const oldId = q.id;
    q.id = idMap.get(oldId) || oldId;

    if (Array.isArray(q.jump)) {
      q.jump = q.jump.map((rule) => {
        const translatedTo = idMap.get(rule.to) || rule.to;
        const translatedWhen: Record<string, any> = {};

        if (rule.when) {
          for (const [key, val] of Object.entries(rule.when)) {
            const mappedKey = idMap.get(key) || key;
            translatedWhen[mappedKey] = val;
          }
        }

        return {
          ...rule,
          to: translatedTo,
          when: rule.when ? translatedWhen : undefined,
        };
      });
    }
  }

  return orderedQuestions;
}
```

---

## 6. 持久化与接口落位

装配完成后，调度器直接调用现有数据持久化层：
1. **生成全局问卷 ID**：通过 `IdGenerator.generateId('sur')`；
2. **入库持久化**：调用 `SurveyService.createSurvey({ id, title, questions })` 写入本地 SQLite；
3. **清理临时缓存**：从 `activeSessions` 中移除该 session，释放内存。
