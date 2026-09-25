"use client";

import { useEffect } from "react";

/**
 * <input type="number">にカーソルを乗せた状態で画面をスクロールすると、
 * ブラウザの既定動作で値が意図せず増減してしまう問題への対策。
 *
 * フォーカスが当たっている数値入力からフォーカスを外すだけなので、
 * ページ自体のスクロールは妨げない(preventDefaultはしない)。
 * アプリ全体で数値入力欄が非常に多い(売価・仕入単価・分量など)ため、
 * 1つ1つの入力欄に個別の対策を入れるのではなく、(app)/layout.tsxに
 * この1コンポーネントを置くだけで全画面に効くようにしている。
 */
export function NumberInputScrollGuard() {
  useEffect(() => {
    function handleWheel() {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement && active.type === "number") {
        active.blur();
      }
    }
    window.addEventListener("wheel", handleWheel, { passive: true });
    return () => window.removeEventListener("wheel", handleWheel);
  }, []);

  return null;
}
