import { describe, expect, it } from 'vitest'
import {
  BridgeMessageSchema,
  createNotice,
  createPage,
  NoticePropsSchema,
  PageDataSchema,
} from './index'

describe('页面数据契约', () => {
  it('默认值相互隔离', () => {
    const first = createPage()
    first.components.push(createNotice('notice-1'))
    expect(createPage().components).toEqual([])
  })

  it('拒绝不受支持的组件、无效颜色和超出业务数量限制的页面', () => {
    const page = createPage()
    expect(
      PageDataSchema.safeParse({ ...page, components: [{ type: 'Unknown' }] })
        .success,
    ).toBe(false)
    expect(
      NoticePropsSchema.safeParse({ textColor: 'url(javascript:alert(1))' })
        .success,
    ).toBe(false)
    expect(
      PageDataSchema.safeParse({
        ...page,
        components: [createNotice('a'), createNotice('b')],
      }).success,
    ).toBe(false)
  })

  it('序列化后的页面仍可通过契约验证', () => {
    const page = { ...createPage(), components: [createNotice('a')] }
    expect(PageDataSchema.parse(JSON.parse(JSON.stringify(page)))).toEqual(page)
  })

  it('拒绝来自其他协议及内容不合法的跨窗口消息', () => {
    expect(
      BridgeMessageSchema.safeParse({ channel: 'other', type: 'ready' })
        .success,
    ).toBe(false)
    expect(
      BridgeMessageSchema.safeParse({
        channel: 'lowcode-v1',
        type: 'pageChange',
        page: null,
      }).success,
    ).toBe(false)
  })
})
