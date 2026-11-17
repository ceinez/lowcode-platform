import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  componentDefinitions,
  createNotice,
  createPage,
  NoticePropsSchema,
  type ComponentNode,
  type NoticeProps,
} from '@lowcode/shared'

export const usePageStore = defineStore('page', () => {
  const defaults = createPage()
  const name = ref(defaults.name)
  const backgroundColor = ref(defaults.backgroundColor)
  return { name, backgroundColor }
})

export const useSelectionStore = defineStore('selection', () => {
  const id = ref<string | null>(null)
  return { id }
})

export const useComponentStore = defineStore('components', () => {
  const nodes = ref<ComponentNode[]>([])
  function addNotice() {
    if (nodes.value.length >= componentDefinitions.Notice.maxNum) return
    const node = createNotice(crypto.randomUUID())
    nodes.value.push(node)
    useSelectionStore().id = node.id
  }
  function update(id: string, props: NoticeProps) {
    const node = nodes.value.find((item) => item.id === id)
    if (node) node.props = NoticePropsSchema.parse(props)
  }
  function remove(id: string) {
    nodes.value = nodes.value.filter((node) => node.id !== id)
    if (useSelectionStore().id === id) useSelectionStore().id = null
  }
  return { nodes, addNotice, update, remove }
})
