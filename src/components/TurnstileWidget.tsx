"use client";

import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile(画像認証)の表示(2026-10-28)。考え方と文言は src/lib/auth/captcha.ts。
 * - Cloudflareのスクリプトは1回だけ読み込む。15秒で読み込めなければ onLoadError(画面には日本語の案内を出す)。
 * - 結果(トークン)は1回きりなので、送ったあとは親が key を変えて作り直す。
 * - 幅は親に合わせる(size: flexible。最小300px)。置き場所が300pxより狭いとき(320pxのスマホ等)は、小さい表示(compact、
 *   150px幅)にして、はみ出さないようにする(2026-10-28、320pxで画面が横にはみ出したため)。
 */

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const LOAD_TIMEOUT_MS = 15_000;
let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loading) return loading;
  loading = new Promise<TurnstileApi>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), LOAD_TIMEOUT_MS);
    const s = document.createElement("script");
    s.src = SCRIPT_URL;
    s.async = true;
    s.onload = () => {
      clearTimeout(timer);
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("no turnstile"));
    };
    s.onerror = () => {
      clearTimeout(timer);
      reject(new Error("load error"));
    };
    document.head.appendChild(s);
  }).catch((e) => {
    loading = null; // 次に開いたときに、もう一度読み込みを試せるように
    throw e;
  });
  return loading;
}

export function TurnstileWidget({
  siteKey,
  onToken,
  onExpire,
  onError,
  onLoadError,
}: {
  siteKey: string;
  onToken: (token: string) => void;
  onExpire: () => void;
  onError: () => void;
  onLoadError: () => void;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  // 親が毎回つくり直す関数でも、最新のものを呼ぶ(作り直しのたびに画像認証を描き直さない)
  const handlers = useRef({ onToken, onExpire, onError, onLoadError });
  useEffect(() => {
    handlers.current = { onToken, onExpire, onError, onLoadError };
  });

  useEffect(() => {
    let widgetId: string | null = null;
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled || !boxRef.current) return;
        const narrow = boxRef.current.clientWidth < 300;
        widgetId = api.render(boxRef.current, {
          sitekey: siteKey,
          language: "ja",
          size: narrow ? "compact" : "flexible",
          callback: (token: string) => handlers.current.onToken(token),
          "expired-callback": () => handlers.current.onExpire(),
          "error-callback": () => {
            handlers.current.onError();
            return true; // Cloudflare側の既定のエラー表示を出さず、こちらの日本語の案内を出す
          },
        });
      })
      .catch(() => {
        if (!cancelled) handlers.current.onLoadError();
      });
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey]);

  return <div ref={boxRef} className="w-full min-w-0 max-w-full overflow-hidden" data-testid="turnstile" />;
}
