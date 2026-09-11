# BugScurry

桌面小虫宠物：透明覆盖层上自由爬行的小虫，点击即可「捏死」。

支持 macOS 与 Windows。应用以后台常驻为主，通过 Menu Bar / 系统托盘控制。

## 特性

已实现（MVP）：

- 透明、无边框、始终置顶的桌面覆盖层
- 默认鼠标穿透，悬停虫子时临时可点
- 虫子随机爬行、偶尔停顿与转向、朝向跟随
- 点击捏死：squish 压扁 + 淡出 + 自动补位
- 托盘 / Menu Bar 菜单：显示隐藏、增减、重生、退出

规划中：

- 设置窗口（数量、大小、速度、随机度、音效、痕迹、多显示器等）
- 更丰富的昆虫动画与音效
- 多虫种（蟑螂 / 蚂蚁 / 蜘蛛 / 苍蝇 / 瓢虫）

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

当前处于 **M1 MVP**：透明覆盖层 + 单虫爬行 + 穿透点击 + 捏死重生 + 托盘菜单。

## 开发

### 环境要求

- Node.js 20+
- pnpm 9+
- Rust stable（`rustup`）
- macOS：Xcode Command Line Tools
- Windows：WebView2 Runtime（Win10/11 通常自带）、MSVC Build Tools

### 命令

```bash
pnpm install          # 安装依赖
pnpm tauri dev        # 开发运行（会启动 Vite + 桌面应用）
pnpm typecheck        # TypeScript 检查
pnpm build            # 前端构建
pnpm tauri build      # 打包安装包
```

### 项目结构（摘要）

```
src-tauri/          # Tauri 壳：窗口、托盘、鼠标穿透、坐标转发
src/core/           # Bug / Movement / Renderer / HitTest / Squish / Loop
src/services/       # 与 Tauri 通信的唯一入口
src/App.vue         # 覆盖层入口
docs/               # 需求、架构、路线图
```

## License

见 [LICENSE](LICENSE)。
