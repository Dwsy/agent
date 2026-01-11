import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// 拦截并阻止 source map 请求
const originalFetch = window.fetch
window.fetch = function(...args) {
  const url = args[0] as string
  if (url && url.includes('.map')) {
    return Promise.reject(new Error('Source map blocked'))
  }
  return originalFetch.apply(this, args)
}

// 拦截 XMLHttpRequest
const originalXHROpen = XMLHttpRequest.prototype.open
// @ts-ignore
XMLHttpRequest.prototype.open = function(method: string, url: string | URL, ...args: any[]) {
  if (typeof url === 'string' && url.includes('.map')) {
    throw new Error('Source map blocked')
  }
  // @ts-ignore
  return originalXHROpen.call(this, method, url, ...args)
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)