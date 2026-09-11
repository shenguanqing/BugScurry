# BugScurry

## 项目简介

BugScurry 是一个支持 macOS 和 Windows 的跨平台桌面应用。

应用会在桌面最上层显示可以自由爬行的小虫，用户可以点击虫子将其“捏死”。

## 技术栈

- Tauri 2
- Vue 3
- TypeScript
- Vite
- pnpm

选型依据见 `docs/tech-analysis.md`（已对比 Electron；穿透/点击若在 Tauri 遇阻，按该文档的回退条件评估）。

## 文档索引

实现前先读：

- `docs/requirements.md` — 需求与验收
- `docs/architecture.md` — 模块边界
- `docs/roadmap.md` — 当前里程碑
- `docs/platforms.md` — 平台差异

## 核心模块

保持以下模块职责独立：

- Bug：虫子实体
- BugManager：虫子管理
- Movement：移动与随机行为
- Renderer：渲染
- Hit Testing：点击检测
- Squish Effect：捏死动画
- Settings：设置
- Tray：系统托盘 / macOS 菜单栏
- Multi Monitor：多显示器管理

约束：

- 模拟与渲染热路径不要放进 Vue 响应式系统
- 业务逻辑放在 `src/core` / `src/services`，Vue 组件只做 UI
- 与 Tauri 的通信只经 `src/services/tauriBridge.ts`
- 新虫种通过 `src/species` 注册表扩展，不改主循环

## 开发规范

- 使用 TypeScript 严格模式
- 优先使用 Vue 3 Composition API
- 组件使用 `<script setup lang="ts">`
- 业务逻辑不要全部堆在 Vue 组件中
- 公共逻辑拆分为 composables / services / utils
- 优先编写简单、清晰、可维护的代码
- 避免引入不必要的依赖
- 不修改与当前任务无关的文件
- 不随意改变现有项目架构
- 修改前先理解现有实现
- 始终考虑 macOS 和 Windows 双平台兼容性

## 性能要求

- 动画目标 60 FPS
- 至少支持同时显示 50 只虫
- 避免每帧触发大量 Vue 响应式更新
- 动画优先使用 requestAnimationFrame
- 控制 CPU / GPU 占用
- 虫子隐藏或应用暂停时停止不必要的计算

## 桌面覆盖层要求

覆盖层需要支持：

- 透明背景
- 无边框
- Always On Top
- 不显示任务栏窗口
- 尽可能不影响桌面正常操作
- 虫子可以响应鼠标点击
- 非虫子区域鼠标尽量穿透
- macOS Retina
- Windows DPI Scaling
- 多显示器

涉及窗口行为时，需要分别验证 macOS 和 Windows。

## 开发流程

执行任务时：

1. 先检查现有代码和目录结构
2. 理解当前实现后再修改
3. 优先采用最小改动方案
4. 不重复实现已有功能
5. 修改完成后运行类型检查
6. 运行测试
7. 运行构建
8. 发现错误直接修复
9. 最后说明修改了什么以及验证结果

## Git 规则

- 未明确要求时不要 commit
- 未明确要求时不要 push
- 禁止 force push
- 不修改 Git 全局配置
- 不删除用户已有分支
- 不覆盖用户未提交的修改
