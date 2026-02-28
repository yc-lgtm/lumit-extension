const $ = (id) => document.getElementById(id)

const ui = {
  chat: $('chat'),
  input: $('input'),
  sendBtn: $('sendBtn'),
  micBtn: $('micBtn'),
  stopBtn: $('stopBtn'),
  menuStopBtn: $('menuStopBtn'),
  thinkBar: $('thinkBar'),
  tetrisLoader: $('tetrisLoader'),
  tetrisGrid: $('tetrisGrid'),
  modelSelect: $('modelSelect'),
  attachBtn: $('attachBtn'),
  attachmentsEl: $('attachments'),
  shareFilesToggle: $('shareFilesToggle'),
  statusBadge: $('statusBadge'),
  statusText: $('statusText'),
  statusIcon: $('statusIcon'),
  avatarAnchor: $('avatarAnchor'),
  avatarBtn: $('avatarBtn'),
  avatarPopover: $('avatarPopover'),
  avatarLabel: $('avatarLabel'),
  avatarGlyphBtn: $('avatarGlyphBtn'),
  avatarGlyphMain: $('avatarGlyphMain'),
  avatarGrid: $('avatarGrid'),
  avatarSettings: $('avatarSettings'),
  avatarSignout: $('avatarSignout'),
  emptyState: $('emptyState'),
  navBar: $('navBar'),
  fileTreeDir: $('fileTreeDir'),
  fileTreeDepth: $('fileTreeDepth'),
  refreshTreeBtn: $('refreshTreeBtn'),
  fileTree: $('fileTree'),
  historyList: $('historyList'),
  clearHistoryBtn: $('clearHistoryBtn'),
  localOnlyToggle: $('localOnlyToggle'),
  toolTriggerBtn: $('toolTriggerBtn'),
  toolMenu: $('toolMenu'),
  activeToolPill: $('activeToolPill'),
  activeToolText: $('activeToolText')
}

const chips = {
  studio: $('chip-studio'),
  blender: $('chip-blender'),
  slides: $('chip-slides'),
  gmail: $('chip-gmail'),
  files: $('chip-files'),
  web: $('chip-web'),
  codex: $('chip-codex')
}

const state = {
  currentBubble: null,
  isRecording: false,
  taskRunning: false,
  recognition: null,
  attachments: [],
  history: [],
  historySeq: 0,
  activeHistoryId: null,
  selectedTool: null,
  localOnly: true,
  fileTreeLoaded: false,
  currentView: 'chat',
  tetrisTimer: null,
  tetrisFrame: 0
}

const tools = [
  { id: 'writeCode', label: 'Write / Code' },
  { id: 'searchWeb', label: 'Search Web' },
  { id: 'createImage', label: 'Create Image' },
  { id: 'deepResearch', label: 'Deep Research' },
  { id: 'thinkLonger', label: 'Think Longer' }
]

const avatarOptions = ['prism', 'neon', 'ember', 'sage']

const tetrisShapes = [
  [[1, 0], [1, 1], [1, 2], [1, 3]],
  [[0, 1], [1, 1], [2, 1], [2, 0]],
  [[0, 1], [1, 1], [2, 1], [0, 0]],
  [[1, 0], [2, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [1, 1], [2, 1]],
  [[1, 0], [0, 1], [1, 1], [2, 1]],
  [[0, 0], [1, 0], [0, 1], [1, 1]]
]

function escapeHtml(text = '') {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function statusIconMarkup(type) {
  if (type === 'thinking') return '<path d="M12 3a9 9 0 1 0 9 9"/><path d="M12 3v4"/>'
  if (type === 'connected') return '<path d="M2 8a16 16 0 0 1 20 0"/><path d="M5 12a11 11 0 0 1 14 0"/><circle cx="12" cy="19" r="1"/>'
  if (type === 'error') return '<circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16h.01"/>'
  return '<path d="M4 12h16"/><path d="M12 4v16"/>'
}

function setStatus(type) {
  ui.statusBadge.classList.remove('idle', 'connected', 'thinking', 'error')
  ui.statusBadge.classList.add(type)
  ui.statusText.textContent = type === 'thinking' ? 'Thinking' : type === 'connected' ? 'Connected' : type === 'error' ? 'Error' : 'Ready'
  ui.statusIcon.innerHTML = statusIconMarkup(type)
}

function fmtBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function resetActiveChips() {
  Object.values(chips).forEach((chip) => chip?.classList.remove('active'))
}

function markTarget(target) {
  resetActiveChips()
  if (chips[target]) chips[target].classList.add('active')
}

function scrollChatToBottom() {
  ui.chat.scrollTop = ui.chat.scrollHeight
}

function updateEmptyState() {
  const hasMessages = ui.chat.children.length > 0
  ui.emptyState.classList.toggle('hidden', hasMessages)
}

function addMsg(role, text) {
  const row = document.createElement('div')
  row.className = `msg ${role}`

  const bubble = document.createElement('div')
  bubble.className = 'bubble'
  bubble.textContent = text

  row.appendChild(bubble)
  ui.chat.appendChild(row)
  if (role === 'lumit') state.currentBubble = bubble

  updateEmptyState()
  scrollChatToBottom()
  return bubble
}

function addSystemMsg(text) {
  addMsg('lumit', text)
}

function addStep(update, stepState = 'live') {
  if (!state.currentBubble) addSystemMsg('')

  const line = document.createElement('div')
  line.className = `step ${stepState}`

  const icon = document.createElement('span')
  icon.className = 'icon'
  icon.textContent = stepState === 'ok' ? 'OK' : stepState === 'fail' ? 'X' : ''

  const label = document.createElement('span')
  label.textContent = update.message || ''

  line.append(icon, label)
  state.currentBubble.appendChild(line)
  scrollChatToBottom()
}

function finalise(update) {
  if (update?.result) addSystemMsg(JSON.stringify(update.result, null, 2))
  resetActiveChips()
}

function ensureTetrisGrid() {
  ui.tetrisGrid.innerHTML = ''
  for (let i = 0; i < 16; i += 1) {
    const cell = document.createElement('div')
    cell.className = 'tetris-cell'
    ui.tetrisGrid.appendChild(cell)
  }
}

function drawTetrisFrame() {
  const cells = Array.from(ui.tetrisGrid.children)
  cells.forEach((cell) => cell.classList.remove('on'))

  const shape = tetrisShapes[Math.floor(state.tetrisFrame / 6) % tetrisShapes.length]
  const offsetY = (state.tetrisFrame % 6) - 2

  for (const [x, y] of shape) {
    const yy = y + offsetY
    if (yy >= 0 && yy < 4 && x >= 0 && x < 4) {
      cells[yy * 4 + x]?.classList.add('on')
    }
  }

  state.tetrisFrame += 1
}

function startTetris() {
  if (state.tetrisTimer) return
  state.tetrisFrame = 0
  drawTetrisFrame()
  state.tetrisTimer = setInterval(drawTetrisFrame, 120)
}

function stopTetris() {
  if (!state.tetrisTimer) return
  clearInterval(state.tetrisTimer)
  state.tetrisTimer = null
  Array.from(ui.tetrisGrid.children).forEach((cell) => cell.classList.remove('on'))
}

function setTaskState(running) {
  state.taskRunning = running
  ui.sendBtn.disabled = running
  ui.stopBtn.classList.toggle('show', running)
  ui.menuStopBtn.classList.toggle('show', running)
  ui.thinkBar.classList.toggle('show', running)
  ui.tetrisLoader.classList.toggle('show', running)

  if (running) {
    setStatus('thinking')
    startTetris()
  } else {
    stopTetris()
    if (!ui.statusBadge.classList.contains('error')) setStatus('idle')
  }
}

function autoResize() {
  ui.input.style.height = 'auto'
  ui.input.style.height = `${Math.min(ui.input.scrollHeight, 110)}px`
}

function renderAttachments() {
  ui.attachmentsEl.innerHTML = ''

  for (const file of state.attachments) {
    const row = document.createElement('div')
    row.className = 'attachment-item'

    const left = document.createElement('span')
    left.textContent = `${file.name} (${fmtBytes(file.size || 0)})`

    const remove = document.createElement('button')
    remove.textContent = 'Remove'
    remove.addEventListener('click', () => {
      state.attachments = state.attachments.filter((f) => f.path !== file.path)
      renderAttachments()
    })

    row.append(left, remove)
    ui.attachmentsEl.appendChild(row)
  }
}

function addAttachment(file) {
  const existing = new Map(state.attachments.map((item) => [item.path, item]))
  existing.set(file.path, file)
  state.attachments = Array.from(existing.values())
  renderAttachments()
}

function closeAvatarPopover() {
  ui.avatarPopover.classList.add('hidden')
  ui.avatarBtn.setAttribute('aria-expanded', 'false')
}

function toggleAvatarPopover() {
  const isHidden = ui.avatarPopover.classList.contains('hidden')
  if (isHidden) {
    ui.avatarPopover.classList.remove('hidden')
    ui.avatarBtn.setAttribute('aria-expanded', 'true')
  } else {
    closeAvatarPopover()
  }
}

function setAvatar(name) {
  if (!avatarOptions.includes(name)) return

  ui.avatarGlyphBtn.className = `avatar-glyph ${name}`
  ui.avatarGlyphMain.className = `avatar-glyph ${name}`
  ui.avatarLabel.textContent = name.charAt(0).toUpperCase() + name.slice(1)

  document.querySelectorAll('.avatar-opt').forEach((el) => {
    el.classList.toggle('active', el.dataset.avatar === name)
  })

  localStorage.setItem('lumit_avatar', name)
}

function renderHistory() {
  ui.historyList.innerHTML = ''
  if (state.history.length === 0) {
    ui.historyList.innerHTML = '<div class="muted">No prompts yet.</div>'
    return
  }

  for (const item of [...state.history].reverse()) {
    const row = document.createElement('div')
    row.className = 'history-item'
    row.innerHTML = `
      <p>${escapeHtml(item.prompt)}</p>
      <div class="meta">status=${escapeHtml(item.status)} | target=${escapeHtml(item.target || '-')} | ${escapeHtml(item.time)}</div>
    `
    ui.historyList.appendChild(row)
  }
}

function createHistory(prompt) {
  state.historySeq += 1
  const item = {
    id: state.historySeq,
    prompt,
    status: 'running',
    target: '',
    time: new Date().toLocaleTimeString()
  }
  state.history.push(item)
  state.activeHistoryId = item.id
  renderHistory()
  return item.id
}

function patchHistory(id, patch) {
  const found = state.history.find((h) => h.id === id)
  if (!found) return
  Object.assign(found, patch)
  renderHistory()
}

function switchView(viewName) {
  state.currentView = viewName
  document.querySelectorAll('.view').forEach((view) => {
    view.classList.toggle('active', view.id === `view-${viewName}`)
  })
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === viewName)
  })

  if (viewName === 'files' && !state.fileTreeLoaded) {
    void loadFileTree()
  }
}

function setSelectedTool(toolId) {
  state.selectedTool = toolId
  const tool = tools.find((entry) => entry.id === toolId)
  if (!tool) {
    ui.activeToolPill.classList.add('hidden')
    ui.activeToolText.textContent = ''
    return
  }
  ui.activeToolText.textContent = tool.label
  ui.activeToolPill.classList.remove('hidden')
}

function renderToolMenu() {
  ui.toolMenu.innerHTML = ''
  for (const tool of tools) {
    const btn = document.createElement('button')
    btn.className = 'tool-item'
    btn.textContent = tool.label
    btn.addEventListener('click', () => {
      setSelectedTool(tool.id)
      ui.toolMenu.classList.add('hidden')
    })
    ui.toolMenu.appendChild(btn)
  }
}

function closeToolMenu() {
  ui.toolMenu.classList.add('hidden')
}

function applyLocalOnlyMode() {
  state.localOnly = Boolean(ui.localOnlyToggle.checked)
  if (state.localOnly) {
    ui.shareFilesToggle.checked = false
    ui.shareFilesToggle.disabled = true
  } else {
    ui.shareFilesToggle.disabled = false
  }
}

function localOnlyBlockReason(prompt) {
  if (!state.localOnly) return ''
  if (!prompt) return ''
  const blocked = /\b(web|search|google|browse|internet|gmail|email|slides|serper)\b/i
  if (blocked.test(prompt)) {
    return 'Local-only mode is on, so web/email/slides prompts are blocked.'
  }
  return ''
}

async function checkCodexStatus() {
  try {
    const res = await fetch('http://127.0.0.1:3000/api/codex-status')
    const data = await res.json()

    if (data.ready) {
      chips.codex.classList.add('on')
      chips.codex.title = 'VS Code Codex available'
      if (!state.taskRunning) setStatus('connected')
    } else {
      chips.codex.classList.remove('on')
      chips.codex.title = 'Open VS Code with the Lumit bridge extension'
      if (!state.taskRunning) setStatus('idle')
    }
    return Boolean(data.ready)
  } catch {
    chips.codex.classList.remove('on')
    if (!state.taskRunning) setStatus('idle')
    return false
  }
}

function renderTreeNode(node, depth = 0) {
  const safeName = escapeHtml(node.name || '')
  const encodedPath = encodeURIComponent(node.path || '')

  if (node.type === 'file') {
    return `<button class="tree-file" data-path="${encodedPath}" title="Attach ${safeName}">${safeName}</button>`
  }

  const children = Array.isArray(node.children) ? node.children.map((child) => renderTreeNode(child, depth + 1)).join('') : '<div class="muted">empty</div>'
  const opened = depth < 2 ? ' open' : ''
  return `<details${opened}><summary>${safeName}</summary><div style="margin-left:10px">${children}</div></details>`
}

async function loadFileTree() {
  const dir = ui.fileTreeDir.value.trim() || '.'
  const depth = Number(ui.fileTreeDepth.value || 3)

  ui.fileTree.innerHTML = '<div class="muted">Loading file tree...</div>'
  try {
    const res = await fetch(`http://127.0.0.1:3000/api/file-tree?dir=${encodeURIComponent(dir)}&depth=${encodeURIComponent(depth)}`)
    const data = await res.json()
    if (!res.ok || !data.ok) {
      ui.fileTree.innerHTML = `<div class="muted">Failed: ${escapeHtml(data.error || 'unknown error')}</div>`
      return
    }

    ui.fileTree.innerHTML = renderTreeNode(data.tree)
    state.fileTreeLoaded = true
  } catch (error) {
    ui.fileTree.innerHTML = `<div class="muted">Failed: ${escapeHtml(error.message || 'network error')}</div>`
  }
}

async function send() {
  const text = ui.input.value.trim()
  if (!text || state.taskRunning) return

  const blockedReason = localOnlyBlockReason(text)
  if (blockedReason) {
    addSystemMsg(blockedReason)
    return
  }

  addMsg('user', text)
  ui.input.value = ''
  autoResize()

  const historyId = createHistory(text)
  setTaskState(true)
  state.currentBubble = null

  try {
    const response = await window.api.sendPrompt({
      prompt: text,
      attachments: state.attachments,
      shareAttachmentContents: ui.shareFilesToggle.checked,
      selectedTool: state.selectedTool || undefined,
      localOnly: state.localOnly
    })

    if (!response?.success) {
      patchHistory(historyId, { status: 'error' })
      addStep({ message: response?.error || 'Request failed.' }, 'fail')
      setTaskState(false)
      setStatus('error')
    }
  } catch (error) {
    patchHistory(historyId, { status: 'error' })
    addSystemMsg(`Error: ${error.message}`)
    setTaskState(false)
    setStatus('error')
  }
}

async function handleAttach() {
  const picked = await window.api.pickFiles()
  if (!picked || picked.length === 0) return
  for (const file of picked) addAttachment(file)
}

async function attachFromWorkspace(relativePath) {
  try {
    const attached = await window.api.attachWorkspaceFile(relativePath)
    if (attached?.path) {
      addAttachment(attached)
      addSystemMsg(`Attached: ${relativePath}`)
    }
  } catch (error) {
    addSystemMsg(`Unable to attach "${relativePath}": ${error.message}`)
    ui.input.value = `Read file "${relativePath}" and help me edit it safely.`
    autoResize()
  }
}

function setupVoice() {
  if (!('webkitSpeechRecognition' in window)) return

  state.recognition = new webkitSpeechRecognition()
  state.recognition.lang = 'en-US'
  state.recognition.continuous = false
  state.recognition.interimResults = false

  state.recognition.onresult = (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript || ''
    ui.input.value = transcript
    autoResize()
  }

  state.recognition.onstart = () => {
    state.isRecording = true
    ui.micBtn.classList.add('recording')
  }

  state.recognition.onend = () => {
    state.isRecording = false
    ui.micBtn.classList.remove('recording')
  }
}

ui.input.addEventListener('input', autoResize)
ui.input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    void send()
  }
})

ui.sendBtn.addEventListener('click', () => void send())
ui.attachBtn.addEventListener('click', () => void handleAttach())
ui.menuStopBtn.addEventListener('click', () => window.api.stopTask())
ui.stopBtn.addEventListener('click', () => window.api.stopTask())

ui.avatarBtn.addEventListener('click', (event) => {
  event.stopPropagation()
  toggleAvatarPopover()
})

ui.avatarGrid.querySelectorAll('.avatar-opt').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.stopPropagation()
    setAvatar(button.dataset.avatar)
  })
})

ui.avatarSettings.addEventListener('click', () => {
  closeAvatarPopover()
  switchView('settings')
})

ui.avatarSignout.addEventListener('click', () => {
  closeAvatarPopover()
  addSystemMsg('Sign out is disabled in local mode.')
})

ui.modelSelect.addEventListener('change', async () => {
  const [provider, model] = ui.modelSelect.value.split('|')
  await window.api.setModel(provider, model)
  if (provider === 'codex') {
    const ready = await checkCodexStatus()
    if (!ready) addSystemMsg('Warning: Codex requires VS Code with the Lumit bridge extension.')
  }
})

ui.micBtn.addEventListener('click', () => {
  if (!state.recognition) {
    addSystemMsg('Voice recognition is unavailable in this environment.')
    return
  }
  if (state.isRecording) state.recognition.stop()
  else state.recognition.start()
})

ui.navBar.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => switchView(btn.dataset.view))
})

document.querySelectorAll('.quick button').forEach((btn) => {
  btn.addEventListener('click', () => {
    ui.input.value = btn.dataset.prompt || ''
    autoResize()
    ui.input.focus()
  })
})

ui.refreshTreeBtn.addEventListener('click', () => void loadFileTree())
ui.fileTreeDepth.addEventListener('change', () => void loadFileTree())
ui.fileTree.addEventListener('click', (event) => {
  const fileBtn = event.target.closest('.tree-file')
  if (!fileBtn) return
  void attachFromWorkspace(decodeURIComponent(fileBtn.dataset.path || ''))
})

ui.clearHistoryBtn.addEventListener('click', () => {
  state.history = []
  renderHistory()
})

ui.localOnlyToggle.addEventListener('change', applyLocalOnlyMode)

ui.toolTriggerBtn.addEventListener('click', (event) => {
  event.stopPropagation()
  ui.toolMenu.classList.toggle('hidden')
})

ui.activeToolPill.addEventListener('click', () => setSelectedTool(null))

document.addEventListener('click', (event) => {
  if (!ui.avatarAnchor.contains(event.target)) closeAvatarPopover()
  if (!ui.toolMenu.contains(event.target) && event.target !== ui.toolTriggerBtn) closeToolMenu()
})

window.api.onFocusInput(() => ui.input.focus())

window.api.onStopTask(() => {
  setTaskState(false)
  setStatus('idle')
  if (state.activeHistoryId) patchHistory(state.activeHistoryId, { status: 'stopped' })
  addSystemMsg('Task stopped.')
})

window.api.onClearChat(() => {
  ui.chat.innerHTML = ''
  state.currentBubble = null
  updateEmptyState()
  addSystemMsg('Chat cleared.')
})

window.api.onUpdate((update) => {
  switch (update.status) {
    case 'thinking':
    case 'generating':
      setStatus('thinking')
      addStep(update, 'live')
      break
    case 'routing':
      addStep(update, 'live')
      markTarget(update.target)
      if (state.activeHistoryId) patchHistory(state.activeHistoryId, { target: update.target || '' })
      break
    case 'executing':
    case 'acting':
      addStep(update, 'live')
      break
    case 'done':
      setTaskState(false)
      setStatus('connected')
      addStep(update, 'ok')
      if (state.activeHistoryId) patchHistory(state.activeHistoryId, { status: 'done' })
      finalise(update)
      break
    case 'error':
      setTaskState(false)
      setStatus('error')
      addStep(update, 'fail')
      if (state.activeHistoryId) patchHistory(state.activeHistoryId, { status: 'error' })
      break
    case 'model':
      addSystemMsg(update.message)
      break
    default:
      addStep(update, 'live')
      break
  }
})

setupVoice()
ensureTetrisGrid()
renderToolMenu()
setSelectedTool(null)
autoResize()
renderAttachments()
renderHistory()
applyLocalOnlyMode()
updateEmptyState()

const savedAvatar = localStorage.getItem('lumit_avatar') || 'prism'
setAvatar(savedAvatar)
setStatus('idle')

addSystemMsg('Lumit UI upgraded: navigation, file tree, tools dropdown, history, and Tetris loader are active.')

void checkCodexStatus()
setInterval(() => void checkCodexStatus(), 30000)
