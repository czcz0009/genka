import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSessionStore, getIngredientPriceHistory, getCategories } from "@/lib/store";
import { categoryTabToParam, parseCategoryTab, sortCategories } from "@/lib/categories";
import { currentMonthString, monthToPeriod } from "@/lib/period/month.ts";
import { withResolvedPrepItemPrices, resolveUnsetLeaves } from "@/lib/prepItemCost";
import { evaluateMenuPriceChangeImpact } from "@/lib/priceChangeImpactEvaluation";
import { MenuEditor, type LocalLine } from "../MenuEditor.tsx";
import { PriceChangeImpactCard } from "../PriceChangeImpactCard.tsx";
import { StoreLoadError } from "@/components/StoreLoadError.tsx";
import { PageHeader } from "@/components/PageHeader.tsx";

export const metadata: Metadata = {
  title: "メニューを編集",
};

export default async function MenuDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ category?: string | string[] }>;
}) {
  if (!isSupabaseConfigured()) redirect("/");

  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const session = await getSessionStore(supabase);
  if (session.status === "unauthenticated") redirect("/login");
  if (session.status === "error") {
    return (
      <div className="max-w-2xl p-6 md:p-8">
        <StoreLoadError />
      </div>
    );
  }
  const { store } = session;

  const { id: menuId } = await params;
  const currentPeriod = monthToPeriod(currentMonthString());

  const [
    { data: menu },
    { data: menuIngredients },
    { data: allIngredients },
    { data: prepItemComponents },
    { data: currentMonthSales },
    { data: priceHistoryRows },
    { data: allMenuSales },
    priceHistory,
    allCategories,
    { category: categoryParamRaw },
  ] = await Promise.all([
    supabase.from("menus").select("id, name, selling_price, target_cost_rate, category_id").eq("id", menuId).eq(
      "store_id",
      store.id,
    ).maybeSingle(),
    supabase
      .from("menu_ingredients")
      .select(
        "id, ingredient_id, quantity, unit, ingredients(name, unit, current_purchase_price, yield_rate_percent, is_prep_item, yield_quantity)",
      )
      .eq("menu_id", menuId),
    supabase
      .from("ingredients")
      .select("id, name, unit, current_purchase_price, price_is_set, yield_rate_percent, is_prep_item, yield_quantity")
      .eq("store_id", store.id)
      .order("name"),
    supabase.from("prep_item_components").select("prep_item_id, component_id, quantity"),
    // 値上げシミュレーションで「月間利益」を試算するための、今月の販売数量。
    // このメニュー1件分だけの絞り込みなので、store全体を取るget_store_dataは使わない。
    supabase
      .from("menu_sales")
      .select("quantity_sold")
      .eq("menu_id", menuId)
      .eq("period_start", currentPeriod.start)
      .eq("period_end", currentPeriod.end)
      .maybeSingle(),
    // 「過去の値付け判断の成果追跡」用。売価変更履歴と、全期間の販売実績。
    supabase.from("menu_price_history").select("price, recorded_at").eq("menu_id", menuId).order("recorded_at", { ascending: true }),
    supabase.from("menu_sales").select("quantity_sold, period_start, period_end").eq("menu_id", menuId),
    getIngredientPriceHistory(supabase),
    getCategories(supabase),
    searchParams,
  ]);
  const menuCategories = sortCategories(allCategories.filter((c) => c.kind === "menu"));
  // 保存後は、メニュー一覧で開いていたタブ(?category=)に戻す。
  const returnCategoryParam = categoryTabToParam(
    parseCategoryTab(typeof categoryParamRaw === "string" ? categoryParamRaw : null, menuCategories, { allowPrepTab: false }),
  );

  if (!menu) notFound();

  const prepItemComponentLines = (prepItemComponents ?? []).map((c) => ({
    prepItemId: c.prep_item_id,
    componentId: c.component_id,
    quantity: c.quantity,
  }));

  // 仕込み品(サブレシピ)は仕入単価を持たないため、レシピから計算した実質単価に
  // 差し替える(withResolvedPrepItemPrices)。差し替え後はMenuEditor.tsxにとって
  // ただの数値なので、仕込み品かどうかを画面側で意識する必要は無い。
  const resolvedIngredients = withResolvedPrepItemPrices(
    (allIngredients ?? []).map((i) => ({
      id: i.id,
      name: i.name,
      currentPurchasePrice: i.current_purchase_price,
      priceIsSet: i.price_is_set,
      yieldRatePercent: i.yield_rate_percent,
      isPrepItem: i.is_prep_item,
      yieldQuantity: i.yield_quantity,
    })),
    prepItemComponentLines,
  );
  const resolvedPriceById = new Map(resolvedIngredients.map((i) => [i.id, i]));
  const unsetLeavesByIngredientId = Object.fromEntries(
    resolveUnsetLeaves(
      (allIngredients ?? []).map((i) => ({
        id: i.id,
        name: i.name,
        currentPurchasePrice: i.current_purchase_price,
        priceIsSet: i.price_is_set,
        yieldRatePercent: i.yield_rate_percent,
        isPrepItem: i.is_prep_item,
        yieldQuantity: i.yield_quantity,
      })),
      prepItemComponentLines,
    ),
  );

  const initialLines: LocalLine[] = (menuIngredients ?? []).map((mi) => {
    const ing = mi.ingredients as unknown as
      | { name: string; unit: string; current_purchase_price: number; yield_rate_percent: number }
      | null;
    const resolved = resolvedPriceById.get(mi.ingredient_id);
    return {
      key: mi.id,
      quantity: String(mi.quantity),
      unit: mi.unit,
      ingredientName: ing?.name ?? "(不明な食材)",
      unitPrice: resolved?.currentPurchasePrice ?? ing?.current_purchase_price ?? 0,
      yieldRatePercent: resolved?.yieldRatePercent ?? ing?.yield_rate_percent ?? 100,
      priceIsSet: resolved?.priceIsSet ?? true,
      source: { type: "existing", ingredientId: mi.ingredient_id },
    };
  });

  // 「過去の値付け判断の成果追跡」: 直近の売価変更が1回でも記録されていれば
  // (履歴が2件以上=最初の価格+その後の変更)、変更前後の月次利益を比較する。
  // 履歴が1件以下(まだ一度も値上げ・値下げしていない)は何も表示しない(null)。
  // 計算に使う月のどこかで単価未設定の食材を含んでいたら「計算できていません」にする
  // (判定はpriceChangeImpactEvaluation.ts。以前は未設定を0円扱いのまま計算していた)。
  const priceChangeOutcome = evaluateMenuPriceChangeImpact({
    menuPriceHistory: (priceHistoryRows ?? []).map((r) => ({ price: r.price, recordedAt: r.recorded_at })),
    menuSales: (allMenuSales ?? []).map((s) => ({ periodStart: s.period_start, periodEnd: s.period_end, quantitySold: s.quantity_sold })),
    menuIngredientLines: (menuIngredients ?? []).map((mi) => ({ ingredientId: mi.ingredient_id, quantity: mi.quantity })),
    ingredients: (allIngredients ?? []).map((i) => ({
      id: i.id,
      name: i.name,
      currentPurchasePrice: i.current_purchase_price,
      priceIsSet: i.price_is_set,
      yieldRatePercent: i.yield_rate_percent,
      isPrepItem: i.is_prep_item,
      yieldQuantity: i.yield_quantity,
    })),
    prepItemComponents: prepItemComponentLines,
    ingredientPriceHistory: priceHistory,
  });

  return (
    <div className="max-w-2xl p-6 md:p-8">
      <PageHeader
        eyebrow="メニュー管理"
        title={`${menu.name}を編集`}
        description="メニュー名・売価・使う食材を、この1画面でまとめて編集できます。"
      />

      <MenuEditor
        storeId={store.id}
        menuId={menu.id}
        initialName={menu.name}
        initialSellingPrice={menu.selling_price}
        initialLines={initialLines}
        allIngredients={(allIngredients ?? []).map((i) => ({
          id: i.id,
          name: i.name,
          unit: i.unit,
          currentPurchasePrice: resolvedPriceById.get(i.id)?.currentPurchasePrice ?? i.current_purchase_price,
          priceIsSet: resolvedPriceById.get(i.id)?.priceIsSet ?? i.price_is_set,
          yieldRatePercent: resolvedPriceById.get(i.id)?.yieldRatePercent ?? i.yield_rate_percent,
          isPrepItem: i.is_prep_item,
        }))}
        individualTargetCostRate={menu.target_cost_rate}
        defaultTargetCostRate={store.defaultTargetCostRate}
        currentMonthQuantitySold={currentMonthSales?.quantity_sold ?? null}
        ingredientPriceTaxMode={store.ingredientPriceTaxMode}
        unsetLeavesByIngredientId={unsetLeavesByIngredientId}
        categories={menuCategories}
        initialCategoryId={menu.category_id}
        returnCategoryParam={returnCategoryParam}
      />

      {priceChangeOutcome && (
        <div className="mt-6">
          <PriceChangeImpactCard outcome={priceChangeOutcome} />
        </div>
      )}
    </div>
  );
}
