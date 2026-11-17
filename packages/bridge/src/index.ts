import { BridgeMessageSchema, type BridgeMessage } from '@lowcode/shared'

export function createBridge(
  target: Window,
  targetOrigin: string,
  receive: (message: BridgeMessage) => void,
) {
  if (targetOrigin === '*' || new URL(targetOrigin).origin !== targetOrigin) {
    throw new Error('通信必须配置明确的 origin')
  }
  const listener = (event: MessageEvent<unknown>) => {
    if (event.source !== target || event.origin !== targetOrigin) return
    const parsed = BridgeMessageSchema.safeParse(event.data)
    if (parsed.success) receive(parsed.data)
  }
  window.addEventListener('message', listener)
  return {
    send(message: BridgeMessage) {
      target.postMessage(BridgeMessageSchema.parse(message), targetOrigin)
    },
    dispose() {
      window.removeEventListener('message', listener)
    },
  }
}
