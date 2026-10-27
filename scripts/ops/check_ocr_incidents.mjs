// 毎朝の確認: 納品書の読み取りで、AI側の都合(残高不足など)の失敗が起きていないか(2026-10-27)。
//   node --env-file=.env.local scripts/ops/check_ocr_incidents.mjs [--test-toast]
// - DBの ocr_service_incidents(種類と日時だけ。個人の情報は入っていない)を、直近26時間分だけ読む(読むだけ)。
// - 記録があれば、Windowsの通知を出し、<ホーム>/genka-demo/お知らせ.txt に1行追記する。無ければ何もしない。
// - --test-toast を付けると、記録が無くても試しの通知を1回出す(通知が出るかの確認用)。
// 毎朝8時に scripts/shunpo/run_shunpo.cmd から呼ぶ(旬報の下書きと同じタスク)。
import { createClient } from "@supabase/supabase-js";
import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const LABEL = { credit: "Anthropicの残高不足(残高を足してください)", auth: "AIの鍵の問題(VercelのANTHROPIC_API_KEYを確かめてください)", busy: "AI側の混雑・障害・通信の失敗" };
const test = process.argv.includes("--test-toast");

function toast(title, body) {
  // Windows PowerShell 5.1 の通知(追加の部品は使わない)。文字は環境変数で渡す(引用符の問題を避けるため)
  const ps = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
$t = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$x = $t.GetElementsByTagName('text')
$x.Item(0).AppendChild($t.CreateTextNode($env:GENKA_TOAST_TITLE)) > $null
$x.Item(1).AppendChild($t.CreateTextNode($env:GENKA_TOAST_BODY)) > $null
$app = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show([Windows.UI.Notifications.ToastNotification]::new($t))`;
  spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps], {
    env: { ...process.env, GENKA_TOAST_TITLE: title, GENKA_TOAST_BODY: body },
    stdio: "ignore",
  });
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const since = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
const { data, error } = await supabase.from("ocr_service_incidents").select("kind, occurred_at").gte("occurred_at", since);
const dir = join(homedir(), "genka-demo");
mkdirSync(dir, { recursive: true });
const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
if (error) {
  appendFileSync(join(dir, "お知らせ.txt"), `${now} 読み取りの記録を確かめられませんでした(${error.message})\n`);
  console.log("記録を読めませんでした:", error.message);
  process.exit(1);
}
const counts = {};
for (const r of data ?? []) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
const kinds = Object.keys(counts);
if (kinds.length) {
  const body = kinds.map((k) => `${LABEL[k] ?? k}: ${counts[k]}件`).join(" / ");
  appendFileSync(join(dir, "お知らせ.txt"), `${now} 納品書の読み取りで、AI側の都合の失敗がありました(直近26時間)。${body}\n`);
  toast("原価レンズ: 読み取りの失敗があります", body);
  console.log("通知:", body);
} else {
  console.log(`${now} 直近26時間に、AI側の都合の失敗はありません`);
  if (test) toast("原価レンズ: 通知のテスト", "毎朝の確認の通知は、このように表示されます");
}
