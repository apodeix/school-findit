import assert from "node:assert/strict";
import test from "node:test";
import {
  REWARD_POINTS,
  cancelDemoReward,
  getRewardSummary,
  grantDemoReward,
  handoffRewardKey,
  helpfulClueRewardKey,
  type RewardTransaction,
} from "../lib/rewards.ts";

test("같은 습득물 인수에는 포인트를 한 번만 지급한다", () => {
  const reward = {
    userId: "student-a",
    points: REWARD_POINTS.foundItemHandoff,
    reason: "found_item_handoff" as const,
    relatedItemId: "item-a",
    uniqueKey: handoffRewardKey("item-a"),
    grantedBy: "teacher-a",
  };
  const first = grantDemoReward([], reward);
  const second = grantDemoReward(first.transactions, reward);

  assert.equal(first.granted, true);
  assert.equal(second.granted, false);
  assert.equal(second.transactions.length, 1);
});

test("같은 학생의 같은 신고 단서는 여러 개여도 한 번만 지급한다", () => {
  const first = grantDemoReward([], {
    userId: "student-a",
    points: REWARD_POINTS.helpfulClue,
    reason: "helpful_clue",
    relatedItemId: "lost-a",
    relatedClueId: "clue-a",
    uniqueKey: helpfulClueRewardKey("lost-a", "student-a"),
    grantedBy: "report-owner",
  });
  const second = grantDemoReward(first.transactions, {
    userId: "student-a",
    points: REWARD_POINTS.helpfulClue,
    reason: "helpful_clue",
    relatedItemId: "lost-a",
    relatedClueId: "clue-b",
    uniqueKey: helpfulClueRewardKey("lost-a", "student-a"),
    grantedBy: "report-owner",
  });

  assert.equal(second.granted, false);
});

test("취소된 거래는 총점과 배지 계산에서 제외한다", () => {
  const transactions: RewardTransaction[] = [
    {
      id: "reward-a",
      userId: "student-a",
      points: 3,
      reason: "found_item_handoff",
      relatedItemId: "item-a",
      uniqueKey: handoffRewardKey("item-a"),
      status: "active",
      grantedAt: "방금",
      grantedBy: "teacher-a",
    },
  ];
  const cancelled = cancelDemoReward(transactions, "reward-a", "admin-a");
  const summary = getRewardSummary(cancelled, "student-a");

  assert.equal(summary.totalPoints, 0);
  assert.equal(summary.badges[0].earned, false);
  assert.equal(cancelled[0].status, "cancelled");
});
