# BugScurry

桌面小虫宠物：透明覆盖层上自由爬行，点击即可「捏死」。

支持 **macOS** 与 **Windows**，以后台常驻为主，通过菜单栏 / 系统托盘控制。

[English](README.md)

## 功能

- 透明、无边框、始终置顶的桌面覆盖层
- 默认鼠标穿透，仅虫子区域可点击
- 多只虫独立随机运动：爬行、停顿、转向、沿边缘游走
- 点击捏死：压扁动画、可选 Web Audio 音效、痕迹与粒子
- 设置：数量 1–50、大小、速度、随机度、音效/痕迹/粒子、开机启动、多显示器、浅色/深色/自动主题
- 托盘 / Menu Bar：显示隐藏、增减、重新生成、设置、退出
- 关闭设置不会退出应用
- **捏死后不自动补位**（增加数量或点「重新生成」才会再出虫）
- 覆盖层跟随 macOS 多桌面（Mission Control Spaces）

## 技术栈

| 层 | 选型 |
|----|------|
| 桌面壳 | [Tauri 2](https://tauri.app) |
| 前端 | Vue 3 + TypeScript + Vite |
| 包管理 | pnpm |
| 渲染 | Canvas 2D |
| 持久化 | tauri-plugin-store |
| 自启动 | tauri-plugin-autostart |

选型对比见 [docs/tech-analysis.md](docs/tech-analysis.md)。

## 项目结构

目录树**只在这里维护**（唯一来源）。设计原则与模块职责见 [docs/architecture.zh-CN.md](docs/architecture.zh-CN.md)，不再重复画树。

```text
BugScurry/
├── index.html                 # 覆盖层 Web 入口
├── settings.html              # 设置窗口入口
├── package.json
├── vite.config.ts
├── tsconfig.json
├── assets/
│   └── icon-source.png        # 应用图标源图（1024²，已按 HIG 留白）
├── docs/
│   ├── README.md              # 文档索引（英文）
│   ├── README.zh-CN.md        # 文档索引（中文）
│   ├── architecture.md / .zh-CN.md
│   ├── platforms.md / .zh-CN.md
│   ├── requirements.md / .zh-CN.md
│   ├── roadmap.md / .zh-CN.md
│   └── tech-analysis.md / .zh-CN.md
├── .github/
│   └── workflows/
│       └── build-windows.yml  # Windows NSIS CI
├── src/
│   ├── main.ts
│   ├── App.vue                # 覆盖层外壳（画布、命中、托盘）
│   ├── core/
│   │   ├── types.ts
│   │   ├── config.ts
│   │   ├── settings.ts        # 设置裁剪纯函数
│   │   ├── rng.ts
│   │   ├── bug.ts             # Bug 实体
│   │   ├── bugManager.ts      # 生成 / 清除 / 重生 / 捏死
│   │   ├── movement.ts        # 爬行 AI
│   │   ├── renderer.ts        # 绘制 + squish / 痕迹 / 粒子
│   │   ├── hitTest.ts
│   │   ├── squish.ts
│   │   ├── audio.ts
│   │   ├── loop.ts            # rAF 主循环
│   │   └── __tests__/         # 核心纯逻辑 Vitest 单测
│   ├── species/
│   │   ├── registry.ts        # 虫种注册表
│   │   ├── drawing.ts         # 公共绘制辅助
│   │   ├── index.ts
│   │   ├── cockroach.ts
│   │   ├── ant.ts
│   │   ├── spider.ts
│   │   ├── fly.ts
│   │   └── ladybug.ts
│   ├── settings/
│   │   ├── main.ts
│   │   └── SettingsApp.vue    # 设置界面
│   ├── services/
│   │   ├── tauriBridge.ts     # 覆盖层 ↔ Tauri 事件/命令
│   │   └── settingsService.ts # 配置存储、主题、多屏
│   └── styles/
│       ├── overlay.css
│       └── settings.css
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── capabilities/
    │   └── default.json
    ├── icons/                 # 应用与托盘图标
    └── src/
        ├── main.rs
        ├── lib.rs             # 窗口、光标轮询、多屏适配、命令
        └── tray.rs            # 菜单栏 / 托盘菜单
```

## 文档

所有文档均提供英文（`*.md`）与中文（`*.zh-CN.md`）。索引：[docs/README.zh-CN.md](docs/README.zh-CN.md)（英文：[docs/README.md](docs/README.md)）。

| 中文 | English | 内容 |
|------|---------|------|
| [docs/requirements.zh-CN.md](docs/requirements.zh-CN.md) | [requirements.md](docs/requirements.md) | 需求与验收 |
| [docs/architecture.zh-CN.md](docs/architecture.zh-CN.md) | [architecture.md](docs/architecture.md) | 原则与模块职责 |
| [docs/tech-analysis.zh-CN.md](docs/tech-analysis.zh-CN.md) | [tech-analysis.md](docs/tech-analysis.md) | Tauri vs Electron |
| [docs/roadmap.zh-CN.md](docs/roadmap.zh-CN.md) | [roadmap.md](docs/roadmap.md) | 里程碑 |
| [docs/platforms.zh-CN.md](docs/platforms.zh-CN.md) | [platforms.md](docs/platforms.md) | 平台说明 |
| [AGENTS.md](AGENTS.md) | — | 协作与开发规范 |

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
pnpm tauri dev        # 开发运行（会启动 Vite :1420，必须先有它）
pnpm typecheck        # TypeScript 检查
pnpm test             # 单元测试（Vitest）
pnpm build            # 前端生产构建
pnpm tauri build      # 打包安装包
```

开发与发布都请走 Tauri CLI。不要单独跑 `target/debug/bugscurry`，也不要只用 `cargo build --release` 当发布产物：debug 会连 `http://localhost:1420`（依赖 Vite），生产资源由 `pnpm tauri build` 嵌入。

### 打包产物

本地 `pnpm tauri build` 输出在 Tauri 默认 bundle 目录：

| 平台 | 路径 |
|------|------|
| macOS | `src-tauri/target/release/bundle/dmg/` · `macos/` |
| Windows | `src-tauri/target/release/bundle/nsis/` |

CI（GitHub Actions）会把 Windows NSIS 安装包拷到仓库根目录 `release/` 并上传 Artifact（`BugScurry-windows-x64`）。该目录已 gitignore，**不是** Tauri 默认输出路径。

```bash
gh workflow run build-windows.yml
gh run watch <run-id>
gh run download <run-id> -n BugScurry-windows-x64 -D release
```

### 发布前检查

1. 更新 `src-tauri/tauri.conf.json` 中的 `version`
2. macOS：可选签名与公证
3. Windows：可选代码签名（未签名可能被 SmartScreen 拦截）

## 平台说明

| 事项 | 做法 |
|------|------|
| 鼠标穿透 | 默认忽略光标；悬停虫子时才接收点击 |
| 命中坐标 | macOS：CGEvent 逻辑点；Windows：物理像素 |
| Retina / DPI | 视口用 CSS `innerWidth` + `devicePixelRatio` |
| 多显示器 | 「所有屏幕」时每台一个覆盖层窗口 |
| 多桌面 Spaces | 覆盖层 `visibleOnAllWorkspaces` |

## License

见 [LICENSE](LICENSE)。
