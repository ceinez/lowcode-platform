# 威享佳低代码活动搭建平台 — 技术方案

> 本文档与 [PRD.md](./PRD.md) 配套，是平台的**目标态技术设计**，同时作为重构（Vibe Coding）与面试准备的依据。
> 每个技术点按统一结构展开：**Why（为什么做）→ How（怎么做）→ Effect（效果）→ Trade-off（代价）**。

---

## 0. 项目定位

从 0 到 1 主导的低代码平台，核心是**编辑器-渲染器分离架构**，支撑运营拖拽搭建移动端营销页并实时预览。

**技术栈**：Vue 3 + TypeScript + Pinia + Vite + Monorepo + postMessage

---

## 1. 总体架构：编辑器-渲染器分离

### Why（为什么做）

编辑器和渲染端的运行环境、依赖、UI 库完全不同：

|          | 编辑器           | 渲染端                    |
| -------- | ---------------- | ------------------------- |
| 使用者   | 运营（PC 端）    | C 端消费者（手机端）      |
| UI 库    | Element Plus     | Vant                      |
| 运行环境 | 浏览器           | 微信 webview / 手机浏览器 |
| 关注点   | 拖拽、配置、表单 | 渲染、性能、微信 JSSDK    |

若放在一个应用里，两个 UI 库的全局样式会互相污染，两套运行环境的需求也无法共存。因此必须**分离**。

### How（怎么做）

```
┌──────────────────────┐        postMessage        ┌──────────────────────┐
│      编辑器 (editor)   │ ◄──────────────────────► │     渲染端 (renderer) │
│  Vue3 + Element Plus  │                          │   Vue3 + Vant        │
│  三栏布局 / 配置面板    │                          │   活动页渲染          │
└──────────────────────┘                          └──────────────────────┘
         │                                                    │
         └──────────── 共享 Schema / 类型（shared 包）──────────┘
```

- 编辑器通过 `iframe` 嵌入渲染端，二者通过 `postMessage` 双向通信
- 二者共享同一份**组件 Schema 与 TypeScript 类型**（shared 包）

### Effect（效果）

- 编辑结果 = 线上结果（所见即所得，发布后不变形）
- 渲染端可独立部署、独立发版，不阻塞编辑器迭代

### Trade-off（代价）

- `postMessage` 需要序列化，无法共享组件实例
- 双向通信逻辑复杂，调试需要开两个 DevTools

---

## 2. 技术栈选型

| 技术            | Why 选它                                                                                   | Trade-off                                  |
| --------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------ |
| **Vue 3**       | Composition API 更适合复杂逻辑复用（编辑器有大量拖拽/通信/状态逻辑）；Proxy 响应式性能更好 | 生态比 Vue 2 年轻，部分老库需适配          |
| **TypeScript**  | 编辑器数据模型复杂（组件树、Schema、事件协议），类型安全防止配置字段拼错                   | 前期类型定义投入大，"类型体操"增加开发时间 |
| **Pinia**       | 相比 Vuex，API 更简洁、TS 支持更好、天然支持多 store                                       | 拆分不当会造成状态碎片化                   |
| **Vite**        | 开发服务器秒级启动、HMR 快，大型编辑器项目体验关键                                         | 构建产物与 webpack 生态有差异              |
| **Monorepo**    | 编辑器/渲染端/共享类型三包联动开发，一次改 Schema 三处同步                                 | 构建与 CI 配置更复杂                       |
| **postMessage** | 跨 iframe 通信标准方案，天然支持跨域                                                       | 需序列化，类型会擦除（用 TypedBridge 补）  |

---

## 3. 编辑器架构：三栏布局 + Pinia 三 Store

### Why（为什么拆三个 Store）

编辑器状态有多种，**变化频率和职责完全不同**。若塞进一个 store，改一个高频状态（如选中态）会触发整个大对象的依赖更新。

### How（怎么做）

**三栏布局**：

```
┌──────────┬──────────────────┬──────────────┐
│ PageLeft  │    PageView       │  PageRight    │
│  组件库    │   iframe 画布     │  属性配置面板  │
└──────────┴──────────────────┴──────────────┘
```

**Pinia 三 Store**：

| Store            | 职责                             | 变化频率               |
| ---------------- | -------------------------------- | ---------------------- |
| `pageStore`      | 页面元信息：名称、背景、分享配置 | 低                     |
| `componentStore` | 组件树：增删改查、拖拽排序       | 中                     |
| `selectionStore` | 选中态：当前选中组件 id          | **高**（每次点击都变） |

### Effect（效果）

- 选中态变化不再触发组件树重算，避免"点一下卡一下"
- 职责单一，每个 store 可独立测试、独立维护

### Trade-off（代价）

- 跨 store 操作（如"删除选中组件"同时动 componentStore + selectionStore）需要协调
- 拆太细会造成碎片化，三 store 是当前场景的合理粒度

---

## 4. iframe + postMessage 双向通信 & 拖拽定位

### Why（为什么用 iframe 而非直接渲染）

1. **样式隔离**：Element Plus 与 Vant 的全局样式不能共存
2. **逻辑隔离**：两个独立 Vue 应用，各自的 router/store 互不干扰
3. **环境模拟**：渲染端需跑微信 JSSDK、rem 适配等移动端专属环境

### How（怎么做）

**渲染端上报位置，编辑器二分查找插入索引**：

渲染端在页面高度变化时，上报每个组件在页面中的 `top` 值列表（**已按顺序递增**）：

```
componentsTopList = [0, 120, 260, 480, ...]  // 单调递增
```

编辑器拖拽组件时，用**二分查找**定位鼠标所在位置应插入的索引：

```ts
function findInsertIndex(topList: number[], targetY: number): number {
  let lo = 0,
    hi = topList.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (topList[mid] < targetY) lo = mid + 1
    else hi = mid
  }
  return lo // O(log n)
}
```

### Effect（效果）

- 拖拽时即使有几十个组件，插入索引计算仍是 O(log n)，不随组件数线性增长

### Trade-off（代价）

- 二分查找**依赖 top 列表有序**，需维护"排序不变量"——任何组件高度变化都要重新排序上报
- iframe 通信有序列化开销（详见第 5 节）

---

## 5. 通信协议：TypedBridge + 4 类双向事件 + 节流防抖

### Why（为什么封装 TypedBridge）

`postMessage` 的 payload 是 `any`，**类型在跨 iframe 时会被擦除**。直接裸调会导致类型丢失、字段拼错无法在编译期发现。因此封装一个带类型的通信层。

### How（怎么做）

**定义 4 类双向事件协议**：

| 方向            | 事件                           | Payload                         | 用途               |
| --------------- | ------------------------------ | ------------------------------- | ------------------ |
| 编辑器 → 渲染端 | `pageChange`                   | `PageData`                      | 全量同步页面数据   |
| 编辑器 → 渲染端 | `setActive`                    | `componentId`                   | 选中态同步         |
| 编辑器 → 渲染端 | `setPreview` / `deletePreview` | `index`                         | 拖拽占位           |
| 渲染端 → 编辑器 | `pageHeightChange`             | `{ height, componentsTopList }` | 上报高度与组件位置 |

**TypedBridge 用泛型定义事件→payload 映射**，让类型在编译期可见：

```ts
// shared 包中定义事件协议
interface BridgeEventMap {
  pageChange: { value: PageData; disabledRestHeight?: boolean }
  setActive: { id: string }
  setPreview: { index: number }
  deletePreview: { index: number }
  pageHeightChange: { height: number; componentsTopList: number[] }
}

class TypedBridge {
  emit<K extends keyof BridgeEventMap>(type: K, payload: BridgeEventMap[K]) {
    window.parent.postMessage({ type, value: payload }, targetOrigin)
  }
  on<K extends keyof BridgeEventMap>(
    type: K,
    cb: (payload: BridgeEventMap[K]) => void,
  ) {
    // 监听并分发，保证回调参数类型正确
  }
}
```

**性能策略——节流与防抖**：

| 场景     | 策略         | 参数  | 理由                                                     |
| -------- | ------------ | ----- | -------------------------------------------------------- |
| 属性编辑 | **debounce** | 300ms | 用户连续输入时停下才同步，避免每次按键都全量 postMessage |
| 拖拽预览 | **throttle** | 50ms  | 拖拽是连续高频操作，限制为每秒最多 20 次同步             |

### Effect（效果）

- 编译期就能发现事件名/字段拼错
- 高频操作不再频繁触发跨 iframe 序列化，主线程压力大减

### Trade-off（代价）

- 每新增一个事件都要同步维护 `BridgeEventMap` 类型（有维护成本）
- debounce 300ms 意味着用户输入后有 300ms 延迟，需在交互上让用户无感
- throttle 50ms 意味着拖拽过程预览有轻微滞后

---

## 6. 组件系统：统一注册中心 + Schema 驱动配置面板

### Why（为什么做 Schema 驱动）

传统做法是"每个组件手写一个配置面板"。当组件有 12+ 种时，手写面板重复度高、新增组件成本大、且配置面板与渲染端数据契约容易不一致。

### How（怎么做）

**统一注册中心**：所有组件在注册中心登记，编辑器与渲染端都从注册中心取组件。

```ts
// shared 包中的组件注册中心
interface ComponentDefinition {
  name: string // 组件名
  type: string // 类型标识，如 'Carousel'
  icon: string // 组件库图标
  maxNum: number // 页面内最多添加数量
  schema: FieldSchema[] // 数据契约（驱动配置面板）
  defaults: Record<string, unknown> // 默认值
}

registerComponent({
  name: '图片广告',
  type: 'Carousel',
  maxNum: 50,
  schema: [
    {
      key: 'layout',
      label: '布局',
      type: 'select',
      options: ['swiper', 'single'],
    },
    { key: 'imageList', label: '图片列表', type: 'image-list' },
    {
      key: 'isBorderRadius',
      label: '是否圆角',
      type: 'radio',
      options: [0, 1],
    },
    { key: 'radius', label: '圆角大小', type: 'slider', max: 30 },
  ],
  defaults: {
    layout: 'swiper',
    imageList: [{ link: null, imageUrl: '', text: '导航1' }],
    isBorderRadius: 0,
    radius: 0,
  },
})
```

**Schema 驱动配置面板**：右侧面板不是手写死表单，而是**根据 schema 自动渲染**对应的表单控件（select / slider / radio / image-list...）。

**shared 包共享类型与默认值**：编辑器的配置面板、渲染端的组件，都引用 shared 包里同一份 `schema` 和 `defaults`，保证**数据契约单一来源**。

### Effect（效果）

- 新增一个组件 = 注册一份 Schema + 写一个渲染组件，**不动编辑器核心**
- 配置面板与渲染数据天然一致，杜绝"配了但没生效"的 bug

### Trade-off（代价）

- Schema 表达力有限，**极复杂组件**（如富文本、商品多条件）仍需自定义面板，Schema 驱动与自定义并存
- Schema 字段类型系统本身要设计好，否则越做越复杂

---

## 7. 数据安全：自动保存 + 草稿 + 拦截

### Why（为什么做）

运营搭一个页面可能要花一两个小时。若浏览器崩溃、误关标签页导致数据全丢，体验是灾难性的。数据安全是**运营侧的核心信任点**。

### How（怎么做）三层防护

| 层级              | 方案                     | 参数        | 保护场景                 |
| ----------------- | ------------------------ | ----------- | ------------------------ |
| 服务端自动保存    | 定时把 pageData 推给后端 | 30s         | 浏览器崩溃、本地数据丢失 |
| localStorage 草稿 | 本地暂存当前编辑数据     | 2s debounce | 网络抖动、服务端暂不可用 |
| beforeunload 拦截 | 关闭页面前弹窗确认       | —           | 误关标签页               |

```ts
// 草稿 debounce 2s：编辑停止 2 秒后才写 localStorage
const saveDraft = debounce((data: PageData) => {
  localStorage.setItem(`draft-${data.id}`, JSON.stringify(data))
}, 2000)

// 离开前拦截
window.addEventListener('beforeunload', (e) => {
  if (hasUnsavedChanges()) {
    e.preventDefault()
    e.returnValue = ''
  }
})
```

### Effect（效果）

- 三层防护覆盖了"崩溃 / 网络故障 / 误操作"三种数据丢失场景

### Trade-off（代价）

- localStorage 有 **5MB 容量上限**，超大页面草稿需裁剪或降级
- 30s 自动保存意味着 30s 内的改动仍可能丢（由 2s 的 localStorage 草稿兜底）
- beforeunload 弹窗对用户略"烦"，需在无未保存改动时跳过

---

## 8. 性能优化

### 8.1 冗余依赖瘦身（webpack-bundle-analyzer）

| 维度          | 内容                                                             |
| ------------- | ---------------------------------------------------------------- |
| **Why**       | 打包产物过大，首屏加载慢                                         |
| **How**       | 用 `webpack-bundle-analyzer` 可视化分析，定位冗余/重复打包的依赖 |
| **Effect**    | 冗余依赖 **-800KB**                                              |
| **Trade-off** | 删除依赖前需确认无隐式引用，否则引入运行时 bug                   |

### 8.2 图片懒加载

| 维度          | 内容                                                               |
| ------------- | ------------------------------------------------------------------ |
| **Why**       | 活动页图片多，首屏全加载拖慢速度                                   |
| **How**       | 用 `IntersectionObserver` 监听，图片进入视口才加载，未进入用占位图 |
| **Effect**    | 首屏加载更快，带宽节省                                             |
| **Trade-off** | 滚动时图片可能短暂白屏（需占位图 + 预加载邻近图片缓解）            |

### 8.3 splitChunks 拆包 + bundle 体积优化

| 维度          | 内容                                                                                      |
| ------------- | ----------------------------------------------------------------------------------------- |
| **Why**       | 单 bundle 过大，且第三方库（Vue/Vant/Element Plus）与业务代码耦合，改动业务也要重下整个包 |
| **How**       | 用 `splitChunks` 将第三方库与业务代码拆分，按需加载路由                                   |
| **Effect**    | bundle 体积优化 **30%**，缓存命中率提升                                                   |
| **Trade-off** | 拆太细会**增加 HTTP 请求数**，需在"包体积"与"请求数"间找平衡点                            |

---

## 9. 工程化：TS 渐进迁移 + 测试 + CI

| 项              | Why                                | How                                               | Effect                       | Trade-off                               |
| --------------- | ---------------------------------- | ------------------------------------------------- | ---------------------------- | --------------------------------------- |
| **TS 渐进迁移** | 一次性全量迁移风险大               | 先建类型声明，逐模块从 `any` 收敛为严格类型       | 类型安全逐步覆盖，不阻塞开发 | 过渡期 `any` 与严格类型混用，需约定边界 |
| **单元测试**    | 保证 store / Schema / 通信层正确性 | 用 Vitest 覆盖核心逻辑（如二分查找、Schema 解析） | 核心逻辑回归有保障           | 维护测试有成本                          |
| **E2E 测试**    | 保证"拖拽→配置→预览"主流程可用     | 用 Playwright 走关键用户路径                      | 主流程不回归                 | E2E 慢且脆弱，需控制用例数              |
| **CI**          | 保证合并前质量                     | 提交触发 lint + type-check + 测试                 | 问题在合并前暴露             | 配置与维护成本                          |

---

## 10. Monorepo 目录结构

```
lowcode-platform/
├── packages/
│   ├── editor/        # 编辑器（Vue3 + Element Plus + Pinia + Vite）
│   ├── renderer/      # 渲染端（Vue3 + Vant + Pinia）
│   ├── shared/        # 共享包：TS 类型、Schema 协议、组件默认值、常量
│   ├── components/    # 组件库（12+ 组件，editor/renderer 共用）
│   └── bridge/        # TypedBridge：通信协议 + 类型定义
├── pnpm-workspace.yaml
└── package.json
```

**关键设计**：`components` 包让编辑态（可选中/可拖拽）和展示态（纯渲染）**共享同一套组件源码**，只是导出不同的包装。这是"一套组件两种模式"的核心，也消灭了"编辑器与渲染端各写一份组件"的重复。

---

## 11. 数据模型（融合旧项目真实资产）

### 11.1 页面数据（PageData）

```ts
interface PageData {
  id: string
  name: string
  shareDesc: string // 微信分享文案
  shareImage: string // 微信分享图片
  backgroundColor: string
  backgroundImage: string
  backgroundPosition: string
  cover: string
  componentList: ComponentNode[]
}
```

### 11.2 组件节点（ComponentNode）

```ts
interface ComponentNode {
  id: string // 组件类型 + 随机 id，如 'Carousel-xxxx'
  name: string // 显示名，如 '图片广告'
  data: Record<string, unknown> // 组件 props（即 schema 配置出的数据）
}
```

### 11.3 组件清单（12+ 种）

| 组件     | 类型标识        | 核心配置字段                                                       |
| -------- | --------------- | ------------------------------------------------------------------ |
| 图片广告 | `Carousel`      | layout, imageList, isBorderRadius, radius, backgroundColor         |
| 图文导航 | `ImageNav`      | layout, lineNumber, imageList, columnPadding, rowPadding           |
| 公告     | `Notice`        | imageUrl, noticelist, backgroundColor, textColor                   |
| 魔方     | `CubeSelection` | template, imageList, pageMargin                                    |
| 文本     | `RichText`      | backgroundColor, content（富文本）                                 |
| 辅助线   | `AssistLine`    | type, borderColor, borderStyle, height                             |
| 浮标     | `FloatLayer`    | imageUrl, link, hideByPageScroll, width                            |
| 客服     | `OnlineService` | text, hideByPageScroll                                             |
| 横向滑动 | `Slider`        | isDefaultMargin, padding, imageMargin, imageList                   |
| 弹窗     | `Dialog`        | timing, imageList                                                  |
| 商品     | `product`       | listStyle, exchangePriceColor, productList, markingPrice, purchase |

---

## 12. 简历点 → 技术方案对照表

| 简历描述                                                            | 本文档章节     | 覆盖 |
| ------------------------------------------------------------------- | -------------- | ---- |
| 从 0 到 1 架构设计，编辑器-渲染器分离                               | §1 总体架构    | ✅   |
| Vue 3 + TypeScript + Pinia + Vite + Monorepo + postMessage          | §2 技术选型    | ✅   |
| 三栏布局 + Pinia 三 Store                                           | §3             | ✅   |
| iframe + postMessage 双向通信，渲染端上报位置，二分查找插入索引     | §4             | ✅   |
| TypedBridge，4 类双向事件协议，300ms debounce、50ms throttle        | §5             | ✅   |
| 统一注册中心 + Schema 驱动配置面板，shared 包共享类型与默认值       | §6             | ✅   |
| 30s 服务端自动保存 + localStorage 草稿（2s debounce）+ beforeunload | §7             | ✅   |
| 冗余依赖 -800KB、图片懒加载、splitChunks、bundle 优化 30%           | §8             | ✅   |
| TS 渐进迁移 + 单测 + E2E + CI                                       | §9             | ✅   |
| 页面上线周期 3 人天 → 2 小时                                        | PRD §2         | ✅   |
| 支撑 12+ 种组件，多个业务线使用                                     | §11.3 组件清单 | ✅   |

---

## 13. 与旧项目（现有代码）的重构对照

> 本文档是**目标态**。现有旧项目是 Vue2 + Vuex + JavaScript + 三个散项目。重构时**复用设计资产，重写代码实现**。

| 设计资产               | 旧项目位置                                         | 目标态落地                             |
| ---------------------- | -------------------------------------------------- | -------------------------------------- |
| 11 种组件清单 + 默认值 | `cms-manage/src/config/component-list.js`          | `packages/shared` 的 Schema + defaults |
| 页面数据模型           | `cms-manage/src/store/index.js` 的 `emptyPageData` | `PageData` TS 类型                     |
| 4 类通信事件           | `Messager` + `Postmessage`                         | `TypedBridge` 泛型协议                 |
| 组件动态分发           | `crs/src/components/componentResolve.vue`          | 统一注册中心 + 渲染分发                |
| 三栏布局               | `cms-manage/src/pages/decorate/`                   | editor 三栏结构                        |

**重构原则**：旧项目的代码质量不高（console 满屏、ESLint 关闭），不应迁移代码，而应以本文档为目标态，用新栈重新实现，把旧项目的设计资产作为输入。
