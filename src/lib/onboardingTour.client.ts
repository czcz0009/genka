import type { Driver, DriveStep } from "driver.js";

/**
 * 初回オンボーディングツアーのステップ定義・起動処理。
 *
 * ハイライト対象は「サイドバーの各ナビ項目」に統一している(実際のページを
 * 遷移して回らない)。理由: このツアーはメニュー0件の新規ユーザー向けが前提だが、
 * その状態では原価率・アラート等の「見せたい実物」がまだ画面に存在しないため、
 * 各ページに飛んでもハイライトできる要素がほとんど無い。サイドバーは常に
 * 存在するので、どのページから起動しても・メニューが登録済みでも壊れない。
 *
 * ダッシュボードの「Excelから取り込む」「手入力で始める」ボタン(data-tour=
 * "start-import"/"start-manual", StartHerePrompt.tsx)だけは実物をハイライトする。
 * これらは他の画面(メニュー一覧・ランキング等)の空状態にも同じコンポーネントが
 * 使われているため、ダッシュボード以外から起動してもDOM上に見つかれば表示される。
 */
function buildSteps(): DriveStep[] {
  const steps: DriveStep[] = [];

  const hasStartButtons =
    document.querySelector('[data-tour="start-import"]') != null &&
    document.querySelector('[data-tour="start-manual"]') != null;

  if (hasStartButtons) {
    steps.push(
      {
        element: '[data-tour="start-import"]',
        popover: {
          title: "① メニューを登録する(その1)",
          description:
            "Excelやスプレッドシートでメニューを管理しているなら、ここから取り込むのが早いです。列の対応付けは自動で判定します。",
        },
      },
      {
        element: '[data-tour="start-manual"]',
        popover: {
          title: "① メニューを登録する(その2)",
          description: "表が無くても大丈夫です。ここから手入力で、1品だけでも1分ほどで登録できます。",
        },
      },
    );
  }

  // md未満(スマホ幅)ではサイドバーがドロワーの中に隠れており、ドロワーを
  // 開かない限りDOM上に存在しない。ドロワーの開閉を外部から操作する仕組みは
  // まだ無いため、スマホ幅では個別のハイライトはせず、まとめて文章で案内する。
  const isDesktopSidebarVisible = window.matchMedia("(min-width: 768px)").matches;

  if (isDesktopSidebarVisible) {
    steps.push(
      {
        element: '[data-tour="nav-menus"]',
        popover: {
          title: "② 原価計算",
          description:
            "メニューを登録すると、ここに原価・原価率が一覧で表示されます。目標の原価率を超えているメニューは色が変わって分かります。",
        },
      },
      {
        element: '[data-tour="nav-ranking"]',
        popover: {
          title: "③ 今見直すべきメニュー",
          description:
            "原価率が目標を超えている・利益への影響が大きいメニューを、優先度の高い順に並べて教えてくれます。値上げの目安額もここで分かります。",
        },
      },
      {
        element: '[data-tour="nav-alerts"]',
        popover: {
          title: "④ 仕入れ値アラート",
          description:
            "野菜(青果物)や肉(畜産物)の市場価格が大きく動いた時に知らせてくれます。畜産物は東京市場、青果物は全国主要な卸売市場の参考値なので、実際の仕入れ値そのものとは差が出ることがあります。",
        },
      },
      {
        element: '[data-tour="nav-settings"]',
        popover: {
          title: "⑤ 設定",
          description:
            "お店全体の目標原価率・家賃はここで設定します(人件費だけは「FL比率」画面から月ごとに入力します)。",
        },
      },
    );
  } else {
    steps.push({
      popover: {
        title: "② 他の画面について",
        description:
          "左上のメニューボタンから「原価計算」「今見直すべきメニュー」「仕入れ値アラート」「設定」の各画面に移動できます。",
      },
    });
  }

  steps.push({
    popover: {
      title: "案内は以上です",
      description: "この案内は、設定画面の「案内をもう一度見る」からいつでも見返せます。",
    },
  });

  return steps;
}

let activeDriver: Driver | null = null;

/**
 * オンボーディングツアーを起動する。「完了」「スキップ(閉じる)」どちらで
 * 終わっても onFinish を呼ぶ(呼び出し側でcompleteOnboardingの保存等に使う)。
 */
export async function runOnboardingTour(onFinish?: () => void): Promise<void> {
  if (activeDriver?.isActive()) return;

  // CSS(driver.js/dist/driver.css)は常にマウントされているOnboardingTour.tsx側で
  // 静的importしている(このファイルは"use client"では無いため、動的importでの
  // CSS読み込みに対応していないバンドラ設定でも問題が起きないようにするため)。
  const { driver } = await import("driver.js");

  const steps = buildSteps();

  activeDriver = driver({
    showProgress: true,
    allowClose: true,
    nextBtnText: "次へ",
    prevBtnText: "戻る",
    doneBtnText: "閉じる",
    steps,
    onDestroyed: () => {
      activeDriver = null;
      onFinish?.();
    },
  });
  activeDriver.drive();
}
