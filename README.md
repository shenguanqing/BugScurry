# BugScurry

桌面小虫宠物：透明覆盖层上自由爬行的小虫，点击即可「捏死」。

支持 macOS 与 Windows。应用以后台常驻为主，通过 Menu Bar / 系统托盘控制。

## 特性（规划）

- 透明、无边框、始终置顶的桌面覆盖层
- 默认鼠标穿透，仅虫子区域可点击
- 多只虫独立随机运动，朝向跟随、偶尔停顿与转向
- 点击捏死：短 squish 动画、可选音效与痕迹、自动补位
- 设置窗口：数量、大小、速度、随机度、音效、痕迹、多显示器等
- 托盘菜单：显示/隐藏、增减、重生、设置、退出

## 技术栈

| 层 | 选型 |
|----|------|
| 桌面壳 | [Tauri 2](https://tauri.app) |
| 前端 | Vue 3 + TypeScript + Vite |
| 包管理 | pnpm |
| 渲染 | Canvas 2D |

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

## 状态

当前处于 **M0：仓库与规范**。工程代码将在 M1（MVP）引入。

## 开发

### 环境要求（M1 起）

- Node.js 20+
- pnpm 9+
- Rust stable
- macOS：Xcode Command Line Tools
- Windows：WebView2 Runtime（Win10/11 通常自带）、MSVC Build Tools

### 命令（M1 后生效）

```bash
pnpm install
pnpm dev          # 开发
pnpm build        # 构建
pnpm tauri build  # 打包安装包
```

## License

见 [LICENSE](LICENSE)。
