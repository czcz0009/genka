import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

const root = document.getElementById('root')!
const app = (
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// 本番ビルドでは本文がHTMLに書き出し済み(scripts/prerender.mjs)なので、それに動きを付けるだけにする。
// 開発サーバー(pnpm dev)では中身が空なので、従来どおり描画する。
if (root.hasChildNodes()) {
  ReactDOM.hydrateRoot(root, app)
} else {
  ReactDOM.createRoot(root).render(app)
}
