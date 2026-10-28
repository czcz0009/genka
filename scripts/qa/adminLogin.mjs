// 手元の画面確認スクリプト用: 管理者の機能で、使い捨てアカウントのログイン状態を作り、ブラウザのcookieに入れる(2026-10-28)。
//
// 背景: 2026-10-28にSupabaseの画像認証(Turnstile)をオンにしたため、自動操作のブラウザはログイン画面から入れない
// (本番はCloudflareにロボットと判定され、手元はテスト用のキーの結果をSupabaseが断る)。
// 方法: 管理者の機能(generateLink)で1回きりのログイン用の印を発行 → 公開の鍵で印をログイン状態に交換(verifyOtp。画像認証の対象外)
//       → @supabase/ssr と同じ形のcookie(sb-<プロジェクト>-auth-token)をブラウザに入れる。
// 守ること: 管理者用の鍵は、手元のスクリプトだけで使う。本番のアプリには持ち込まない(Mahiroの指示、2026-10-28)。
//           使えるのは、メールアドレスの先頭が tmp-demo- の使い捨てアカウントだけ。
import { createClient } from "@supabase/supabase-js";

const CHUNK = 3180; // @supabase/ssr のcookieの1つあたりの上限(これを超えると .0 .1 に分ける)

/**
 * @param {import("playwright").BrowserContext} context
 * @param {string} email 使い捨てアカウントのメールアドレス(tmp-demo- で始まること)
 * @param {string} appUrl 例: http://localhost:3100
 */
export async function adminLogin(context, email, appUrl) {
  if (!email.startsWith("tmp-demo-")) throw new Error("adminLogin は使い捨てアカウント(tmp-demo-)だけに使えます");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkErr) throw new Error(`ログイン用の印を発行できませんでした: ${linkErr.message}`);
  const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error || !data.session) throw new Error(`ログイン状態を作れませんでした: ${error?.message ?? "セッションなし"}`);

  const ref = new URL(url).hostname.split(".")[0];
  const name = `sb-${ref}-auth-token`;
  const value = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
  const host = new URL(appUrl).hostname;
  const base = { domain: host, path: "/", sameSite: "Lax", httpOnly: false, secure: appUrl.startsWith("https") };
  const cookies =
    value.length <= CHUNK
      ? [{ ...base, name, value }]
      : Array.from({ length: Math.ceil(value.length / CHUNK) }, (_, i) => ({ ...base, name: `${name}.${i}`, value: value.slice(i * CHUNK, (i + 1) * CHUNK) }));
  await context.addCookies(cookies);
  return data.session.user.id;
}
