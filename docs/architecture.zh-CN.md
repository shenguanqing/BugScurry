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
| Bug | `src/core/bug.ts` | 实体工厂（位置、朝向、大小、虫种、状态、搬运） |
| BugManager | `src/core/bugManager.ts` | 列表、数量、清除、重生、捏死/啃食特效、果汁印；**死后不自动补位** |
| Settings clamp | `src/core/settings.ts` | 纯函数归一化设置（无 Tauri 依赖） |
| Personality / Feeding | `src/core/personality.ts`、`src/core/feeding.ts` | 出生时固定性格；`resolveEatPlan` 叠加虫种 `eatStyle`；按距离与 `favoriteFood` 选食 |
| Weather | `src/core/weather.ts` | 本机时钟 `DayPhase` 权重；五档雨 profile、风向、闪电包络、自动雨时钟 |
| Rain audio / textures | `src/core/rainAudio.ts`、`src/core/rainTexture.ts` | 程序化雨声与雷声；离线构建循环纹理（rAF 内不实时合成） |
| Movement | `src/core/movement.ts` | 爬行 / 停顿 / 转向 / 角落脱困 / 贴边 / 雨天躲边 / 啃食与搬运 |
| Renderer | `src/core/renderer.ts` | Canvas、squish 形变、痕迹、粒子、雨丝、闪电、搬运碎屑；委托虫种 `draw` |
| HitTest | `src/core/hitTest.ts` | 指针与虫半径命中 |
| Squish | `src/core/squish.ts` | `squishing` → `dying` 进度 |
| Audio | `src/core/audio.ts` | Web Audio 短音效 |
| Loop | `src/core/loop.ts` | rAF 更新 + 绘制；主覆盖层 `onFrame` 驱动雨声 |
| Species | `src/species/*` | 注册表、traits（`favoriteFood` / `activity` / `eatStyle`）、各虫种绘制 |
| Settings UI | `src/settings/*` | 设置窗口 |
| Services | `src/services/*` | Tauri 事件/命令、配置、主题、多屏 |
| DailyStatsService | `src/services/dailyStatsService.ts` | 主覆盖层独占：排队击杀、串行落盘、刷新托盘战绩 |
| Shell | `src-tauri/src/lib.rs` | 窗口、光标、显示器、命令、覆盖层/设置层级 |
| Tray | `src-tauri/src/tray.rs` | 菜单栏 / 托盘（投喂与天气子菜单） |

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

## 8. 今日战绩（多显示器）

```text
任意覆盖层击杀 → emitTo("overlay", "bug-killed", {date, combo})
                        │
主覆盖层  ─────────────┘
  dailyStatsService.record()
        ├─ 内存累加（击杀 · 最高连击）
        └─ 串行队列 → store.set + setTrayStats
```

仅 label 为 `overlay` 的窗口负责落盘。副屏（`overlay-1` 等）只上报；单次写盘失败不会丢掉后续击杀。

## 9. 设置与覆盖层层级

打开设置时**不要**降低覆盖层的 `always_on_top`。覆盖层保持置顶，虫子继续可见；设置窗负责 show / raise / focus。覆盖层除碰到虫子外点击穿透，因此透明层下面的面板仍可正常操作。

## 10. 进食与满足态

```text
selectBait(bug, baits)          // 距离 × foodInterest（favoriteFood × personality.appetite）
        │
        ▼ 进入 BAIT_NIBBLE_RADIUS
resolveEatPlan(personality, species.eatStyle)
        │  hold / cooldown / cling / carry / bob / ripple / probe
        ▼
啃食（paused，eatingBaitId；最爱则 enjoyingFood）
        │
        ├─ cling  → 仍在范围内则不断续时
        └─ peck   → 进入 foodCooldown 后离开；carry 会置 carryKind
```

| 字段 | 含义 |
|------|------|
| `eatingBaitId` | 当前是否在食物上；每帧先清空，仍在范围内再写回 |
| `enjoyingFood` | 虫种最爱 → paused 时画爱心 |
| `foodCooldown` | 短啄型等待后再咬（胆小长、好奇短） |
| `satisfiedTimer` | 餐后暖光；最爱 `SATISFIED_FAVORITE_SEC`（8s），普通 `SATISFIED_ANY_SEC`（2.5s） |
| `carryKind` / `carryTimer` | 蚂蚁啄完搬运；朝最近边缘走 `CARRY_DURATION_SEC`（6s），口器前画碎屑 |

`eatingBaitId` 有效时，BugManager 按短冷却喷出啃食粒子（饼干渣 / 糖闪光 / 果汁）。水果耗尽会留下 `__juice` 痕迹。hover/ripple 只改绘制（悬停 bob / 身体起伏）；carry/scurry/sip 会改时序并可能离开食物。

性格基线在 `EAT_STYLES`（`personality.ts`），虫种风味在 `resolveEatPlan`（`feeding.ts`）叠加。新虫种只需可选的 `eatStyle`。

## 11. 扩展虫种

```ts
// src/species/example.ts
registerSpecies({
  id: "example",
  label: "Example",
  emoji: "✨",
  traits: {
    bodyScale,
    speedMul,
    edgeAffinity,
    tint,
    fluidColor,
    stainColor,
    // 可选：favoriteFood、activity（"diurnal" | "nocturnal"）、
    // eatStyle（"carry" | "hover" | "ripple" | "scurry" | "wrap" | "probe" | "sip" | "munch"）
  },
  draw(ctx, bug, alpha) { /* canvas */ },
});
```

在 `src/species/index.ts` 引入。运动逻辑共用，traits 只影响参数。`activity` 只作用于随机混养；指定单一虫种时忽略时段。`eatStyle` 通过 `resolveEatPlan` 叠在性格吃相之上。

## 12. 约定

- TypeScript `strict`
- Vue 组件只做 UI；逻辑在 `core/` / `services/`
- rAF 循环内避免重分配
- 常量集中在 `src/core/config.ts`
- 核心纯逻辑用 Vitest 覆盖（`pnpm test`）
