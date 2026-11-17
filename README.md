# FlowPage（流页）— 移动端营销页搭建平台

个人独立学习项目，使用 Vue 3 + TypeScript 构建移动端营销页搭建平台。目标是让运营通过拖拽或自然语言生成页面、编辑并发布，逐步学习完整的前端、后端与 Agent 开发。每次实现一个小闭环，先评审方案，再编码、验证和推送。

## 当前实现

- 独立的三栏编辑器与 H5 渲染端，通过 iframe 和消息协议同步。
- 公告组件的添加、选中、文字与颜色配置、删除。
- 当前浏览器中的手动草稿保存与恢复。
- 共享 Zod 数据校验、Pinia 状态分离、严格 TypeScript 配置。
- ESLint、Prettier、Vitest、Playwright 和 GitHub Actions。

当前没有拖拽排序、服务端存储、发布能力或 AI 调用；详细设计文档描述的是目标态，不能视为已完成功能。

## 本地运行

使用 `.nvmrc` 指定的 Node.js 22.22.2 和 npm 10+：

```sh
npm ci
npm run dev
```

打开 <http://127.0.0.1:5173>。渲染端运行于 <http://127.0.0.1:5174>，两个端口均固定，冲突时启动会失败并提示。

编辑器默认连接本地渲染端。需要调整地址时，将 `packages/editor/.env.example` 复制为同目录 `.env.local`，修改 `VITE_RENDERER_URL` 后重新启动。

```sh
npm run check         # lint、类型检查、单测、两端生产构建
npm run format:check  # 格式检查
npx playwright install chromium
npm run test:e2e      # 自动启动两端，验证完整编辑流程
```

本机已安装 Chrome 时，也可运行 `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`，使用独立临时浏览器实例，省去下载测试浏览器。

生产构建输出到 `packages/editor/dist`、`packages/renderer/dist`。独立部署方案将在后续批准的批次实现。

## 目录

```text
packages/
  editor/      编辑器应用、三个 Pinia store、Schema 驱动属性表单
  renderer/    独立 H5 预览应用
  shared/      页面和公告 Schema、注册元信息、通信消息契约
  bridge/      带运行时校验和来源校验的通信封装
tests/e2e/     跨 iframe 编辑、保存和恢复测试
docs/          原始设计文档副本与实际实施记录
```

旧项目保留在本仓库父目录，不属于此 Git 仓库。文档入口：[实施记录](docs/refactor-progress.md)、[PRD](docs/PRD.md)、[前端技术方案](docs/tech-design.md)、[完整架构](docs/architecture.md)。
