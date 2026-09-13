"use client";
/* eslint-disable @next/next/no-img-element -- Private JPEG data URLs, loaded only when visible. */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { User } from "firebase/auth";
import { MapPin, PackageOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { appRequest } from "@/lib/api-client";
import { statusLabels, type Item } from "@/lib/domain";
import { rewardReasonLabel, type RewardTransaction } from "@/lib/rewards";
export const panel = "rounded-[24px] border border-[#dfe2ef] bg-white p-5";
export function formatTime(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("ko-KR");
}
export function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-3xl bg-[#f0f1f8] p-6 text-center leading-7 text-muted-foreground">
      {text}
    </p>
  );
}
export function Status({ item }: { item: Item }) {
  return (
    <span
      className={`inline-block rounded-full px-3 py-1 text-sm font-bold ${item.kind === "lost" ? "bg-[#eeeaff] text-[#5146a8]" : "bg-[#daf4eb] text-[#17624c]"}`}
    >
      {statusLabels[item.status] || "확인 중"}
    </span>
  );
}
export function ItemImage({
  item,
  user,
  large = false,
}: {
  item: Item;
  user: User;
  large?: boolean;
}) {
  return (
    <PrivateImage
      key={`${user.uid}:${item.id}:${item.updatedAt}:${item.hidden}`}
      item={item}
      user={user}
      large={large}
    />
  );
}
function PrivateImage({
  item,
  user,
  large = false,
}: {
  item: Item;
  user: User;
  large?: boolean;
}) {
  const [src, setSrc] = useState(""),
    [failed, setFailed] = useState(false),
    [retry, setRetry] = useState(0);
  const holder = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let live = true;
    if (!item.hasImage) return;
    const element = holder.current;
    const load = () =>
      appRequest<{ imageDataUrl: string }>(user, "image", { id: item.id })
        .then((r) => {
          if (live) setSrc(r.imageDataUrl);
        })
        .catch(() => {
          if (live) setFailed(true);
        });
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        observer.disconnect();
        void load();
      }
    });
    if (element) observer.observe(element);
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [item.id, item.hasImage, item.hidden, item.updatedAt, user, retry]);
  return (
    <div
      ref={holder}
      className={`grid shrink-0 place-items-center overflow-hidden rounded-[20px] bg-gradient-to-br ${item.kind === "lost" ? "from-[#d4ceff] to-[#f0eeff] text-[#5146a8]" : "from-[#b7dfff] to-[#eaf5ff] text-[#26537a]"} ${large ? "min-h-40 w-full" : "h-28 w-24 sm:w-28"}`}
    >
      {src ? (
        <img
          src={src}
          alt={large ? item.title : ""}
          className={
            large
              ? "max-h-80 w-full object-contain"
              : "h-full w-full object-cover"
          }
        />
      ) : (
        <div className="p-3 text-center">
          <PackageOpen className="mx-auto size-10" />
          {failed && large && (
            <button
              className="mt-2 text-sm underline"
              onClick={() => setRetry((v) => v + 1)}
            >
              사진 다시 불러오기
            </button>
          )}
        </div>
      )}
    </div>
  );
}
export function ItemCard({
  item,
  user,
  onClick,
}: {
  item: Item;
  user: User;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="item-card w-full items-center text-left"
    >
      <ItemImage item={item} user={user} />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-muted-foreground">
          {item.kind === "lost" ? "분실 신고" : "습득물"}
          {item.isMine ? " · 내 글" : ""}
        </p>
        <h2 className="mt-1 line-clamp-2 break-words text-base font-extrabold">
          {item.title}
        </h2>
        <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="size-4 shrink-0" />
          <span className="truncate">{item.location}</span>
        </p>
        <p className="my-2 text-sm text-muted-foreground">
          {item.dateText} · 단서 {item.clueCount}개
        </p>
        <Status item={item} />
        {item.hidden && <span className="ml-2 text-sm text-red-800">숨김</span>}
      </div>
    </button>
  );
}
export function ManageGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <details className="rounded-3xl border bg-[#f5f6fc] p-4">
      <summary className="cursor-pointer text-lg font-bold">{title}</summary>
      <div className="mt-4 space-y-3">{children}</div>
    </details>
  );
}
export function RewardList({
  rewards,
  onCancel,
}: {
  rewards: RewardTransaction[];
  onCancel?: (r: RewardTransaction) => void;
}) {
  return (
    <div className="space-y-3">
      {rewards.map((r) => (
        <div key={r.id} className={panel}>
          <div className="flex flex-wrap justify-between gap-2">
            <p className="font-bold">{rewardReasonLabel(r.reason)}</p>
            <p
              className={
                r.status === "cancelled"
                  ? "text-muted-foreground"
                  : "font-bold text-[#946b00]"
              }
            >
              {r.status === "cancelled"
                ? `지급 취소 · ${r.points}점`
                : `+${r.points}점`}
            </p>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {formatTime(r.grantedAt)}
          </p>
          {r.cancellationReason && (
            <p className="mt-2 text-sm">취소 이유: {r.cancellationReason}</p>
          )}
          {onCancel && (
            <p className="mt-2 break-all text-sm text-muted-foreground">
              활동 계정: {r.userId} · 관련 글: {r.relatedItemId}
            </p>
          )}
          {onCancel && r.status === "active" && (
            <Button
              variant="outline"
              className="mt-3 rounded-full"
              onClick={() => onCancel(r)}
            >
              잘못 지급된 포인트 취소
            </Button>
          )}
        </div>
      ))}
      {!rewards.length && <Empty text="아직 포인트 활동 내역이 없습니다." />}
    </div>
  );
}
