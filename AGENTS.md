# AGENTS.md - Agent Execution & Code Architecture Rules

## 1. 务实架构准则 (Anti-Bureaucracy & Pragmatism)
- **严禁滥建 `INDEX.md`**：只有 1~3 个文件的小目录、辅助目录绝对禁止建立 `INDEX.md`；严禁编写空洞重复的套话凑数。
- **目录扁平化**：禁止过度微碎片化拆分目录，保持代码结构清晰紧凑。
- **单一职责与命名**：文件命名遵循领域实体 + 职责角色（`kebab-case`），禁止模糊空洞命名。

## 2. 行为纪律 (Discipline)
- **功能优先**：聚焦实现用户提出的功能目标，代码精简干练。
- **严禁未经允许运行测试**：未经用户明确许可，严禁私自启动浏览器自动化测试（Subagent）或产生干扰。只需通过 `npm run build` 进行代码构建与类型检查。
