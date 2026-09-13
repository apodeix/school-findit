import assert from "node:assert/strict";
import test from "node:test";
import {
  canSeeItem,
  canSeeClue,
  canTransition,
  clueInput,
  itemInput,
  similarItems,
  today,
} from "../lib/domain.ts";
const lost = {
  kind: "lost",
  status: "seeking",
  authorId: "owner",
  isPublished: true,
  title: "검정 무선 이어폰",
  category: "전자기기",
  color: "검정",
  location: "도서관",
  dateText: today(),
};
test("사진과 특징은 선택, 장소 모름과 날짜는 정상 입력", () => {
  const input = {
    kind: "lost",
    title: "물병",
    location: "모름",
    dateText: today(),
    description: "",
  };
  assert.equal(itemInput.safeParse(input).success, true);
  for (const field of ["title", "location", "dateText"])
    assert.equal(
      itemInput.safeParse({ ...input, [field]: "   " }).success,
      false,
    );
  assert.equal(
    itemInput.safeParse({ ...input, dateText: "2026-02-30" }).success,
    false,
  );
  assert.equal(
    itemInput.safeParse({ ...input, dateText: "2099-01-01" }).success,
    false,
  );
});
test("빈 단서, 공백 단서, 장소·시간 누락은 거부", () => {
  const input = {
    place: "도서관",
    seenDate: today(),
    seenTime: "점심시간",
    detail: "반납대 옆에서 보았어요.",
  };
  assert.equal(clueInput.safeParse(input).success, true);
  for (const field of Object.keys(input))
    assert.equal(
      clueInput.safeParse({ ...input, [field]: " \n " }).success,
      false,
    );
});
test("전달 대기·숨김·삭제 자료는 다른 학생에게 비공개", () => {
  const pending = { ...lost, isPublished: false };
  assert.equal(canSeeItem(pending, "other", "student"), false);
  assert.equal(canSeeItem(pending, "owner", "student"), true);
  assert.equal(canSeeItem(pending, "teacher", "teacher"), true);
  assert.equal(
    canSeeItem({ ...lost, hidden: true }, "other", "student"),
    false,
  );
  assert.equal(
    canSeeItem({ ...lost, deleted: true }, "admin", "final_admin"),
    false,
  );
  assert.equal(
    canSeeClue({ authorId: "helper", hidden: true }, lost, "other", "student"),
    false,
  );
  assert.equal(
    canSeeClue(
      { authorId: "helper" },
      { ...lost, deleted: true },
      "helper",
      "student",
    ),
    false,
  );
});
test("상태 변경은 소유자·교사별 올바른 순서만 허용", () => {
  assert.equal(canTransition(lost, "found", "owner", "student"), true);
  assert.equal(canTransition(lost, "closed", "owner", "student"), false);
  assert.equal(canTransition(lost, "found", "other", "student"), false);
  assert.equal(
    canTransition({ ...lost, status: "found" }, "closed", "owner", "student"),
    true,
  );
  const found = { ...lost, kind: "found", status: "teacher_received" };
  assert.equal(canTransition(found, "returned", "owner", "student"), false);
  assert.equal(canTransition(found, "returned", "teacher", "teacher"), true);
  assert.equal(
    canTransition(
      { ...found, deleted: true },
      "returned",
      "teacher",
      "teacher",
    ),
    false,
  );
});
test("유사 알림은 날짜와 두 가지 특징을 확인하고 자기 글을 제외", () => {
  const found = { ...lost, kind: "found", authorId: "finder" };
  assert.equal(similarItems(lost, found), true);
  assert.equal(similarItems(lost, { ...found, authorId: "owner" }), false);
  assert.equal(similarItems(lost, { ...found, dateText: "2020-01-01" }), false);
  assert.equal(
    similarItems(lost, {
      ...found,
      title: "지갑",
      category: "기타",
      location: "운동장",
    }),
    false,
  );
});
