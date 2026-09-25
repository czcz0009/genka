import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const DEMO_EMAIL = process.argv[2];
const DEMO_PASSWORD = process.argv[3];

function normalize(name) {
  return name.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

async function main() {
  // 1. デモ用の使い捨てアカウントを作成(メール確認不要)
  const { data: userData, error: userErr } = await supabase.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
  });
  if (userErr) throw userErr;
  const userId = userData.user.id;
  console.log("created user:", userId);

  // 2. 店舗を作成(オンボーディング完了済み扱いにしてツアーを出さない)
  const { data: store, error: storeErr } = await supabase
    .from("stores")
    .insert({
      owner_id: userId,
      name: "サンプル食堂",
      default_target_cost_rate: 30,
      onboarding_completed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (storeErr) throw storeErr;
  const storeId = store.id;
  console.log("created store:", storeId);

  // 3. 食材
  const ingredientDefs = [
    { name: "豚こま肉", unit: "g", price: 1.5 },
    { name: "キャベツ", unit: "個", price: 150 },
    { name: "米", unit: "g", price: 0.4 },
    { name: "鶏もも肉", unit: "g", price: 1.0 },
    { name: "揚げ油", unit: "g", price: 0.1 },
    { name: "生ビール", unit: "杯", price: 80 },
  ];
  const ingredientIds = {};
  for (const ing of ingredientDefs) {
    const { data, error } = await supabase
      .from("ingredients")
      .insert({
        store_id: storeId,
        name: ing.name,
        normalized_name: normalize(ing.name),
        unit: ing.unit,
        current_purchase_price: ing.price,
      })
      .select("id")
      .single();
    if (error) throw error;
    ingredientIds[ing.name] = data.id;
  }
  console.log("created ingredients:", Object.keys(ingredientIds).length);

  // 4. メニュー(1つは目標原価率超過、2つは健全)
  const menuDefs = [
    {
      name: "生姜焼き定食",
      sellingPrice: 750,
      lines: [
        { ingredient: "豚こま肉", quantity: 120, unit: "g" },
        { ingredient: "キャベツ", quantity: 0.2, unit: "個" },
        { ingredient: "米", quantity: 180, unit: "g" },
      ],
      quantitySold: 90,
    },
    {
      name: "唐揚げ定食",
      sellingPrice: 780,
      lines: [
        { ingredient: "鶏もも肉", quantity: 150, unit: "g" },
        { ingredient: "米", quantity: 180, unit: "g" },
        { ingredient: "揚げ油", quantity: 20, unit: "g" },
      ],
      quantitySold: 130,
    },
    {
      name: "生ビール",
      sellingPrice: 480,
      lines: [{ ingredient: "生ビール", quantity: 1, unit: "杯" }],
      quantitySold: 200,
    },
  ];

  const period = { start: "2026-08-01", end: "2026-08-31" };

  for (const menu of menuDefs) {
    const { data: menuRow, error: menuErr } = await supabase
      .from("menus")
      .insert({
        store_id: storeId,
        name: menu.name,
        normalized_name: normalize(menu.name),
        selling_price: menu.sellingPrice,
      })
      .select("id")
      .single();
    if (menuErr) throw menuErr;
    const menuId = menuRow.id;

    for (const line of menu.lines) {
      const { error } = await supabase.from("menu_ingredients").insert({
        menu_id: menuId,
        ingredient_id: ingredientIds[line.ingredient],
        quantity: line.quantity,
        unit: line.unit,
      });
      if (error) throw error;
    }

    const { error: salesErr } = await supabase.from("menu_sales").insert({
      menu_id: menuId,
      period_start: period.start,
      period_end: period.end,
      quantity_sold: menu.quantitySold,
    });
    if (salesErr) throw salesErr;
  }
  console.log("created menus:", menuDefs.length);

  // 5. 固定費(FL比率画面用)
  const { error: rentErr } = await supabase.from("store_fixed_costs").insert({
    store_id: storeId,
    cost_type: "rent",
    amount: 20000,
    period_start: period.start,
    period_end: null,
  });
  if (rentErr) throw rentErr;
  const { error: laborErr } = await supabase.from("store_fixed_costs").insert({
    store_id: storeId,
    cost_type: "labor",
    amount: 50000,
    period_start: period.start,
    period_end: period.end,
  });
  if (laborErr) throw laborErr;
  console.log("created fixed costs");

  console.log("DONE. userId=" + userId + " storeId=" + storeId);
}

main().catch((e) => {
  console.error("SEED ERROR:", e);
  process.exit(1);
});
