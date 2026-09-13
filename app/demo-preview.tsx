"use client";
import { useEffect, useRef, useState } from "react";
import { Lightbulb, LogIn, MapPin, PackageOpen, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "./findit-forms";
import { Empty, panel } from "./findit-widgets";
// Presentation only. Never merged into the authenticated snapshot or written to Firebase.
const examples = [
  {
    id: "demo-earbuds",
    kind: "lost",
    title: "검정 무선 이어폰",
    location: "도서관",
    description: "둥근 검정 케이스에 들어 있어요.",
    status: "찾는 중",
    clue: "도서관 반납대 옆에서 비슷한 물건을 보았어요.",
  },
  {
    id: "demo-pencilcase",
    kind: "found",
    title: "파란 지퍼 필통",
    location: "3층 연결 복도",
    description: "작은 별무늬가 있는 파란 필통이에요.",
    status: "주인 찾는 중",
    storage: "1층 교무실",
  },
  {
    id: "demo-bottle",
    kind: "lost",
    title: "은색 물병",
    location: "운동장 벤치",
    description: "뚜껑에 손잡이가 달린 은색 물병이에요.",
    status: "찾는 중",
  },
  { id: "demo-uniform", kind: "found", title: "회색 체육복 상의", location: "체육관 무대 옆", description: "이름표는 가려서 확인해 주세요.", status: "교사 인수", storage: "체육 교무실" },
  { id: "demo-umbrella", kind: "found", title: "남색 우산", location: "1층 우산꽂이", description: "손잡이에 작은 스티커가 있어요.", status: "주인 찾는 중", storage: "1층 교무실" },
  { id: "demo-case", kind: "lost", title: "투명 카드 케이스", location: "운동장 스탠드", description: "파란 목걸이 줄이 달린 케이스예요. 카드 개인정보는 공개하지 않아요.", status: "찾는 중" },
];
export function DemoPreview({
  onLogin,
  disabled,
  searchFocus = 0,
}: {
  onLogin: () => void;
  disabled: boolean;
  searchFocus?: number;
}) {
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => { if (searchFocus) { search.current?.scrollIntoView({ block: "center" }); search.current?.focus({ preventScroll: true }); } }, [searchFocus]);
  const [query, setQuery] = useState(""),
    [kind, setKind] = useState("all"),
    [selected, setSelected] = useState<(typeof examples)[number] | null>(null);
  const rows = examples.filter(
    (i) =>
      (kind === "all" || i.kind === kind) &&
      `${i.title} ${i.location}`.includes(query.trim()),
  );
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold">잃어버린 물건을 찾아보세요</h1>
        <span className="rounded-full bg-[#fff0bd] px-3 py-1 text-sm font-bold text-[#725900]">
          시연 화면
        </span>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">
        아래는 사용 방법을 살펴보는 예시입니다. 로그인하면 실제 우리 학교 자료로
        바뀝니다.
      </p>
      <div className="search-shell">
        <Search className="shrink-0 text-primary" />
        <input
          ref={search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-0 flex-1 bg-transparent py-4 outline-none"
          aria-label="시연 물건 검색"
          placeholder="예시 물건 이름이나 장소로 검색"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {[
          ["all", "전체"],
          ["lost", "잃어버렸어요"],
          ["found", "주인을 찾아요"],
        ].map(([value, label]) => (
          <Button
            key={value}
            variant={kind === value ? "default" : "outline"}
            className="rounded-full"
            onClick={() => setKind(value)}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {rows.map((i) => (
          <button
            key={i.id}
            className="item-card items-center text-left"
            onClick={() => setSelected(i)}
          >
            <div
              className={`grid h-28 w-24 shrink-0 place-items-center rounded-2xl ${i.kind === "lost" ? "bg-[#e5dfff] text-[#5747a6]" : "bg-[#d7edff] text-[#36628c]"}`}
            >
              <PackageOpen className="size-10" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">
                예시 · {i.kind === "lost" ? "분실 신고" : "습득물"}
              </p>
              <h2 className="mt-1 font-extrabold">{i.title}</h2>
              <p className="my-2 flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="size-4" />
                {i.location}
              </p>
              <span className="rounded-full bg-[#eff0fa] px-3 py-1 text-sm font-bold">
                {i.status}
              </span>
            </div>
          </button>
        ))}
      </div>
      {!rows.length && <Empty text="검색어에 맞는 예시가 없습니다." />}
      <div className={`${panel} space-y-3`}>
        <p className="font-bold">
          내 물건을 찾거나 단서를 남기려면 로그인하세요.
        </p>
        <Button
          disabled={disabled}
          className="h-12 rounded-full"
          onClick={onLogin}
        >
          <LogIn />
          Google 계정으로 시작하기
        </Button>
        <p className="text-sm text-muted-foreground">
          실명과 이메일은 다른 학생에게 공개되지 않습니다.
        </p>
      </div>
      {selected && (
        <Modal
          onClose={() => setSelected(null)}
          title={`${selected.title} · 시연`}
          description="실제 학교 게시물이 아닌 사용 예시입니다."
        >
          <p>{selected.description}</p>
          <p>장소: {selected.location}</p>
          {selected.storage && <p>보관 장소: {selected.storage}</p>}
          {selected.clue && (
            <div className="rounded-2xl bg-[#fff5d0] p-4">
              <p className="mb-2 flex items-center gap-2 font-bold">
                <Lightbulb className="size-5" />
                찾기 단서 예시
              </p>
              {selected.clue}
            </div>
          )}
          <Button onClick={onLogin} disabled={disabled}>
            로그인하고 실제 물건 찾기
          </Button>
        </Modal>
      )}
    </section>
  );
}
