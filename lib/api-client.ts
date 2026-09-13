import type { User } from "firebase/auth";
import type { Clue, Item, Notice, Role } from "./domain";
import type { RewardTransaction } from "./rewards";
export type Snapshot = {
  role: Role;
  items: Item[];
  clues: Clue[];
  notifications: Notice[];
  rewards: RewardTransaction[];
};
export async function appRequest<T = { message: string }>(
  user: User,
  action: string,
  input: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch("/api/app", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await user.getIdToken()}`,
    },
    body: JSON.stringify({ action, ...input }),
    cache: "no-store",
  });
  let result: { error?: string };
  try {
    result = (await response.json()) as { error?: string };
  } catch {
    throw new Error("서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
  if (!response.ok)
    throw new Error(result.error || "요청을 처리하지 못했습니다.");
  return result as T;
}
