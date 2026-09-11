# 平台差异与注意事项

## macOS

### 窗口

- 透明 + 无边框：`transparent: true`, `decorations: false`；
- 始终置顶：`alwaysOnTop: true`，必要时 `alwaysOnTop: true` + level 调整；
- 不抢焦点：窗口 `focusable: false`（设置窗口除外）；
- Menu Bar 使用托盘图标 + 菜单（不是 Dock 主入口）；
- 全屏应用 / Stage Manager：置顶窗口可能被系统遮挡，属系统策略，文档中说明。

### 鼠标穿透

- `setIgnoreCursorEvents(true)` ↔ AppKit `NSWindow.ignoresMouseEvents`；
- 无官方 `forward` 模式，需自建坐标转发或动态开关；
- 动态开关时注意点击丢失窗口约一帧。

### Retina

- `window.devicePixelRatio` 为 2；
- Canvas backing store 必须乘 dpr；
- 从 Tauri 拿到的 cursor 坐标需确认是逻辑像素。

### 兼容

- Apple Silicon（arm64）与 Intel（x64）分别打包或 universal；
- 最低系统版本建议在 `tauri.conf.json` 与 README 标明。

## Windows

### 窗口

- 透明无边框置顶：对应 WS_EX_LAYERED / TOPMOST / TOOLWINDOW 等由 Tauri 封装；
- `skipTaskbar: true` 避免任务栏按钮；
- WebView2 运行时依赖：安装器需处理 bootstrapper。

### 鼠标穿透

- 对应 layered window 的 click-through 标志；
- 同样建议只在命中变化时切换。

### DPI

- 系统缩放 100% / 125% / 150% / 200%；
- 混合 DPI 多显示器（笔记本 150% + 外接 100%）是重点测试项；
- 行为模拟与命中一律逻辑像素。

### 兼容

- x64 为主；ARM64 作为兼容目标验证 WebView2 与托盘。

## 多显示器

| 问题 | 处理 |
|------|------|
| 分辨率不同 | 每显示器独立窗口与 viewport |
| 缩放不同 | 各窗口独立 dpr |
| 主屏切换 / 插拔 | 监听变化，重建窗口 |
| 「当前屏幕」 | 以托盘/设置窗口所在屏或主屏定义，需在设置文案写清 |

## 性能检查清单

- [ ] 1 虫空闲 CPU
- [ ] 10 虫 60 FPS
- [ ] 50 虫 60 FPS（可接受略降特效）
- [ ] 隐藏虫子后 CPU 近 0
- [ ] 设置窗口打开时覆盖层不冻结
- [ ] 睡眠唤醒后覆盖层恢复正常

## 手动测试矩阵（MVP）

| 用例 | macOS | Windows |
|------|-------|---------|
| 透明覆盖显示虫子 | | |
| 桌面图标可点击穿透 | | |
| 点击虫子可捏死 | | |
| 淡出重生 | | |
| 托盘菜单 | | |
| 关设置不退出 | | |
| Retina / DPI 显示正常 | | |
| 外接显示器 | | |
