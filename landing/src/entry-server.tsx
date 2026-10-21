import React from 'react'
import { renderToString } from 'react-dom/server'
import App from './App'

/**
 * ビルド時のプリレンダリング用(scripts/prerender.mjs から呼ぶ)。
 * ページの本文をHTMLとして書き出し、JavaScriptが動く前から検索エンジン・SNSに読めるようにする。
 * ブラウザ側(main.tsx)と同じ部品を描くので、見た目は変わらない。
 */
export function render(): string {
  return renderToString(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}
