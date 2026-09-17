"use client";

import { useEffect, useRef } from "react";
import "driver.js/dist/driver.css";
import { runOnboardingTour } from "@/lib/onboardingTour.client.ts";
import { completeOnboarding } from "@/app/(app)/onboarding/actions.ts";

/**
 * 初回オンボーディングツアーの自動起動。(app)/layout.tsxに1つだけ置き、
 * shouldAutoShow(メニュー0件かつ未完了)の時だけ、マウント後にツアーを開始する。
 * 完了・スキップどちらでも completeOnboarding を呼び、以後の自動表示を止める。
 */
export function OnboardingTour({ storeId, shouldAutoShow }: { storeId: string; shouldAutoShow: boolean }) {
  // React Strict Mode等でのeffect二重実行や、遷移のたびのlayout再マウントで
  // 二重に起動しないようにするためのガード。
  const startedRef = useRef(false);

  useEffect(() => {
    if (!shouldAutoShow || startedRef.current) return;
    startedRef.current = true;
    void runOnboardingTour(() => {
      void completeOnboarding(storeId);
    });
  }, [shouldAutoShow, storeId]);

  return null;
}
