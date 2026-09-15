# Kapsel Agent Guidelines & Instructions (AGENTS.md)

This file is automatically ingested by AI coding agents (Antigravity, Gemini, Cursor, Copilot, etc.).

## 1. Version Iteration Manifesto (逢 9 进 1)
- **Mandatory Version Advancement**: Whenever code modifications are made to Kapsel core or any official plugin, you **MUST** advance the version number.
- **Base-10 Rollover Rule**:
  - Carry over upon reaching 9: e.g. `0.1.8` -> `0.1.9` -> `0.2.0`, or `0.2.9` -> `0.3.0`.
- **Manifest & Catalog Synchronization**:
  - For Kapsel core: Update `pyproject.toml` and `kapsel/__init__.py`.
  - For official plugins: Update `PluginManifest` in `plugins/<name>/plugin.py` and synchronize `plugins/catalog.json` with the new version and a clear changelog note.



## 2. Investigation & Code Standards
- Minimize temporary ad-hoc python scripts for inspection; use standard CLI tools, pytest, ripgrep, or git directly.
- **English Comments (注释使用英语)**: All code comments, docstrings, and type annotations must remain in English.
- **Minimal Text & Essential Descriptions (文本描述仅保留必须项)**: 界面、提示及代码内的文本描述仅保留必须项，杜绝任何多余的说明性赘述。
- Maintain existing tests and ensure all tests pass (`python -m pytest`).
- **Leverage Established Libraries (优先引入成熟包)**: 优先引入成熟完善的包，而不是自己重写逻辑。

## 3. Strict File & Task Scope (精确读取与最快回复)
- **Zero Scope Creep**: When the user designates specific files or a concrete task, strictly confine all reading, inspection, and operations to those specified files/boundaries.
- **No Unsolicited Reading/Actions**: Do not read, inspect, or modify other files or perform unrelated operations without explicit instructions or prior permission.
- **Precise Reads & Fastest Response**: Minimize redundant tool calls, read only the exact target locations, and deliver the fastest, most direct response.

## 4. Frontend & Preset Policy (前端严禁示例与最小化预设)
- **Zero Mock / Preset Data in Frontend**: 前端禁止填入任何示例、演示卡片或预设文本；界面输入及数据展示必须保持干净，仅依赖用户实际输入或后端读取存储。
- **Minimal Preset Content**: 最小化预设内容，杜绝非必要的占位与硬编码假数据。

## 5. Testing Prohibition (严禁未经允许的测试)
- **No Unsolicited Testing**: 未经用户明确允许，严禁进行测试，包括编写测试文件、运行测试用例、启动浏览器自动化等。
- **Compile-Only Verification**: 仅验证编译无错误即可（如 TypeScript 编译 / 项目构建校验），无需且禁止发起任何额外的自主测试。

## 6. Request Adherence & Mandatory Planning (严禁未要求改动与计划前置)
- **Zero Unrequested Work**: 不要实现用户没有要求的内容，严禁任何擅自扩展、过度设计或添加额外未指定的特性。
- **Plan-First for Any Extended Work**: 如果认为有必要执行额外扩展或未明确指定的改动，必须先使用详细计划（Plan / implementation_plan.md）阐明方案，待用户明确确认许可后方可执行。

