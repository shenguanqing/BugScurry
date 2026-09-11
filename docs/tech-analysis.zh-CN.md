# 技术方案分析：Tauri 2 vs Electron

[English](tech-analysis.md)

> 目标：为 BugScurry 选出更适合「透明桌面覆盖层 + 选择性点击 + 后台常驻」场景的技术栈。
> 结论不为技术栈站台，只服务最终体验。

## 1. 核心约束

| 约束 | 说明 |
|------|------|
| 透明、无边框、置顶覆盖层 | 跨 macOS / Windows |
| 鼠标默认穿透 | 不影响桌面与其它软件操作 |
| 仅虫子区域可点击 | 点击命中后执行「捏死」 |
| 后台常驻 | 资源占用需可控 |
| 最多 50 只虫、目标 60 FPS | Canvas/WebGL 动画 |
| 多显示器 / Retina / DPI | 物理像素与逻辑像素正确换算 |
| 系统托盘 / Menu Bar | 常驻入口，设置窗口可关不退应用 |

其中 **「鼠标默认穿透 + 仅虫子可点」** 是决定技术选型的关键能力。

## 2. 两种方案对比

### 2.1 综合对比表

| 维度 | Tauri 2 | Electron | 对本项目的影响 |
|------|---------|----------|----------------|
| 渲染内核 | 系统 WebView（WKWebView / WebView2） | 内置 Chromium | 两者做 Canvas 动画都够用 |
| 内存占用 | 约 30–80 MB | 约 150–300 MB | 后台常驻场景 Tauri 明显更友好 |
| 安装包体积 | 约 5–10 MB | 约 80–150 MB | Tauri 更轻 |
| 透明窗口 | 支持（`transparent` + 无边框 + 置顶） | 支持且生态更成熟 | 两者都可实现基础覆盖层 |
| 鼠标穿透 | `setIgnoreCursorEvents(bool)`，**无事件转发** | `setIgnoreMouseEvents(true, { forward: true })` | Electron 原生解决「穿透仍可感知鼠标位置」 |
| 选择性点击 | 需自行用原生层转发鼠标坐标，再动态开关穿透 | `forward: true` + 动态切换即可 | **体验差距最大的一项** |
| 窗口遮挡焦点 | 透明置顶窗口需处理 `focusable: false` 等 | 同样需要配置 | 两者都可 |
| 多显示器 | 需自行用原生 API / 插件枚举屏幕 | `screen` 模块开箱可用 | Electron 开发成本更低 |
| 托盘 / Menu Bar | 原生支持，体积小 | 原生支持 | 两者都可 |
| 自动更新 / 打包 | 官方工具链完整 | electron-builder / forge 成熟 | 两者都可 |
| 跨平台一致性 | 依赖系统 WebView 版本，偶有差异 | Chromium 完全一致 | Electron 更省心 |
| 语言栈 | Rust + 前端 | 纯 Node/前端 | 若需底层鼠标钩子，Tauri 可写 Rust，Electron 需原生模块 |
| 热更新前端 | 支持 | 支持 | 无差异 |

### 2.2 关键能力详解：选择性鼠标穿透

真实需求不是「整窗可点」或「整窗穿透」，而是：

1. 透明区域：事件穿透到桌面，用户正常操作；
2. 虫子像素区域：能收到 click，触发捏死；
3. 虫子爬走后：原区域立即恢复穿透。

#### Electron 路径（原生支持较好）

```ts
// 默认穿透，但转发 mousemove 给页面
win.setIgnoreMouseEvents(true, { forward: true });

// 页面内通过 mousemove 做命中检测
window.addEventListener('mousemove', (e) => {
  const hit = hitTestBugs(e.clientX, e.clientY);
  win.setIgnoreMouseEvents(!hit, { forward: true });
});
```

- `forward: true`：穿透的同时，页面仍能收到 `mousemove`，可实时命中检测；
- 命中虫子 → `setIgnoreMouseEvents(false)`，click 进入页面；
- 离开虫子 → 立刻改回 `true`；
- 这是大量桌面宠物 / 桌面挂件类 Electron 应用的成熟做法。

#### Tauri 路径（可用，但需补原生能力）

Tauri 2 提供：

```ts
await getCurrentWindow().setIgnoreCursorEvents(true);
```

但 **没有** `forward: true` 等价物：开启穿透后，WebView 完全收不到鼠标事件，也就无法在前端判断「鼠标是否悬停在虫子上」。

可行补救方案：

1. **Rust 全局鼠标监听**
   - macOS：`NSEvent.addGlobalMonitorForEvents(matching: [.mouseMoved, ...])`
   - Windows：`SetWindowsHookEx(WH_MOUSE_LL, ...)` 或定时 `GetCursorPos`
   - 将坐标以事件形式发给前端；
   - 前端命中虫子时调用 `setIgnoreCursorEvents(false)`，否则保持 `true`。
2. **切换粒度**
   - 穿透开关若频繁切换，可能产生点击「抖动」或漏点；
   - 需要防抖、只在命中状态变化时切换。
3. **平台差异**
   - macOS 辅助功能权限、输入监听权限；
   - Windows 钩子与 WebView2 坐标系（物理 vs 逻辑像素）要对齐。

结论：Tauri 可以做到同等体验，但需要自研约 100–300 行跨平台原生代码，并处理权限与坐标问题；Electron 开箱即用。

### 2.3 性能与常驻

| 指标 | 期望 | Tauri | Electron |
|------|------|-------|----------|
| 空闲内存 | 越低越好 | 优 | 中 |
| 50 虫 Canvas 60FPS | 必须 | 优（WKWebView/WebView2 足够） | 优 |
| 空闲 CPU | 接近 0 | 优（可仅 rAF 驱动） | 良（Chromium 略高） |
| 冷启动 | 快 | 优 | 中 |

动画本身（2D Canvas / 轻量 WebGL）在两边都不是瓶颈。瓶颈在「常驻资源」与「鼠标事件链路」。

### 2.4 工程与维护

- **Tauri**：Rust 工具链、双平台 WebView 依赖、Apple Silicon / Intel、Windows x64 / ARM64 均有官方支持；打包链路清晰。
- **Electron**：纯 JS 栈，人才与资料更多；`electron-builder` 对 macOS（签名/公证）与 Windows（NSIS/MSI）支持成熟；ARM64 Windows 可用但需注意原生模块编译。
- 本项目前端均为 Vue 3 + TypeScript，切换成本主要在「壳」层。

## 3. 决策

### 3.1 选择：Tauri 2 + Vue 3 + TypeScript

**理由：**

1. 应用定位是 **7×24 后台常驻** 的桌面小宠物/覆盖层，Tauri 的内存与包体优势会直接变成用户感知（风扇、内存压力）；
2. 动画负载不高，系统 WebView 完全够用，不需要 Electron 的 Chromium 一致性；
3. 「选择性点击」在 Tauri 上有清晰的补救路径：**小型原生鼠标坐标转发模块**（macOS Global Monitor + Windows 低级钩子/轮询），只做这一件事，不扩大原生面；
4. 托盘、Menu Bar、透明置顶、多显示器枚举，Tauri 2 均有官方能力或稳定插件生态；
5. 项目已有 `AGENTS.md` 技术栈约定与之一致，避免为选型推翻既定方向。

### 3.2 明确的代价与对策

| 代价 | 对策 |
|------|------|
| 无 `forward: true` | MVP 先实现「整窗 `ignoreCursorEvents` + 命中时临时打开」；稳定后再加原生坐标转发，做到平滑 hover |
| 系统 WebView 行为差异 | CI/手动矩阵：macOS Sonoma+、Windows 10/11 + WebView2 |
| 多显示器 API 需组合 | `tauri` 窗口 API + `Rust` 侧 `available_monitors()`，自建 MultiMonitorManager |
| 权限（macOS 辅助功能/输入监听） | 仅在启用「全局鼠标转发增强」时申请；基础点击路径不依赖全局钩子（见架构） |

### 3.3 MVP 阶段的点击实现策略（降低风险）

为避免一上来就写原生钩子，MVP 采用 **「窗口级动态穿透」**：

1. 覆盖层窗口始终透明、置顶、无边框、不出现在任务栏；
2. 默认 `ignoreCursorEvents = true`（桌面可正常点击）；
3. 使用 **Rust 侧轻量轮询 `cursor_position`**（Tauri 可拿当前鼠标位置）或首阶段可接受的启发式：虫子附近区域临时打开接收；
4. 前端在命中虫子时 `ignoreCursorEvents = false`，否则恢复 `true`；
5. 点击成功后立即恢复穿透。

若 MVP 实测穿透切换抖动明显，再升级为原生 `mousemove` 转发（Electron `forward` 的等价实现）。若该升级在某一平台成本过高且体验仍不达标，**允许回退到 Electron**，并迁移已有 Vue 渲染层与行为层（业务代码与壳层已解耦，迁移成本可控）。

### 3.4 回退触发条件（写进路线图）

出现以下任一情况时，启动 Electron 回退评估：

- macOS 或 Windows 上穿透切换导致明显漏点/误点，且原生转发无法在合理成本内修复；
- 多显示器 + DPI 下坐标错位无法收敛；
- 系统 WebView 在目标机型上 Canvas 动画性能不达标。

## 4. 最终技术栈

| 层 | 选择 |
|----|------|
| 桌面壳 | Tauri 2 |
| 前端 | Vue 3 + TypeScript + Vite |
| 包管理 | pnpm |
| 渲染 | Canvas 2D（预留 WebGL 升级点） |
| 状态 | 轻量响应式（Vue）+ 独立模拟循环（非响应式热路径） |
| 设置持久化 | tauri-plugin-store 或 JSON 配置文件 |
| 打包 | Tauri bundler（DMG / NSIS） |

## 5. 不选 Electron 的原因（摘要）

不是 Electron 做不到，而是：

1. 常驻内存与包体对「背景爬宠」不友好；
2. 核心体验（选择性点击）可通过有限原生代码在 Tauri 补齐，不必为此付出 Electron 的长期资源成本；
3. 业务层与壳层解耦，保留回退余地。
