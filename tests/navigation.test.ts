import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const source = readFileSync(new URL("../app/findit-app.tsx", import.meta.url), "utf8");
test("원래 모바일 홈·찾기·등록·내 정보 메뉴를 유지한다", () => {
  const start = source.indexOf('aria-label="모바일 메뉴"');
  const menu = source.slice(start, source.indexOf("</nav>", start));
  for (const label of ['label="홈"', 'label="찾기"', 'label="등록"', 'label="내 정보"']) assert.ok(menu.includes(label));
  assert.equal((menu.match(/<MobileTab/g) || []).length, 4);
  assert.equal(menu.includes("-top-5"), false);
  assert.equal(menu.includes("인수 대기"), false);
  assert.ok(menu.includes("setSearchFocus"));
  assert.ok(menu.includes("requestRegistration"));
});
test("교사 인증 버튼은 내 정보 안에만 한 번 표시한다", () => {
  assert.equal((source.match(/onClick=\{codeDialog\}/g) || []).length, 1);
  const profile = source.indexOf("{profileOpen && (");
  const button = source.indexOf("onClick={codeDialog}");
  const end = source.indexOf("</Modal>", profile);
  assert.ok(profile >= 0 && button > profile && button < end);
});

test("교사 메뉴를 구분하고 상단 등록은 데스크톱에서만 표시한다", () => {
  assert.ok(source.includes('aria-label="교사 메뉴"'));
  assert.ok(source.includes('{teacher && (\n            <section'));
  const register = source.indexOf("물건 등록\n");
  const button = source.slice(source.lastIndexOf("<Button", register), register);
  assert.ok(button.includes("lg:flex"));
  assert.equal(button.includes("sm:flex"), false);
});
