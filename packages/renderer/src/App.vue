<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { createBridge } from '@lowcode/bridge'
import { createPage } from '@lowcode/shared'

const page = ref(createPage())
const activeId = ref<string | null>(null)
let bridge: ReturnType<typeof createBridge> | undefined
let handshake: ReturnType<typeof setInterval> | undefined
const editorOrigin = new URLSearchParams(location.search).get('editorOrigin')
// 预览模式仅接受 URL 中明确指定的父窗口；独立访问不监听编辑消息。
if (editorOrigin && window.parent !== window) {
  bridge = createBridge(window.parent, editorOrigin, (message) => {
    if (message.type === 'pageChange') {
      page.value = message.page
      document.title = message.page.name
      clearInterval(handshake)
    }
    if (message.type === 'setActive') activeId.value = message.id
  })
  bridge.send({ channel: 'lowcode-v1', type: 'ready' })
  handshake = setInterval(
    () => bridge?.send({ channel: 'lowcode-v1', type: 'ready' }),
    500,
  )
}

onBeforeUnmount(() => {
  clearInterval(handshake)
  bridge?.dispose()
})

function select(id: string) {
  bridge?.send({ channel: 'lowcode-v1', type: 'setActive', id })
}
</script>

<template>
  <div class="page" :style="{ backgroundColor: page.backgroundColor }">
    <p v-if="page.components.length === 0" class="empty">
      从左侧添加组件，预览将在这里呈现
    </p>
    <button
      v-for="node in page.components"
      :key="node.id"
      class="notice"
      :class="{ active: activeId === node.id }"
      :style="{
        backgroundColor: node.props.backgroundColor,
        color: node.props.textColor,
      }"
      @click="select(node.id)"
    >
      {{ node.props.text }}
    </button>
  </div>
</template>

<style>
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
.page {
  min-height: 100vh;
  padding: 16px 0;
}
.empty {
  margin: 120px 24px;
  color: #8b95a5;
  font-size: 13px;
  text-align: center;
  line-height: 2;
}
.notice {
  display: block;
  width: 100%;
  padding: 16px 20px;
  border: 2px solid transparent;
  font: inherit;
  font-size: 14px;
  line-height: 1.8;
  text-align: left;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  cursor: pointer;
}
.active {
  border-color: #496ee8;
}
</style>
