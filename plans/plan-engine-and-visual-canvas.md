# 实施计划二：逻辑流控引擎增强与全景拓扑调试画布升级方案 (Engine & Canvas)

## 1. 背景与核心痛点

当前 TypeSense 已建立基于 `src/logic/` 的规则求值体系与基于 `src/canvas/` (ELK) 的自组织拓扑画布：
- **静态分析与防御能力缺失**：如果问卷编排者在 JSON 中意外配置了**死循环环路**（A -> B -> A）、**断头路**（某分支后无下一题也未标记结束）或**永远无法被执行的幽灵题目**（不可达节点），目前系统缺乏静态校验预警。
- **算法注入尚未具备标准落地场景**：虽然底层架构支持 `AlgorithmCondition` 与 `AlgorithmFunction`，但尚未提供高频业务算法库（如心理学计分、信度甄别、动态风险评级），未能发挥算法注入的真正威力。
- **画布目前仅为只读展示，缺乏交互式仿真调试**：问卷管理员打开 `/admin.html` 画布，只能肉眼看拓扑图，无法在画布上模拟“如果受访者选了 A，接下来会走哪条线”，无法直观观察变量池（`variables`）和判定上下文的变化。

---

## 2. 核心功能与模块拆解

### 模块 A：问卷拓扑静态验证与安全卫士 (Topology Verification Engine)
位于 [`src/logic/verification.ts`](file:///c:/Users/meru6/Desktop/TypeSense/src/logic/verification.ts) 深度增强：
1. **死循环检测 (Cycle Detection)**：
   - 基于 Tarjan 强连通分量算法，遍历 DAG 连通图。如果检测到非明确意图的死循环路由（非受控 Loop 节点），立即报错并输出具体环路路径：`q02 -> q04 -> q02`。
2. **不可达节点分析 (Unreachable Node Analyzer)**：
   - 从入口节点（`canvas_node_start`）出发做 BFS 遍历。若存在任何孤立题目（无法从任何分支到达），输出警告。
3. **分支完整性检测 (Exhaustive Branch Checking)**：
   - 检查题目配置的 `branch` 是否存在逻辑空隙（例如单选题共 4 个选项，只配置了选项 0 和 1 的跳转，且没有配置 `else` 兜底，导致选 2 和 3 时流程异常挂起）。

### 模块 B：工业级内置算法库 (Standard Algorithm Library)
在 [`src/logic/registry.ts`](file:///c:/Users/meru6/Desktop/TypeSense/src/logic/registry.ts) 预置生产级算法注入函数：
1. `algorithm_weighted_score`：加权多维综合打分算法（支持为不同题目赋予不同权重，实时向 `context.variables` 累加维度分）。
2. `algorithm_trap_verification`：测谎题/注意力校验算法（校验受访者前后两道互斥题目的逻辑一致性，自动判断是否存在胡乱作答行为）。
3. `algorithm_persona_router`：用户画像智能路由（根据前置 5 道背景题的聚类特征，通过轻量级决策树自动输出受访者分类标签）。

### 模块 C：全景画布交互式流程仿真器 (Interactive Flow Simulator)
升级 [`src/admin.ts`](file:///c:/Users/meru6/Desktop/TypeSense/src/admin.ts) 管理画布：
1. **单步调试穿梭面板 (Debug Inspector Dock)**：
   - 画布侧边栏新增“流程仿真器”开关。开启后，管理员可在面板中即时选择选项或触发测试数据。
2. **动态路由高亮 (Active Route Glowing)**：
   - 当仿真器推进时，ELK 画布上的活跃边（Active Edge）与当前命中的节点自动呈现粒子发光/高亮效果，实时展现“穿梭足迹”。
3. **运行时变量池监视器 (Variables Watcher)**：
   - 实时观察 FlowContext 内部的 `answers` 与 `variables`，支持直接修改变量值并查看分支走向。

### 模块 D：画布逆向导出与可视化流控微调
1. 支持在画布节点卡片上直接点击微调分支流向（如快速更改选项的分流目标题号）。
2. 提供“一键导出标准化 JSON”，保证画布修改与底层 JSON 文件的一致性。

---

## 3. 技术实施路线

1. **第 1 阶段**：完善 `verification.ts`，在前端编译与问卷加载时自动执行拓扑体检，控制台与画布顶部展示“体检诊断报告”（包含警告条数、孤岛节点标红）。
2. **第 2 阶段**：注册内置算法，并在 `survey_enterprise_tech_2026.json` 中示范算法注入规则（例如基于前置技术选项计算企业架构成熟度分值）。
3. **第 3 阶段**：在 `admin.ts` 中接入仿真器事件总线，实现画布连线 SVG 路径动态着色。

---

## 4. 验收标准与度量

1. **静态体检准度**：人为在测试问卷中注入死循环或未连通题目，校验引擎能 100% 捕获并准确定位到出错题号。
2. **仿真器交互体验**：在 `/admin.html` 画布上单步点击选项，画布视图能够平滑自动 PanZoom 聚焦到下一命中节点，连线高亮无明显顿挫（> 60 FPS）。
3. **纯数值规则一致性**：算法求值与数值分支结果符合预设契约，通过自动化单元测试检验。
