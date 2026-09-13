"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bell, Check, ChevronRight, CircleUserRound, Clock3, Eye, Home,
  ImagePlus, Lightbulb, MapPin, Megaphone, PackageCheck, PackageOpen,
  LogIn, LogOut, PenLine, Plus, Search, ShieldCheck, Sparkles, Tag, X,
} from "lucide-react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  getFirebaseServices,
  isAllowedSchoolEmail,
  isFirebaseConfigured,
  schoolEmailDomain,
} from "@/lib/firebase/client";
import {
  createItem,
  subscribeToPublishedItems,
  type ItemKind,
  type StoredItem,
} from "@/lib/firebase/items";
import { ensureStudentProfile } from "@/lib/firebase/users";

type Kind = ItemKind;
type Item = StoredItem;

const initialItems: Item[] = [
  { id:"demo-1", kind:"lost", title:"검정색 무선 이어폰", category:"전자기기", location:"본관 2층 또는 도서관", date:"9월 12일", status:"찾는 중", color:"검정", tone:"violet", clueCount:2, description:"검정색 타원형 케이스이고 오른쪽 이어폰에 작은 흠집이 있습니다." },
  { id:"demo-2", kind:"found", title:"파란색 지퍼 필통", category:"학용품", location:"3층 연결 복도 창가", date:"9월 13일", status:"주인 찾는 중", color:"파랑", tone:"blue", clueCount:0, description:"앞면에 흰색 작은 별 무늬가 있습니다. 1층 교무실에서 보관 중입니다." },
  { id:"demo-3", kind:"found", title:"회색 체육복 상의", category:"의류", location:"체육관 무대 오른쪽", date:"9월 12일", status:"교사 인수", color:"회색", tone:"orange", clueCount:0, description:"중간 크기이며 이름표 부분은 사진에서 가렸습니다. 체육교무실에서 보관 중입니다." },
  { id:"demo-4", kind:"lost", title:"은색 보온 물병", category:"생활용품", location:"급식실 앞 벤치", date:"9월 11일", status:"찾는 중", color:"은색", tone:"mint", clueCount:1, description:"뚜껑에 연두색 고리가 달린 500ml 물병입니다." },
  { id:"demo-5", kind:"found", title:"노란 우산", category:"생활용품", location:"후관 1층 우산꽂이", date:"9월 10일", status:"주인 찾는 중", color:"노랑", tone:"yellow", clueCount:0, description:"접이식이 아닌 긴 우산이며 손잡이에 토끼 스티커가 붙어 있습니다." },
  { id:"demo-6", kind:"lost", title:"투명 학생증 케이스", category:"기타", location:"운동장 스탠드 근처", date:"9월 9일", status:"찾는 중", color:"투명", tone:"pink", clueCount:3, description:"파란 목걸이 줄이 달린 투명 카드 케이스입니다. 개인정보는 공개하지 않았습니다." },
];

const tones: Record<string,string> = {
  violet:"from-[#cdc7ff] to-[#eceaff] text-[#352b82]", blue:"from-[#aad4ff] to-[#e7f3ff] text-[#16466f]",
  orange:"from-[#ffc7a7] to-[#fff0e7] text-[#743719]", mint:"from-[#9ee7d5] to-[#e4f8f1] text-[#145342]",
  yellow:"from-[#ffe17c] to-[#fff6c9] text-[#684f00]", pink:"from-[#f8bfd6] to-[#fff0f5] text-[#742744]",
};

export default function LostFoundApp() {
  const [kind,setKind] = useState<"all"|Kind>("all");
  const [query,setQuery] = useState("");
  const [selected,setSelected] = useState<Item|null>(null);
  const [registerOpen,setRegisterOpen] = useState(false);
  const [noticeOpen,setNoticeOpen] = useState(false);
  const [newKind,setNewKind] = useState<Kind>("lost");
  const [items,setItems] = useState(initialItems);
  const [toast,setToast] = useState("");
  const [authUser,setAuthUser] = useState<User|null>(null);
  const [authBusy,setAuthBusy] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const { auth, db } = getFirebaseServices();
    let unsubscribeItems: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async user => {
      unsubscribeItems?.();
      unsubscribeItems = undefined;

      if (!user) {
        setAuthUser(null);
        setItems(initialItems);
        return;
      }

      if (!isAllowedSchoolEmail(user.email)) {
        await signOut(auth);
        flash(`@${schoolEmailDomain} 학교 계정으로 로그인해 주세요.`);
        return;
      }

      try {
        await ensureStudentProfile(db, user);
      } catch {
        flash("학교 사용자 정보를 준비하지 못했습니다. Firebase 설정을 확인해 주세요.");
        return;
      }

      setAuthUser(user);
      unsubscribeItems = subscribeToPublishedItems(
        db,
        setItems,
        () => flash("Firebase 목록을 불러오지 못했습니다. 보안 규칙을 확인해 주세요."),
      );
    });

    return () => {
      unsubscribeItems?.();
      unsubscribeAuth();
    };
  }, []);

  const filtered = useMemo(() => {
    const needle=query.trim().toLowerCase();
    return items.filter(item => (kind==="all"||item.kind===kind) && (!needle||`${item.title} ${item.location} ${item.category} ${item.color}`.toLowerCase().includes(needle)));
  },[items,kind,query]);

  function flash(message:string){ setToast(message); setTimeout(()=>setToast(""),2600); }
  async function handleSignIn(){
    if (!isFirebaseConfigured) return;
    setAuthBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ hd: schoolEmailDomain, prompt: "select_account" });
      const { auth } = getFirebaseServices();
      const result = await signInWithPopup(auth, provider);
      if (!isAllowedSchoolEmail(result.user.email)) {
        await signOut(auth);
        flash(`@${schoolEmailDomain} 학교 계정만 사용할 수 있습니다.`);
      }
    } catch {
      flash("Google 로그인을 완료하지 못했습니다.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignOut(){
    if (!isFirebaseConfigured) return;
    await signOut(getFirebaseServices().auth);
    flash("로그아웃했습니다.");
  }

  async function addDemoItem(formData:FormData){
    const title=String(formData.get("title")||"새로 등록한 물건");
    const location=String(formData.get("location")||"장소 확인 중");
    const description=String(formData.get("description")||"상세 설명이 없습니다.");

    if (isFirebaseConfigured) {
      if (!authUser) {
        flash("학교 Google 계정으로 먼저 로그인해 주세요.");
        return;
      }
      try {
        await createItem(getFirebaseServices().db, {
          kind:newKind, title, location, description, authorId:authUser.uid,
        });
        setRegisterOpen(false);
        flash(newKind==="lost" ? "분실 신고가 저장되었습니다." : "습득물이 전달 대기로 저장되었습니다.");
      } catch {
        flash("Firebase에 저장하지 못했습니다. 설정과 보안 규칙을 확인해 주세요.");
      }
      return;
    }

    setItems(current => [{ id:`demo-${Date.now()}`, kind:newKind, title, location, description, category:"기타", date:"오늘", status:newKind==="lost"?"찾는 중":"전달 대기", color:"", tone:newKind==="lost"?"violet":"blue", clueCount:0 },...current]);
    setRegisterOpen(false); flash(`${newKind==="lost"?"분실 신고":"습득물"}가 시연 목록에 등록되었습니다.`);
  }

  return <div className="min-h-screen bg-background text-foreground">
    <header className="sticky top-0 z-40 border-b border-[#dfe2f3] bg-[#fbf9ff]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-[1440px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button className="brand-mark" aria-label="어디 있니? 홈"><Search className="size-6 stroke-[2.4]"/><span className="brand-spark"/></button>
        <div className="min-w-0"><div className="flex items-baseline gap-2"><h1 className="text-[1.28rem] font-extrabold tracking-[-0.055em] sm:text-[1.45rem]">어디 있니?</h1><span className="hidden text-sm font-medium text-muted-foreground sm:inline">우리 학교 분실물 찾기</span></div></div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="icon-lg" className="relative rounded-full hover:bg-[#eeedff]" aria-label="알림 3개" onClick={()=>setNoticeOpen(true)}><Bell className="size-5"/><span className="absolute right-1 top-1 grid size-[18px] place-items-center rounded-full bg-[#e33f65] text-[10px] font-bold text-white">3</span></Button>
          {isFirebaseConfigured ? authUser ? <button onClick={handleSignOut} className="hidden items-center gap-2 rounded-full border border-[#d9dcf0] bg-white px-3 py-2 text-sm font-bold shadow-[0_2px_8px_rgba(40,45,85,.05)] sm:flex"><span className="grid size-8 place-items-center rounded-full bg-[#e0e3ff] text-[#3e4daf]">{authUser.displayName?.slice(0,1)||"학"}</span><span>학교 계정</span><LogOut className="size-4"/></button> : <Button variant="outline" className="rounded-full" disabled={authBusy} onClick={handleSignIn}><LogIn className="size-4"/>{authBusy?"로그인 중":"학교 계정 로그인"}</Button> : <span className="hidden rounded-full bg-[#fff4cf] px-3 py-2 text-xs font-bold text-[#725700] sm:inline">시연 모드</span>}
        </div>
      </div>
    </header>

    <div className="mx-auto grid max-w-[1440px] lg:grid-cols-[220px_minmax(0,1fr)_280px]">
      <aside className="sticky top-[72px] hidden h-[calc(100vh-72px)] border-r border-[#e0e2ef] px-5 py-7 lg:flex lg:flex-col">
        <nav className="space-y-1" aria-label="주요 메뉴"><SideLink icon={<Home/>} label="물건 찾기" active/><SideLink icon={<PenLine/>} label="내가 쓴 글"/><SideLink icon={<Lightbulb/>} label="내가 남긴 단서"/><SideLink icon={<Bell/>} label="알림" count="3"/></nav>
        <div className="my-6 h-px bg-[#e2e4f0]"/><p className="mb-2 px-3 text-xs font-bold tracking-wide text-muted-foreground">교사 메뉴</p>
        <nav className="space-y-1"><SideLink icon={<PackageCheck/>} label="인수 대기" count="2"/><SideLink icon={<ShieldCheck/>} label="관리 도구"/></nav>
        <div className="mt-auto rounded-[24px] bg-[#eef0ff] p-4 text-[#303b91]"><div className="mb-2 flex items-center gap-2 text-sm font-bold"><ShieldCheck className="size-4"/>교사 인증 완료</div><p className="text-xs leading-relaxed text-[#5961a1]">습득물을 확인하고 보관 장소를 안내할 수 있습니다.</p></div>
      </aside>

      <main className="min-w-0 px-4 pb-28 pt-6 sm:px-7 sm:pt-8 lg:px-9 lg:pb-12"><section className="mx-auto max-w-[880px]">
        <div className="mb-5 flex items-end justify-between gap-4"><div><p className="mb-1 flex items-center gap-1.5 text-sm font-bold text-[#4a56ba]"><Sparkles className="size-4"/>오늘 새 소식 4개</p><h2 className="text-[1.7rem] font-extrabold tracking-[-0.045em] sm:text-[2rem]">잃어버린 물건을 찾아보세요</h2></div><Button className="hidden h-12 rounded-full bg-[#4958c7] px-5 text-[15px] shadow-[0_8px_22px_rgba(73,88,199,.25)] hover:bg-[#3847b5] sm:flex" onClick={()=>setRegisterOpen(true)}><Plus className="size-5"/>물건 등록</Button></div>
        <div className="search-shell"><Search className="size-5 shrink-0 text-[#4b5599]"/><Input value={query} onChange={e=>setQuery(e.target.value)} className="h-auto border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0" placeholder="물건 이름, 색상, 잃어버린 장소로 검색" aria-label="분실물 검색"/>{query&&<Button variant="ghost" size="icon-sm" className="rounded-full" onClick={()=>setQuery("")} aria-label="검색어 지우기"><X/></Button>}</div>
        <div className="scrollbar-none -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" aria-label="물건 종류 필터"><FilterChip active={kind==="all"} onClick={()=>setKind("all")}>전체 {items.length}</FilterChip><FilterChip active={kind==="lost"} onClick={()=>setKind("lost")}>잃어버렸어요</FilterChip><FilterChip active={kind==="found"} onClick={()=>setKind("found")}>주인을 찾아요</FilterChip><FilterChip>최근 7일</FilterChip><FilterChip>장소</FilterChip></div>
        <div className="mt-7 flex items-center justify-between"><p className="text-sm font-bold">{filtered.length}개의 물건</p><button className="text-sm font-medium text-muted-foreground">최신순 ▾</button></div>
        {filtered.length>0?<div className="mt-3 grid gap-4 sm:grid-cols-2">{filtered.map(item=><ItemCard key={item.id} item={item} onClick={()=>setSelected(item)}/>)}</div>:<div className="mt-4 grid min-h-64 place-items-center rounded-[28px] border border-dashed border-[#cfd3e9] bg-white p-8 text-center"><div><Search className="mx-auto mb-3 size-9 text-[#7a82bd]"/><p className="font-bold">검색 결과가 없습니다</p><p className="mt-1 text-sm text-muted-foreground">장소나 색상을 다른 말로 검색해 보세요.</p></div></div>}
      </section></main>

      <aside className="sticky top-[72px] hidden h-[calc(100vh-72px)] border-l border-[#e0e2ef] px-6 py-8 xl:block"><div className="mb-6 flex items-center justify-between"><h2 className="font-extrabold tracking-[-0.03em]">최근 찾기 단서</h2><Lightbulb className="size-5 text-[#d28700]"/></div><div className="space-y-3"><ClueCard title="검정색 무선 이어폰" text="도서관 반납대 옆에서 비슷한 케이스를 봤어요." time="8분 전"/><ClueCard title="은색 보온 물병" text="급식실에서 후관 쪽으로 옮겨진 것 같아요." time="35분 전"/><ClueCard title="투명 학생증 케이스" text="운동장 방송실 앞 계단에서 봤습니다." time="어제"/></div><button className="mt-4 flex w-full items-center justify-center gap-1 rounded-full py-2 text-sm font-bold text-[#4a56ba] hover:bg-[#f0f1ff]">단서 모두 보기<ChevronRight className="size-4"/></button><div className="mt-8 rounded-[26px] bg-[#1f265e] p-5 text-white shadow-[0_16px_30px_rgba(31,38,94,.14)]"><div className="mb-3 grid size-10 place-items-center rounded-2xl bg-white/12"><Megaphone className="size-5"/></div><p className="font-bold">사진 등록 전 확인해요</p><p className="mt-1 text-xs leading-relaxed text-[#d8dcff]">얼굴, 이름표, 전화번호가 보이지 않도록 가린 뒤 올려주세요.</p></div></aside>
    </div>

    <nav className="fixed inset-x-0 bottom-0 z-40 grid h-[74px] grid-cols-4 border-t border-[#dfe2f1] bg-[#fbf9ff]/95 px-3 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden" aria-label="모바일 메뉴"><MobileLink icon={<Home/>} label="홈" active/><MobileLink icon={<Search/>} label="찾기"/><button className="relative flex flex-col items-center justify-center gap-1 text-xs font-bold text-[#4a56ba]" onClick={()=>setRegisterOpen(true)}><span className="absolute -top-5 grid size-14 place-items-center rounded-[20px] bg-[#4958c7] text-white shadow-[0_9px_20px_rgba(73,88,199,.32)]"><Plus className="size-7"/></span><span className="mt-9">등록</span></button><MobileLink icon={<CircleUserRound/>} label="내 정보"/></nav>

    <Dialog open={!!selected} onOpenChange={open=>!open&&setSelected(null)}><DialogContent className="max-h-[88vh] overflow-y-auto rounded-[30px] border-[#dfe2f1] p-0 sm:max-w-[620px]">{selected&&<><div className={`relative grid h-52 place-items-center overflow-hidden rounded-t-[29px] bg-gradient-to-br ${tones[selected.tone]}`}><PackageOpen className="size-20 stroke-[1.25] opacity-80"/><span className="absolute left-5 top-5 rounded-full bg-white/75 px-3 py-1 text-xs font-extrabold backdrop-blur">{selected.kind==="lost"?"잃어버렸어요":"주인을 찾아요"}</span></div><div className="p-6 sm:p-7"><DialogHeader className="text-left"><div className="flex items-start justify-between gap-3"><DialogTitle className="text-2xl font-extrabold tracking-[-0.04em]">{selected.title}</DialogTitle><StatusBadge item={selected}/></div><DialogDescription className="sr-only">물건 상세 정보</DialogDescription></DialogHeader><div className="mt-5 grid gap-3 rounded-[22px] bg-[#f4f4fb] p-4 text-sm"><InfoRow icon={<MapPin/>} label="장소" value={selected.location}/><InfoRow icon={<Clock3/>} label="날짜" value={selected.date}/><InfoRow icon={<Tag/>} label="분류" value={`${selected.category}${selected.color?` · ${selected.color}`:""}`}/></div><p className="mt-5 text-[15px] leading-7 text-[#3f4254]">{selected.description}</p>{selected.kind==="lost"&&<div className="mt-6 rounded-[22px] border border-[#ead89b] bg-[#fff8dc] p-4"><div className="flex items-center gap-2 font-bold text-[#705600]"><Lightbulb className="size-4"/>찾기 단서 {selected.clueCount}개</div><p className="mt-2 text-sm leading-relaxed text-[#6c6041]">이 물건을 본 적이 있다면 장소와 시간을 알려주세요. 연락처는 적지 않아도 됩니다.</p></div>}<DialogFooter className="mt-6 sm:justify-stretch">{selected.kind==="lost"?<Button className="h-12 flex-1 rounded-full bg-[#4958c7] hover:bg-[#3847b5]" onClick={()=>{setSelected(null);flash("찾기 단서를 남겼습니다.")}}><Lightbulb/>찾기 단서 남기기</Button>:<Button className="h-12 flex-1 rounded-full bg-[#4958c7] hover:bg-[#3847b5]" onClick={()=>{setSelected(null);flash("보관 장소를 확인했습니다.")}}><MapPin/>보관 장소 확인</Button>}<DialogClose asChild><Button variant="outline" className="h-12 rounded-full px-5">닫기</Button></DialogClose></DialogFooter></div></>}</DialogContent></Dialog>

    <Dialog open={registerOpen} onOpenChange={setRegisterOpen}><DialogContent className="max-h-[90vh] overflow-y-auto rounded-[30px] border-[#dfe2f1] sm:max-w-[560px]"><DialogHeader className="text-left"><DialogTitle className="text-2xl font-extrabold tracking-[-0.04em]">물건 등록하기</DialogTitle><DialogDescription>{isFirebaseConfigured?"학교 계정으로 등록한 내용이 안전하게 저장됩니다.":"Firebase 설정 전에는 시연 목록에만 추가됩니다."}</DialogDescription></DialogHeader><div className="grid grid-cols-2 gap-2 rounded-[18px] bg-[#eff0f7] p-1.5"><button type="button" onClick={()=>setNewKind("lost")} className={`h-11 rounded-[14px] text-sm font-bold transition ${newKind==="lost"?"bg-white text-[#3544aa] shadow-sm":"text-muted-foreground"}`}>잃어버렸어요</button><button type="button" onClick={()=>setNewKind("found")} className={`h-11 rounded-[14px] text-sm font-bold transition ${newKind==="found"?"bg-white text-[#3544aa] shadow-sm":"text-muted-foreground"}`}>주인을 찾아요</button></div><form action={addDemoItem} className="space-y-4"><label className="block text-sm font-bold">물건 이름<Input required name="title" placeholder="예: 검정색 무선 이어폰" className="mt-2 h-12 rounded-[16px] bg-[#f8f8fd]"/></label><label className="block text-sm font-bold">마지막으로 본 장소<Input required name="location" placeholder="자유롭게 입력하세요" className="mt-2 h-12 rounded-[16px] bg-[#f8f8fd]"/></label><label className="block text-sm font-bold">특징<Textarea name="description" placeholder="색상, 모양, 눈에 띄는 특징을 적어주세요" className="mt-2 min-h-24 rounded-[16px] bg-[#f8f8fd]"/></label><button type="button" disabled className="flex h-24 w-full cursor-not-allowed items-center justify-center gap-2 rounded-[20px] border border-dashed border-[#aeb4da] bg-[#f7f7ff] text-sm font-bold text-[#777da8]"><ImagePlus className="size-5"/>사진 연결 준비 중</button><div className="rounded-[16px] bg-[#fff6d8] px-4 py-3 text-xs leading-relaxed text-[#66552a]">얼굴·이름표·전화번호가 보이지 않는지 확인해 주세요.</div><DialogFooter><DialogClose asChild><Button type="button" variant="outline" className="h-12 rounded-full">취소</Button></DialogClose><Button type="submit" className="h-12 rounded-full bg-[#4958c7] px-7 hover:bg-[#3847b5]">등록하기</Button></DialogFooter></form></DialogContent></Dialog>

    <Dialog open={noticeOpen} onOpenChange={setNoticeOpen}><DialogContent className="rounded-[30px] border-[#dfe2f1] sm:max-w-[500px]"><DialogHeader className="text-left"><DialogTitle className="text-2xl font-extrabold tracking-[-0.04em]">알림</DialogTitle><DialogDescription>내 글과 관련된 새 소식입니다.</DialogDescription></DialogHeader><div className="space-y-2"><Notice icon={<Lightbulb/>} title="새로운 찾기 단서가 도착했어요" text="검정색 무선 이어폰 · 도서관 반납대 근처"/><Notice icon={<PackageCheck/>} title="습득물을 선생님이 인수했어요" text="회색 체육복 상의 · 체육교무실 보관"/><Notice icon={<Eye/>} title="비슷한 습득물이 등록되었어요" text="은색 보온 물병과 색상·장소가 비슷해요"/></div></DialogContent></Dialog>
    {toast&&<div role="status" className="fixed bottom-24 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-[#202557] px-5 py-3 text-sm font-bold text-white shadow-xl lg:bottom-8"><Check className="size-4"/>{toast}</div>}
  </div>;
}

function SideLink({icon,label,active,count}:{icon:React.ReactNode;label:string;active?:boolean;count?:string}){return <button className={`flex h-12 w-full items-center gap-3 rounded-[16px] px-3 text-sm font-bold transition ${active?"bg-[#e0e3ff] text-[#3544aa]":"text-[#55586b] hover:bg-[#f0f1f8]"}`}><span className="[&>svg]:size-[19px]">{icon}</span><span>{label}</span>{count&&<span className="ml-auto grid min-w-5 place-items-center rounded-full bg-[#e33f65] px-1.5 py-0.5 text-[10px] text-white">{count}</span>}</button>}
function MobileLink({icon,label,active}:{icon:React.ReactNode;label:string;active?:boolean}){return <button className={`flex flex-col items-center justify-center gap-1 text-[11px] font-bold ${active?"text-[#4251b8]":"text-[#73768a]"}`}><span className={`grid h-8 w-14 place-items-center rounded-full [&>svg]:size-5 ${active?"bg-[#e0e3ff]":""}`}>{icon}</span>{label}</button>}
function FilterChip({active,onClick,children}:{active?:boolean;onClick?:()=>void;children:React.ReactNode}){return <button onClick={onClick} className={`h-10 shrink-0 rounded-full border px-4 text-sm font-bold transition ${active?"border-[#4958c7] bg-[#4958c7] text-white shadow-[0_5px_13px_rgba(73,88,199,.18)]":"border-[#d5d8e8] bg-white text-[#55586c] hover:border-[#929ad1] hover:bg-[#f6f6ff]"}`}>{children}</button>}
function ItemCard({item,onClick}:{item:Item;onClick:()=>void}){return <button onClick={onClick} className="item-card group text-left"><div className={`item-visual bg-gradient-to-br ${tones[item.tone]}`}><PackageOpen className="size-14 stroke-[1.25] opacity-75 transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-105"/><span className="absolute left-3 top-3 rounded-full bg-white/75 px-2.5 py-1 text-[11px] font-extrabold backdrop-blur-sm">{item.kind==="lost"?"분실":"습득"}</span></div><div className="min-w-0 flex-1 py-0.5"><div className="flex items-start justify-between gap-2"><h3 className="line-clamp-1 text-[16px] font-extrabold tracking-[-0.025em]">{item.title}</h3><ChevronRight className="mt-0.5 size-4 shrink-0 text-[#9b9fb3] transition-transform group-hover:translate-x-0.5"/></div><p className="mt-2 flex items-center gap-1.5 text-[13px] text-[#666a7c]"><MapPin className="size-3.5 shrink-0"/><span className="line-clamp-1">{item.location}</span></p><p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-[#666a7c]"><Clock3 className="size-3.5 shrink-0"/>{item.date}</p><div className="mt-3 flex items-center justify-between gap-2"><StatusBadge item={item}/>{item.clueCount>0&&<span className="flex items-center gap-1 text-xs font-bold text-[#a66b00]"><Lightbulb className="size-3.5"/>단서 {item.clueCount}</span>}</div></div></button>}
function StatusBadge({item}:{item:Item}){return <Badge className={`border-0 px-2.5 py-1 ${item.kind==="lost"?"bg-[#eeeaff] text-[#5146a8]":"bg-[#daf4eb] text-[#17624c]"}`}>{item.status}</Badge>}
function ClueCard({title,text,time}:{title:string;text:string;time:string}){return <button className="w-full rounded-[20px] border border-[#e1e3f0] bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-[#bec3e5] hover:shadow-[0_8px_20px_rgba(40,45,90,.07)]"><div className="mb-2 flex items-center justify-between gap-2"><p className="line-clamp-1 text-sm font-extrabold">{title}</p><span className="shrink-0 text-[11px] text-muted-foreground">{time}</span></div><p className="line-clamp-2 text-xs leading-relaxed text-[#6d7083]">{text}</p></button>}
function InfoRow({icon,label,value}:{icon:React.ReactNode;label:string;value:string}){return <div className="grid grid-cols-[20px_44px_1fr] items-start gap-2"><span className="pt-0.5 text-[#5963af] [&>svg]:size-4">{icon}</span><span className="font-bold text-[#696c7e]">{label}</span><span className="font-medium text-[#303344]">{value}</span></div>}
function Notice({icon,title,text}:{icon:React.ReactNode;title:string;text:string}){return <button className="flex w-full items-start gap-3 rounded-[20px] bg-[#f5f5fc] p-4 text-left hover:bg-[#eeeff9]"><span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#e0e3ff] text-[#4553b8] [&>svg]:size-5">{icon}</span><span className="min-w-0"><span className="flex items-center gap-2 text-sm font-extrabold">{title}<span className="size-2 rounded-full bg-[#e33f65]"/></span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{text}</span></span></button>}
