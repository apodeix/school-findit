export const REWARD_POINTS = {
  foundItemHandoff: 3,
  helpfulClue: 1,
} as const;

export const BADGE_CRITERIA = {
  firstHelp: { minimumPoints: 1 },
  lostItemSolver: { minimumHelpfulClues: 3 },
  schoolGuardian: { minimumFoundItemHandoffs: 3 },
} as const;

export type RewardReason = "found_item_handoff" | "helpful_clue";
export type RewardStatus = "active" | "cancelled";

export type RewardTransaction = {
  id: string;
  userId: string;
  points: number;
  reason: RewardReason;
  relatedItemId: string;
  relatedClueId?: string;
  uniqueKey: string;
  status: RewardStatus;
  grantedAt: string;
  grantedBy: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancellationReason?: string;
};

export type RewardBadge = {
  id: "first-help" | "lost-item-solver" | "school-guardian";
  name: string;
  description: string;
  earned: boolean;
};

export const initialDemoRewards: RewardTransaction[] = [
  {
    id: "reward-demo-1",
    userId: "demo-current-user",
    points: 3,
    reason: "found_item_handoff",
    relatedItemId: "demo-handoff-complete",
    uniqueKey: "handoff:demo-handoff-complete",
    status: "active",
    grantedAt: "9월 11일 오후 2:20",
    grantedBy: "담당 교사",
  },
  {
    id: "reward-demo-2",
    userId: "demo-current-user",
    points: 1,
    reason: "helpful_clue",
    relatedItemId: "demo-other-report",
    relatedClueId: "demo-helpful-clue",
    uniqueKey: "helpful-clue:demo-other-report:demo-current-user",
    status: "active",
    grantedAt: "9월 12일 오전 10:05",
    grantedBy: "신고 작성자",
  },
];

export function handoffRewardKey(itemId: string) {
  return `handoff:${itemId}`;
}

export function helpfulClueRewardKey(itemId: string, clueAuthorId: string) {
  return `helpful-clue:${itemId}:${clueAuthorId}`;
}

export function grantDemoReward(
  transactions: RewardTransaction[],
  reward: Omit<RewardTransaction, "id" | "status" | "grantedAt">,
) {
  const duplicate = transactions.some(
    transaction => transaction.uniqueKey === reward.uniqueKey,
  );
  if (duplicate) return { transactions, granted: false };

  const transaction: RewardTransaction = {
    ...reward,
    id: `reward-${Date.now()}`,
    status: "active",
    grantedAt: "방금",
  };
  return { transactions: [transaction, ...transactions], granted: true };
}

export function cancelDemoReward(
  transactions: RewardTransaction[],
  transactionId: string,
  cancelledBy: string,
) {
  return transactions.map(transaction =>
    transaction.id === transactionId && transaction.status === "active"
      ? {
          ...transaction,
          status: "cancelled" as const,
          cancelledAt: "방금",
          cancelledBy,
        }
      : transaction,
  );
}

export function rewardReasonLabel(reason: RewardReason) {
  return reason === "found_item_handoff"
    ? "습득물 전달 확인"
    : "도움이 된 찾기 단서";
}

export function getRewardSummary(
  transactions: RewardTransaction[],
  userId: string,
) {
  const active = transactions.filter(
    transaction => transaction.userId === userId && transaction.status === "active",
  );
  const totalPoints = active.reduce(
    (total, transaction) => total + transaction.points,
    0,
  );
  const helpfulClues = active.filter(
    transaction => transaction.reason === "helpful_clue",
  ).length;
  const foundItemHandoffs = active.filter(
    transaction => transaction.reason === "found_item_handoff",
  ).length;

  const badges: RewardBadge[] = [
    {
      id: "first-help",
      name: "첫 번째 도움",
      description: "처음으로 도움 포인트를 받았어요.",
      earned: totalPoints >= BADGE_CRITERIA.firstHelp.minimumPoints,
    },
    {
      id: "lost-item-solver",
      name: "분실물 해결사",
      description: `유용한 찾기 단서 ${BADGE_CRITERIA.lostItemSolver.minimumHelpfulClues}회`,
      earned:
        helpfulClues >= BADGE_CRITERIA.lostItemSolver.minimumHelpfulClues,
    },
    {
      id: "school-guardian",
      name: "우리 학교 지킴이",
      description: `습득물 전달 ${BADGE_CRITERIA.schoolGuardian.minimumFoundItemHandoffs}회`,
      earned:
        foundItemHandoffs >=
        BADGE_CRITERIA.schoolGuardian.minimumFoundItemHandoffs,
    },
  ];

  return { totalPoints, helpfulClues, foundItemHandoffs, badges };
}
