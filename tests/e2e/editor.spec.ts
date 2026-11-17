import { expect, test } from '@playwright/test'

test('添加公告、配置、跨 iframe 同步、保存并重新打开', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('预览已连接', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '添加公告' }).click()
  await expect(page.getByRole('button', { name: '添加公告' })).toBeDisabled()
  await page.getByLabel('公告内容').fill('双十一好物限时优惠')
  await page.getByLabel('文字颜色', { exact: true }).fill('#ff0000')
  const preview = page.frameLocator('iframe')
  await expect(
    preview.getByRole('button', { name: '双十一好物限时优惠' }),
  ).toBeVisible()
  await expect(
    preview.getByRole('button', { name: '双十一好物限时优惠' }),
  ).toHaveCSS('color', 'rgb(255, 0, 0)')
  await page.screenshot({ path: 'test-results/editor.png', fullPage: true })
  await page.getByRole('button', { name: '保存草稿' }).click()
  await expect(page.getByRole('status')).toHaveText('草稿已保存到当前浏览器')
  await page.reload()
  await expect(
    preview.getByRole('button', { name: '双十一好物限时优惠' }),
  ).toBeVisible()
  await preview.getByRole('button', { name: '双十一好物限时优惠' }).click()
  await expect(page.getByLabel('公告内容')).toHaveValue('双十一好物限时优惠')
  await page.getByRole('button', { name: '删除组件' }).click()
  await expect(
    preview.getByText('从左侧添加组件，预览将在这里呈现'),
  ).toBeVisible()
})

test('损坏的草稿不会导致编辑器白屏', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('lowcode-draft-v1', '{broken'),
  )
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText(
    '本地草稿无法读取，已打开空白页面',
  )
  await expect(page.getByRole('button', { name: '添加公告' })).toBeEnabled()
})
