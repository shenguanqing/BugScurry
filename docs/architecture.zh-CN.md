# 架构设计

[English](architecture.md)

完整文件树见 [README.zh-CN.md](../README.zh-CN.md) 的 **「项目结构」**。本文只描述**原则、数据流与模块职责**，不重复罗列目录。

## 1. 设计原则

1. **壳与业务解耦** — Tauri 负责窗口、托盘、原生事件、光标转发；模拟与绘制在前端，可测、可迁移。
2. **热路径不去响应式** — rAF 循环直接改普通 `Bug[]`；Vue 只做设置 UI。
3. **实体与系统分离** — `Bug` 是数据；Movement / Renderer / HitTest / Squish / Audio 是系统。
4. **平台差异收口** — DPI、多屏、穿透、Spaces 只出现在 `src-tauri` 与 `tauriBridge`。
5. **可扩展虫种** — 新虫种 = `src/species` 里的绘制 + traits，不改主循环。

## 2. 运行时总览

```text
托盘 / 设置 UI
        │
        ▼
 settingsService ──emit──► 覆盖层 App.vue
        │                      │
        │                      ▼
        │                 BugManager ──► Bug[]
        │                      │
        │         ┌────────────┼────────────┐
        │         ▼            ▼            ▼
        │     Movement      HitTest      Squish
        │         │            │            │
        │         └────► Renderer ◄─────────┘
        │                    │
        │                    ▼
        │                Canvas 帧
        │
        └── store（settings.json）
```

壳层（Rust）：

```text
lib.rs
  ├── overlay 窗口     — 透明、置顶、穿透
  ├── 光标轮询         — 每窗本地坐标 → cursor-local
  ├── 显示器适配       — macOS CGDisplayBounds / Windows 物理像素
  └── 命令             — clickable、设置、多屏、退出

tray.rs
  └── 菜单 → tray-command → overlay
```

## 3. 模块职责

| 模块 | 路径 | 职责 |
|------|------|------|
| Bug | `src/core/bug.ts` | 实体工厂（位置、朝向、大小、虫种、状态） |
| BugManager | `src/core/bugManager.ts` | 列表、数量、清除、重生、捏死特效；**死后不自动补位** |
| Settings clamp | `src/core/settings.ts` | 纯函数归一化设置（无 Tauri 依赖） |
| Movement | `src/core/movement.ts` | 爬行 / 停顿 / 转向 / 角落脱困 / 贴边 |
| Renderer | `src/core/renderer.ts` | Canvas、squish 形变、痕迹、粒子；委托虫种 `draw` |
| HitTest | `src/core/hitTest.ts` | 指针与虫半径命中 |
| Squish | `src/core/squish.ts` | `squishing` → `dying` 进度 |
| Audio | `src/core/audio.ts` | Web Audio 短音效 |
| Loop | `src/core/loop.ts` | rAF 更新 + 绘制 |
| Species | `src/species/*` | 注册表、traits、各虫种绘制 |
| Settings UI | `src/settings/*` | 设置窗口 |
| Services | `src/services/*` | Tauri 事件/命令、配置、主题、多屏 |
| Shell | `src-tauri/src/lib.rs` | 窗口、光标、显示器、命令 |
| Tray | `src-tauri/src/tray.rs` | 菜单栏 / 托盘 |

## 4. Bug 状态机

```text
crawling ⇄ paused
    │
    ▼（点击）
squishing → dying → 移除（不重生）
```

只有「调高数量 / 托盘 + / 重新生成」才会再生成虫子。

## 5. 坐标系

| 空间 | 用途 |
|------|------|
| 逻辑 CSS 像素 | 模拟、命中、设置中的大小/速度 |
| 物理像素 | Canvas backing store（`css * dpr`） |
| macOS 光标 | CGEvent 全局**点** |
| Windows 光标 | 全局**物理像素** |

各窗口本地光标：

- macOS：`点 − origin_physical / scale`
- Windows：`(物理 − origin_physical) / scale`

绘制视口用 `window.innerWidth/innerHeight` + `devicePixelRatio`。

## 6. 鼠标穿透

```text
Rust 轮询 → 每窗 cursor-local {x,y,inside}
                     │
前端命中检测 ────────┤
                     ├─ 命中 → setIgnoreCursorEvents(false) → click → squish
                     └─ 未中 → setIgnoreCursorEvents(true)
```

只在 hover 状态变化时切换穿透。覆盖层 `focusable: false`。

## 7. 设置同步

1. UI / 托盘改设置 → `saveSettings` → 存盘 + `settings-changed`
2. 覆盖层应用（大小实时缩放；仅数量变化时增删虫）
3. 设置窗口监听并刷新表单
4. 主题 / 音效等不会解除「已清除」状态

## 8. 扩展虫种

```ts
// src/species/example.ts
registerSpecies({
  id: "example",
  label: "Example",
  emoji: "✨",
  traits: { bodyScale, speedMul, edgeAffinity, tint, fluidColor, stainColor },
  draw(ctx, bug, alpha) { /* canvas */ },
});
```

在 `src/species/index.ts` 引入。运动逻辑共用，traits 只影响参数。

## 9. 约定

- TypeScript `strict`
- Vue 组件只做 UI；逻辑在 `core/` / `services/`
- rAF 循环内避免重分配
- 常量集中在 `src/core/config.ts`
- 核心纯逻辑用 Vitest 覆盖（`pnpm test`）
