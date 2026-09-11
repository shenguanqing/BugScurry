# 开发路线图

[English](roadmap.md)

原则：先做出可玩的最小闭环，再扩能力；每个里程碑都可运行、可验收。

## M0 — 仓库与规范

- [x] Git 仓库初始化
- [x] 需求 / 架构 / 技术分析文档
- [x] README、LICENSE、.gitignore
- [x] 首次 commit 并 push 到 main

## M1 — MVP：一只虫可捏死

- [x] Tauri 2 + Vue 3 工程
- [x] 透明覆盖层 + Canvas 蟑螂
- [x] 随机爬行 / 停顿 / 转向 / 朝向
- [x] 穿透 + 点击捏死
- [x] 捏死后不自动补位
- [x] 基础托盘菜单

## M2 — 多虫 + 设置

- [x] 设置窗口（数量、大小、速度、随机度）
- [x] 清除 / 重生 / 即时同步
- [x] store 持久化
- [x] 关设置不退出
- [x] 虫种选择（随机 / 蟑螂 / 蚂蚁 / 蜘蛛 / 苍蝇 / 瓢虫）

## M3 — 手感与效果

- [x] 沿边缘游走
- [x] squish 形变打磨
- [x] Web Audio 音效（可关）
- [x] 死亡痕迹 / 粒子（可关）

## M4 — 多显示器与系统集成

- [x] 当前屏幕 / 所有屏幕
- [x] 开机启动
- [x] 隐藏时降低轮询
- [x] 窗口相对坐标命中

## M5 — 打包与扩展点

- [x] README 打包命令与产物路径
- [x] 虫种注册表（蟑螂、蚂蚁、蜘蛛、苍蝇、瓢虫）
- [x] 平台验证矩阵更新
- [x] 核心纯逻辑单元测试（`pnpm test`）
- [x] CI：typecheck + 测试 + cargo check + Windows NSIS + macOS DMG
- [x] `v*` 标签触发 GitHub Release + CHANGELOG
- [ ] 0.1.0 之后的版本号 / 发布流水线演练

### 后续可选（未阻塞当前版本）

- [x] 覆盖层跟随所有 macOS Spaces（2026-09-11 在 2 个 Space 上 soak 通过）
- [x] 隐藏时暂停 rAF 与光标轮询（隐藏 CPU 约 0%）
- [ ] 睡眠唤醒恢复 soak
- [ ] Windows 实机全量验证
- [ ] macOS 签名 / 公证流水线
- [ ] 虫种外形进一步打磨

## 完成定义（DoD）

1. `pnpm typecheck` 通过
2. `pnpm test` 通过
3. `pnpm build` 通过
4. `cargo check` 通过
5. macOS 实机跑通覆盖层与设置
6. 文档与代码一致
