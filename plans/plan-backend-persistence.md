# 实施计划一：服务端全栈持久化与唯一短链服务方案 (Backend & Persistence)

## 1. 背景与核心痛点

当前 TypeSense 项目为 100% 纯前端 SPA/MPA 结构（基于 Vite + TS）：
- **问卷数据割裂**：静态问卷硬编码在 `public/data/surveys/*.json`，控制台新建问卷只能存放在浏览器的 `localStorage`，更换设备或隐身模式后数据直接丢失。
- **链接并非真唯一**：现有的 `/survey.html?id=xxx` 仅为客户端路由 Query 参数，无法做到受访者访问频次控制、有效截止时间、答卷权限鉴权。
- **提交结果无法汇总**：受访者答完后，Payload 仅在控制台输出或前端弹窗展示，无法持久化入库，更无法进行多样本数据分析与 CSV/Excel 导出。

本计划旨在为系统补齐轻量、高效、免运维的服务端底座，形成真正的问卷研发-发布-分发-回收闭环。

---

## 2. 架构设计与技术选型

- **服务端运行时**：Node.js (LTS) + TypeScript
- **Web 框架选型**：Fastify 或 Express（兼顾轻量与高吞吐），采用 ESM 模块化。
- **持久化方案**：
  - **开发/单机阶段**：SQLite (通过 `better-sqlite3` 或纯本地 JSON 文件系统存储)，零外部数据库运维依赖。
  - **数据层抽象**：通过仓储层（Repository Pattern）隔离底层存储，未来可平滑切至 PostgreSQL / MySQL。
- **短链分发引擎**：
  - 基于 NanoID / 自增 Base62 算法生成 6~8 位的全局唯一访问短码（如 `/s/k9xQ2a`）。
  - 支持短链状态机（未生效、进行中、已暂停、已达到收集配额上限、已过期）。

---

## 3. 核心功能与模块拆解

### 模块 A：问卷生命周期 RESTful API
1. `GET /api/surveys`：获取问卷列表（支持按状态、标签、创建时间分页）。
2. `GET /api/surveys/:id`：获取问卷完整 JSON Schema 及流转规则。
3. `POST /api/surveys`：创建新问卷（严格执行 JSON Schema 语法与逻辑校验）。
4. `PUT /api/surveys/:id`：更新问卷内容或修改流控规则。
5. `DELETE /api/surveys/:id`：归档或软删除问卷。

### 模块 B：专属短链与分发管理系统
1. `POST /api/surveys/:id/links`：为指定问卷生成一条或多条专属访问链接：
   - 支持设置参数：最大答卷配额（`maxResponses`）、截止时间（`expiresAt`）、是否允许重复提交（`allowMultiple`）。
2. `GET /s/:shortCode`：短链入口重定向：
   - 检查链接有效性（未满配额、在有效期内）。
   - 重定向至 `/survey.html?token=xxx` 或直接服务端直出初始状态。

### 模块 C：答卷提交与统计聚合引擎
1. `POST /api/surveys/:id/responses`：提交答卷数据载荷：
   - 包含元数据：客户端指纹、作答总耗时、答题链路跟踪（`routeHistory`）、答案映射字典（`answers`）。
   - 触发配额计数自增与并发安全性控制。
2. `GET /api/surveys/:id/analytics`：问卷数据大盘聚合：
   - 题目级完成率、跳出率漏斗分析（识别哪道题流失率最高）。
   - 单选/多选/量表的各选项分布占比。
3. `GET /api/surveys/:id/export`：作答原始数据导出（支持 CSV 和结构化 JSON）。

---

## 4. 前端适配与改造范围

1. **[`src/services/questionnaire-repository-service.ts`](file:///c:/Users/meru6/Desktop/TypeSense/src/services/questionnaire-repository-service.ts)**：
   - 将原先读取 `localStorage` 和静态目录的逻辑，替换为调用 `/api/surveys` 与 `/api/surveys/:id`。
   - 保留离线兜底降级策略（若网络不通，可回退读取本地静态缓存）。
2. **[`src/main.ts`](file:///c:/Users/meru6/Desktop/TypeSense/src/main.ts) (控制台页面)**：
   - 增加“数据统计”卡片入口与“导出 CSV”按钮。
   - 访问链接直接生成真实后端分发的 `/s/:shortCode` 短链。
3. **[`src/renderer/questionnaire-form-renderer.ts`](file:///c:/Users/meru6/Desktop/TypeSense/src/renderer/questionnaire-form-renderer.ts)**：
   - 答题完成时，通过 `fetch('/api/surveys/:id/responses', { method: 'POST', body: ... })` 提交服务端，并在界面展示真实的提交成功反馈。

---

## 5. 验收标准与度量

1. **端到端闭环测试**：在后台新建一份 30 题问卷 -> 发布生成唯一短链接 -> 受访者通过短链接作答提交 -> 后台统计报表实时刷新并查看到新增样本。
2. **异常拦截有效性**：设置问卷上限为 1 份，第 2 次通过短链访问时，系统精准阻断并提示“该问卷收集配额已满”。
3. **数据一致性**：导出的 CSV 数据字段与受访者答题内容 100% 对齐无乱码。
