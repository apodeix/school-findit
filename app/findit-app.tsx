"use client";
import { DemoPreview } from "./demo-preview";
import { BrandMark } from "@/components/brand-mark";
function MobileTab({ icon, label, active, onClick }: { icon: ReactNode; label: string; active?: boolean; onClick: () => void }) {
  return <button onClick={onClick} aria-current={active ? "page" : undefined} className={`flex flex-col items-center justify-center gap-1 text-sm font-bold ${active ? "text-[#4251b8]" : "text-[#73768a]"}`}><span className={`grid h-8 w-14 place-items-center rounded-full [&>svg]:size-5 ${active ? "bg-[#e0e3ff]" : ""}`}>{icon}</span>{label}</button>;
}
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Award,
  Bell,
  CircleUserRound,
  Home,
  KeyRound,
  Lightbulb,
  LoaderCircle,
  LogIn,
  LogOut,
  PackageCheck,
  PackageOpen,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import {
  browserSessionPersistence,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getFirebaseServices,
  isFirebaseConfigured,
  schoolEmailDomain,
} from "@/lib/firebase/client";
import { appRequest, type Snapshot } from "@/lib/api-client";
import {
  categories,
  isTeacher,
  roleLabels,
  today,
  type Clue,
  type Item,
  type Notice,
  type Role,
} from "@/lib/domain";
import { getRewardSummary, type RewardTransaction } from "@/lib/rewards";
import {
  ActionPrompt,
  ClueEditor,
  Field,
  ItemEditor,
  Modal,
  messageOf,
  type Prompt,
} from "./findit-forms";
import {
  Empty,
  ItemCard,
  ItemImage,
  ManageGroup,
  RewardList,
  Status,
  formatTime,
  panel,
} from "./findit-widgets";
const empty: Snapshot = {
  role: "student",
  items: [],
  clues: [],
  notifications: [],
  rewards: [],
};
type Section = "all" | "mine" | "clues" | "handoff" | "profile" | "manage";
type Management = {
  rewards: RewardTransaction[];
  reports: {
    id: string;
    itemId: string;
    targetId: string;
    targetType: string;
    reason: string;
    status: string;
  }[];
  users: { id: string; email: string; role: Role }[];
  notifications: Notice[];
  logs: {
    id: string;
    action: string;
    targetId: string;
    actorId: string;
    reason: string;
    createdAt: string;
  }[];
};

export default function FinditApp() {
  const [user, setUser] = useState<User | null>(null),
    userRef = useRef<User | null>(null);
  const [data, setData] = useState<Snapshot>(empty),
    [loading, setLoading] = useState(isFirebaseConfigured),
    [error, setError] = useState(
      isFirebaseConfigured ? "" : "로그인 연결 설정을 확인해 주세요.",
    );
  const [section, setSection] = useState<Section>("all"),
    [kind, setKind] = useState("all"),
    [query, setQuery] = useState("");
  const [category, setCategory] = useState("all"),
    [color, setColor] = useState(""),
    [place, setPlace] = useState(""),
    [date, setDate] = useState(""),
    [recent, setRecent] = useState(false),
    [active, setActive] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null),
    [editor, setEditor] = useState<Item | "lost" | "found" | null>(null),
    [clueEditor, setClueEditor] = useState<{ item: Item; clue?: Clue } | null>(
      null,
    );
  const [noticesOpen, setNoticesOpen] = useState(false),
    [profileOpen, setProfileOpen] = useState(false),
    [prompt, setPrompt] = useState<Prompt | null>(null),
    [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false),
    [management, setManagement] = useState<Management | null>(null),
    [managementError, setManagementError] = useState("");
  const version = useRef(0),
    refreshing = useRef(false),
    pendingRefresh = useRef(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const [searchFocus, setSearchFocus] = useState(0);
  const [searchMode, setSearchMode] = useState(false);
  useEffect(() => {
    if (searchMode && searchFocus && section === "all") {
      searchInput.current?.scrollIntoView({
        block: "center",
        behavior: "instant",
      });
      searchInput.current?.focus({ preventScroll: true });
    }
  }, [searchFocus, section, searchMode]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  const refresh = useCallback(async function refreshData() {
    if (!userRef.current) return;
    if (refreshing.current) {
      pendingRefresh.current = true;
      return;
    }
    refreshing.current = true;
    const current = userRef.current,
      sequence = version.current;
    try {
      const next = await appRequest<Snapshot>(current, "snapshot");
      if (sequence === version.current) {
        setData(next);
        if (!isTeacher(next.role)) setManagement(null);
        setError("");
      }
    } catch (err) {
      if (sequence === version.current) {
        setData(empty);
        setManagement(null);
        setError(messageOf(err));
      }
    } finally {
      refreshing.current = false;
      if (sequence === version.current) setLoading(false);
      if (pendingRefresh.current) {
        pendingRefresh.current = false;
        void refreshData();
      }
    }
  }, []);
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const { auth, db } = getFirebaseServices();
    let revision: (() => void) | undefined;
    const off = onAuthStateChanged(auth, (current) => {
      version.current++;
      revision?.();
      userRef.current = current;
      setUser(current);
      setData(empty);
      setManagement(null);
      setSelectedId(null);
      setEditor(null);
      setClueEditor(null);
      setPrompt(null);
      setNoticesOpen(false);
      setProfileOpen(false);
      setSearchMode(false);
      setError("");
      if (!current) {
        setLoading(false);
        setSection("all");
        return;
      }
      setLoading(true);
      void refresh();
      revision = onSnapshot(
        doc(db, "app_settings", "revision"),
        () => void refresh(),
        () => {
          /* refresh on focus and interval remains available */
        },
      );
    });
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 60000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => {
      off();
      revision?.();
      clearInterval(interval);
      window.removeEventListener("focus", focus);
    };
  }, [refresh]);
  const teacher = isTeacher(data.role),
    admin = data.role === "final_admin",
    selected = data.items.find((i) => i.id === selectedId) || null;
  const unread = data.notifications.filter(
    (n) => !n.read && n.status !== "cancelled",
  ).length;
  const summary = useMemo(
    () => getRewardSummary(data.rewards, user?.uid || ""),
    [data.rewards, user?.uid],
  );
  const ownClues = data.clues.filter((c) => c.isMine),
    pending = data.items.filter(
      (i) => i.status === "pending_handoff" && !i.hidden,
    );
  const filtered = data.items.filter((item) => {
    if (section === "mine" && !item.isMine) return false;
    if (
      section === "handoff" &&
      (item.status !== "pending_handoff" || item.hidden)
    )
      return false;
    if (section === "all" && (item.status === "pending_handoff" || item.hidden))
      return false;
    if (
      (kind !== "all" && item.kind !== kind) ||
      (category !== "all" && item.category !== category) ||
      (date && item.dateText !== date)
    )
      return false;
    const days = (Date.parse(today()) - Date.parse(item.dateText)) / 86400000;
    if (recent && (!Number.isFinite(days) || days < 0 || days > 6))
      return false;
    if (active && ["found", "closed", "returned"].includes(item.status))
      return false;
    return (
      `${item.title} ${item.category} ${item.location} ${item.color}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()) &&
      item.location.toLowerCase().includes(place.trim().toLowerCase()) &&
      item.color.toLowerCase().includes(color.trim().toLowerCase())
    );
  });
  function navigate(next: Section) {
    if (next === "profile") {
      if (user) setProfileOpen(true);
      else void login();
      return;
    }
    setProfileOpen(false);
    setSearchMode(false);
    setSection(next);
    setKind("all");
    setQuery("");
    setCategory("all");
    setColor("");
    setPlace("");
    setDate("");
    setRecent(false);
    setActive(false);
    setManagement(null);
  }
  function requestRegistration() {
    if (!user) {
      void login();
      return;
    }
    setEditor("lost");
  }
  async function login() {
    setBusy(true);
    try {
      const { auth } = getFirebaseServices();
      await setPersistence(auth, browserSessionPersistence);
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: "select_account",
        ...(schoolEmailDomain ? { hd: schoolEmailDomain } : {}),
      });
      await signInWithPopup(auth, provider);
    } catch {
      setToast(
        "로그인을 완료하지 못했습니다. 팝업 차단 여부를 확인하고 다시 시도해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    try {
      await signOut(getFirebaseServices().auth);
      setToast("로그아웃했습니다.");
    } catch {
      setToast("로그아웃하지 못했습니다. 다시 시도해 주세요.");
    }
  }
  const loadManagement = useCallback(async () => {
    if (!userRef.current) return;
    const current = userRef.current,
      sequence = version.current;
    try {
      const next = await appRequest<Management>(current, "management");
      if (sequence === version.current) {
        setManagement(next);
        setManagementError("");
      }
    } catch (err) {
      if (sequence === version.current) {
        setManagement(null);
        setManagementError(messageOf(err));
      }
    }
  }, []);
  useEffect(() => {
    if (section === "manage" && teacher && user) void loadManagement();
  }, [section, teacher, user, data, loadManagement]);
  async function mutate(action: string, input: Record<string, unknown>) {
    if (!userRef.current) throw new Error("먼저 로그인해 주세요.");
    const currentVersion = version.current;
    const result = await appRequest(userRef.current, action, input);
    if (currentVersion !== version.current) return result;
    setToast(result.message);
    await refresh();
    return result;
  }
  function ask(
    title: string,
    action: string,
    input: Record<string, unknown>,
    field?: string,
    initial?: string,
    label?: string,
    description = "처리 내용을 확인하고 진행해 주세요.",
  ) {
    setPrompt({ title, action, input, field, initial, label, description });
  }
  function codeDialog() {
    setPrompt({
      title: admin ? "교사 인증코드 변경" : "교사 인증",
      description: admin
        ? "영문·숫자·기호 중 두 종류 이상을 섞어 12~32자로 설정하세요. 교직원에게만 공유하고, 기존의 짧은 코드는 교체해 주세요. 이미 인증된 교사 권한은 유지됩니다."
        : "교직원 메신저로 안내받은 코드를 입력하세요. 5회 실패하면 15분 뒤 다시 시도할 수 있습니다.",
      action: admin ? "teacher.code" : "teacher.verify",
      input: {},
      field: "code",
      label: "교사 인증코드",
      password: true,
    });
  }
  async function openNotice(n: Notice) {
    try {
      if (!n.read) await mutate("notification.read", { id: n.id });
      setNoticesOpen(false);
      if (n.itemId && data.items.some((i) => i.id === n.itemId))
        setSelectedId(n.itemId);
      else
        setToast(
          n.itemId
            ? "삭제되었거나 숨김 처리되어 열 수 없는 글입니다."
            : n.message,
        );
    } catch (err) {
      setToast(messageOf(err));
    }
  }
  const nav: { key: Section; label: string; icon: ReactNode }[] = [
    { key: "all", label: "전체 물건", icon: <Home /> },
    { key: "mine", label: "내가 쓴 글", icon: <PackageOpen /> },
    { key: "clues", label: "내가 남긴 단서", icon: <Lightbulb /> },
    { key: "profile", label: "내 정보", icon: <CircleUserRound /> },
    ...(teacher
      ? [
          {
            key: "handoff" as Section,
            label: `인수 대기 (${pending.length})`,
            icon: <PackageCheck />,
          },
          {
            key: "manage" as Section,
            label: "교사·관리자 업무",
            icon: <ShieldCheck />,
          },
        ]
      : []),
  ];
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-[#dfe2f3] bg-[#fbf9ff]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <button
            className="flex items-center gap-3 text-left"
            onClick={() => navigate("all")}
            aria-label="어디 있니? 전체 물건"
          >
            <BrandMark />
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="whitespace-nowrap text-[1.28rem] font-extrabold tracking-[-0.055em] sm:text-[1.45rem]">
                어디 있니?
              </span>
              <span className="hidden text-sm text-muted-foreground sm:inline">
                우리 학교 분실물 찾기
              </span>
            </span>
          </button>
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <span className="hidden rounded-full bg-[#e0e3ff] px-3 py-2 text-sm font-bold sm:block">
                  {roleLabels[data.role]}
                </span>
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={() => setNoticesOpen(true)}
                  aria-label={`알림 ${unread}개`}
                >
                  <Bell />
                  <span className="hidden sm:inline">알림</span>
                  {unread > 0 && (
                    <span className="rounded-full bg-[#d12f59] px-1.5 text-sm text-white">
                      {unread}
                    </span>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  className="rounded-full"
                  onClick={logout}
                  aria-label="로그아웃"
                >
                  <LogOut />
                  <span className="hidden sm:inline">로그아웃</span>
                </Button>
              </>
            ) : (
              <Button
                onClick={login}
                disabled={busy || !isFirebaseConfigured}
                className="rounded-full"
              >
                <LogIn />
                Google 로그인
              </Button>
            )}
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1440px] lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_280px]">
        <aside className="sticky top-[72px] hidden h-[calc(100vh-72px)] border-r border-[#e0e2ef] px-5 py-7 lg:flex lg:flex-col">
          <nav className="space-y-1" aria-label="주요 메뉴">
            {nav.filter((n) => n.key !== "handoff" && n.key !== "manage").map((n) => (
              <button
                key={n.key}
                onClick={() => navigate(n.key)}
                className={`flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left text-sm font-bold [&_svg]:size-5 ${section === n.key ? "bg-[#e0e3ff] text-[#3544aa]" : "hover:bg-[#eff0f8]"}`}
              >
                {n.icon}
                {n.label}
              </button>
            ))}
          </nav>
          {teacher && (
            <section className="mt-6 border-t border-[#e0e2ef] pt-5" aria-labelledby="teacher-menu-heading">
              <h2 id="teacher-menu-heading" className="mb-2 px-3 text-sm font-bold text-muted-foreground">교사 메뉴</h2>
              <nav className="space-y-1" aria-label="교사 메뉴">
                {nav.filter((n) => n.key === "handoff" || n.key === "manage").map((n) => (
                  <button
                    key={n.key}
                    onClick={() => navigate(n.key)}
                    aria-current={section === n.key ? "page" : undefined}
                    className={`flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left text-sm font-bold [&_svg]:size-5 ${section === n.key ? "bg-[#e0e3ff] text-[#3544aa]" : "hover:bg-[#eff0f8]"}`}
                  >
                    {n.icon}
                    {n.label}
                  </button>
                ))}
              </nav>
            </section>
          )}
            <div className="mt-6 rounded-3xl bg-[#fff5d0] p-4 text-sm leading-6 text-[#68521c]">
              물건을 주웠나요?
              <br />
              등록 후 선생님께 전달하면 학교 친구에게 안전하게 돌아갈 수 있어요.
            </div>
        </aside>
        <main className="min-w-0 space-y-5 px-4 pb-28 pt-6 sm:px-7 sm:pt-8 lg:px-9 lg:pb-12">
          {!user ? (
            <DemoPreview
              onLogin={login}
              disabled={busy || !isFirebaseConfigured}
              searchFocus={searchMode ? searchFocus : 0}
            />
          ) : (
            <>
              {error && (
                <div
                  role="alert"
                  className="rounded-2xl bg-red-50 p-4 text-red-800"
                >
                  {error}
                  <Button
                    variant="outline"
                    className="ml-2 rounded-full"
                    onClick={() => void refresh()}
                  >
                    다시 불러오기
                  </Button>
                </div>
              )}
              {loading && (
                <div role="status" className="flex items-center gap-2 p-4">
                  <LoaderCircle className="animate-spin" />
                  학교 소식을 불러오는 중이에요.
                </div>
              )}
              {!loading && !error && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h1 className="text-2xl font-extrabold">
                      {section === "all"
                        ? "잃어버린 물건을 찾아보세요"
                        : nav.find((n) => n.key === section)?.label}
                    </h1>
                    {["all", "mine"].includes(section) && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          className="hidden h-12 shrink-0 rounded-full px-5 shadow-[0_8px_22px_rgba(73,88,199,.25)] lg:flex"
                          onClick={requestRegistration}
                        >
                          <Plus />
                          물건 등록
                        </Button>
                      </div>
                    )}
                  </div>
                  {["all", "mine", "handoff"].includes(section) && (
                    <>
                      <p className="text-sm text-muted-foreground">
                        {section === "handoff"
                          ? "학생에게 물건을 실제로 받은 뒤 인수 확인하세요. 인수와 3점 지급이 함께 처리됩니다."
                          : "목록에서 내 물건을 찾아보거나, 알고 있는 위치를 단서로 알려주세요."}
                      </p>
                      <div className="search-shell">
                        <Search className="shrink-0 text-[#6871ac]" />
                        <input
                          ref={searchInput}
                          aria-label="물건 이름, 색상, 장소 검색"
                          placeholder="물건 이름, 색상, 장소로 찾아보세요"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          className="min-w-0 flex-1 bg-transparent py-4 outline-none"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {[
                          ["all", "전체"],
                          ["lost", "잃어버렸어요"],
                          ["found", "주인을 찾아요"],
                        ].map(([v, l]) => (
                          <Button
                            key={v}
                            variant={kind === v ? "default" : "outline"}
                            aria-pressed={kind === v}
                            className="rounded-full"
                            onClick={() => setKind(v)}
                          >
                            {l}
                          </Button>
                        ))}
                        <Button
                          variant={recent ? "default" : "outline"}
                          aria-pressed={recent}
                          className="rounded-full"
                          onClick={() => setRecent((value) => !value)}
                        >
                          최근 7일
                        </Button>
                      </div>
                      <details className={`${panel} !p-4`}>
                        <summary className="cursor-pointer text-sm font-bold">
                          상세 검색 · 분류 / 색상 / 날짜 / 장소
                        </summary>
                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                          <Field label="분류">
                            <select
                              value={category}
                              onChange={(e) => setCategory(e.target.value)}
                              className="h-11 w-full rounded-xl border bg-white px-3"
                            >
                              <option value="all">전체 분류</option>
                              {categories.map((c) => (
                                <option key={c}>{c}</option>
                              ))}
                            </select>
                          </Field>
                          <Field label="색상">
                            <Input
                              value={color}
                              onChange={(e) => setColor(e.target.value)}
                              placeholder="예: 검정"
                            />
                          </Field>
                          <Field label="장소 키워드">
                            <Input
                              value={place}
                              onChange={(e) => setPlace(e.target.value)}
                              placeholder="예: 도서관"
                            />
                          </Field>
                          <Field label="날짜">
                            <Input
                              type="date"
                              max={today()}
                              value={date}
                              onChange={(e) => setDate(e.target.value)}
                            />
                          </Field>
                          <label className="flex min-h-11 items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={active}
                              onChange={(e) => setActive(e.target.checked)}
                            />
                            진행 중인 글만
                          </label>
                          <Button
                            variant="outline"
                            className="rounded-full"
                            onClick={() => navigate(section)}
                          >
                            검색 조건 초기화
                          </Button>
                        </div>
                      </details>
                      <p className="text-sm text-muted-foreground">
                        {filtered.length}개 · 최신 등록순
                      </p>
                      <div className="grid gap-4 sm:grid-cols-2">
                        {filtered.map((i) => (
                          <ItemCard
                            key={i.id}
                            item={i}
                            user={user}
                            onClick={() => setSelectedId(i.id)}
                          />
                        ))}
                      </div>
                      {!filtered.length && (
                        <Empty
                          text={
                            section === "handoff"
                              ? "인수 대기 중인 물건이 없습니다."
                              : "조건에 맞는 물건이 없습니다. 검색 조건을 바꾸거나 새 글을 등록해 주세요."
                          }
                        />
                      )}
                    </>
                  )}
                  {section === "clues" && (
                    <div className="space-y-3">
                      {ownClues.map((c) => (
                        <button
                          key={c.id}
                          className={`${panel} w-full text-left`}
                          onClick={() => setSelectedId(c.itemId)}
                        >
                          <p className="font-bold">
                            {data.items.find((i) => i.id === c.itemId)?.title ||
                              "분실 신고"}
                          </p>
                          <p className="mt-2">
                            {c.place} · {c.seenDate} · {c.seenTime}
                          </p>
                          <p className="mt-2 whitespace-pre-wrap break-words text-muted-foreground">
                            {c.detail}
                          </p>
                          <p className="mt-3 text-sm text-primary">
                            {c.hidden ? "숨김 처리됨 · " : ""}상세 보기 및 내
                            단서 수정
                          </p>
                        </button>
                      ))}
                      {!ownClues.length && (
                        <Empty text="아직 남긴 단서가 없습니다. 찾는 중인 분실 신고에서 목격 정보를 알려주세요." />
                      )}
                    </div>
                  )}
                  {profileOpen && (
                    <Modal
                      onClose={() => setProfileOpen(false)}
                      title="내 정보 · 도움 포인트"
                      description="본인의 활동과 계정 설정을 확인하세요."
                    >
                      <div className={panel}>
                        <p className="break-all font-bold">{user.email}</p>
                        <p className="mt-2 text-sm">
                          {roleLabels[data.role]} · 이 계정 정보는 본인에게만
                          표시됩니다.
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            className="rounded-full"
                            onClick={() => navigate("mine")}
                          >
                            내가 쓴 글
                          </Button>
                          <Button
                            variant="outline"
                            className="rounded-full"
                            onClick={() => navigate("clues")}
                          >
                            내가 남긴 단서
                          </Button>
                          {(admin || !teacher) && (
                            <Button
                              variant="outline"
                              className="rounded-full"
                              onClick={codeDialog}
                            >
                              <KeyRound />
                              {admin ? "교사 인증코드 설정" : "교사 인증"}
                            </Button>
                          )}
                          {teacher && (
                            <>
                              <Button
                                variant="outline"
                                className="rounded-full"
                                onClick={() => navigate("handoff")}
                              >
                                인수 대기 {pending.length}개
                              </Button>
                              <Button
                                variant="outline"
                                className="rounded-full"
                                onClick={() => navigate("manage")}
                              >
                                교사·관리자 업무
                              </Button>
                            </>
                          )}
                          <Button
                            variant="outline"
                            className="rounded-full"
                            onClick={logout}
                          >
                            <LogOut />
                            로그아웃
                          </Button>
                        </div>
                      </div>
                      <div className="rounded-[28px] border border-[#e6cd77] bg-[#fff7d9] p-6">
                        <p className="flex items-center gap-2 font-bold">
                          <Award />내 도움 포인트
                        </p>
                        <p className="mt-3 text-4xl font-extrabold text-[#705200]">
                          {summary.totalPoints}
                          <span className="ml-2 text-lg">점</span>
                        </p>
                        <p className="mt-3 text-sm text-[#705d28]">
                          우리 학교를 돕는 마음을 응원해요. 학생 간 순위는
                          공개하지 않습니다.
                        </p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        {summary.badges.map((b) => (
                          <div
                            key={b.id}
                            className={`rounded-3xl border p-4 ${b.earned ? "border-[#e6cd77] bg-[#fff7d9]" : "bg-[#f0f1f8]"}`}
                          >
                            <Award
                              className={
                                b.earned
                                  ? "text-[#8d6800]"
                                  : "text-muted-foreground"
                              }
                            />
                            <p className="mt-3 font-bold">{b.name}</p>
                            <p className="mt-2 text-sm">
                              {b.earned ? "획득 완료" : b.description}
                            </p>
                          </div>
                        ))}
                      </div>
                      <h2 className="text-lg font-bold">포인트 활동 내역</h2>
                      <RewardList rewards={data.rewards} />
                    </Modal>
                  )}
                  {section === "manage" && teacher && (
                    <>
                      <p className="text-sm text-muted-foreground">
                        {admin
                          ? "신고, 숨김 글, 포인트, 교사 권한과 발송 알림을 관리합니다."
                          : "인수, 보관·반환, 부적절한 내용 숨김과 담당 포인트 취소를 처리합니다."}
                      </p>
                      <Button
                        variant="outline"
                        className="rounded-full"
                        onClick={() => void loadManagement()}
                      >
                        <RefreshCw />
                        새로고침
                      </Button>
                      {managementError && (
                        <p role="alert" className="text-red-800">
                          {managementError}
                        </p>
                      )}
                      {!management && !managementError && (
                        <p>관리 내역을 불러오는 중입니다.</p>
                      )}
                      {management && (
                        <>
                          <ManageGroup title="신고 확인">
                            {management.reports.map((r) => (
                              <div key={r.id} className={panel}>
                                <p className="font-bold">
                                  {r.targetType === "clues" ? "단서" : "게시물"}{" "}
                                  신고 ·{" "}
                                  {r.status === "open"
                                    ? "확인 대기"
                                    : "처리 완료"}
                                </p>
                                <p className="mt-2 whitespace-pre-wrap break-words">
                                  {r.reason}
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <Button
                                    variant="outline"
                                    onClick={() => setSelectedId(r.itemId)}
                                  >
                                    관련 글 보기
                                  </Button>
                                  {r.status === "open" && (
                                    <Button
                                      onClick={() =>
                                        ask(
                                          "신고 처리 완료",
                                          "report.resolve",
                                          { id: r.id },
                                          "reason",
                                          "",
                                          "처리 내용",
                                        )
                                      }
                                    >
                                      처리 기록 남기기
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ))}
                            {!management.reports.length && (
                              <Empty text="접수된 신고가 없습니다." />
                            )}
                          </ManageGroup>
                          <ManageGroup title="숨김 처리된 글과 단서">
                            {data.items
                              .filter((i) => i.hidden)
                              .map((i) => (
                                <button
                                  key={i.id}
                                  className={`${panel} w-full text-left`}
                                  onClick={() => setSelectedId(i.id)}
                                >
                                  {i.title} · 숨김 글 보기
                                </button>
                              ))}
                            {data.clues
                              .filter((c) => c.hidden)
                              .map((c) => (
                                <button
                                  key={c.id}
                                  className={`${panel} w-full text-left`}
                                  onClick={() => setSelectedId(c.itemId)}
                                >
                                  {c.place} · 숨김 단서 보기
                                </button>
                              ))}
                            {!data.items.some((i) => i.hidden) &&
                              !data.clues.some((c) => c.hidden) && (
                                <Empty text="숨김 처리된 내용이 없습니다." />
                              )}
                          </ManageGroup>
                          <ManageGroup
                            title={
                              admin
                                ? "포인트 지급·취소 내역"
                                : "내가 담당한 포인트 내역"
                            }
                          >
                            <RewardList
                              rewards={management.rewards}
                              onCancel={(r) =>
                                ask(
                                  "포인트 지급 취소",
                                  "reward.cancel",
                                  { id: r.id },
                                  "reason",
                                  "",
                                  "취소 이유",
                                  "포인트와 배지가 재계산되고 학생에게 취소 이유가 안내됩니다. 같은 활동에 다시 지급하지 않습니다.",
                                )
                              }
                            />
                          </ManageGroup>
                          {admin && (
                            <>
                              <ManageGroup title="교사 권한 관리">
                                {management.users.map((u) => (
                                  <div key={u.id} className={panel}>
                                    <p className="break-all font-bold">
                                      {u.email}
                                    </p>
                                    <p className="mt-1 text-sm">
                                      {roleLabels[u.role]}
                                    </p>
                                    {u.role === "teacher" && (
                                      <div className="mt-3 flex flex-wrap gap-2">
                                        <Button
                                          variant="outline"
                                          onClick={() =>
                                            ask(
                                              "교사 권한을 회수할까요?",
                                              "role.change",
                                              { id: u.id, role: "student" },
                                              undefined,
                                              undefined,
                                              undefined,
                                              "학생 권한으로 변경됩니다. 인증코드가 바뀔 때까지 재인증할 수 없습니다.",
                                            )
                                          }
                                        >
                                          교사 권한 회수
                                        </Button>
                                        <Button
                                          onClick={() =>
                                            ask(
                                              "최종 관리자로 지정할까요?",
                                              "role.change",
                                              { id: u.id, role: "final_admin" },
                                              undefined,
                                              undefined,
                                              undefined,
                                              "모든 계정과 게시물을 관리할 권한을 부여합니다. 이 화면에서는 최종 관리자 권한을 회수할 수 없습니다.",
                                            )
                                          }
                                        >
                                          최종 관리자 지정
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </ManageGroup>
                              <ManageGroup title="발송 알림 관리">
                                <p className="text-sm text-muted-foreground">
                                  수신자의 알림함에도 취소 표시가 남습니다. 이미
                                  읽은 내용까지 회수되지는 않습니다.
                                </p>
                                {management.notifications.map((n) => (
                                  <div key={n.id} className={panel}>
                                    <p className="font-bold">
                                      {n.status === "cancelled"
                                        ? "취소됨 · "
                                        : ""}
                                      {n.title}
                                    </p>
                                    <p className="mt-2 break-words">
                                      {n.message}
                                    </p>
                                    {n.status !== "cancelled" && (
                                      <Button
                                        className="mt-3"
                                        variant="outline"
                                        onClick={() =>
                                          ask(
                                            "잘못 보낸 알림을 취소할까요?",
                                            "notification.cancel",
                                            { id: n.id },
                                          )
                                        }
                                      >
                                        알림 취소
                                      </Button>
                                    )}
                                  </div>
                                ))}
                                {!management.notifications.length && (
                                  <Empty text="발송된 알림이 없습니다." />
                                )}
                              </ManageGroup>
                              <ManageGroup title="최근 관리 기록 (100건)">
                                {management.logs.map((l) => (
                                  <div
                                    key={l.id}
                                    className={`${panel} text-sm`}
                                  >
                                    <p className="break-all font-bold">
                                      {l.action} · {formatTime(l.createdAt)}
                                    </p>
                                    <p className="mt-2 break-all">
                                      대상: {l.targetId}
                                    </p>
                                    <p className="break-all">
                                      처리 계정: {l.actorId}
                                    </p>
                                    {l.reason && (
                                      <p className="mt-2 break-words">
                                        {l.reason}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </ManageGroup>
                            </>
                          )}
                        </>
                      )}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </main>
        <aside className="sticky top-[72px] hidden h-[calc(100vh-72px)] border-l border-[#e0e2ef] px-6 py-8 xl:block">
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-lg font-extrabold">
              <Lightbulb className="text-[#b07a00]" />
              최근 찾기 단서
            </h2>
            {data.clues
              .filter((c) => !c.hidden)
              .slice(0, 5)
              .map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.itemId)}
                  className={`${panel} w-full text-left`}
                >
                  <p className="font-bold">
                    {data.items.find((i) => i.id === c.itemId)?.title}
                  </p>
                  <p className="mt-2 text-sm">
                    {c.place} · {c.seenTime}
                  </p>
                  <p className="mt-2 line-clamp-3 break-words text-sm text-muted-foreground">
                    {c.detail}
                  </p>
                </button>
              ))}
            {!data.clues.length && (
              <p className="text-sm text-muted-foreground">
                새 단서가 등록되면 여기에 표시됩니다.
              </p>
            )}
          </div>
        </aside>
      </div>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid h-[74px] grid-cols-4 border-t border-[#dfe2f1] bg-[#fbf9ff]/95 px-3 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
        aria-label="모바일 메뉴"
      >
        <MobileTab
          icon={<Home />}
          label="홈"
          active={section === "all" && !searchMode}
          onClick={() => {
            navigate("all");
            window.scrollTo({ top: 0 });
          }}
        />
        <MobileTab
          icon={<Search />}
          label="찾기"
          active={section === "all" && searchMode}
          onClick={() => {
            navigate("all");
            setSearchMode(true);
            setSearchFocus((value) => value + 1);
          }}
        />
        <MobileTab
          icon={<Plus />}
          label="등록"
          active={Boolean(editor)}
          onClick={requestRegistration}
        />
        <MobileTab
          icon={<CircleUserRound />}
          label="내 정보"
          active={profileOpen}
          onClick={() => (user ? navigate("profile") : void login())}
        />
      </nav>
      <Modal
        open={Boolean(selectedId)}
        onClose={() => setSelectedId(null)}
        title={selected?.title || "게시물 확인"}
        description="실명과 연락처를 공개하지 말고, 물건 반환은 선생님과 함께 확인하세요."
      >
        {selected && user ? (
          <div className="space-y-5">
            <ItemImage item={selected} user={user} large />
            <div className="flex flex-wrap gap-2">
              <Status item={selected} />
              {selected.hidden && (
                <span className="rounded-full bg-red-100 px-3 py-1 text-sm text-red-800">
                  임시 숨김
                </span>
              )}
              <span className="rounded-full bg-[#eff0f8] px-3 py-1 text-sm">
                {selected.isMine ? "내가 쓴 글" : "익명 작성"}
              </span>
            </div>
            <dl className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3">
              <dt className="text-muted-foreground">장소</dt>
              <dd className="break-words">{selected.location}</dd>
              <dt className="text-muted-foreground">날짜</dt>
              <dd>{selected.dateText}</dd>
              <dt className="text-muted-foreground">분류·색상</dt>
              <dd>
                {selected.category} {selected.color}
              </dd>
              {selected.kind === "found" && (
                <>
                  <dt className="text-muted-foreground">보관 장소</dt>
                  <dd className="break-words font-bold text-primary">
                    {selected.storageLocation || "선생님께 전달 대기 중"}
                  </dd>
                </>
              )}
            </dl>
            <p className="whitespace-pre-wrap break-words leading-7">
              {selected.description || "추가 설명이 없습니다."}
            </p>
            <div className="flex flex-wrap gap-2">
              {(admin ||
                (selected.isMine &&
                  ["seeking", "pending_handoff"].includes(selected.status) &&
                  !selected.hidden)) && (
                <Button variant="outline" onClick={() => setEditor(selected)}>
                  글 수정
                </Button>
              )}
              {(selected.isMine || admin) && (
                <Button
                  variant="outline"
                  onClick={() =>
                    ask(
                      "이 글을 삭제할까요?",
                      "item.delete",
                      { id: selected.id },
                      undefined,
                      undefined,
                      undefined,
                      "목록과 단서 화면에서 사라집니다. 삭제 기록은 보관됩니다.",
                    )
                  }
                >
                  글 삭제
                </Button>
              )}
              {!selected.isMine && (
                <Button
                  variant="outline"
                  onClick={() =>
                    ask(
                      "게시물 신고",
                      "report.create",
                      { id: selected.id, targetType: "items" },
                      "reason",
                      "",
                      "신고 이유",
                    )
                  }
                >
                  신고
                </Button>
              )}
              {teacher && (!selected.hidden || admin) && (
                <Button
                  variant="outline"
                  onClick={() =>
                    ask(
                      selected.hidden ? "숨김 해제" : "게시물 임시 숨김",
                      "item.hide",
                      { id: selected.id, hidden: !selected.hidden },
                      "reason",
                      "",
                      "처리 이유",
                    )
                  }
                >
                  {selected.hidden ? "숨김 해제" : "임시 숨김"}
                </Button>
              )}
              {(selected.isMine || admin) &&
                !selected.hidden &&
                selected.kind === "lost" &&
                ["seeking", "found"].includes(selected.status) && (
                  <Button
                    onClick={() =>
                      ask(
                        selected.status === "seeking"
                          ? "물건을 찾았나요?"
                          : "분실 신고를 종료할까요?",
                        "item.status",
                        {
                          id: selected.id,
                          status:
                            selected.status === "seeking" ? "found" : "closed",
                        },
                      )
                    }
                  >
                    {selected.status === "seeking" ? "찾았어요" : "신고 종료"}
                  </Button>
                )}
              {teacher && !selected.hidden && selected.kind === "found" && (
                <>
                  {selected.status === "pending_handoff" ? (
                    <Button
                      onClick={() =>
                        ask(
                          "인수 확인 및 3점 지급",
                          "item.handoff",
                          { id: selected.id },
                          "storageLocation",
                          "",
                          "보관 장소",
                          "실제 물건을 받은 뒤 확인하세요. 공개 목록에 표시되고 등록자에게 3점이 지급됩니다.",
                        )
                      }
                    >
                      <PackageCheck />
                      인수 확인 및 3점 지급
                    </Button>
                  ) : (
                    ["teacher_received", "looking_for_owner"].includes(
                      selected.status,
                    ) && (
                      <>
                        <Button
                          variant="outline"
                          onClick={() =>
                            ask(
                              "보관 장소 변경",
                              "item.storage",
                              { id: selected.id },
                              "storageLocation",
                              selected.storageLocation,
                              "새 보관 장소",
                            )
                          }
                        >
                          보관 장소 변경
                        </Button>
                        {selected.status === "teacher_received" && (
                          <Button
                            variant="outline"
                            onClick={() =>
                              ask(
                                "주인 찾는 중으로 변경할까요?",
                                "item.status",
                                {
                                  id: selected.id,
                                  status: "looking_for_owner",
                                },
                              )
                            }
                          >
                            주인 찾는 중
                          </Button>
                        )}
                        <Button
                          onClick={() =>
                            ask(
                              "주인에게 반환했나요?",
                              "item.status",
                              { id: selected.id, status: "returned" },
                              undefined,
                              undefined,
                              undefined,
                              "비공개 세부 특징을 확인하고 실제로 물건을 전달한 뒤 처리하세요.",
                            )
                          }
                        >
                          반환 완료
                        </Button>
                      </>
                    )
                  )}
                </>
              )}
            </div>
            {selected.kind === "lost" && (
              <section className="space-y-3 border-t pt-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-lg font-extrabold">찾기 단서</h3>
                  {selected.status === "seeking" && !selected.hidden && (
                    <Button
                      className="rounded-full"
                      onClick={() => setClueEditor({ item: selected })}
                    >
                      <Plus />
                      단서 남기기
                    </Button>
                  )}
                </div>
                {selected.status !== "seeking" && (
                  <p className="text-sm text-muted-foreground">
                    찾았거나 종료된 신고에는 새 단서를 남길 수 없습니다.
                  </p>
                )}
                {data.clues
                  .filter((c) => c.itemId === selected.id)
                  .map((c) => (
                    <div
                      key={c.id}
                      className={`rounded-3xl border p-4 ${c.hidden ? "bg-red-50" : "bg-[#fafaff]"}`}
                    >
                      <p className="font-bold">
                        {c.isMine ? "내 단서" : "익명 단서"}
                        {c.hidden ? " · 숨김" : ""}
                        {c.helpful ? " · 도움이 된 단서" : ""}
                      </p>
                      <p className="mt-2 text-sm">
                        {c.place} · {c.seenDate} · {c.seenTime}
                      </p>
                      <p className="my-3 whitespace-pre-wrap break-words">
                        {c.detail}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {c.isMine &&
                          !c.hidden &&
                          !selected.hidden &&
                          selected.status === "seeking" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setClueEditor({ item: selected, clue: c })
                              }
                            >
                              수정
                            </Button>
                          )}
                        {(c.isMine || admin) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              ask("단서를 삭제할까요?", "clue.delete", {
                                id: c.id,
                              })
                            }
                          >
                            삭제
                          </Button>
                        )}
                        {!c.isMine && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              ask(
                                "단서 신고",
                                "report.create",
                                { id: c.id, targetType: "clues" },
                                "reason",
                                "",
                                "신고 이유",
                              )
                            }
                          >
                            신고
                          </Button>
                        )}
                        {teacher && (!c.hidden || admin) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              ask(
                                c.hidden ? "단서 숨김 해제" : "단서 임시 숨김",
                                "clue.hide",
                                { id: c.id, hidden: !c.hidden },
                                "reason",
                                "",
                                "처리 이유",
                              )
                            }
                          >
                            {c.hidden ? "숨김 해제" : "임시 숨김"}
                          </Button>
                        )}
                        {selected.isMine &&
                          !c.isMine &&
                          !c.hidden &&
                          !selected.hidden && (
                            <Button
                              size="sm"
                              className="bg-[#ffe17c] text-[#654c00] hover:bg-[#f5d46b]"
                              disabled={c.helpful}
                              onClick={() =>
                                ask(
                                  "이 단서가 도움이 됐나요?",
                                  "clue.helpful",
                                  { id: c.id },
                                  undefined,
                                  undefined,
                                  undefined,
                                  "실제 물건 찾기에 도움이 된 경우 작성자에게 1점을 지급합니다. 같은 학생에게는 이 신고에서 한 번만 지급됩니다.",
                                )
                              }
                            >
                              {c.helpful
                                ? "도움 표시 완료"
                                : "도움 됐어요 · +1점"}
                            </Button>
                          )}
                      </div>
                    </div>
                  ))}
                {!data.clues.some((c) => c.itemId === selected.id) && (
                  <Empty text="아직 단서가 없습니다. 본 장소와 상황을 알려주세요." />
                )}
              </section>
            )}
          </div>
        ) : (
          <Empty text="삭제되었거나 열람할 수 없는 게시물입니다." />
        )}
      </Modal>
      {editor && user && (
        <ItemEditor
          key={typeof editor === "string" ? editor : editor.id}
          item={typeof editor === "string" ? undefined : editor}
          kind={typeof editor === "string" ? editor : editor.kind}
          teacher={teacher}
          user={user}
          onClose={() => setEditor(null)}
          onSave={mutate}
        />
      )}
      {clueEditor && (
        <ClueEditor
          item={clueEditor.item}
          clue={clueEditor.clue}
          onClose={() => setClueEditor(null)}
          onSave={mutate}
        />
      )}
      {prompt && (
        <ActionPrompt
          prompt={prompt}
          onClose={() => setPrompt(null)}
          onSave={mutate}
        />
      )}
      <Modal
        open={noticesOpen}
        onClose={() => setNoticesOpen(false)}
        title="내 알림함"
        description="알림을 놓쳐도 여기에서 다시 확인할 수 있어요. 앱을 열면 새 소식을 불러옵니다."
      >
        <div className="space-y-3">
          {data.notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => void openNotice(n)}
              className={`w-full rounded-3xl p-4 text-left ${n.status === "cancelled" ? "bg-[#eeeef2]" : n.read ? "bg-[#f6f6fc]" : "bg-[#e9ecff]"}`}
            >
              <p className="font-bold">
                {n.status === "cancelled"
                  ? "취소된 안내 · "
                  : !n.read
                    ? "새 알림 · "
                    : ""}
                {n.title}
              </p>
              <p className="mt-2 break-words text-sm leading-6">{n.message}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {formatTime(n.createdAt)}
              </p>
            </button>
          ))}
          {!data.notifications.length && (
            <Empty text="새 알림이 없습니다. 내 글, 단서, 포인트에 변화가 생기면 알려드릴게요." />
          )}
        </div>
      </Modal>
      {toast && (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 z-[100] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 rounded-2xl bg-[#202557] px-5 py-4 text-sm leading-6 text-white shadow-xl lg:bottom-8"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
