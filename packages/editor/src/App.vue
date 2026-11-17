<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { createBridge } from '@lowcode/bridge'
import {
  componentDefinitions,
  createPage,
  PageDataSchema,
  type FieldMeta,
} from '@lowcode/shared'
import { useComponentStore, usePageStore, useSelectionStore } from './stores'

const page = usePageStore()
const components = useComponentStore()
const selection = useSelectionStore()
const frame = ref<HTMLIFrameElement>()
const connected = ref(false)
const feedback = ref('')
const rendererUrl = new URL(
  import.meta.env.VITE_RENDERER_URL || 'http://127.0.0.1:5174',
)
rendererUrl.searchParams.set('editorOrigin', window.location.origin)
let bridge: ReturnType<typeof createBridge> | undefined
const selected = computed(() =>
  components.nodes.find((node) => node.id === selection.id),
)
const fields = componentDefinitions.Notice.fields
const data = computed(() => ({
  ...createPage(),
  name: page.name,
  backgroundColor: page.backgroundColor,
  components: components.nodes,
}))

function sync() {
  const parsed = PageDataSchema.safeParse(data.value)
  if (!parsed.success) {
    feedback.value = parsed.error.issues[0]?.message || '页面配置无效'
    return
  }
  bridge?.send({ channel: 'lowcode-v1', type: 'pageChange', page: parsed.data })
  bridge?.send({ channel: 'lowcode-v1', type: 'setActive', id: selection.id })
}

function connect() {
  bridge?.dispose()
  connected.value = false
  const target = frame.value?.contentWindow
  if (!target) return
  bridge = createBridge(target, rendererUrl.origin, (message) => {
    if (message.type === 'ready') {
      connected.value = true
      sync()
    }
    if (message.type === 'setActive') {
      selection.id = components.nodes.some((node) => node.id === message.id)
        ? message.id
        : null
    }
  })
  // iframe load 可能晚于子页面 ready；主动同步并通过重复 ready 完成握手。
  sync()
}

function editField(field: FieldMeta, event: Event) {
  const node = selected.value
  if (!node) return
  const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value
  components.update(node.id, { ...node.props, [field.key]: value })
  feedback.value = ''
}

function save() {
  const parsed = PageDataSchema.safeParse(data.value)
  if (!parsed.success) {
    feedback.value = parsed.error.issues[0]?.message || '保存失败'
    return
  }
  try {
    localStorage.setItem('lowcode-draft-v1', JSON.stringify(parsed.data))
    feedback.value = '草稿已保存到当前浏览器'
  } catch {
    feedback.value = '浏览器存储不可用，草稿未保存'
  }
}

try {
  const raw = localStorage.getItem('lowcode-draft-v1')
  if (raw) {
    const draft = PageDataSchema.parse(JSON.parse(raw))
    page.name = draft.name
    page.backgroundColor = draft.backgroundColor
    components.nodes = draft.components
  }
} catch {
  feedback.value = '本地草稿无法读取，已打开空白页面'
}

watch([data, () => selection.id], sync, { deep: true })
onBeforeUnmount(() => bridge?.dispose())
</script>

<template>
  <div class="editor">
    <header>
      <div>
        <strong>FlowPage</strong><span class="subtitle">活动页工作台</span>
      </div>
      <button class="primary" @click="save">保存草稿</button>
    </header>
    <div class="workspace">
      <aside>
        <h2>组件库</h2>
        <p class="hint">选择组件，开始搭建你的活动页。</p>
        <button
          class="component-card"
          :disabled="components.nodes.length >= 1"
          @click="components.addNotice"
        >
          ＋ 添加公告
        </button>
        <p class="hint">每页最多一个公告。</p>
        <h2>页面组件</h2>
        <button
          v-for="node in components.nodes"
          :key="node.id"
          class="component-card"
          :aria-pressed="selection.id === node.id"
          @click="selection.id = node.id"
        >
          {{ node.name }}
        </button>
      </aside>
      <main>
        <div class="canvas-heading">
          <span>手机预览 · 375px</span
          ><span>{{ connected ? '预览已连接' : '正在连接预览…' }}</span>
        </div>
        <iframe
          ref="frame"
          :src="rendererUrl.href"
          title="活动页实时预览"
          @load="connect"
        />
      </main>
      <aside>
        <h2>页面设置</h2>
        <label>页面名称<input v-model="page.name" maxlength="100" /></label>
        <label
          >页面背景<input v-model="page.backgroundColor" type="color"
        /></label>
        <template v-if="selected">
          <h2>{{ selected.name }}设置</h2>
          <label v-for="field in fields" :key="field.key">
            {{ field.label }}
            <textarea
              v-if="field.type === 'textarea'"
              :value="selected.props[field.key]"
              maxlength="500"
              rows="4"
              @input="editField(field, $event)"
            />
            <input
              v-else
              type="color"
              :value="selected.props[field.key]"
              @input="editField(field, $event)"
            />
          </label>
          <button class="danger" @click="components.remove(selected.id)">
            删除组件
          </button>
        </template>
        <p v-else class="hint">添加或选中组件后配置其属性。</p>
        <p role="status">{{ feedback }}</p>
      </aside>
    </div>
  </div>
</template>
