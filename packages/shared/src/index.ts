import { z } from 'zod'

export const ColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, '请输入六位十六进制颜色')

export const NoticePropsSchema = z.object({
  text: z.string().max(500).default('欢迎来到 FlowPage 活动专区'),
  backgroundColor: ColorSchema.default('#fff8e9'),
  textColor: ColorSchema.default('#665533'),
})

export const NoticeNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal('Notice'),
  name: z.string().default('公告'),
  props: NoticePropsSchema,
})

export const PageDataSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    id: z.string().default(''),
    name: z.string().min(1).max(100).default('未命名活动页'),
    backgroundColor: ColorSchema.default('#f4f5f7'),
    components: z.array(NoticeNodeSchema).max(1).default([]),
  })
  .superRefine((page, context) => {
    const ids = page.components.map((node) => node.id)
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: 'custom',
        message: '组件 ID 不可重复',
        path: ['components'],
      })
    }
  })

export type NoticeProps = z.infer<typeof NoticePropsSchema>
export type ComponentNode = z.infer<typeof NoticeNodeSchema>
export type PageData = z.infer<typeof PageDataSchema>
export type FieldMeta = {
  key: keyof NoticeProps
  label: string
  type: 'textarea' | 'color'
}

// 新增组件时扩展注册表、节点判别联合及渲染映射，编辑器表单无需分支。
export const componentDefinitions = {
  Notice: {
    name: '公告',
    maxNum: 1,
    schema: NoticePropsSchema,
    fields: [
      { key: 'text', label: '公告内容', type: 'textarea' },
      { key: 'backgroundColor', label: '背景颜色', type: 'color' },
      { key: 'textColor', label: '文字颜色', type: 'color' },
    ] satisfies FieldMeta[],
  },
}

export function createPage(): PageData {
  return PageDataSchema.parse({})
}

export function createNotice(id: string): ComponentNode {
  return NoticeNodeSchema.parse({ id, type: 'Notice', props: {} })
}

export const BridgeMessageSchema = z.discriminatedUnion('type', [
  z.object({ channel: z.literal('lowcode-v1'), type: z.literal('ready') }),
  z.object({
    channel: z.literal('lowcode-v1'),
    type: z.literal('pageChange'),
    page: PageDataSchema,
  }),
  z.object({
    channel: z.literal('lowcode-v1'),
    type: z.literal('setActive'),
    id: z.string().nullable(),
  }),
])

export type BridgeMessage = z.infer<typeof BridgeMessageSchema>
