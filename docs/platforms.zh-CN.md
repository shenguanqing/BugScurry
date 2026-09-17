# 平台差异与注意事项

[English](platforms.md)

最近一次 macOS 实测：**2026-09-16**（含合盖睡眠唤醒 soak）· Apple M1 Pro · macOS 15.7.9 · 内置 Retina 3024×1964@2x + 外接 1920×1080。Spaces soak 另见 2026-09-11。

- 开发路径：`pnpm tauri dev`（debug + Vite）
- 生产路径：用户执行 `pnpm tauri build` 后的 `BugScurry.app` / `BugScurry_0.4.0_aarch64.dmg`（已补测）

Windows 列本机尚未实机验证。

## macOS

### 窗口

- 透明 + 无边框：`transparent: true`, `decorations: false`
- 始终置顶：`alwaysOnTop: true`，必要时 level 调整
- 不抢焦点：覆盖层 `focusable: false`（设置窗口除外）
- Menu Bar 使用托盘图标 + 菜单（不是 Dock 主入口）
- 全屏应用 / Stage Manager：置顶窗口可能被系统遮挡，属系统策略
- **Spaces：** 覆盖层 `visibleOnAllWorkspaces`，切换桌面时虫子跟随

### 鼠标穿透

- `setIgnoreCursorEvents(true)` ↔ AppKit `NSWindow.ignoresMouseEvents`
- 无官方 `forward` 模式，需自建坐标转发或动态开关
- 动态开关时注意点击丢失窗口约一帧

### Retina

- `window.devicePixelRatio` 为 2
- Canvas backing store 必须乘 dpr
- CGEvent 光标是全局**逻辑点**，需按窗口 origin/scale 换算

### 兼容

- Apple Silicon（arm64）与 Intel（x64）分别打包或 universal
- 最低系统版本建议在 `tauri.conf.json` 与 README 标明

### 运行时结论（已实测）

| 主题 | 发现 |
|------|------|
| 开发模式 vs 裸 `cargo build --release` | `pnpm tauri dev` 走 `http://localhost:1420`，**必须先有 Vite**。单独跑 `target/debug/bugscurry` 时 WebView 为空白。生产资源应用 `pnpm tauri build` 生成；仅 `cargo build --release` 可能未正确嵌入 `frontendDist`。 |
| 覆盖层绘制 | 生产包 `BugScurry.app`：主屏 overlay 截屏可见不透明虫体像素，其余区域透明。 |
| 多显示器 | `monitorMode: "all"` 在 dev 与生产包均会创建第二块屏覆盖层。 |
| 设置窗口 | 默认隐藏（`onscreen=false`）；覆盖层主循环不依赖设置窗口是否打开。 |
| 设置与覆盖层层级（0.3+） | 打开设置**不要**降低覆盖层 `always_on_top`。覆盖层保持置顶，虫子仍可见；设置负责 show / focus。除碰到虫子外点击穿透。 |
| 天气（0.3+） | 托盘：停止 + 五档雨 / 雪 / 雾 / 沙尘，并勾选当前档。环境声程序化（仅主覆盖层）；停止/隐藏/关音效时硬静音。雷为延迟低频滚雷；沙尘共用阵风包络偏风噪。 |
| 投喂特效（0.3+） | 性格 + 虫种吃相；蚂蚁搬运时口器前画碎屑；水果吃完留 `__juice` 淡印；餐后暖光。 |
| 产物 | `src-tauri/target/release/bundle/macos/BugScurry.app` · `dmg/BugScurry_0.4.0_aarch64.dmg`（arm64） |

## Windows

### 窗口

- 透明无边框置顶：对应 WS_EX_LAYERED / TOPMOST / TOOLWINDOW 等由 Tauri 封装
- `skipTaskbar: true` 避免任务栏按钮
- WebView2 运行时依赖：安装器需处理 bootstrapper

### 鼠标穿透

- 对应 layered window 的 click-through 标志
- 同样建议只在命中变化时切换

### DPI

- 系统缩放 100% / 125% / 150% / 200%
- 混合 DPI 多显示器（笔记本 150% + 外接 100%）是重点测试项
- 行为模拟与命中一律逻辑像素

### 兼容

- x64 为主；ARM64 作为兼容目标验证 WebView2 与托盘

**状态：** CI 可产出 NSIS 安装包；本机尚未做 Windows 实机 soak，下表 Windows 列均为待测。

## 多显示器

| 问题 | 处理 |
|------|------|
| 分辨率不同 | 每显示器独立窗口与 viewport |
| 缩放不同 | 各窗口独立 dpr |
| 主屏切换 / 插拔 | 监听变化，重建窗口 |
| 「当前屏幕」 | 主屏（UI 文案需写清） |

## 性能检查清单

### 生产包（`pnpm tauri build` · BugScurry.app · M1 Pro）

- [x] 1 虫空闲 CPU — 进程约 **4.8%**（仅主屏覆盖层）
- [x] 10 虫双屏 — 进程约 **8.2%**
- [x] 50 虫双屏 — 短时采样约 **4.9%**（波动大，未见 CPU 打满）
- [x] 隐藏虫子后 CPU 近 0 — **通过（已暂停轮询）。** 托盘隐藏会停掉 rAF 与 Rust 光标轮询（`set_cursor_poller_enabled(false)`）；实测隐藏约 **0.0%**，可见约 5.5%（debug，12 虫）。
- [x] 设置窗口打开时覆盖层不冻结 — 设置默认隐藏，可从托盘打开；覆盖层独立
- [x] 睡眠唤醒后覆盖层恢复正常 — **通过（2026-09-16）。** 合盖 >30s 唤醒后主/副屏虫子与雨自动恢复。恢复路径：`system-resumed` → `force_rebuild_overlays`（关掉重建副屏，与手动切多显示器同路径）→ 刷新 viewport / 恢复音频。

### Debug（`pnpm tauri dev` · 上界参考）

含 Vite HMR 与 debug 代码，高于生产包：约 10–15%（1 虫）、4–5%（10 虫）、~3%（50 虫短采样）。

## 手动测试矩阵

| 用例 | macOS | Windows |
|------|-------|---------|
| 透明覆盖显示虫子 | 通过（dev + 生产包绘制/窗口） | 待测 |
| 桌面图标可点击穿透 | 通过 — 空白覆盖层上的点击与按键进入 TextEdit 文档 | 待测 |
| 点击虫子可捏死 | 通过 — 悬停约 250ms 后 CGEvent 点击；瓢虫簇 12→11，并出现汁液痕迹像素 | 待测 |
| 捏死后不自动重生 | 通过（单测 + 代码约定） | 待测 |
| 托盘菜单 | 通过（CGEvent 打开状态菜单；隐藏/显示可切换；设置可从托盘打开） | 待测 |
| 关设置不退出 | 通过（关窗仅 hide，进程仍在） | 待测 |
| Retina / DPI 显示正常 | 通过（CSS×dpr；逻辑 1512×982 @2x；生产包绘制已验证） | 待测 |
| 外接显示器 | 通过（`all` 模式在 dev 与生产包均生成第二覆盖层） | 待测 |
| 切换 Spaces（macOS） | 通过 — 本机 2 个 Space；Ctrl+←/→ 后覆盖层保持 onscreen 且仍有虫体像素 | — |
| 隐藏虫子 | 通过（托盘可切换；隐藏后 CPU 约 0%） | 待测 |

## 如何复跑 macOS soak

```bash
pnpm install
pnpm tauri dev          # 需要 Vite 在 :1420，不要单独跑 debug 二进制
```

生产形态请用 `pnpm tauri build` 后启动安装包；不要把裸 `cargo build --release` 当作发布产物。

### 睡眠唤醒 soak（人工）

1. `pnpm tauri dev` 或启动生产包，确认桌面有虫在爬。
2. 可选：托盘投喂一份食物、开雨，便于观察音频是否恢复。
3. 真正睡眠机器（苹果菜单 → 睡眠，或合盖）至少 30 秒。
4. 唤醒后检查：
   - **主屏与副屏**虫子都仍在各自屏幕范围内爬动（没有飞出、卡住，或副屏整层消失）
   - 若睡前开着雨，两块屏的雨丝都应恢复；雨声应在数秒内恢复
   - 点击虫子仍可捏死（穿透与命中正常）
   - 打开设置再关掉，应用不退出
5. 另测「全部清除」：应同时清掉虫子/食物/痕迹并停天气；再「重新生成」只出虫、不自动下天气。
