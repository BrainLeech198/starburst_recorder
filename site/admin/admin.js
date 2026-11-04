const API = 'https://starburst-push.starburst-recorder.workers.dev'

let sessionToken = null
let editingNoticeId = null
let noticeEditBaseline = null

const loginView = document.querySelector('#login-view')
const workspaceView = document.querySelector('#workspace-view')
const loginForm = document.querySelector('#login-form')
const loginMessage = document.querySelector('#login-message')
const workspaceMessage = document.querySelector('#workspace-message')
const actionDialog = document.querySelector('#action-dialog')
const actionDialogTitle = document.querySelector('#action-dialog-title')
const actionDialogDescription = document.querySelector('#action-dialog-description')
const actionDialogPreview = document.querySelector('#action-dialog-preview')
const actionDialogPreviewTitle = document.querySelector('#action-dialog-preview-title')
const actionDialogPreviewSubject = document.querySelector('#action-dialog-preview-subject')
const actionDialogPreviewBody = document.querySelector('#action-dialog-preview-body')
const actionDialogCancel = document.querySelector('#action-dialog-cancel')
const actionDialogConfirm = document.querySelector('#action-dialog-confirm')

function showLogin(message = '') {
  sessionToken = null
  workspaceView.hidden = true
  loginView.hidden = false
  loginMessage.textContent = message
}

function showWorkspaceMessage(message, kind = 'success') {
  workspaceMessage.textContent = message
  workspaceMessage.dataset.kind = kind === 'error' ? 'error' : 'success'
  workspaceMessage.hidden = false
}

function requestActionConfirmation({ title, description, confirmLabel, preview, destructive = false }) {
  actionDialogTitle.textContent = title
  actionDialogDescription.textContent = description
  actionDialogConfirm.textContent = confirmLabel
  actionDialogConfirm.classList.toggle('button--danger', destructive)
  actionDialogConfirm.classList.toggle('button--primary', !destructive)
  actionDialogPreview.hidden = !preview
  actionDialogPreviewTitle.textContent = preview?.title || ''
  actionDialogPreviewSubject.hidden = !preview?.subject
  actionDialogPreviewSubject.textContent = preview?.subject ? `邮件主题：${preview.subject}` : ''
  actionDialogPreviewBody.textContent = preview?.body || ''
  actionDialog.returnValue = ''

  return new Promise((resolve) => {
    actionDialog.addEventListener('close', () => {
      resolve(actionDialog.returnValue === 'confirm')
    }, { once: true })
    actionDialog.showModal()
    actionDialogCancel.focus({ preventScroll: true })
  })
}

actionDialogCancel.addEventListener('click', () => actionDialog.close('cancel'))
actionDialogConfirm.addEventListener('click', () => actionDialog.close('confirm'))
actionDialog.addEventListener('click', (event) => {
  if (event.target === actionDialog) actionDialog.close('cancel')
})

async function readResponse(response) {
  const body = await response.json().catch(() => ({}))
  if (response.status === 401) {
    showLogin('登录状态已失效，请重新登录。')
    throw new Error('登录状态已失效')
  }
  if (!response.ok && response.status !== 207) {
    throw new Error(body.error || `请求失败（${response.status}）`)
  }
  return body
}

async function adminRequest(path, options = {}) {
  if (!sessionToken) throw new Error('请先登录')
  const response = await fetch(`${API}${path}`, {
    ...options,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${sessionToken}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  })
  return readResponse(response)
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  const button = loginForm.querySelector('button[type="submit"]')
  const values = new FormData(loginForm)
  button.disabled = true
  loginMessage.textContent = '正在验证…'
  try {
    const response = await fetch(`${API}/admin/session`, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: values.get('username'),
        password: values.get('password'),
      }),
    })
    const result = await readResponse(response)
    sessionToken = result.sessionToken
    loginForm.elements.password.value = ''
    loginView.hidden = true
    workspaceView.hidden = false
    workspaceMessage.hidden = true
    const status = await adminRequest('/admin/api/status')
    const emailOptions = [...loginView.ownerDocument.querySelectorAll('select[name="delivery"] option')]
      .filter((option) => option.value !== 'notice')
    for (const option of emailOptions) option.disabled = !status.emailSendingEnabled
    document.querySelector('#mail-note').textContent = status.emailSendingEnabled
      ? '邮件会发送给当前所有已订阅地址；每封邮件均附退订链接。'
      : `${status.emailReason}。邮件发送选项暂不可用。`
    await loadAdminNotices()
  } catch (error) {
    if (sessionToken) {
      showWorkspaceMessage(error.message || '已登录，但无法读取工作台配置。', 'error')
    } else {
      loginMessage.textContent = error.message || '登录失败，请稍后重试。'
    }
  } finally {
    button.disabled = false
  }
})

document.querySelector('#logout-button').addEventListener('click', async () => {
  if (!(await confirmDiscardNoticeChanges())) return
  resetNoticeEditor()
  showLogin()
  loginForm.elements.username.focus({ preventScroll: true })
})

const noticeForm = document.querySelector('#notice-form')
const deliverySelect = noticeForm.elements.delivery
const emailSubjectRow = document.querySelector('#email-subject-row')
const emailSubject = noticeForm.elements.subject
const noticeSubmit = noticeForm.querySelector('button[type="submit"]')
const urgentRow = document.querySelector('#urgent-row')
const urgentCheckbox = noticeForm.elements.urgent
const cancelEditButton = document.querySelector('#cancel-edit')

function updateDeliveryFields() {
  const delivery = deliverySelect.value
  const usesEmail = delivery === 'email' || delivery === 'both'
  const includesNotice = delivery === 'notice' || delivery === 'both'
  const isEditing = editingNoticeId !== null
  deliverySelect.disabled = isEditing
  emailSubjectRow.hidden = !usesEmail
  emailSubject.disabled = !usesEmail
  urgentRow.hidden = !includesNotice
  urgentCheckbox.disabled = !includesNotice
  noticeSubmit.textContent = isEditing ? '保存公告修改' : {
    notice: '发布应用内公告',
    email: '发送邮件',
    both: '发布公告并发送邮件',
  }[delivery]
  cancelEditButton.hidden = !isEditing
}

function hasUnsavedNoticeChanges() {
  const title = noticeForm.elements.title.value
  const body = noticeForm.elements.body.value
  const urgent = urgentCheckbox.checked
  if (editingNoticeId && noticeEditBaseline) {
    return title !== noticeEditBaseline.title
      || body !== noticeEditBaseline.body
      || urgent !== noticeEditBaseline.urgent
  }
  return Boolean(
    title.trim()
      || body.trim()
      || emailSubject.value.trim()
      || deliverySelect.value !== 'notice'
      || urgent,
  )
}

async function confirmDiscardNoticeChanges() {
  if (!hasUnsavedNoticeChanges()) return true
  return requestActionConfirmation({
    title: '放弃未保存的更改？',
    description: editingNoticeId
      ? '当前公告的标题、正文或紧急级别有未保存改动。放弃后退出编辑，已发布公告不会改变。'
      : '当前公告草稿尚未提交。放弃后，标题、正文和投递设置都会清空。',
    confirmLabel: '放弃更改',
    preview: { title: noticeForm.elements.title.value, body: noticeForm.elements.body.value },
    destructive: true,
  })
}

function resetNoticeEditor() {
  editingNoticeId = null
  noticeEditBaseline = null
  noticeForm.reset()
  workspaceMessage.hidden = true
  updateDeliveryFields()
}

deliverySelect.addEventListener('change', updateDeliveryFields)
cancelEditButton.addEventListener('click', async () => {
  if (!(await confirmDiscardNoticeChanges())) return
  resetNoticeEditor()
  document.querySelector('#load-notices').focus({ preventScroll: true })
})

noticeForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  const form = event.currentTarget
  const button = form.querySelector('button[type="submit"]')
  const values = new FormData(form)
  const delivery = editingNoticeId ? 'notice' : values.get('delivery')
  const level = values.get('urgent') === 'on' ? 'urgent' : 'info'

  const preview = { title: values.get('title'), body: values.get('body') }
  if (delivery === 'email' || delivery === 'both') {
    preview.subject = values.get('subject')?.trim() || values.get('title')
  }
  let confirmation
  if (editingNoticeId) {
    confirmation = {
      title: '确认保存公告修改？',
      description: '保存后会更新当前应用内公告，保留原发布时间；不会重新发送或撤回已发出的邮件。',
      confirmLabel: '保存修改',
      preview,
    }
  } else {
    const scope = []
    if (delivery === 'notice' || delivery === 'both') {
      scope.push('应用内：所有查看公告的用户都能看到')
    }
    if (delivery === 'email' || delivery === 'both') {
      scope.push('邮件：发送给所有已确认订阅者，发出后无法撤回')
    }
    if (level === 'urgent' && (delivery === 'notice' || delivery === 'both')) {
      scope.push('级别：在应用内标记为紧急公告')
    }
    confirmation = {
      title: '确认发布这条公告？',
      description: `${scope.join('；')}。确认后才会提交。`,
      confirmLabel: {
        notice: '确认发布',
        email: '确认发送邮件',
        both: '确认发布并发送',
      }[delivery],
      preview,
    }
  }
  if (!(await requestActionConfirmation(confirmation))) return

  button.disabled = true
  button.textContent = '正在发布…'
  workspaceMessage.hidden = true
  try {
    if (editingNoticeId) {
      const result = await adminRequest(
        `/admin/api/notices/${encodeURIComponent(editingNoticeId)}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            title: values.get('title'),
            body: values.get('body'),
            level,
          }),
        },
      )
      showWorkspaceMessage(`公告已更新：${result.notice.title}。已发出的邮件不会重新发送。`)
      editingNoticeId = null
      noticeEditBaseline = null
      form.reset()
      updateDeliveryFields()
      await loadAdminNotices()
      return
    }

    const result = await adminRequest('/admin/api/messages', {
      method: 'POST',
      headers: delivery === 'notice' ? {} : { 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({
        delivery,
        title: values.get('title'),
        body: values.get('body'),
        subject: values.get('subject'),
        level,
      }),
    })
    if (result.email?.status === 'partial_or_failed') {
      const announcementStatus = result.notice ? `公告已发布：${result.notice.title}。` : ''
      showWorkspaceMessage(
        `${announcementStatus}邮件队列未全部接收（已排队 ${result.email.queued}/${result.email.total}，失败 ${result.email.failed}）。请查看 Worker 日志和队列状态，再决定是否重发，避免重复发送。`,
        'error',
      )
    } else if (result.email?.status === 'no_subscribers') {
      showWorkspaceMessage(result.notice ? '公告已发布；当前没有邮箱订阅者。' : '当前没有邮箱订阅者，未发送邮件。')
    } else if (result.email) {
      const announcementStatus = result.notice ? `公告已发布：${result.notice.title}；` : ''
      showWorkspaceMessage(`${announcementStatus}邮件已排队：${result.email.queued} 位订阅者。`)
    } else {
      showWorkspaceMessage(`公告已发布：${result.notice.title}`)
    }
    form.reset()
    updateDeliveryFields()
    if (result.notice) {
      noticesSearch.value = ''
      noticesLevel.value = 'all'
      await loadAdminNotices()
    }
  } catch (error) {
    if (workspaceView.hidden) return
    showWorkspaceMessage(error.message || '发布失败，请重试。', 'error')
  } finally {
    button.disabled = false
    updateDeliveryFields()
  }
})

function formatTime(timestamp) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '时间未知'
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false })
}

function showEmpty(list, message) {
  const item = document.createElement('li')
  item.className = 'empty'
  item.textContent = message
  list.replaceChildren(item)
}

function showListFailure(error, { list, count, label, loaded, previousCount, render }) {
  const detail = error.message || '暂时无法连接服务'
  if (loaded) {
    if (render) render()
    else count.textContent = previousCount
    showWorkspaceMessage(`${label}刷新失败：${detail}。已保留上次成功加载的数据，可再次点击加载按钮重试。`, 'error')
    return
  }

  count.textContent = '加载失败'
  showEmpty(list, `${label}加载失败：${detail}`)
  showWorkspaceMessage(`${label}加载失败：${detail}。可再次点击加载按钮重试。`, 'error')
}

async function beginNoticeEdit(notice) {
  if (editingNoticeId === notice.id) {
    noticeForm.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'center',
    })
    noticeForm.elements.title.focus({ preventScroll: true })
    return
  }
  if (!(await confirmDiscardNoticeChanges())) return

  editingNoticeId = notice.id
  noticeForm.elements.title.value = notice.title
  noticeForm.elements.body.value = notice.body
  noticeForm.elements.delivery.value = 'notice'
  urgentCheckbox.checked = notice.level === 'urgent'
  noticeEditBaseline = {
    title: notice.title,
    body: notice.body,
    urgent: notice.level === 'urgent',
  }
  workspaceMessage.hidden = true
  updateDeliveryFields()
  noticeForm.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'center',
  })
  noticeForm.elements.title.focus({ preventScroll: true })
}

let adminNotices = []
let adminNoticesLoaded = false
let subscribersLoaded = false
let feedbackLoaded = false
const noticesSearch = document.querySelector('#notices-search')
const noticesLevel = document.querySelector('#notices-level')

function renderAdminNotices() {
  const list = document.querySelector('#notices-list')
  const count = document.querySelector('#notices-count')
  const query = noticesSearch.value.trim().toLocaleLowerCase('zh-CN')
  const level = noticesLevel.value
  const filtered = adminNotices.filter((notice) => {
    const matchesQuery = !query || `${notice.title}\n${notice.body}`.toLocaleLowerCase('zh-CN').includes(query)
    return matchesQuery && (level === 'all' || notice.level === level)
  })

  if (query || level !== 'all') {
    count.textContent = `显示 ${filtered.length} / ${adminNotices.length} 条公告`
  } else {
    count.textContent = `共 ${adminNotices.length} 条公告`
  }
  if (!adminNotices.length) return showEmpty(list, '目前没有已发布的公告。')
  if (!filtered.length) return showEmpty(list, '没有匹配的公告，请调整搜索词或级别筛选。')

  const items = filtered.map((notice) => {
    const item = document.createElement('li')
    item.className = 'notice-record'

    const heading = document.createElement('div')
    heading.className = 'notice-record__heading'
    const title = document.createElement('strong')
    title.className = 'notice-record__title'
    title.textContent = notice.title
    const level = document.createElement('span')
    level.className = 'notice-record__level'
    level.dataset.level = notice.level
    level.textContent = notice.level === 'urgent' ? '紧急' : '普通'
    heading.append(title, level)

    const body = document.createElement('p')
    body.className = 'notice-record__body'
    body.textContent = notice.body

    const meta = document.createElement('small')
    meta.textContent = notice.updatedAt && notice.updatedAt > notice.createdAt
      ? `发布于 ${formatTime(notice.createdAt)} · 编辑于 ${formatTime(notice.updatedAt)}`
      : `发布于 ${formatTime(notice.createdAt)}`

    const actions = document.createElement('div')
    actions.className = 'notice-record__actions'
    const editButton = document.createElement('button')
    editButton.className = 'button button--small'
    editButton.type = 'button'
    editButton.textContent = '编辑'
    editButton.addEventListener('click', () => beginNoticeEdit(notice))
    const deleteButton = document.createElement('button')
    deleteButton.className = 'button button--small button--danger'
    deleteButton.type = 'button'
    deleteButton.textContent = '删除'
    deleteButton.addEventListener('click', async () => {
      const confirmed = await requestActionConfirmation({
        title: '确认删除这条公告？',
        description: '删除后会从应用内公告列表移除，且无法恢复；已发出的邮件无法撤回。',
        confirmLabel: '确认删除',
        preview: { title: notice.title, body: notice.body },
        destructive: true,
      })
      if (!confirmed) return
      deleteButton.disabled = true
      try {
        await adminRequest(`/admin/api/notices/${encodeURIComponent(notice.id)}`, { method: 'DELETE' })
        if (editingNoticeId === notice.id) {
          resetNoticeEditor()
        }
        showWorkspaceMessage(`公告已删除：${notice.title}`)
        await loadAdminNotices()
        document.querySelector('#load-notices').focus({ preventScroll: true })
      } catch (error) {
        showWorkspaceMessage(error.message || '删除公告失败。', 'error')
        deleteButton.disabled = false
      }
    })
    actions.append(editButton, deleteButton)
    item.append(heading, body, meta, actions)
    return item
  })
  list.replaceChildren(...items)
}

async function loadAdminNotices() {
  const button = document.querySelector('#load-notices')
  const list = document.querySelector('#notices-list')
  const count = document.querySelector('#notices-count')
  const loaded = adminNoticesLoaded
  const previousCount = count.textContent
  button.disabled = true
  count.textContent = loaded ? '正在刷新…' : '正在加载…'
  try {
    const result = await adminRequest('/admin/api/notices')
    adminNotices = result.notices
    adminNoticesLoaded = true
    renderAdminNotices()
  } catch (error) {
    if (workspaceView.hidden) return
    showListFailure(error, {
      list,
      count,
      label: '公告历史',
      loaded,
      previousCount,
      render: renderAdminNotices,
    })
  } finally {
    button.disabled = false
  }
}

document.querySelector('#load-notices').addEventListener('click', () => void loadAdminNotices())
noticesSearch.addEventListener('input', renderAdminNotices)
noticesLevel.addEventListener('change', renderAdminNotices)

document.querySelector('#load-subscribers').addEventListener('click', async (event) => {
  const button = event.currentTarget
  const list = document.querySelector('#subscribers-list')
  const count = document.querySelector('#subscribers-count')
  const loaded = subscribersLoaded
  const previousCount = count.textContent
  button.disabled = true
  count.textContent = loaded ? '正在刷新…' : '正在加载…'
  try {
    const result = await adminRequest('/admin/api/subscribers')
    subscribersLoaded = true
    count.textContent = `共 ${result.count} 位订阅者`
    if (!result.subscribers.length) return showEmpty(list, '还没有邮箱订阅者。')
    const items = result.subscribers.map((person) => {
      const item = document.createElement('li')
      item.append(document.createTextNode(person.email))
      const time = document.createElement('small')
      time.textContent = `订阅于 ${formatTime(person.createdAt)}`
      item.append(time)
      return item
    })
    list.replaceChildren(...items)
  } catch (error) {
    if (workspaceView.hidden) return
    showListFailure(error, { list, count, label: '订阅者名单', loaded, previousCount })
  } finally {
    button.disabled = false
  }
})

document.querySelector('#load-feedback').addEventListener('click', async (event) => {
  const button = event.currentTarget
  const list = document.querySelector('#feedback-list')
  const count = document.querySelector('#feedback-count')
  const loaded = feedbackLoaded
  const previousCount = count.textContent
  button.disabled = true
  count.textContent = loaded ? '正在刷新…' : '正在加载…'
  try {
    const result = await adminRequest('/admin/api/feedback')
    feedbackLoaded = true
    count.textContent = `共 ${result.count} 条反馈`
    if (!result.feedback.length) return showEmpty(list, '还没有用户反馈。')
    const items = result.feedback.map((feedback) => {
      const item = document.createElement('li')
      item.append(document.createTextNode(feedback.body))
      const time = document.createElement('small')
      time.textContent = formatTime(feedback.createdAt)
      item.append(time)
      return item
    })
    list.replaceChildren(...items)
  } catch (error) {
    if (workspaceView.hidden) return
    showListFailure(error, { list, count, label: '用户反馈', loaded, previousCount })
  } finally {
    button.disabled = false
  }
})
