const { contextBridge, ipcRenderer } = require('electron')

function on(channel, callback) {
  const handler = (_event, payload) => callback(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('api', {
  sendPrompt: (payload) => ipcRenderer.invoke('send-prompt', payload),
  setModel: (provider, model) => ipcRenderer.invoke('set-model', { provider, model }),
  stopTask: () => ipcRenderer.invoke('stop-task'),
  pickFiles: () => ipcRenderer.invoke('pick-files'),
  attachWorkspaceFile: (relativePath) => ipcRenderer.invoke('attach-workspace-file', { relativePath }),

  onUpdate: (callback) => on('update', callback),
  onFocusInput: (callback) => on('focus-input', callback),
  onStopTask: (callback) => on('stop-task', callback),
  onClearChat: (callback) => on('clear-chat', callback)
})
