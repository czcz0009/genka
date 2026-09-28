/**
 * サービスの表示名。今後改名する場合は、この1か所だけを書き換える。
 *
 * これはアプリ側(Next.js)専用の定数で、LP(landing/)は別プロジェクト
 * なのでこの値をimportできない。LP側は landing/src/App.tsx の
 * SERVICE_NAME、および landing/.figma/make/site.json の title/description
 * (HTMLの<title>・OGP用。ビルド前のJSONなのでJSの定数を参照できない)を
 * 別途書き換える必要がある。改名時はこの3箇所を必ずセットで確認すること。
 */
export const SERVICE_NAME = "原価レンズ";
