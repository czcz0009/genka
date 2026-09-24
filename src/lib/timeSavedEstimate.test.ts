import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateTimeSavedMinutes, formatTimeSaved } from "./timeSavedEstimate.ts";

test("estimateTimeSavedMinutes: 何も無ければ0分", () => {
  assert.equal(estimateTimeSavedMinutes({ csvRowsThisMonth: 0, menusRegisteredThisMonth: 0 }), 0);
});

test("estimateTimeSavedMinutes: CSV10行(3分/行)+メニュー5件(2分/件)=40分", () => {
  assert.equal(estimateTimeSavedMinutes({ csvRowsThisMonth: 10, menusRegisteredThisMonth: 5 }), 40);
});

test("formatTimeSaved: 60分未満は分単位", () => {
  assert.equal(formatTimeSaved(45), "約45分");
  assert.equal(formatTimeSaved(0), "約0分");
});

test("formatTimeSaved: 60分以上は時間単位(小数第1位)", () => {
  assert.equal(formatTimeSaved(90), "約1.5時間");
  assert.equal(formatTimeSaved(120), "約2.0時間");
});

test("formatTimeSaved: 10時間以上は整数の時間で表示する", () => {
  assert.equal(formatTimeSaved(600), "約10時間");
  assert.equal(formatTimeSaved(650), "約11時間");
});
