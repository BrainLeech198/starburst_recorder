const API = 'https://starburst-push.starburst-recorder.workers.dev'

let sessionToken = null

const loginView = document.querySelector('#login-view')
const workspaceView = document.querySelector('#workspace-view')
const loginForm = document.querySelector('#login-form')
const loginMessage = document.querySelector('#login-message')
const workspaceMessage = document.querySelector('#workspace-message')

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

document.querySelector('#logout-button').addEventListener('click', () => showLogin())

const noticeForm = document.querySelector('#notice-form')
const deliverySelect = noticeForm.elements.delivery
const emailSubjectRow = document.querySelector('#email-subject-row')
const emailSubject = noticeForm.elements.subject
const noticeSubmit = noticeForm.querySelector('button[type="submit"]')
const urgentRow = document.querySelector('#urgent-row')
const urgentCheckbox = noticeForm.elements.urgent

function updateDeliveryFields() {
  const delivery = deliverySelect.value
  const usesEmail = delivery === 'email' || delivery === 'both'
  const includesNotice = delivery === 'notice' || delivery === 'both'
  emailSubjectRow.hidden = !usesEmail
  emailSubject.disabled = !usesEmail
  urgentRow.hidden = !includesNotice
  urgentCheckbox.disabled = !includesNotice
  noticeSubmit.textContent = {
    notice: '发布应用内公告',
    email: '发送邮件',
    both: '发布公告并发送邮件',
  }[delivery]
}

deliverySelect.addEventListener('change', updateDeliveryFields)

noticeForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  const form = event.currentTarget
  const button = form.querySelector('button[type="submit"]')
  const values = new FormData(form)
  const delivery = values.get('delivery')
  const level = values.get('urgent') === 'on' ? 'urgent' : 'info'
  if (delivery !== 'notice') {
    const includesNotice = delivery === 'both'
    const noticeCopy = includesNotice && level === 'urgent' ? '并发布紧急应用内公告' : includesNotice ? '并发布应用内公告' : ''
    if (!window.confirm(`将向当前全部邮箱订阅者发送邮件${noticeCopy}。${level === 'urgent' && includesNotice ? '紧急公告会提醒应用内用户。' : ''}确认继续吗？`)) return
  } else if (level === 'urgent' && !window.confirm('这条公告会以紧急级别展示给所有用户，确认发布吗？')) {
    return
  }

  button.disabled = true
  button.textContent = '正在发布…'
  workspaceMessage.hidden = true
  try {
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

document.querySelector('#load-subscribers').addEventListener('click', async (event) => {
  const button = event.currentTarget
  const list = document.querySelector('#subscribers-list')
  const count = document.querySelector('#subscribers-count')
  button.disabled = true
  count.textContent = '正在加载…'
  try {
    const result = await adminRequest('/admin/api/subscribers')
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
    count.textContent = '加载失败'
    showEmpty(list, error.message || '无法读取订阅者名单。')
  } finally {
    button.disabled = false
  }
})

document.querySelector('#load-feedback').addEventListener('click', async (event) => {
  const button = event.currentTarget
  const list = document.querySelector('#feedback-list')
  const count = document.querySelector('#feedback-count')
  button.disabled = true
  count.textContent = '正在加载…'
  try {
    const result = await adminRequest('/admin/api/feedback')
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
    count.textContent = '加载失败'
    showEmpty(list, error.message || '无法读取用户反馈。')
  } finally {
    button.disabled = false
  }
})
