# BugScurry

桌面小虫宠物：透明覆盖层上自由爬行的小虫，点击即可「捏死」。

支持 macOS 与 Windows。应用以后台常驻为主，通过 Menu Bar / 系统托盘控制。

## 功能

- 透明、无边框、始终置顶的桌面覆盖层
- 默认鼠标穿透，悬停虫子时临时可点
- 多只虫独立随机运动：爬行、停顿、转向、沿边缘游走
- 点击捏死：squish 压扁、Web Audio「啪」、痕迹与粒子、自动补位
- 设置窗口：数量 1–50、大小、速度、随机度、音效/痕迹/粒子、开机启动、多显示器
- 托盘 / Menu Bar：显示隐藏、增减、重生、设置、退出
- 关闭设置不退出应用

## 技术栈

| 层 | 选型 |
|----|------|
| 桌面壳 | [Tauri 2](https://tauri.app) |
| 前端 | Vue 3 + TypeScript + Vite |
| 包管理 | pnpm |
| 渲染 | Canvas 2D |
| 持久化 | tauri-plugin-store |
| 自启动 | tauri-plugin-autostart |

选型说明见 [docs/tech-analysis.md](docs/tech-analysis.md)。

## 文档

| 文档 | 内容 |
|------|------|
| [docs/requirements.md](docs/requirements.md) | 产品与功能需求、验收标准 |
| [docs/architecture.md](docs/architecture.md) | 模块划分、数据流、坐标与穿透协作 |
| [docs/tech-analysis.md](docs/tech-analysis.md) | Tauri vs Electron 分析与决策 |
| [docs/roadmap.md](docs/roadmap.md) | 里程碑与完成定义 |
| [docs/platforms.md](docs/platforms.md) | 平台差异与测试矩阵 |
| [AGENTS.md](AGENTS.md) | 协作与开发规范 |

## 开发

### 环境要求

- Node.js 20+
- pnpm 9+
- Rust stable（`rustup`）
- macOS：Xcode Command Line Tools
- Windows：WebView2 Runtime、MSVC Build Tools

### 命令

```bash
pnpm install          # 安装依赖
pnpm tauri dev        # 开发运行
pnpm typecheck        # TypeScript 检查
pnpm build            # 前端构建
pnpm tauri build      # 打包安装包
```

### 打包产物

`pnpm tauri build` 后：

- **macOS**：`src-tauri/target/release/bundle/dmg/`、`macos/`
- **Windows**：`src-tauri/target/release/bundle/nsis/`

发布前建议：

1. 更新 `src-tauri/tauri.conf.json` 的 `version`
2. macOS 配置签名与公证（Apple Developer）
3. Windows 可选代码签名

### 项目结构

```
src-tauri/           # 窗口、托盘、穿透、多显示器、自启动
src/core/            # Bug / Movement / Renderer / HitTest / Squish / Audio / Loop
src/settings/        # 设置窗口 UI
src/species/         # 虫种注册表（首期蟑螂）
src/services/        # 与 Tauri 通信、设置持久化
docs/                # 需求、架构、路线图
```

## 平台验证

| 项 | macOS | Windows |
|----|-------|---------|
| 覆盖层显示 | 已验证 | 待验证 |
| 穿透点击 / 捏死 | 待手动确认 | 待验证 |
| 设置窗口 | 已验证 | 待验证 |
| 多显示器 | 单屏已验证 | 待验证 |

## License

见 [LICENSE](LICENSE)。
