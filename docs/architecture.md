# 威享佳低代码平台 — 完整项目架构（含后端 + AI）

> 本文档补充 [tech-design.md](./tech-design.md)（前端技术方案）与 [PRD.md](./PRD.md)，补齐**后端与 AI 层**，形成完整可落地的项目。
> 更新时间：2026-09。结合 2026 年生成式 UI 技术趋势（A2UI、GenUI、Structured Output）。

---

## 1. 背景：为什么需要补后端 + AI

- 前端技术方案（tech-design.md）只覆盖编辑器/渲染端，缺后端，无法构成完整项目。
- 目标：边学**全栈 AI 开发**，边完成一个**真实业务场景**（低代码活动页搭建 + AI 生成）。

---

## 2. 生成式 UI 技术趋势（2026 路线判断）

2026 年，让 AI 生成界面分三条路线：

| 路线                     | 做法                                  | 代表                  | 优点                     | 缺点                            |
| ------------------------ | ------------------------------------- | --------------------- | ------------------------ | ------------------------------- |
| **A. Structured Output** | LLM 用 function calling 输出严格 JSON | Vercel JSON-Render    | 数据严格合法，直接可渲染 | JSON token 开销大，约束复杂易错 |
| **B. A2UI 协议**         | Agent 输出框架无关的组件树消息        | Google A2UI v0.9      | 标准化、可移植           | 需实现渲染器，生态早期          |
| **C. Prompt-First**      | AI 写自然语言，框架解析               | Flutter GenUI、OpenUI | token 省、更自然         | 解析不确定，需强框架兜底        |

### 本项目的选型结论

**采用路线 A（Structured Output），并借鉴路线 B（A2UI）的"解耦"思想。**

理由：

1. 本场景组件**有限**（12 种）、Schema **固定且简单**，Structured Output 的约束小，JSON 开销可控。
2. 数据需**严格合法**（AI 输出直接进渲染层），Structured Output 天然保证合法性。
3. A2UI 与 Prompt-First 面向"开放式 UI 创作"，对本场景是过度设计。

**核心思想**：本项目用自定义的轻量"组件 Schema"作为 AI 与渲染层之间的中间协议，本质上就是 A2UI 的"解耦"思想，只是协议私有、有限、专属活动页。

---

## 3. 完整架构图

```
┌─────────────────────── 前端 Monorepo（tech-design.md 已规划）───────────────────────┐
│  editor（编辑器 + AI 对话面板）   renderer（渲染端）   shared（Schema/类型）          │
└───────────────────────────────┬──────────────────────────────────────────────────┘
                                │ HTTP
┌───────────────────────────────▼──────────────────────────────────────────────────┐
│                           后端服务（Node.js + TypeScript）                        │
│  ├── 页面服务：CRUD、发布、组件管理（对应旧项目 cms-node）                          │
│  ├── AI 服务：意图理解 → LLM 调用 → 返回 Schema JSON                              │
│  └── 数据存储：PostgreSQL/MySQL + Redis                                          │
└───────────────────────────────┬──────────────────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────────────────┐
│                             AI 层                                                │
│  ├── LLM（Structured Output / Function Calling）                                 │
│  ├── zod Schema（与前端 shared 同构，一份定义三用）                                │
│  └── （进阶）MCP：把组件库暴露为 Agent 可调用的工具                                │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. 技术栈选型（2026 版）

| 层          | 选型                                | 理由                              |
| ----------- | ----------------------------------- | --------------------------------- |
| 前端        | Vue3 + TS + Pinia + Vite + Monorepo | 已有方案，不变                    |
| 后端        | **Node.js + TS**（Fastify 或 Hono） | 与前端同构 TS，一套类型打通前后端 |
| ORM         | **Prisma 或 Drizzle**               | TS 友好，Schema 即类型            |
| 数据库      | PostgreSQL（或沿用 MySQL）          | 页面配置用 JSONB 更灵活           |
| AI          | LLM API + **zod**                   | Structured Output + 运行时校验    |
| 校验        | **zod**                             | 前后端 + AI 三处同构              |
| AI 开发工具 | Claude Code / Cursor / Codex        | 边学边做时辅助编码                |
| 扩展协议    | MCP（Phase 3 可选）                 | 2026 生态主流，把组件库暴露为工具 |

---

## 5. 核心设计：一份 Schema，三处复用

这是全栈 AI 开发最有价值的模式：

```
zod Schema（在 shared 包定义一次）
   ├── ① 前端：z.infer 推导 TS 类型（编译期安全）
   ├── ② 后端：运行时校验（接口入参/出参）
   └── ③ AI：zod → JSON Schema 喂给 LLM（约束输出格式）
```

一套 zod 定义，同时服务"类型、校验、AI 输出约束"三个用途。这是"Schema 驱动"在 AI 时代的自然延伸。

---

## 6. Schema TS 定义

### 6.1 字段类型枚举（从旧项目 11 个组件字段归纳）

```ts
// shared/schema/field.ts
export type FieldType =
  | 'text' // 单行文本
  | 'textarea' // 多行文本
  | 'rich-text' // 富文本
  | 'image' // 单图
  | 'image-list' // 图片列表
  | 'color' // 颜色
  | 'number' // 数字
  | 'slider' // 滑块
  | 'switch' // 开关
  | 'select' // 下拉
  | 'radio' // 单选
  | 'link' // 跳转链接
  | 'time-range' // 生效时间区间（validTime）
  | 'list' // 自定义列表（公告列表、商品列表）
```

### 6.2 单个字段 Schema（驱动配置面板）

```ts
// shared/schema/field.ts
import { z } from 'zod'

export interface FieldMeta {
  key: string // 字段名
  label: string // 显示名
  type: FieldType // 字段类型，决定配置面板渲染什么控件
  description?: string // 说明/提示
  options?: { label: string; value: unknown }[] // select/radio 选项
  min?: number // number/slider 最小值
  max?: number // number/slider 最大值
  step?: number
  placeholder?: string
}

// 组件定义：Schema（数据契约）+ 元信息（面板展示）
export interface ComponentDefinition {
  name: string // 中文名，如"图片广告"
  type: string // 类型标识，如 'Carousel'
  icon: string // 组件库图标
  maxNum: number // 页面内最多添加数量
  fields: FieldMeta[] // 字段集合（驱动配置面板 + 供 AI 参考）
  schema: z.ZodType // zod schema（校验 + 推导类型 + 喂 AI）
}
```

### 6.3 组件 Schema 示例（Carousel）

```ts
// shared/schema/components/carousel.ts
import { z } from 'zod'

export const CarouselPropsSchema = z.object({
  layout: z.enum(['swiper', 'single']).default('swiper'),
  imageList: z
    .array(
      z.object({
        link: z.string().nullable().default(null),
        imageUrl: z.string().default(''),
        text: z.string().default(''),
      }),
    )
    .default([]),
  isBorderRadius: z.union([z.literal(0), z.literal(1)]).default(0),
  radius: z.number().min(0).max(30).default(0),
  backgroundColor: z.string().default(''),
})

export type CarouselProps = z.infer<typeof CarouselPropsSchema>
```

### 6.4 组件节点与页面数据

```ts
// shared/schema/page.ts
import { z } from 'zod'

export const ComponentNodeSchema = z.object({
  id: z.string(), // 组件类型 + 随机 id，如 'Carousel-xxxx'
  type: z.string(), // 组件类型，对应 ComponentDefinition.type
  name: z.string(), // 显示名
  props: z.record(z.unknown()), // 实际配置数据
})

export const PageDataSchema = z.object({
  id: z.string().default(''),
  name: z.string().default('页面标题'),
  shareDesc: z.string().default(''), // 微信分享文案
  shareImage: z.string().default(''), // 微信分享图片
  backgroundColor: z.string().default(''),
  backgroundImage: z.string().default(''),
  backgroundPosition: z.string().default('top'),
  cover: z.string().default(''),
  components: z.array(ComponentNodeSchema).default([]),
})

export type PageData = z.infer<typeof PageDataSchema>
export type ComponentNode = z.infer<typeof ComponentNodeSchema>
```

### 6.5 组件清单（12 种，从旧项目 asset 归纳）

| 组件     | type            | 核心字段                                                           |
| -------- | --------------- | ------------------------------------------------------------------ |
| 图片广告 | `Carousel`      | layout, imageList, isBorderRadius, radius, backgroundColor         |
| 图文导航 | `ImageNav`      | layout, lineNumber, imageList, columnPadding, rowPadding           |
| 公告     | `Notice`        | imageUrl, noticelist, backgroundColor, textColor                   |
| 魔方     | `CubeSelection` | template, imageList, pageMargin                                    |
| 文本     | `RichText`      | backgroundColor, content                                           |
| 辅助线   | `AssistLine`    | type, borderColor, borderStyle, height                             |
| 浮标     | `FloatLayer`    | imageUrl, link, hideByPageScroll, width                            |
| 客服     | `OnlineService` | text, hideByPageScroll                                             |
| 横向滑动 | `Slider`        | isDefaultMargin, padding, imageMargin, imageList                   |
| 弹窗     | `Dialog`        | timing, imageList                                                  |
| 商品     | `product`       | listStyle, exchangePriceColor, productList, markingPrice, purchase |
| 优惠券   | `Coupon`        | （旧项目渲染端有 Coupon.vue，待补 Schema）                         |

---

## 7. AI 在项目中的角色

| 角色           | 做什么                        | 难度           | 阶段    |
| -------------- | ----------------------------- | -------------- | ------- |
| 页面初稿生成   | 自然语言 → 整个 pageData JSON | 低（单次 LLM） | Phase 1 |
| 组件属性编辑   | 选中组件，自然语言改 props    | 低             | Phase 2 |
| 文案生成       | 给公告/富文本生成营销文案     | 低             | Phase 2 |
| 组件组合推荐   | 推荐"促销页通常包含哪些组件"  | 中             | Phase 3 |
| Agent 多步编排 | 分析页面 → 建议 → 自动调整    | 高             | Phase 3 |

**核心机制**：LLM 用 Structured Output 生成合法 JSON，zod 校验后进入编辑器。

**AI 与拖拽的关系**：AI 加速"从 0 到 1"（生成 80% 初稿），拖拽负责"精确微调"（20%）。互补，非替代。

---

## 8. AI 服务接口设计

```
POST /ai/generate-page
  入参：{ prompt: "做个双十一促销页，顶部轮播，下面商品列表，底部优惠券" }
  出参：PageData（合法 JSON，已过 zod 校验）

POST /ai/edit-component
  入参：{ componentId, instruction: "把按钮改成红色", context: 当前组件 props }
  出参：更新后的 props（合法 JSON）

POST /ai/generate-copy
  入参：{ type: 'notice', topic: '双十一大促' }
  出参：{ text: "..." }
```

**实现要点**：把 `PageDataSchema` 通过 `zod-to-json-schema` 转成 JSON Schema，作为 function calling 的 parameters；LLM 输出用 `PageDataSchema.parse()` 校验，失败则重试或降级。

---

## 9. 实施路径（边学边做，4 阶段）

### Phase 0：完整闭环（不含 AI）— 打地基

| 学什么                | 做什么                           | 产出                   |
| --------------------- | -------------------------------- | ---------------------- |
| Monorepo、Vite、Pinia | 搭骨架，三栏编辑器 + iframe 预览 | 能拖拽、能预览的编辑器 |
| Node.js + TS + Prisma | 页面 CRUD 接口                   | 能保存/读取页面的后端  |
| zod 基础              | 定义 PageData + 组件 Schema      | shared 包有类型 + 校验 |

**目标**：运营能手动搭页面、存库、再打开。

### Phase 1：AI 生成页面初稿（第一个 AI 能力）

| 学什么                               | 做什么                   | 产出                           |
| ------------------------------------ | ------------------------ | ------------------------------ |
| Structured Output / Function Calling | `/ai/generate-page` 接口 | 编辑器对话框，输一句话生成页面 |
| zod → JSON Schema 转换               | 把 PageDataSchema 喂 LLM | AI 输出永不脏数据              |

**目标**：一句话生成页面初稿，运营微调。

### Phase 2：AI 局部编辑（增强体验）

| 学什么                       | 做什么                 | 产出                     |
| ---------------------------- | ---------------------- | ------------------------ |
| 意图分类（function calling） | 选中组件自然语言改属性 | "把按钮变红"直接改 props |

**目标**：AI 不只生成整页，还能改单组件。

### Phase 3：Agent 编排 + MCP（进阶，可选）

| 学什么               | 做什么                            | 产出           |
| -------------------- | --------------------------------- | -------------- |
| Agent、工具调用、MCP | 多步任务；把组件库暴露为 MCP 工具 | "智能优化"按钮 |

**目标**：学 MCP（2026 最热协议）的实践载体。

---

## 10. 与已有文档的关系

| 文档                               | 定位                                      |
| ---------------------------------- | ----------------------------------------- |
| [PRD.md](./PRD.md)                 | 为什么做 + 做什么                         |
| [tech-design.md](./tech-design.md) | 前端怎么做（编辑器/渲染端/通信/组件系统） |
| 本文档                             | 完整项目 = 前端 + 后端 + AI，及实施路径   |

**原则**：本平台采用 Structured Output（路线 A）+ 借鉴 A2UI 解耦思想，不做 Prompt-First 或完整 A2UI 协议实现。

---

## 11. 组件可扩展性与 AI 组件选择（补充）

### 11.1 组件库是持续增长的

组件种类并非固定 12 种，而是随业务持续沉淀（12 → 20 → 50 → 上百种）。这是低代码平台的常态。

**判断"真低代码 vs 伪低代码"的标准**：新增一个组件，是否要改编辑器核心？

- 只需"注册一份 Schema + 写一个渲染组件"，编辑器/配置面板/渲染端自动生效 → **真低代码**
- 要同时改编辑器、渲染端、AI 层多处 → 伪低代码，组件一多就崩

本平台的 Schema 驱动 + 注册中心设计，保证新增组件**不改编辑器核心**，天然可扩展。

### 11.2 组件增长对 AI 层的真正挑战

组件少时（12 种）：把所有组件 Schema 一次性喂给 LLM，可行。

组件多时（50+ 种）：问题出现——

| 组件数量 | 喂给 LLM 的 Schema 总量 | 问题                               |
| -------- | ----------------------- | ---------------------------------- |
| 12       | 几 KB                   | 无问题                             |
| 50       | 几十 KB                 | token 爆炸、成本高                 |
| 100+     | 上百 KB                 | 约束太宽，LLM 反而更易出错、漏组件 |

**关键认知**：Structured Output 是否够用，不取决于组件总数，而取决于"单次喂给 LLM 的约束复杂度"。

### 11.3 解法：AI 组件选择（RAG 思想）

不要把所有组件 Schema 全喂 LLM，先选出"这个页面可能用到的组件"，只喂相关的。

```text
运营："做个双十一促销页，顶部轮播，下面商品，底部优惠券"
   │
   ▼
① 组件选择（从注册中心召回相关组件）
   ├── 简单方案：分类/规则过滤（"促销页常用组件"预选 10-15 种）
   └── 进阶方案：向量检索（prompt 匹配组件库，召回 top-K）
   │
   ▼
② 只把选中的 10-15 个组件 Schema 喂 LLM（非全量）
   │
   ▼
③ LLM Structured Output 生成合法 JSON
   │
   ▼
④ zod 校验 → 渲染
```

**效果**：组件从 12 涨到 100，AI 层的成本与准确性都不失控，因为有"组件选择"层在中间缓冲。

### 11.4 面试话术

> 组件增长分两个层面。编辑器层面，Schema 驱动 + 注册中心保证新增组件不改核心，只是注册一份定义。AI 层面，组件多了不能全量喂模型，我加了一层"组件选择"——先用规则或向量检索召回相关组件，只把相关 Schema 作为约束喂 LLM。这样组件库扩张时，AI 生成的成本和准确性都不会失控。
