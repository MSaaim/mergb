const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kb', {
  listDevices:   ()     => ipcRenderer.invoke('kb:list-devices'),
  connect:       ()     => ipcRenderer.invoke('kb:connect'),
  disconnect:    ()     => ipcRenderer.invoke('kb:disconnect'),
  setStatic:     (args) => ipcRenderer.invoke('kb:static', args),
  setOff:        (args) => ipcRenderer.invoke('kb:off', args),
  setBreathing:  (args) => ipcRenderer.invoke('kb:breathing', args),
  setWave:       (args) => ipcRenderer.invoke('kb:wave', args),
  setReactive:   (args) => ipcRenderer.invoke('kb:reactive', args),
  setTornado:    (args) => ipcRenderer.invoke('kb:tornado', args),
  setYeti:       (args) => ipcRenderer.invoke('kb:yeti', args),
  setMatrix:     (args) => ipcRenderer.invoke('kb:matrix', args),
  setCustom:     (args) => ipcRenderer.invoke('kb:custom', args),
  readCurrentMode: ()  => ipcRenderer.invoke('kb:read-mode'),
  saveState:    (s)    => ipcRenderer.invoke('kb:save-state', s),
  loadPresets:  ()     => ipcRenderer.invoke('kb:presets-load'),
  savePresets:  (p)    => ipcRenderer.invoke('kb:presets-save', p),
  switchProfile: (args) => ipcRenderer.invoke('kb:profile-switch', args),
  sendVizFrame: (args) => ipcRenderer.invoke('kb:viz-frame', args),
  pauseKeepalive:  () => ipcRenderer.invoke('kb:pause-keepalive'),
  resumeKeepalive: () => ipcRenderer.invoke('kb:resume-keepalive'),
  lightOnly:     (args) => ipcRenderer.invoke('kb:light-only', args),
  onAutoConnected:    (cb) => { ipcRenderer.on('kb:auto-connected', (_, d) => cb(d)); },
  onAutoDisconnected: (cb) => { ipcRenderer.on('kb:auto-disconnected', () => cb()); },
  onTrayEffectChanged: (cb) => { ipcRenderer.on('tray:effect-changed', (_, effect) => cb(effect)); },
  startGlobalKeys: () => ipcRenderer.invoke('kb:start-global-keys'),
  stopGlobalKeys:  () => ipcRenderer.invoke('kb:stop-global-keys'),
  onGlobalKey:     (cb) => { ipcRenderer.on('global:keydown', (_, keycode) => cb(keycode)); },
});

contextBridge.exposeInMainWorld('desktop', {
  getSources: () => ipcRenderer.invoke('desktop:get-sources'),
  grabFrame:  () => ipcRenderer.invoke('screen:grab-frame'),
});

contextBridge.exposeInMainWorld('appInfo', {
  isFirstLaunch: () => ipcRenderer.invoke('app:is-first-launch'),
  dismissCloseBanner: () => ipcRenderer.invoke('app:dismiss-close-banner'),
  setCurrentEffect: (e) => ipcRenderer.invoke('app:set-current-effect', e),
  hideToTray: () => ipcRenderer.invoke('app:hide-to-tray'),
  onCloseToTray: (cb) => { ipcRenderer.on('app:close-to-tray', () => cb()); },
  onUpdateStatus: (cb) => { ipcRenderer.on('update:status', (_, d) => cb(d)); },
});

contextBridge.exposeInMainWorld('mc', {
  start:      ()     => ipcRenderer.invoke('mc:start'),
  stop:       ()     => ipcRenderer.invoke('mc:stop'),
  setLogPath: (p)    => ipcRenderer.invoke('mc:set-log-path', { path: p }),
  onEvent:    (cb)   => { const fn = (_, d) => cb(d); ipcRenderer.on('mc:event', fn); return fn; },
  onStatus:   (cb)   => { const fn = (_, d) => cb(d); ipcRenderer.on('mc:status', fn); return fn; },
  offEvent:   (fn)   => ipcRenderer.removeListener('mc:event', fn),
  offStatus:  (fn)   => ipcRenderer.removeListener('mc:status', fn),
});
