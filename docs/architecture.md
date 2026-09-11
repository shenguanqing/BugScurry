# 架构设计

## 1. 设计原则

1. **壳与业务解耦**：Tauri 只负责窗口、托盘、原生事件；虫子行为与渲染全部在前端可测、可迁移。
2. **热路径去响应式**：模拟循环与绘制不经过 Vue 响应式系统；Vue 只绑定设置与面板 UI。
3. **实体与系统分离**：Bug 是数据；Movement / Renderer / HitTest / Squish 是系统。
4. **平台差异收口**：DPI、多屏、鼠标穿透等只在 `platform` / 壳层出现，不散落在业务代码。
5. **可扩展虫种**：新虫种 = 资源 + 轻量配置，不改主循环。

## 2. 模块划分

```
BugScurry
├── src-tauri/                 # Tauri 壳
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs
│   │   ├── tray.rs            # 托盘 / Menu Bar 菜单
│   │   ├── windows.rs         # 覆盖层与设置窗口创建、置顶、透明
│   │   ├── monitor.rs         # 多显示器枚举与坐标
│   │   └── cursor.rs          # 鼠标位置转发（MVP 可轮询）
│   └── tauri.conf.json
│
└── src/                       # Vue + TS 前端
    ├── main.ts
    ├── App.vue
    ├── overlay/               # 覆盖层入口（虫子画布）
    ├── settings/              # 设置窗口 UI
    ├── core/
    │   ├── types.ts           # 共享类型
    │   ├── config.ts          # 默认配置与校验
    │   ├── bug.ts             # Bug 实体工厂 / 状态机
    │   ├── bugManager.ts      # 增删、补位、全部清除、重生
    │   ├── movement.ts        # 移动 / AI
    │   ├── renderer.ts        # Canvas 渲染
    │   ├── hitTest.ts         # 点击命中
    │   ├── squish.ts          # 捏死效果
    │   ├── loop.ts            # rAF 主循环
    │   └── rng.ts             # 可种子随机
    ├── species/
    │   ├── registry.ts        # 虫种注册表
    │   └── cockroach.ts       # 首个虫种定义（后续 ant/spider/…）
    ├── composables/
    │   ├── useSettings.ts
    │   └── useBugs.ts
    ├── services/
    │   ├── settingsStore.ts   # 持久化
    │   └── tauriBridge.ts     # 与壳通信的唯一入口
    └── styles/
```

## 3. 核心数据流

```
设置变更 / 托盘命令
        │
        ▼
  SettingsStore ──► BugManager.spawn/despawn
        │                 │
        │                 ▼
        │            Bug[]（纯数据，非响应式）
        │                 │
        │     ┌───────────┼───────────┐
        │     ▼           ▼           ▼
        │  Movement    HitTest     Squish
        │     │           │           │
        │     └────► Renderer ◄───────┘
        │                │
        │                ▼
        │            Canvas 帧
        │
        └──► 设置窗口 UI（响应式，不进热路径）
```

## 4. 关键模块职责

### 4.1 Bug（实体）

- 字段：`id, species, x, y, heading, speed, size, state, animPhase, rngState…`
- `state`: `crawling | paused | turning | squishing | dying | dead`
- 不直接依赖 DOM；可序列化（便于调试）。

### 4.2 BugManager

- 维护 `Map<id, Bug>`；
- `setCount(n)`：增删到目标数量；
- `spawn()` / `despawn(id)` / `clear()` / `regenerate()`；
- 捏死淡出结束后按策略补位；
- 读取 `Settings` 决定数量、大小、速度、随机度。

### 4.3 Movement / AI

- 每只虫独立噪声源（避免同步）；
- 状态机：
  - `crawling`：按 `heading + noise` 前进，速度轻微抖动；
  - 随机进入 `paused`（停顿）或 `turning`（换向）；
  - 接近边界时：优先沿边缘滑动或转向内部；
- 约束：`0 <= x <= viewportWidth` 等（逻辑像素）；
- 可选：沿边缘移动权重更高（更像虫）。

### 4.4 Renderer

- 单全屏 Canvas，`devicePixelRatio` 感知；
- 输入：`Bug[]` + 当前时间；
- 输出：一帧画面（腿、身体、触角、朝向旋转）；
- 淡出：`alpha` 随 `dying` 进度；
- 不在渲染函数里改业务状态。

### 4.5 Hit Testing

- 点击坐标（逻辑像素）→ 与各虫 `hitRadius` / 椭圆碰撞；
- 命中返回 `bugId`，由 BugManager 触发 squish；
- 与「穿透开关」联动：hover 命中时通知壳层关闭穿透。

### 4.6 Squish Effect

- `squishing`：短时压扁动画（scaleY↓、scaleX↑、轻微旋转）；
- `dying`：alpha 衰减；
- 可选污渍：独立 stain 列表，延时淡出；
- 可选粒子：同 stain，限制数量上限。

### 4.7 Settings

- 默认值、范围校验、持久化；
- 变更事件总线（非每帧）；
- 开机启动 / 始终运行 / 显示器模式交给壳层。

### 4.8 Tray / Menu Bar

- Tauri tray 菜单发出命令事件到前端或直接调 Rust；
- 命令集：`toggle_visible, add_one, remove_one, regenerate, open_settings, quit`。

### 4.9 Multi Monitor Manager

- 枚举显示器逻辑坐标与缩放；
- 按「当前屏 / 所有屏」创建一个或多个覆盖层窗口；
- MVP：仅主屏单窗口。

## 5. 渲染与输入坐标

| 空间 | 用途 |
|------|------|
| 逻辑像素 | 行为模拟、设置中的大小/速度、命中检测 |
| 物理像素 | Canvas backing store（`width = cssWidth * dpr`） |

约束：

- 所有 Movement/HitTest 只使用逻辑坐标；
- Renderer 统一 `ctx.scale(dpr, dpr)`；
- 从壳层拿到的鼠标坐标必须先换算为该窗口的逻辑坐标。

## 6. 鼠标穿透与点击（跨层协作）

```
[壳层] 默认 ignore_cursor_events = true
          │
          │  cursor 位置事件（轮询或 native forward）
          ▼
[前端 HitTest] 是否命中虫？
          │是                     │否
          ▼                      ▼
[壳层] ignore=false          [壳层] ignore=true
          │
          ▼
     click 进入页面 → Squish → 恢复 ignore=true
```

注意事项：

- 穿透开关只在命中状态**变化**时切换，避免抖动；
- 切换瞬间可能丢失一次 click，可通过「命中后短暂保持可点」缓解；
- 不把窗口做成可 `focus`，避免抢键盘。

## 7. 主循环

```ts
function frame(t: number) {
  const dt = clamp(t - last, 0, maxDt);
  if (visible && !paused) {
    updateBugs(bugs, dt, settings);
    updateEffects(effects, dt);
    render(ctx, bugs, effects, viewport);
  }
  last = t;
  rafId = requestAnimationFrame(frame);
}
```

- 标签页不可见（如设置窗口遮挡导致 rAF 节流）时依赖壳层「始终运行」策略：覆盖层窗口保持可绘制、不抢焦点；
- 隐藏虫子时跳过 update/render，保留 rAF 或改为低频定时唤醒。

## 8. 扩展虫种

```ts
interface Species {
  id: string;
  label: string;
  defaultSize: number;
  draw(ctx, bug, phase): void;
  movementTraits?: Partial<MovementTraits>;
}
```

`registry.register(cockroach)`；设置里可选虫种（后续阶段）。行为差异放进 `movementTraits`，避免 fork 主循环。

## 9. 目录与代码规范

- TypeScript `strict: true`；
- Vue 组件仅负责 UI；逻辑在 `core/` / `services/`；
- 命名：文件 kebab 或单一职责 camel 均可，保持仓库内一致；
- 禁止在渲染帧内 `JSON.parse`、频繁分配大对象；
- 常量（速度上限、squish 时长）集中到 `config.ts`。
