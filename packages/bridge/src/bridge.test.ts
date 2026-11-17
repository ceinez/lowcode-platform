import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBridge } from './index'

afterEach(() => vi.unstubAllGlobals())

describe('跨窗口消息边界', () => {
  it('只接收指定来源、窗口和有效契约，销毁时移除监听', () => {
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()
    vi.stubGlobal('window', { addEventListener, removeEventListener })
    const target = { postMessage: vi.fn() } as unknown as Window
    const receive = vi.fn()
    const bridge = createBridge(target, 'http://127.0.0.1:5174', receive)
    const listener = addEventListener.mock.calls[0]?.[1] as (
      event: unknown,
    ) => void
    const valid = {
      source: target,
      origin: 'http://127.0.0.1:5174',
      data: { channel: 'lowcode-v1', type: 'ready' },
    }
    listener({ ...valid, origin: 'https://other.example' })
    listener({ ...valid, source: {} })
    listener({ ...valid, data: { channel: 'other', type: 'ready' } })
    expect(receive).not.toHaveBeenCalled()
    listener(valid)
    expect(receive).toHaveBeenCalledWith(valid.data)
    bridge.send({ channel: 'lowcode-v1', type: 'ready' })
    expect(target.postMessage).toHaveBeenCalledWith(valid.data, valid.origin)
    bridge.dispose()
    expect(removeEventListener).toHaveBeenCalledWith('message', listener)
  })

  it('不允许通配符接收来源', () => {
    expect(() => createBridge({} as Window, '*', vi.fn())).toThrow(
      '明确的 origin',
    )
  })
})
