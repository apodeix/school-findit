"use client";

/* eslint-disable @next/next/no-img-element -- Firestore data URLs are already compressed client-side. */

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  Award, Bell, Camera, Check, ChevronRight, CircleUserRound, Clock3, Gift, Home,
  ImagePlus, KeyRound, Lightbulb, MapPin, Megaphone, PackageCheck, PackageOpen,
  LoaderCircle, LogIn, LogOut, PenLine, Plus, RotateCcw, Search, ShieldCheck, Sparkles,
  Tag, Trash2, Trophy, X,
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
  confirmItemHandoff,
  createItem,
  softDeleteItem,
  subscribeToPublishedItems,
  updateItem,
  type ItemKind,
  type StoredItem,
} from "@/lib/firebase/items";
import { ensureUserProfile, type UserRole } from "@/lib/firebase/users";
import { changeTeacherCode, verifyTeacherCode } from "@/lib/firebase/teacher-verification";
import { cancelNotification, markNotificationRead, subscribeToAllNotifications, subscribeToNotifications, type AppNotification } from "@/lib/firebase/notifications";
import { prepareItemImage } from "@/lib/images";
import {
  REWARD_POINTS,
  cancelDemoReward,
  getRewardSummary,
  grantDemoReward,
  handoffRewardKey,
  helpfulClueRewardKey,
  initialDemoRewards,
  rewardReasonLabel,
  type RewardTransaction,
} from "@/lib/rewards";

type Kind = ItemKind;
type Item = StoredItem & { isMine?: boolean };

type DemoClue = {
  id: string;
  itemId: string;
  authorId: string;
  place: string;
  seenAt: string;
  detail: string;
};

type PendingHandoff = {
  id: string;
  title: string;
  studentId: string;
  location: string;
  received: boolean;
  persisted?: boolean;
};

const initialItems: Item[] = [
  { id:"demo-1", kind:"lost", title:"검정색 무선 이어폰", category:"전자기기", location:"본관 2층 또는 도서관", date:"9월 12일", status:"찾는 중", color:"검정", tone:"violet", clueCount:2, description:"검정색 타원형 케이스이고 오른쪽 이어폰에 작은 흠집이 있습니다.", isMine:true },
  { id:"demo-2", kind:"found", title:"파란색 지퍼 필통", category:"학용품", location:"3층 연결 복도 창가", date:"9월 13일", status:"주인 찾는 중", color:"파랑", tone:"blue", clueCount:0, description:"앞면에 흰색 작은 별 무늬가 있습니다. 1층 교무실에서 보관 중입니다." },
  { id:"demo-3", kind:"found", title:"회색 체육복 상의", category:"의류", location:"체육관 무대 오른쪽", date:"9월 12일", status:"교사 인수", color:"회색", tone:"orange", clueCount:0, description:"중간 크기이며 이름표 부분은 사진에서 가렸습니다. 체육교무실에서 보관 중입니다." },
  { id:"demo-4", kind:"lost", title:"은색 보온 물병", category:"생활용품", location:"급식실 앞 벤치", date:"9월 11일", status:"찾는 중", color:"은색", tone:"mint", clueCount:1, description:"뚜껑에 연두색 고리가 달린 500ml 물병입니다.", isMine:true },
  { id:"demo-5", kind:"found", title:"노란 우산", category:"생활용품", location:"후관 1층 우산꽂이", date:"9월 10일", status:"주인 찾는 중", color:"노랑", tone:"yellow", clueCount:0, description:"접이식이 아닌 긴 우산이며 손잡이에 토끼 스티커가 붙어 있습니다." },
  { id:"demo-6", kind:"lost", title:"투명 학생증 케이스", category:"기타", location:"운동장 스탠드 근처", date:"9월 9일", status:"찾는 중", color:"투명", tone:"pink", clueCount:3, description:"파란 목걸이 줄이 달린 투명 카드 케이스입니다. 개인정보는 공개하지 않았습니다." },
];

const demoClues: DemoClue[] = [
  { id:"clue-1", itemId:"demo-1", authorId:"helper-a", place:"도서관 반납대 옆", seenAt:"9월 12일 오후 1시쯤", detail:"비슷한 검정색 케이스가 책 반납대 옆에 놓여 있었어요." },
  { id:"clue-2", itemId:"demo-1", authorId:"helper-a", place:"도서관 입구", seenAt:"9월 12일 오후 1시 20분쯤", detail:"같은 물건을 안내 데스크로 옮기는 것을 봤어요." },
  { id:"clue-3", itemId:"demo-4", authorId:"helper-b", place:"후관 연결 복도", seenAt:"9월 11일 점심시간", detail:"급식실 앞 벤치에서 후관 방향으로 옮겨진 것 같아요." },
];

const initialPendingHandoffs: PendingHandoff[] = [
  { id:"handoff-1", title:"빨간색 보조 가방", studentId:"finder-a", location:"2층 교무실 앞", received:false },
  { id:"handoff-2", title:"흰색 카드 지갑", studentId:"finder-b", location:"중앙 계단", received:false },
];

const tones: Record<string,string> = {
  violet:"from-[#cdc7ff] to-[#eceaff] text-[#352b82]", blue:"from-[#aad4ff] to-[#e7f3ff] text-[#16466f]",
  orange:"from-[#ffc7a7] to-[#fff0e7] text-[#743719]", mint:"from-[#9ee7d5] to-[#e4f8f1] text-[#145342]",
  yellow:"from-[#ffe17c] to-[#fff6c9] text-[#684f00]", pink:"from-[#f8bfd6] to-[#fff0f5] text-[#742744]",
};

export default function LostFoundApp() {
  const [section,setSection] = useState<"all"|"mine"|"clues">("all");
  const [kind,setKind] = useState<"all"|Kind>("all");
  const [query,setQuery] = useState("");
  const [selected,setSelected] = useState<Item|null>(null);
  const [registerOpen,setRegisterOpen] = useState(false);
  const [noticeOpen,setNoticeOpen] = useState(false);
  const [newKind,setNewKind] = useState<Kind>("lost");
  const [items,setItems] = useState(initialItems);
  const [toast,setToast] = useState("");
  const [authUser,setAuthUser] = useState<User|null>(null);
  const [userRole,setUserRole] = useState<UserRole|null>(null);
  const [authBusy,setAuthBusy] = useState(false);
  const [rewards,setRewards] = useState<RewardTransaction[]>(initialDemoRewards);
  const [profileOpen,setProfileOpen] = useState(false);
  const [handoffOpen,setHandoffOpen] = useState(false);
  const [adminOpen,setAdminOpen] = useState(false);
  const [pendingHandoffs,setPendingHandoffs] = useState(initialPendingHandoffs);
  const [photoPreview,setPhotoPreview] = useState("");
  const [photoBusy,setPhotoBusy] = useState(false);
  const [registerBusy,setRegisterBusy] = useState(false);
  const [registerError,setRegisterError] = useState("");
  const [formErrors,setFormErrors] = useState<Record<string,string>>({});
  const [teacherCodeOpen,setTeacherCodeOpen] = useState(false);
  const [teacherCodeBusy,setTeacherCodeBusy] = useState(false);
  const [teacherCodeError,setTeacherCodeError] = useState("");
  const [notifications,setNotifications] = useState<AppNotification[]>([]);
  const [adminNotifications,setAdminNotifications] = useState<AppNotification[]>([]);
  const [notificationAdminOpen,setNotificationAdminOpen] = useState(false);
  const [editingItem,setEditingItem] = useState<Item|null>(null);
  const [deletingItem,setDeletingItem] = useState<Item|null>(null);
  const [itemMutationBusy,setItemMutationBusy] = useState(false);
  const [editError,setEditError] = useState("");

  const demoUserId = "demo-current-user";
  const rewardSummary = useMemo(
    () => getRewardSummary(rewards, demoUserId),
    [rewards],
  );
  const visiblePendingHandoffs = useMemo<PendingHandoff[]>(() => {
    if (!isFirebaseConfigured || (userRole!=="teacher"&&userRole!=="final_admin")) {
      return pendingHandoffs;
    }
    return items
      .filter(item => item.kind==="found" && item.status==="전달 대기")
      .map(item => ({
        id:item.id,
        title:item.title,
        studentId:item.authorId ?? "",
        location:item.location,
        received:false,
        persisted:true,
      }));
  }, [items, pendingHandoffs, userRole]);
  const unreadCount = notifications.filter(notification => !notification.read && notification.status==="active").length;

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const { auth, db } = getFirebaseServices();
    let unsubscribeItems: (() => void) | undefined;
    let unsubscribeNotifications: (() => void) | undefined;
    let unsubscribeAdminNotifications: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async user => {
      unsubscribeItems?.();
      unsubscribeItems = undefined;
      unsubscribeNotifications?.();
      unsubscribeNotifications = undefined;
      unsubscribeAdminNotifications?.();
      unsubscribeAdminNotifications = undefined;

      if (!user) {
        setAuthUser(null);
        setUserRole(null);
        setItems(initialItems);
        setNotifications([]);
        setAdminNotifications([]);
        return;
      }

      if (!isAllowedSchoolEmail(user.email)) {
        await signOut(auth);
        flash(schoolEmailDomain ? `@${schoolEmailDomain} 학교 계정으로 로그인해 주세요.` : "허용된 Google 계정으로 로그인해 주세요.");
        return;
      }

      let role: UserRole;
      try {
        role = await ensureUserProfile(db, user);
        setUserRole(role);
      } catch {
        await signOut(auth);
        flash("계정 등록에 실패해 로그아웃했습니다. 관리자에게 계정 허용 여부를 확인해 주세요.");
        return;
      }

      setAuthUser(user);
      unsubscribeItems = subscribeToPublishedItems(
        db,
        role==="teacher"||role==="final_admin",
        user.uid,
        rows => setItems(rows.map(item => ({ ...item, isMine:item.authorId===user.uid }))),
        () => flash("Firebase 목록을 불러오지 못했습니다. 보안 규칙을 확인해 주세요."),
      );
      unsubscribeNotifications = subscribeToNotifications(
        db,
        user.uid,
        setNotifications,
        () => flash("알림을 불러오지 못했습니다."),
      );
      if (role === "final_admin") {
        unsubscribeAdminNotifications = subscribeToAllNotifications(
          db,
          setAdminNotifications,
          () => flash("관리용 알림 내역을 불러오지 못했습니다."),
        );
      }
    });

    return () => {
      unsubscribeItems?.();
      unsubscribeNotifications?.();
      unsubscribeAdminNotifications?.();
      unsubscribeAuth();
    };
  }, []);

  const filtered = useMemo(() => {
    const needle=query.trim().toLowerCase();
    if(section==="clues") return [];
    return items.filter(item => (section!=="mine"||item.isMine) && (kind==="all"||item.kind===kind) && (!needle||`${item.title} ${item.location} ${item.category} ${item.color}`.toLowerCase().includes(needle)));
  },[items,kind,query,section]);

  function flash(message:string){ setToast(message); setTimeout(()=>setToast(""),5000); }
  async function handleSignIn(){
    if (!isFirebaseConfigured) return;
    setAuthBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters(schoolEmailDomain ? { hd: schoolEmailDomain, prompt: "select_account" } : { prompt: "select_account" });
      const { auth } = getFirebaseServices();
      const result = await signInWithPopup(auth, provider);
      if (!isAllowedSchoolEmail(result.user.email)) {
        await signOut(auth);
        flash(schoolEmailDomain ? `@${schoolEmailDomain} 학교 계정만 사용할 수 있습니다.` : "허용된 Google 계정만 사용할 수 있습니다.");
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

  async function requestRegistration() {
    if (isFirebaseConfigured && !authUser) {
      flash("물건을 등록하려면 먼저 Google 계정으로 로그인해 주세요.");
      await handleSignIn();
      return;
    }
    setRegisterError("");
    setFormErrors({});
    setRegisterOpen(true);
  }

  async function submitTeacherCode(formData: FormData) {
    if (!authUser || !userRole) return;
    const code = String(formData.get("teacherCode") ?? "");
    setTeacherCodeBusy(true);
    setTeacherCodeError("");
    try {
      const { db } = getFirebaseServices();
      if (userRole === "final_admin") {
        await changeTeacherCode(db, authUser.uid, code);
        setTeacherCodeOpen(false);
        flash("새 교사 인증코드를 설정했습니다. 교직원에게만 공유해 주세요.");
      } else {
        await verifyTeacherCode(db, authUser.uid, code);
        setUserRole("teacher");
        setTeacherCodeOpen(false);
        flash("교사 인증이 완료되었습니다. 교사 메뉴가 열렸습니다.");
        setTimeout(() => window.location.reload(), 900);
      }
    } catch (error) {
      setTeacherCodeError(
        error instanceof Error && error.message.startsWith("인증코드는")
          ? error.message
          : userRole === "final_admin"
            ? "인증코드를 설정하지 못했습니다. 최종 관리자 권한을 확인해 주세요."
            : "인증코드가 올바르지 않습니다. 다시 확인해 주세요.",
      );
    } finally {
      setTeacherCodeBusy(false);
    }
  }

  async function openNotification(notification: AppNotification) {
    if (!notification.read && authUser) {
      await markNotificationRead(getFirebaseServices().db, notification.id).catch(() => undefined);
    }
    setNoticeOpen(false);
    if (notification.itemId) {
      const relatedItem = items.find(item => item.id === notification.itemId);
      if (relatedItem) setSelected(relatedItem);
    }
  }

  async function cancelSentNotification(notification: AppNotification) {
    if (!authUser || userRole!=="final_admin" || notification.status==="cancelled") return;
    try {
      await cancelNotification(getFirebaseServices().db, notification.id, authUser.uid);
      flash("잘못 전달된 알림을 취소했습니다. 수신자 화면에도 취소로 표시됩니다.");
    } catch {
      flash("알림을 취소하지 못했습니다. 관리자 권한을 확인해 주세요.");
    }
  }

  async function saveItemEdits(formData: FormData) {
    if (!editingItem || !authUser) return;
    const title=String(formData.get("title")??"").trim();
    const location=String(formData.get("location")??"").trim();
    const dateText=String(formData.get("date")??"").trim();
    const description=String(formData.get("description")??"").trim();
    if(title.length<2||location.length<2||!dateText){setEditError("물건 이름, 장소와 날짜를 확인해 주세요.");return;}
    setItemMutationBusy(true);
    setEditError("");
    try {
      await updateItem(getFirebaseServices().db, editingItem.id, {title,location,dateText,description});
      setEditingItem(null);
      flash("글을 수정했습니다.");
    } catch {
      setEditError("수정하지 못했습니다. 본인 글인지와 현재 상태를 확인해 주세요.");
    } finally {
      setItemMutationBusy(false);
    }
  }

  async function confirmDeleteItem() {
    if (!deletingItem || !authUser) return;
    setItemMutationBusy(true);
    try {
      await softDeleteItem(getFirebaseServices().db, deletingItem.id, authUser.uid);
      setDeletingItem(null);
      setSelected(null);
      flash("글을 삭제하고 처리 기록을 남겼습니다.");
    } catch {
      flash("글을 삭제하지 못했습니다. 권한을 확인해 주세요.");
    } finally {
      setItemMutationBusy(false);
    }
  }

  function markHelpful(clue: DemoClue) {
    if (!selected) return;
    const result = grantDemoReward(rewards, {
      userId: clue.authorId,
      points: REWARD_POINTS.helpfulClue,
      reason: "helpful_clue",
      relatedItemId: selected.id,
      relatedClueId: clue.id,
      uniqueKey: helpfulClueRewardKey(selected.id, clue.authorId),
      grantedBy: "신고 작성자",
    });
    setRewards(result.transactions);
    flash(result.granted ? "단서 작성자에게 도움 포인트 1점을 지급했습니다." : "이 학생은 이 신고에서 이미 포인트를 받았습니다.");
  }

  async function confirmHandoff(handoff: PendingHandoff, storageLocation: string) {
    if (handoff.persisted) {
      if (!authUser || (userRole!=="teacher"&&userRole!=="final_admin")) {
        flash("교사 또는 최종 관리자만 인수할 수 있습니다.");
        return;
      }
      if (storageLocation.trim().length < 2) {
        flash("보관 장소를 입력해 주세요.");
        return;
      }
      try {
        await confirmItemHandoff(getFirebaseServices().db, handoff.id, authUser.uid, handoff.studentId, storageLocation);
        flash("교사 인수를 확인하고 공개 목록에 반영했습니다.");
      } catch {
        flash("인수 처리에 실패했습니다. 권한과 보관 장소를 확인해 주세요.");
      }
      return;
    }
    const result = grantDemoReward(rewards, {
      userId: handoff.studentId,
      points: REWARD_POINTS.foundItemHandoff,
      reason: "found_item_handoff",
      relatedItemId: handoff.id,
      uniqueKey: handoffRewardKey(handoff.id),
      grantedBy: "담당 교사",
    });
    setRewards(result.transactions);
    if (result.granted) {
      setPendingHandoffs(current => current.map(item => item.id === handoff.id ? { ...item, received:true } : item));
      flash("인수를 확인하고 등록 학생에게 도움 포인트 3점을 지급했습니다.");
    } else {
      flash("이미 인수 확인과 포인트 지급이 완료된 물건입니다.");
    }
  }

  function cancelReward(transactionId: string) {
    setRewards(current => cancelDemoReward(current, transactionId, "최종 관리자"));
    flash("포인트 지급을 취소하고 기록을 남겼습니다.");
  }

  async function handlePhotoSelected(event: ChangeEvent<HTMLInputElement>) {
    const selectedPhoto = event.target.files?.[0];
    event.target.value = "";
    if (!selectedPhoto) return;

    setPhotoBusy(true);
    try {
      const preparedPhoto = await prepareItemImage(selectedPhoto);
      setPhotoPreview(preparedPhoto);
    } catch (error) {
      flash(error instanceof Error ? error.message : "사진을 불러오지 못했습니다.");
    } finally {
      setPhotoBusy(false);
    }
  }

  function clearPhoto() {
    setPhotoPreview("");
  }

  function changeRegisterOpen(open: boolean) {
    if (registerBusy) return;
    setRegisterOpen(open);
    if (!open) {
      clearPhoto();
      setRegisterError("");
      setFormErrors({});
    }
  }

  async function addDemoItem(formData:FormData){
    const title=String(formData.get("title")||"").trim();
    const location=String(formData.get("location")||"").trim();
    const description=String(formData.get("description")||"").trim();
    const dateText=String(formData.get("date")||"").trim();
    const errors:Record<string,string>={};
    if(title.length<2) errors.title="물건 이름을 2자 이상 입력해 주세요.";
    if(location.length<2) errors.location="마지막으로 본 장소를 2자 이상 입력해 주세요.";
    if(!dateText) errors.date="날짜를 선택해 주세요.";
    setFormErrors(errors);
    setRegisterError("");
    if(Object.keys(errors).length>0) return;

    if (isFirebaseConfigured) {
      if (!authUser) {
        flash("학교 Google 계정으로 먼저 로그인해 주세요.");
        return;
      }
      setRegisterBusy(true);
      try {
        const { db } = getFirebaseServices();
        await createItem(db, {
          kind:newKind, title, location, description:description||"상세 설명이 없습니다.", authorId:authUser.uid,
          imageDataUrl:photoPreview || undefined,
          dateText,
        });
        setRegisterOpen(false);
        clearPhoto();
        flash(newKind==="lost" ? "분실 신고가 저장되었습니다." : "습득물이 전달 대기로 저장되었습니다.");
      } catch {
        setRegisterError("등록하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요. 계속 실패하면 관리자에게 알려주세요.");
      } finally {
        setRegisterBusy(false);
      }
      return;
    }

    setItems(current => [{ id:`demo-${Date.now()}`, kind:newKind, title, location, description:description||"상세 설명이 없습니다.", category:"기타", date:dateText, status:newKind==="lost"?"찾는 중":"전달 대기", color:"", tone:newKind==="lost"?"violet":"blue", clueCount:0 },...current]);
    setRegisterOpen(false); flash(`${newKind==="lost"?"분실 신고":"습득물"}가 시연 목록에 등록되었습니다.`);
  }

  return <div className="min-h-screen bg-background text-foreground">
    <header className="sticky top-0 z-40 border-b border-[#dfe2f3] bg-[#fbf9ff]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-[1440px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button className="brand-mark" aria-label="어디 있니? 홈"><Search className="size-6 stroke-[2.4]"/><span className="brand-spark"/></button>
        <div className="min-w-0"><div className="flex items-baseline gap-2"><h1 className="text-[1.28rem] font-extrabold tracking-[-0.055em] sm:text-[1.45rem]">어디 있니?</h1><span className="hidden text-sm font-medium text-muted-foreground sm:inline">우리 학교 분실물 찾기</span></div></div>
        <div className="ml-auto flex items-center gap-2">
          {authUser&&(userRole==="student"||userRole==="final_admin")&&<Button variant="outline" size="sm" className="rounded-full" aria-label={userRole==="final_admin"?"교사 인증코드 설정":"교사 인증"} onClick={()=>{setTeacherCodeError("");setTeacherCodeOpen(true)}}><KeyRound className="size-4"/><span className="hidden sm:inline">{userRole==="final_admin"?"인증코드 설정":"교사 인증"}</span></Button>}
          {userRole==="final_admin"&&<Button variant="ghost" size="icon" className="rounded-full" onClick={()=>setNotificationAdminOpen(true)} aria-label="발송 알림 관리" title="발송 알림 관리"><Megaphone className="size-5"/></Button>}
          <Button variant="ghost" size="icon-lg" className="relative rounded-full hover:bg-[#eeedff]" aria-label={`읽지 않은 알림 ${unreadCount}개`} onClick={()=>setNoticeOpen(true)}><Bell className="size-5"/>{unreadCount>0&&<span className="absolute right-1 top-1 grid min-h-[18px] min-w-[18px] place-items-center rounded-full bg-[#e33f65] px-1 text-[10px] font-bold text-white">{unreadCount>99?"99+":unreadCount}</span>}</Button>
          {isFirebaseConfigured ? authUser ? <><div className="hidden items-center gap-2 rounded-full border border-[#d9dcf0] bg-white px-3 py-2 text-sm font-bold shadow-[0_2px_8px_rgba(40,45,85,.05)] sm:flex"><span className="grid size-8 place-items-center rounded-full bg-[#e0e3ff] text-[#3e4daf]">{authUser.displayName?.slice(0,1)||"학"}</span><span>{userRole==="final_admin"?"최종 관리자":userRole==="teacher"?"일반 교사":"학생"}</span></div><Button variant="ghost" size="icon" className="rounded-full" onClick={handleSignOut} aria-label="로그아웃" title="로그아웃"><LogOut className="size-5"/></Button></> : <Button variant="outline" className="rounded-full" disabled={authBusy} onClick={handleSignIn}><LogIn className="size-4"/>{authBusy?"로그인 중":"학교 계정 로그인"}</Button> : <span className="hidden rounded-full bg-[#fff4cf] px-3 py-2 text-xs font-bold text-[#725700] sm:inline">시연 모드</span>}
        </div>
      </div>
    </header>

    <div className="mx-auto grid max-w-[1440px] lg:grid-cols-[220px_minmax(0,1fr)_280px]">
      <aside className="sticky top-[72px] hidden h-[calc(100vh-72px)] border-r border-[#e0e2ef] px-5 py-7 lg:flex lg:flex-col">
        <nav className="space-y-1" aria-label="주요 메뉴"><SideLink icon={<Home/>} label="물건 찾기" active={section==="all"} onClick={()=>setSection("all")}/><SideLink icon={<PenLine/>} label="내가 쓴 글" active={section==="mine"} onClick={()=>setSection("mine")}/><SideLink icon={<Lightbulb/>} label="내가 남긴 단서" active={section==="clues"} onClick={()=>setSection("clues")}/><SideLink icon={<Award/>} label="내 도움 포인트" count={`${rewardSummary.totalPoints}점`} onClick={()=>setProfileOpen(true)}/><SideLink icon={<Bell/>} label="알림" count={unreadCount>0?`${unreadCount}`:undefined} onClick={()=>setNoticeOpen(true)}/></nav>
        {(userRole==="teacher"||userRole==="final_admin")&&<><div className="my-6 h-px bg-[#e2e4f0]"/><p className="mb-2 px-3 text-xs font-bold tracking-wide text-muted-foreground">교사 메뉴</p><nav className="space-y-1"><SideLink icon={<PackageCheck/>} label="인수 대기" count={`${visiblePendingHandoffs.filter(item=>!item.received).length}`} onClick={()=>setHandoffOpen(true)}/>{userRole==="final_admin"&&<><SideLink icon={<Megaphone/>} label="발송 알림 관리" onClick={()=>setNotificationAdminOpen(true)}/><SideLink icon={<ShieldCheck/>} label="포인트 관리" onClick={()=>setAdminOpen(true)}/></>}</nav></>}
        {userRole&&<div className="mt-auto rounded-[24px] bg-[#eef0ff] p-4 text-[#303b91]"><div className="mb-2 flex items-center gap-2 text-sm font-bold"><ShieldCheck className="size-4"/>{userRole==="final_admin"?"최종 관리자":userRole==="teacher"?"교사 인증 완료":"학생 계정"}</div><p className="text-xs leading-relaxed text-[#5961a1]">{userRole==="student"?"분실 신고와 습득물 등록, 찾기 단서를 이용할 수 있습니다.":"습득물을 확인하고 보관 장소를 안내할 수 있습니다."}</p></div>}
      </aside>

      <main className="min-w-0 px-4 pb-28 pt-6 sm:px-7 sm:pt-8 lg:px-9 lg:pb-12"><section className="mx-auto max-w-[880px]">
        <div className="mb-5 flex items-end justify-between gap-4"><div><p className="mb-1 flex items-center gap-1.5 text-sm font-bold text-[#4a56ba]"><Sparkles className="size-4"/>{section==="all"?"검색하고, 없으면 등록하세요":section==="mine"?"내가 등록한 진행 상태를 확인하세요":"내가 제공한 도움을 확인하세요"}</p><h2 className="text-[1.7rem] font-extrabold tracking-[-0.045em] sm:text-[2rem]">{section==="all"?"잃어버린 물건을 찾아보세요":section==="mine"?"내가 쓴 글":"내가 남긴 찾기 단서"}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{section==="all"?"물건 이름이나 장소로 먼저 검색하고, 찾는 글이 없으면 새로 등록할 수 있어요.":section==="mine"?"전달 대기 중인 습득물과 공개된 내 글을 한곳에서 확인할 수 있어요.":"아직 실제 단서 저장 기능을 연결하는 중입니다."}</p></div>{section!=="clues"&&<Button className="hidden h-12 shrink-0 rounded-full bg-[#4958c7] px-5 text-[15px] shadow-[0_8px_22px_rgba(73,88,199,.25)] hover:bg-[#3847b5] sm:flex" onClick={requestRegistration}><Plus className="size-5"/>{isFirebaseConfigured&&!authUser?"로그인 후 등록":"물건 등록"}</Button>}</div>
        <div className="search-shell"><Search className="size-5 shrink-0 text-[#4b5599]"/><Input value={query} onChange={e=>setQuery(e.target.value)} className="h-auto border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0" placeholder="물건 이름, 색상, 잃어버린 장소로 검색" aria-label="분실물 검색"/>{query&&<Button variant="ghost" size="icon-sm" className="rounded-full" onClick={()=>setQuery("")} aria-label="검색어 지우기"><X/></Button>}</div>
        <div className="scrollbar-none -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" aria-label="물건 종류 필터"><FilterChip active={kind==="all"} onClick={()=>setKind("all")}>전체 {items.length}</FilterChip><FilterChip active={kind==="lost"} onClick={()=>setKind("lost")}>잃어버렸어요</FilterChip><FilterChip active={kind==="found"} onClick={()=>setKind("found")}>주인을 찾아요</FilterChip><FilterChip>최근 7일</FilterChip><FilterChip>장소</FilterChip></div>
        <div className="mt-7 flex items-center justify-between"><p className="text-sm font-bold">{section==="clues"?"내 단서":`${filtered.length}개의 물건`}</p>{section!=="clues"&&<span className="text-sm font-medium text-muted-foreground">최신순</span>}</div>
        {filtered.length>0?<div className="mt-3 grid gap-4 sm:grid-cols-2">{filtered.map(item=><ItemCard key={item.id} item={item} canEdit={Boolean(authUser&&item.authorId===authUser.uid&&(item.status==="찾는 중"||item.status==="전달 대기"))} canDelete={Boolean(authUser&&(item.authorId===authUser.uid||userRole==="final_admin"))} onClick={()=>setSelected(item)} onEdit={()=>{setEditError("");setEditingItem(item)}} onDelete={()=>setDeletingItem(item)}/>)}</div>:<div className="mt-4 grid min-h-64 place-items-center rounded-[28px] border border-dashed border-[#cfd3e9] bg-white p-8 text-center"><div>{section==="clues"?<Lightbulb className="mx-auto mb-3 size-9 text-[#d28700]"/>:<Search className="mx-auto mb-3 size-9 text-[#7a82bd]"/>}<p className="font-bold">{section==="mine"?"아직 작성한 글이 없습니다":section==="clues"?"아직 저장된 내 단서가 없습니다":"검색 결과가 없습니다"}</p><p className="mt-1 text-sm text-muted-foreground">{section==="all"?"장소나 색상을 다른 말로 검색해 보세요.":section==="mine"?"분실 신고나 습득물을 등록하면 여기에 표시됩니다.":"실제 찾기 단서 저장 기능을 연결하면 이곳에서 확인할 수 있습니다."}</p></div></div>}
      </section></main>

      <aside className="sticky top-[72px] hidden h-[calc(100vh-72px)] border-l border-[#e0e2ef] px-6 py-8 xl:block"><div className="mb-6 flex items-center justify-between"><h2 className="font-extrabold tracking-[-0.03em]">최근 찾기 단서</h2><Lightbulb className="size-5 text-[#d28700]"/></div><div className="space-y-3"><ClueCard title="검정색 무선 이어폰" text="도서관 반납대 옆에서 비슷한 케이스를 봤어요." time="8분 전"/><ClueCard title="은색 보온 물병" text="급식실에서 후관 쪽으로 옮겨진 것 같아요." time="35분 전"/><ClueCard title="투명 학생증 케이스" text="운동장 방송실 앞 계단에서 봤습니다." time="어제"/></div><button className="mt-4 flex w-full items-center justify-center gap-1 rounded-full py-2 text-sm font-bold text-[#4a56ba] hover:bg-[#f0f1ff]">단서 모두 보기<ChevronRight className="size-4"/></button><div className="mt-8 rounded-[26px] bg-[#1f265e] p-5 text-white shadow-[0_16px_30px_rgba(31,38,94,.14)]"><div className="mb-3 grid size-10 place-items-center rounded-2xl bg-white/12"><Megaphone className="size-5"/></div><p className="font-bold">사진 등록 전 확인해요</p><p className="mt-1 text-xs leading-relaxed text-[#d8dcff]">얼굴, 이름표, 전화번호가 보이지 않도록 가린 뒤 올려주세요.</p></div></aside>
    </div>

    <nav className="fixed inset-x-0 bottom-0 z-40 grid h-[74px] grid-cols-4 border-t border-[#dfe2f1] bg-[#fbf9ff]/95 px-3 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden" aria-label="모바일 메뉴"><MobileLink icon={<Home/>} label="홈" active={section==="all"} onClick={()=>setSection("all")}/>{userRole==="teacher"||userRole==="final_admin"?<MobileLink icon={<PackageCheck/>} label="인수 대기" onClick={()=>setHandoffOpen(true)}/>:<MobileLink icon={<Search/>} label="찾기" onClick={()=>setSection("all")}/>}<button className="relative flex flex-col items-center justify-center gap-1 text-xs font-bold text-[#4a56ba]" onClick={requestRegistration}><span className="absolute -top-5 grid size-14 place-items-center rounded-[20px] bg-[#4958c7] text-white shadow-[0_9px_20px_rgba(73,88,199,.32)]"><Plus className="size-7"/></span><span className="mt-9">등록</span></button><MobileLink icon={<CircleUserRound/>} label="내 정보" onClick={()=>setProfileOpen(true)}/></nav>

    <Dialog open={!!selected} onOpenChange={open=>!open&&setSelected(null)}><DialogContent className="max-h-[88vh] overflow-y-auto rounded-[30px] border-[#dfe2f1] p-0 sm:max-w-[620px]">{selected&&<><div className={`relative grid h-52 place-items-center overflow-hidden rounded-t-[29px] bg-gradient-to-br ${tones[selected.tone]}`}><PackageOpen className="size-20 stroke-[1.25] opacity-80"/><span className="absolute left-5 top-5 rounded-full bg-white/75 px-3 py-1 text-xs font-extrabold backdrop-blur">{selected.kind==="lost"?"잃어버렸어요":"주인을 찾아요"}</span></div><div className="p-6 sm:p-7"><DialogHeader className="text-left"><div className="flex items-start justify-between gap-3"><DialogTitle className="text-2xl font-extrabold tracking-[-0.04em]">{selected.title}</DialogTitle><StatusBadge item={selected}/></div><DialogDescription className="sr-only">물건 상세 정보</DialogDescription></DialogHeader><div className="mt-5 grid gap-3 rounded-[22px] bg-[#f4f4fb] p-4 text-sm"><InfoRow icon={<MapPin/>} label="장소" value={selected.location}/><InfoRow icon={<Clock3/>} label="날짜" value={selected.date}/><InfoRow icon={<Tag/>} label="분류" value={`${selected.category}${selected.color?` · ${selected.color}`:""}`}/></div><p className="mt-5 text-[15px] leading-7 text-[#3f4254]">{selected.description}</p>{selected.kind==="lost"&&<div className="mt-6 rounded-[22px] border border-[#ead89b] bg-[#fff8dc] p-4"><div className="flex items-center gap-2 font-bold text-[#705600]"><Lightbulb className="size-4"/>찾기 단서 {selected.clueCount}개</div><p className="mt-2 text-sm leading-relaxed text-[#6c6041]">이 물건을 본 적이 있다면 장소와 시간을 알려주세요. 연락처는 적지 않아도 됩니다.</p><div className="mt-4 space-y-3">{demoClues.filter(clue=>clue.itemId===selected.id).map(clue=>{const rewarded=rewards.some(transaction=>transaction.uniqueKey===helpfulClueRewardKey(selected.id,clue.authorId));return <div key={clue.id} className="rounded-[18px] bg-white/85 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-extrabold text-[#4d4326]">익명의 학교 구성원</p><p className="mt-1 text-xs text-[#756a4a]">{clue.place} · {clue.seenAt}</p></div>{selected.isMine&&<Button size="sm" variant="outline" disabled={rewarded} className="shrink-0 rounded-full border-[#e0b946] bg-[#fff9e6] text-[#725700] hover:bg-[#ffefb2]" onClick={()=>markHelpful(clue)}><Award className="size-4"/>{rewarded?"지급 완료":"도움 됐어요"}</Button>}</div><p className="mt-2 text-sm leading-6 text-[#5f5537]">{clue.detail}</p></div>})}</div>{selected.isMine&&<p className="mt-3 text-xs text-[#786a41]">같은 학생이 이 신고에 여러 단서를 남겨도 포인트는 한 번만 지급됩니다.</p>}</div>}<DialogFooter className="mt-6 sm:justify-stretch">{selected.kind==="lost"?<Button className="h-12 flex-1 rounded-full bg-[#4958c7] hover:bg-[#3847b5]" onClick={()=>{setSelected(null);flash("찾기 단서를 남겼습니다.")}}><Lightbulb/>찾기 단서 남기기</Button>:<Button className="h-12 flex-1 rounded-full bg-[#4958c7] hover:bg-[#3847b5]" onClick={()=>{setSelected(null);flash("보관 장소를 확인했습니다.")}}><MapPin/>보관 장소 확인</Button>}<DialogClose asChild><Button variant="outline" className="h-12 rounded-full px-5">닫기</Button></DialogClose></DialogFooter></div></>}</DialogContent></Dialog>

    <Dialog open={profileOpen} onOpenChange={setProfileOpen}><DialogContent className="max-h-[90vh] overflow-y-auto rounded-[30px] border-[#e2d39c] sm:max-w-[620px]"><DialogHeader className="text-left"><DialogTitle className="flex items-center gap-2 text-2xl font-extrabold tracking-[-0.04em]"><Award className="size-6 text-[#d08a00]"/>내 도움 포인트</DialogTitle><DialogDescription>내 선행과 학교 공동체 기여를 모아 보여줍니다.</DialogDescription></DialogHeader><div className="rounded-[26px] bg-gradient-to-br from-[#ffe17c] to-[#fff4c1] p-6 text-[#5b4300]"><p className="text-sm font-bold">현재 도움 포인트</p><div className="mt-1 flex items-end gap-2"><strong className="text-4xl font-black tracking-[-0.05em]">{rewardSummary.totalPoints}</strong><span className="pb-1 font-bold">점</span></div><p className="mt-3 text-sm leading-6">순위를 매기지 않고, 확인된 도움만 차곡차곡 기록해요.</p></div><section><h3 className="mb-3 mt-6 font-extrabold">나의 배지</h3><div className="grid gap-3 sm:grid-cols-3">{rewardSummary.badges.map(badge=><RewardBadgeCard key={badge.id} badge={badge}/>)}</div></section><section><h3 className="mb-3 mt-6 font-extrabold">포인트 활동 내역</h3><div className="space-y-2">{rewards.filter(transaction=>transaction.userId===demoUserId).map(transaction=><div key={transaction.id} className="flex items-center gap-3 rounded-[18px] bg-[#f6f6fc] p-4"><span className={`grid size-10 shrink-0 place-items-center rounded-2xl ${transaction.status==="active"?"bg-[#fff0ad] text-[#8a6200]":"bg-[#e8e8ee] text-[#777986]"}`}><Gift className="size-5"/></span><div className="min-w-0 flex-1"><p className="text-sm font-extrabold">{rewardReasonLabel(transaction.reason)}</p><p className="mt-1 text-xs text-muted-foreground">{transaction.grantedAt} · {transaction.grantedBy}</p></div><span className={`font-black ${transaction.status==="active"?"text-[#b17300]":"text-[#8b8d98] line-through"}`}>+{transaction.points}점</span></div>)}</div></section><div className="rounded-[18px] border border-[#e4e5ef] px-4 py-3 text-xs leading-5 text-muted-foreground">포인트와 활동 내역은 본인, 담당 교사와 최종 관리자만 확인할 수 있습니다.</div></DialogContent></Dialog>

    <Dialog open={handoffOpen} onOpenChange={setHandoffOpen}><DialogContent className="max-h-[90vh] overflow-y-auto rounded-[30px] border-[#dfe2f1] sm:max-w-[620px]"><DialogHeader className="text-left"><DialogTitle className="flex items-center gap-2 text-2xl font-extrabold tracking-[-0.04em]"><PackageCheck className="size-6 text-[#4a56ba]"/>습득물 인수 대기</DialogTitle><DialogDescription>학생에게 실제 물건을 전달받은 뒤 보관 장소를 입력하고 인수해 주세요.</DialogDescription></DialogHeader><div className="space-y-3">{visiblePendingHandoffs.length>0?visiblePendingHandoffs.map(handoff=><HandoffCard key={handoff.id} handoff={handoff} onConfirm={confirmHandoff}/>):<div className="rounded-[22px] bg-[#f4f5fb] p-8 text-center text-sm text-muted-foreground">현재 인수를 기다리는 습득물이 없습니다.</div>}</div><div className="rounded-[18px] bg-[#fff7d6] px-4 py-3 text-xs leading-5 text-[#685524]">실제 등록 항목은 인수 후 공개 목록으로 이동합니다. 도움 포인트 영구 지급은 서버 검증 기능 연결 후 적용됩니다.</div></DialogContent></Dialog>

    <Dialog open={adminOpen} onOpenChange={setAdminOpen}><DialogContent className="max-h-[90vh] overflow-y-auto rounded-[30px] border-[#dfe2f1] sm:max-w-[700px]"><DialogHeader className="text-left"><DialogTitle className="flex items-center gap-2 text-2xl font-extrabold tracking-[-0.04em]"><ShieldCheck className="size-6 text-[#4a56ba]"/>도움 포인트 관리</DialogTitle><DialogDescription>지급 사유와 연결 항목을 확인하고 잘못된 지급을 취소합니다. 현재는 시연 데이터입니다.</DialogDescription></DialogHeader><div className="space-y-3">{rewards.map(transaction=><div key={transaction.id} className={`rounded-[20px] border p-4 ${transaction.status==="cancelled"?"border-[#dedfe6] bg-[#f5f5f7]":"border-[#ead89b] bg-[#fffdf5]"}`}><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-extrabold">{rewardReasonLabel(transaction.reason)} · +{transaction.points}점</p><Badge className={transaction.status==="active"?"border-0 bg-[#fff0ad] text-[#755400]":"border-0 bg-[#e2e2e7] text-[#666873]"}>{transaction.status==="active"?"지급됨":"취소됨"}</Badge></div><p className="mt-1 break-all text-xs text-muted-foreground">사용자 {transaction.userId} · 항목 {transaction.relatedItemId}{transaction.relatedClueId?` · 단서 ${transaction.relatedClueId}`:""}</p><p className="mt-1 text-xs text-muted-foreground">{transaction.grantedAt} · 처리: {transaction.grantedBy}{transaction.cancelledBy?` · 취소: ${transaction.cancelledBy}`:""}</p></div>{transaction.status==="active"&&<Button variant="outline" className="rounded-full border-[#d7a9a9] text-[#9a3e3e] hover:bg-[#fff0f0]" onClick={()=>cancelReward(transaction.id)}><RotateCcw className="size-4"/>지급 취소</Button>}</div></div>)}</div></DialogContent></Dialog>

    <Dialog open={Boolean(editingItem)} onOpenChange={open=>{if(!open&&!itemMutationBusy)setEditingItem(null)}}>
      <DialogContent className="rounded-[30px] border-[#dfe2f1] sm:max-w-[520px]">
        <DialogHeader className="text-left"><DialogTitle className="text-2xl font-extrabold tracking-[-0.04em]">글 수정</DialogTitle><DialogDescription>본인이 작성한 진행 중 글만 수정할 수 있습니다.</DialogDescription></DialogHeader>
        {editingItem&&<form action={saveItemEdits} className="space-y-4"><label className="block text-sm font-bold">물건 이름<Input required minLength={2} name="title" defaultValue={editingItem.title} className="mt-2 h-12 rounded-[16px] bg-[#f8f8fd]"/></label><label className="block text-sm font-bold">장소<Input required minLength={2} name="location" defaultValue={editingItem.location} className="mt-2 h-12 rounded-[16px] bg-[#f8f8fd]"/></label><label className="block text-sm font-bold">날짜<Input required type="date" name="date" defaultValue={editingItem.date} className="mt-2 h-12 rounded-[16px] bg-[#f8f8fd]"/></label><label className="block text-sm font-bold">특징 <span className="font-medium text-muted-foreground">(선택)</span><Textarea name="description" defaultValue={editingItem.description==="상세 설명이 없습니다."?"":editingItem.description} className="mt-2 min-h-24 rounded-[16px] bg-[#f8f8fd]"/></label>{editError&&<p role="alert" className="rounded-[16px] bg-[#fff0f0] px-4 py-3 text-sm font-bold text-[#9a3e3e]">{editError}</p>}<DialogFooter><Button type="button" variant="outline" disabled={itemMutationBusy} className="h-12 rounded-full" onClick={()=>setEditingItem(null)}>취소</Button><Button type="submit" disabled={itemMutationBusy} className="h-12 rounded-full bg-[#4958c7] px-6 hover:bg-[#3847b5]">{itemMutationBusy?<><LoaderCircle className="size-4 animate-spin"/>저장 중</>:"수정 저장"}</Button></DialogFooter></form>}
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(deletingItem)} onOpenChange={open=>{if(!open&&!itemMutationBusy)setDeletingItem(null)}}>
      <DialogContent className="rounded-[30px] border-[#ead4d4] sm:max-w-[440px]"><DialogHeader className="text-left"><DialogTitle className="flex items-center gap-2 text-2xl font-extrabold"><Trash2 className="size-6 text-[#a33e3e]"/>글을 삭제할까요?</DialogTitle><DialogDescription>목록에서는 즉시 사라지지만, 안전을 위해 삭제한 계정과 시간 기록은 남습니다.</DialogDescription></DialogHeader><div className="rounded-[18px] bg-[#f7f7fb] p-4 text-sm font-bold">{deletingItem?.title}</div><DialogFooter><Button variant="outline" disabled={itemMutationBusy} className="h-12 rounded-full" onClick={()=>setDeletingItem(null)}>취소</Button><Button disabled={itemMutationBusy} className="h-12 rounded-full bg-[#a33e3e] px-6 hover:bg-[#873232]" onClick={confirmDeleteItem}>{itemMutationBusy?<><LoaderCircle className="size-4 animate-spin"/>삭제 중</>:"삭제하기"}</Button></DialogFooter></DialogContent>
    </Dialog>

    <Dialog open={registerOpen} onOpenChange={changeRegisterOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-[30px] border-[#dfe2f1] sm:max-w-[560px]">
        <DialogHeader className="text-left"><DialogTitle className="text-2xl font-extrabold tracking-[-0.04em]">물건 등록하기</DialogTitle><DialogDescription>{isFirebaseConfigured?"학교 계정으로 등록한 내용과 사진이 안전하게 저장됩니다.":"Firebase 설정 전에는 시연 목록에만 추가됩니다."}</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-2 rounded-[18px] bg-[#eff0f7] p-1.5"><button type="button" onClick={()=>setNewKind("lost")} className={`h-11 rounded-[14px] text-sm font-bold transition ${newKind==="lost"?"bg-white text-[#3544aa] shadow-sm":"text-muted-foreground"}`}>잃어버렸어요</button><button type="button" onClick={()=>setNewKind("found")} className={`h-11 rounded-[14px] text-sm font-bold transition ${newKind==="found"?"bg-white text-[#3544aa] shadow-sm":"text-muted-foreground"}`}>주인을 찾아요</button></div>
        <form action={addDemoItem} className="space-y-4">
          <label className="block text-sm font-bold">물건 이름<Input required name="title" aria-invalid={Boolean(formErrors.title)} placeholder="예: 검정색 무선 이어폰" className="mt-2 h-12 rounded-[16px] bg-[#f8f8fd]"/>{formErrors.title&&<span className="mt-1.5 block text-xs text-[#a33e3e]">{formErrors.title}</span>}</label>
          <label className="block text-sm font-bold">마지막으로 본 장소<Input required name="location" aria-invalid={Boolean(formErrors.location)} placeholder="모르면 ‘모름’이라고 입력하세요" className="mt-2 h-12 rounded-[16px] bg-[#f8f8fd]"/>{formErrors.location&&<span className="mt-1.5 block text-xs text-[#a33e3e]">{formErrors.location}</span>}</label>
          <label className="block text-sm font-bold">날짜<Input required name="date" type="date" aria-invalid={Boolean(formErrors.date)} className="mt-2 h-12 rounded-[16px] bg-[#f8f8fd]"/>{formErrors.date&&<span className="mt-1.5 block text-xs text-[#a33e3e]">{formErrors.date}</span>}</label>
          <label className="block text-sm font-bold">특징 <span className="font-medium text-muted-foreground">(선택)</span><Textarea name="description" placeholder="색상, 모양, 눈에 띄는 특징을 적어주세요" className="mt-2 min-h-24 rounded-[16px] bg-[#f8f8fd]"/></label>
          <div className="rounded-[20px] border border-dashed border-[#aeb4da] bg-[#f7f7ff] p-3">
            <p className="mb-2 text-sm font-bold text-[#4c527a]">사진 <span className="font-medium text-muted-foreground">(선택)</span></p>
            {photoPreview?<div className="relative overflow-hidden rounded-[16px]"><img src={photoPreview} alt="선택한 사진 미리보기" className="h-48 w-full object-cover"/><button type="button" onClick={clearPhoto} className="absolute right-2 top-2 z-10 grid size-10 place-items-center rounded-full bg-[#202557]/85 text-white shadow-lg" aria-label="선택한 사진 삭제"><X className="size-5"/></button></div>:<div className="grid min-h-28 place-items-center text-center text-[#686f9e]"><div>{photoBusy?<LoaderCircle className="mx-auto size-7 animate-spin"/>:<ImagePlus className="mx-auto size-7"/>}<p className="mt-2 text-sm font-bold">물건 사진을 추가해 주세요</p><p className="mt-1 text-xs">등록 전에 화면에서 확인할 수 있어요</p></div></div>}
            <div className="mt-3 grid grid-cols-2 gap-2"><label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-[#c9cde5] bg-white text-sm font-bold text-[#4652ad] hover:bg-[#eef0ff]"><ImagePlus className="size-4"/>사진 업로드<input type="file" accept="image/*" className="sr-only" disabled={photoBusy||registerBusy} onChange={handlePhotoSelected}/></label><label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-[#4958c7] text-sm font-bold text-white hover:bg-[#3847b5]"><Camera className="size-4"/>바로 촬영<input type="file" accept="image/*" capture="environment" className="sr-only" disabled={photoBusy||registerBusy} onChange={handlePhotoSelected}/></label></div>
          </div>
          <div className="rounded-[16px] bg-[#fff6d8] px-4 py-3 text-xs leading-relaxed text-[#66552a]">얼굴·이름표·학생증·전화번호가 보이지 않는지 확인해 주세요. 사진은 업로드 전에 자동으로 적당한 크기로 줄어듭니다.</div>
          {registerError&&<p role="alert" className="rounded-[16px] bg-[#fff0f0] px-4 py-3 text-sm font-bold leading-5 text-[#9a3e3e]">{registerError}</p>}
          <DialogFooter><DialogClose asChild><Button type="button" variant="outline" disabled={registerBusy} className="h-12 rounded-full">취소</Button></DialogClose><Button type="submit" disabled={registerBusy||photoBusy} className="h-12 rounded-full bg-[#4958c7] px-7 hover:bg-[#3847b5]">{registerBusy?<><LoaderCircle className="size-4 animate-spin"/>사진 저장 중</>:"등록하기"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={notificationAdminOpen} onOpenChange={setNotificationAdminOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-[30px] border-[#dfe2f1] sm:max-w-[620px]">
        <DialogHeader className="text-left"><DialogTitle className="flex items-center gap-2 text-2xl font-extrabold tracking-[-0.04em]"><Megaphone className="size-6 text-[#4a56ba]"/>발송 알림 관리</DialogTitle><DialogDescription>잘못 전달된 알림은 삭제하지 않고 취소 기록을 남깁니다.</DialogDescription></DialogHeader>
        <div className="space-y-3">{adminNotifications.length>0?adminNotifications.map(notification=><div key={notification.id} className={`rounded-[20px] border p-4 ${notification.status==="cancelled"?"border-[#dedfe6] bg-[#f5f5f7]":"border-[#dfe2f1] bg-white"}`}><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="font-extrabold">{notification.status==="cancelled"?"취소됨 · ":""}{notification.title}</p><p className="mt-1 text-sm text-muted-foreground">{notification.message}</p><p className="mt-2 break-all text-xs text-muted-foreground">수신 계정 ID: {notification.userId}</p></div>{notification.status==="active"&&<Button variant="outline" className="rounded-full border-[#d7a9a9] text-[#9a3e3e] hover:bg-[#fff0f0]" onClick={()=>cancelSentNotification(notification)}><RotateCcw className="size-4"/>알림 취소</Button>}</div></div>):<div className="rounded-[20px] bg-[#f5f5fc] p-8 text-center text-sm text-muted-foreground">아직 실제로 발송된 알림이 없습니다.</div>}</div>
      </DialogContent>
    </Dialog>

    <Dialog open={teacherCodeOpen} onOpenChange={open=>{if(!teacherCodeBusy){setTeacherCodeOpen(open);setTeacherCodeError("")}}}>
      <DialogContent className="rounded-[30px] border-[#dfe2f1] sm:max-w-[500px]">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2 text-2xl font-extrabold tracking-[-0.04em]"><KeyRound className="size-6 text-[#4a56ba]"/>{userRole==="final_admin"?"교사 인증코드 설정":"교사 인증"}</DialogTitle>
          <DialogDescription>{userRole==="final_admin"?"8~32자의 새 코드를 정하고 교직원에게만 전달하세요. 기존에 인증한 교사의 권한은 유지됩니다.":"학교에서 안내받은 교사 인증코드를 한 번만 입력하세요."}</DialogDescription>
        </DialogHeader>
        <form action={submitTeacherCode} className="space-y-4">
          <label className="block text-sm font-bold">{userRole==="final_admin"?"새 인증코드":"교사 인증코드"}<Input required minLength={8} maxLength={32} name="teacherCode" type="password" autoComplete="new-password" placeholder="8~32자 입력" className="mt-2 h-12 rounded-[16px] bg-[#f8f8fd]" aria-describedby="teacher-code-help teacher-code-error"/></label>
          <p id="teacher-code-help" className="rounded-[16px] bg-[#f1f2ff] px-4 py-3 text-xs leading-5 text-[#555e9d]">인증코드 원문은 저장하지 않습니다. 변환된 값만 비공개 설정에 보관하고 서버 보안 규칙에서 확인합니다.</p>
          {teacherCodeError&&<p id="teacher-code-error" role="alert" className="rounded-[16px] bg-[#fff0f0] px-4 py-3 text-sm font-bold text-[#9a3e3e]">{teacherCodeError}</p>}
          <DialogFooter><DialogClose asChild><Button type="button" variant="outline" disabled={teacherCodeBusy} className="h-12 rounded-full">취소</Button></DialogClose><Button type="submit" disabled={teacherCodeBusy} className="h-12 rounded-full bg-[#4958c7] px-6 hover:bg-[#3847b5]">{teacherCodeBusy?<><LoaderCircle className="size-4 animate-spin"/>확인 중</>:userRole==="final_admin"?"코드 설정":"교사 인증"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={noticeOpen} onOpenChange={setNoticeOpen}><DialogContent className="rounded-[30px] border-[#dfe2f1] sm:max-w-[500px]"><DialogHeader className="text-left"><DialogTitle className="text-2xl font-extrabold tracking-[-0.04em]">알림</DialogTitle><DialogDescription>읽지 않은 소식은 확인할 때까지 여기에 남아 있습니다.</DialogDescription></DialogHeader><div className="space-y-2">{notifications.length>0?notifications.map(notification=><Notice key={notification.id} icon={<PackageCheck/>} title={notification.status==="cancelled"?"취소된 안내입니다":notification.title} text={notification.status==="cancelled"?"관리자가 잘못 전달된 안내를 취소했습니다.":notification.message} read={notification.read} cancelled={notification.status==="cancelled"} onClick={()=>openNotification(notification)}/>):<div className="rounded-[20px] bg-[#f5f5fc] p-8 text-center"><Bell className="mx-auto size-8 text-[#8a8fad]"/><p className="mt-3 font-bold">새 알림이 없습니다</p><p className="mt-1 text-xs leading-5 text-muted-foreground">내 글의 상태가 바뀌면 이곳에 계속 보관됩니다.</p></div>}</div></DialogContent></Dialog>
    {toast&&<div role="status" className="fixed bottom-24 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-[#202557] px-5 py-3 text-sm font-bold text-white shadow-xl lg:bottom-8"><Check className="size-4"/>{toast}</div>}
  </div>;
}

function SideLink({icon,label,active,count,onClick}:{icon:React.ReactNode;label:string;active?:boolean;count?:string;onClick?:()=>void}){return <button onClick={onClick} className={`flex h-12 w-full items-center gap-3 rounded-[16px] px-3 text-sm font-bold transition ${active?"bg-[#e0e3ff] text-[#3544aa]":"text-[#55586b] hover:bg-[#f0f1f8]"}`}><span className="[&>svg]:size-[19px]">{icon}</span><span>{label}</span>{count&&<span className={`ml-auto grid min-w-5 place-items-center rounded-full px-1.5 py-0.5 text-[10px] ${label.includes("포인트")?"bg-[#ffe17c] text-[#634900]":"bg-[#e33f65] text-white"}`}>{count}</span>}</button>}
function MobileLink({icon,label,active,onClick}:{icon:React.ReactNode;label:string;active?:boolean;onClick?:()=>void}){return <button onClick={onClick} className={`flex flex-col items-center justify-center gap-1 text-[11px] font-bold ${active?"text-[#4251b8]":"text-[#73768a]"}`}><span className={`grid h-8 w-14 place-items-center rounded-full [&>svg]:size-5 ${active?"bg-[#e0e3ff]":""}`}>{icon}</span>{label}</button>}
function FilterChip({active,onClick,children}:{active?:boolean;onClick?:()=>void;children:React.ReactNode}){return <button onClick={onClick} className={`h-10 shrink-0 rounded-full border px-4 text-sm font-bold transition ${active?"border-[#4958c7] bg-[#4958c7] text-white shadow-[0_5px_13px_rgba(73,88,199,.18)]":"border-[#d5d8e8] bg-white text-[#55586c] hover:border-[#929ad1] hover:bg-[#f6f6ff]"}`}>{children}</button>}
function ItemCard({item,canEdit,canDelete,onClick,onEdit,onDelete}:{item:Item;canEdit:boolean;canDelete:boolean;onClick:()=>void;onEdit:()=>void;onDelete:()=>void}){
  return <div className="item-card group relative text-left"><button onClick={onClick} className="contents"><div className={`item-visual bg-gradient-to-br ${tones[item.tone]}`}>{item.imageUrl?<img src={item.imageUrl} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"/>:<PackageOpen className="size-14 stroke-[1.25] opacity-75 transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-105"/>}<span className="absolute left-3 top-3 z-10 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-extrabold backdrop-blur-sm">{item.kind==="lost"?"분실":"습득"}</span></div><div className="min-w-0 flex-1 py-0.5"><div className="flex items-start justify-between gap-2"><h3 className="line-clamp-1 pr-14 text-[16px] font-extrabold tracking-[-0.025em]">{item.title}</h3><ChevronRight className="mt-0.5 size-4 shrink-0 text-[#9b9fb3] transition-transform group-hover:translate-x-0.5"/></div><p className="mt-2 flex items-center gap-1.5 text-[13px] text-[#666a7c]"><MapPin className="size-3.5 shrink-0"/><span className="line-clamp-1">{item.location}</span></p><p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-[#666a7c]"><Clock3 className="size-3.5 shrink-0"/>{item.date}</p><div className="mt-3 flex items-center justify-between gap-2"><StatusBadge item={item}/>{item.clueCount>0&&<span className="flex items-center gap-1 text-xs font-bold text-[#a66b00]"><Lightbulb className="size-3.5"/>단서 {item.clueCount}</span>}</div></div></button>{(canEdit||canDelete)&&<div className="absolute right-12 top-3 z-20 flex gap-1">{canEdit&&<button onClick={onEdit} className="grid size-9 place-items-center rounded-full bg-white text-[#4652ad] shadow-sm" aria-label={`${item.title} 수정`}><PenLine className="size-4"/></button>}{canDelete&&<button onClick={onDelete} className="grid size-9 place-items-center rounded-full bg-white text-[#a33e3e] shadow-sm" aria-label={`${item.title} 삭제`}><Trash2 className="size-4"/></button>}</div>}</div>
}
function StatusBadge({item}:{item:Item}){return <Badge className={`border-0 px-2.5 py-1 ${item.kind==="lost"?"bg-[#eeeaff] text-[#5146a8]":"bg-[#daf4eb] text-[#17624c]"}`}>{item.status}</Badge>}
function ClueCard({title,text,time}:{title:string;text:string;time:string}){return <button className="w-full rounded-[20px] border border-[#e1e3f0] bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-[#bec3e5] hover:shadow-[0_8px_20px_rgba(40,45,90,.07)]"><div className="mb-2 flex items-center justify-between gap-2"><p className="line-clamp-1 text-sm font-extrabold">{title}</p><span className="shrink-0 text-[11px] text-muted-foreground">{time}</span></div><p className="line-clamp-2 text-xs leading-relaxed text-[#6d7083]">{text}</p></button>}
function InfoRow({icon,label,value}:{icon:React.ReactNode;label:string;value:string}){return <div className="grid grid-cols-[20px_44px_1fr] items-start gap-2"><span className="pt-0.5 text-[#5963af] [&>svg]:size-4">{icon}</span><span className="font-bold text-[#696c7e]">{label}</span><span className="font-medium text-[#303344]">{value}</span></div>}
function HandoffCard({handoff,onConfirm}:{handoff:PendingHandoff;onConfirm:(handoff:PendingHandoff,storageLocation:string)=>Promise<void>}){
  const [storageLocation,setStorageLocation]=useState("");
  const [busy,setBusy]=useState(false);
  async function submit(){setBusy(true);try{await onConfirm(handoff,storageLocation);}finally{setBusy(false);}}
  return <div className="rounded-[22px] border border-[#e1e3f0] bg-white p-4"><p className="font-extrabold">{handoff.title}</p><p className="mt-1 text-sm text-muted-foreground"><MapPin className="mr-1 inline size-4"/>습득 장소: {handoff.location}</p><p className="mt-2 text-xs text-muted-foreground">등록 학생의 이름과 이메일은 공개하지 않습니다.</p>{handoff.persisted&&<label className="mt-4 block text-sm font-bold">보관 장소<Input value={storageLocation} onChange={event=>setStorageLocation(event.target.value)} placeholder="예: 1층 교무실 분실물 보관함" className="mt-2 h-11 rounded-[14px] bg-[#f8f8fd]"/></label>}<Button disabled={handoff.received||busy} onClick={submit} className="mt-4 w-full rounded-full bg-[#4958c7] hover:bg-[#3847b5]"><PackageCheck className="size-4"/>{busy?"처리 중":handoff.received?"인수 완료":handoff.persisted?"인수 확인 및 공개":"인수 확인 및 3점 지급"}</Button></div>
}
function Notice({icon,title,text,read=false,cancelled=false,onClick}:{icon:React.ReactNode;title:string;text:string;read?:boolean;cancelled?:boolean;onClick?:()=>void}){return <button onClick={onClick} className={`flex w-full items-start gap-3 rounded-[20px] p-4 text-left ${cancelled?"bg-[#f1f1f4] text-[#777986]":read?"bg-[#f7f7fb]":"bg-[#eef0ff] hover:bg-[#e5e8ff]"}`}><span className={`grid size-10 shrink-0 place-items-center rounded-2xl [&>svg]:size-5 ${cancelled?"bg-[#e1e1e5] text-[#777986]":"bg-[#e0e3ff] text-[#4553b8]"}`}>{icon}</span><span className="min-w-0"><span className="flex items-center gap-2 text-sm font-extrabold">{title}{!read&&!cancelled&&<span className="size-2 rounded-full bg-[#e33f65]"/>}</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{text}</span></span></button>}

function RewardBadgeCard({badge}:{badge:{name:string;description:string;earned:boolean}}){return <div className={`rounded-[20px] border p-4 text-center ${badge.earned?"border-[#e4c35a] bg-[#fff8dc]":"border-[#e1e2e8] bg-[#f6f6f8] opacity-65"}`}><span className={`mx-auto grid size-11 place-items-center rounded-full ${badge.earned?"bg-[#ffe17c] text-[#765600]":"bg-[#e2e2e6] text-[#777985]"}`}>{badge.name==="분실물 해결사"?<Trophy className="size-5"/>:<Award className="size-5"/>}</span><p className="mt-3 text-sm font-extrabold">{badge.name}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{badge.earned?"획득 완료":badge.description}</p></div>}
