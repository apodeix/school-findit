import { z } from "zod";

export const roles = ["student", "teacher", "final_admin"] as const;
export type Role = (typeof roles)[number];
export const roleLabels: Record<Role, string> = {
  student: "학생",
  teacher: "일반 교사",
  final_admin: "최종 관리자",
};
export const statusLabels = {
  seeking: "찾는 중",
  found: "찾았어요",
  closed: "종료",
  pending_handoff: "전달 대기",
  teacher_received: "교사 인수",
  looking_for_owner: "주인 찾는 중",
  returned: "반환 완료",
} as const;
export type ItemStatus = keyof typeof statusLabels;
export const categories = [
  "기타",
  "전자기기",
  "학용품",
  "의류",
  "생활용품",
] as const;
export function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
const required = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label}을 입력해 주세요.`)
    .max(max, `${label}은 ${max}자 이내로 입력해 주세요.`);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜를 선택해 주세요.")
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v &&
      v <= today(),
    "오늘 또는 이전의 올바른 날짜를 선택해 주세요.",
  );
export const itemInput = z.object({
  kind: z.enum(["lost", "found"]),
  title: required("물건 이름", 80),
  location: required("장소", 120),
  dateText: date,
  description: z
    .string()
    .trim()
    .max(1500, "특징은 1500자 이내로 입력해 주세요."),
  category: z.enum(categories).default("기타"),
  color: z.string().trim().max(30).default(""),
  storageLocation: z.string().trim().max(120).default(""),
  imageDataUrl: z
    .string()
    .max(450000, "사진 용량을 줄여 주세요.")
    .regex(
      /^(data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2})?$/,
      "JPEG 사진만 저장할 수 있습니다.",
    )
    .default(""),
});
export const clueInput = z.object({
  place: required("본 장소", 120),
  seenDate: date,
  seenTime: required("대략적인 시간", 60),
  detail: required("단서 내용", 1500),
});
export const reasonInput = required("처리 이유", 500);
export type Item = {
  id: string;
  kind: "lost" | "found";
  title: string;
  location: string;
  dateText: string;
  description: string;
  category: string;
  color: string;
  status: ItemStatus;
  storageLocation: string;
  isMine: boolean;
  hidden: boolean;
  hasImage: boolean;
  clueCount: number;
  createdAt: string;
  updatedAt: string;
};
export type Clue = {
  id: string;
  itemId: string;
  place: string;
  seenDate: string;
  seenTime: string;
  detail: string;
  isMine: boolean;
  hidden: boolean;
  helpful: boolean;
  createdAt: string;
};
export type Notice = {
  id: string;
  title: string;
  message: string;
  itemId?: string;
  read: boolean;
  status: "active" | "cancelled";
  createdAt: string;
};
export type DataRow = Record<string, unknown>;
export function isTeacher(role: Role) {
  return role === "teacher" || role === "final_admin";
}
export function canSeeItem(item: DataRow, uid: string, role: Role) {
  return (
    item.deleted !== true &&
    (isTeacher(role) ||
      item.authorId === uid ||
      (item.isPublished === true && item.hidden !== true))
  );
}
export function canSeeClue(
  clue: DataRow,
  item: DataRow,
  uid: string,
  role: Role,
) {
  return (
    clue.deleted !== true &&
    canSeeItem(item, uid, role) &&
    (clue.hidden !== true || isTeacher(role) || clue.authorId === uid)
  );
}
export function canTransition(
  item: DataRow,
  target: string,
  uid: string,
  role: Role,
) {
  if (item.deleted || item.hidden) return false;
  if (item.kind === "lost")
    return (
      (item.authorId === uid || role === "final_admin") &&
      ((item.status === "seeking" && target === "found") ||
        (item.status === "found" && target === "closed"))
    );
  return (
    isTeacher(role) &&
    ((item.status === "teacher_received" && target === "looking_for_owner") ||
      (["teacher_received", "looking_for_owner"].includes(
        String(item.status),
      ) &&
        target === "returned"))
  );
}
export function similarItems(lost: DataRow, found: DataRow) {
  if (
    lost.kind !== "lost" ||
    lost.status !== "seeking" ||
    lost.deleted ||
    lost.hidden ||
    lost.authorId === found.authorId
  )
    return false;
  const delta = Math.abs(
    Date.parse(String(lost.dateText)) - Date.parse(String(found.dateText)),
  );
  if (!Number.isFinite(delta) || delta > 14 * 86400000) return false;
  const clean = (v: unknown) =>
    String(v ?? "")
      .trim()
      .toLowerCase();
  const sameCategory =
    lost.category !== "기타" &&
    Boolean(lost.category) &&
    lost.category === found.category;
  const sameColor =
    Boolean(clean(lost.color)) && clean(lost.color) === clean(found.color);
  const words = clean(lost.location)
    .split(/\s+/)
    .filter((w) => w.length > 1 && w !== "모름");
  const samePlace = words.some((w) => clean(found.location).includes(w));
  const sameTitle = clean(lost.title)
    .split(/\s+/)
    .some((w) => w.length > 1 && clean(found.title).includes(w));
  return (
    Number(sameCategory) +
      Number(sameColor) +
      Number(samePlace) +
      Number(sameTitle) >=
    2
  );
}
