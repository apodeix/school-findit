"use client";
/* eslint-disable @next/next/no-img-element -- Private, pre-compressed JPEG data URLs. */
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { User } from "firebase/auth";
import { Camera, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { appRequest } from "@/lib/api-client";
import {
  categories,
  clueInput,
  itemInput,
  today,
  type Clue,
  type Item,
} from "@/lib/domain";
import { prepareItemImage } from "@/lib/images";

export type Save = (
  action: string,
  input: Record<string, unknown>,
) => Promise<unknown>;
export type Prompt = {
  title: string;
  description: string;
  action: string;
  input: Record<string, unknown>;
  field?: string;
  initial?: string;
  label?: string;
  password?: boolean;
};
export function messageOf(err: unknown) {
  return err instanceof Error
    ? err.message
    : "처리하지 못했습니다. 다시 시도해 주세요.";
}
export function Modal({
  open = true,
  onClose,
  title,
  description,
  children,
}: {
  open?: boolean;
  onClose: () => void;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-[28px] sm:max-w-[650px]">
        <DialogHeader className="text-left">
          <DialogTitle className="break-words text-2xl font-extrabold">
            {title}
          </DialogTitle>
          <DialogDescription className="text-sm leading-6">
            {description}
          </DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm font-bold">
      <span className="mb-2 block">{label}</span>
      {children}
    </label>
  );
}
export function FormError({ text }: { text: string }) {
  return text ? (
    <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">
      {text}
    </p>
  ) : null;
}
function Actions({
  busy,
  disabled,
  onClose,
  label,
}: {
  busy: boolean;
  disabled?: boolean;
  onClose: () => void;
  label: string;
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
        취소
      </Button>
      <Button type="submit" disabled={busy || disabled}>
        {busy ? "저장 중…" : label}
      </Button>
    </div>
  );
}

export function ItemEditor({
  item,
  kind,
  teacher,
  user,
  onClose,
  onSave,
}: {
  item?: Item;
  kind: "lost" | "found";
  teacher: boolean;
  user: User;
  onClose: () => void;
  onSave: Save;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [photoBusy, setPhotoBusy] = useState(Boolean(item?.hasImage)),
    [photo, setPhoto] = useState(""),
    [photoError, setPhotoError] = useState("");
  const id = useRef(item?.id || crypto.randomUUID());
  useEffect(() => {
    if (!item?.hasImage) return;
    let live = true;
    appRequest<{ imageDataUrl: string }>(user, "image", { id: item.id })
      .then((r) => {
        if (live) setPhoto(r.imageDataUrl);
      })
      .catch(() => {
        if (live)
          setPhotoError(
            "기존 사진을 불러오지 못했습니다. 창을 닫고 다시 시도해 주세요.",
          );
      })
      .finally(() => {
        if (live) setPhotoBusy(false);
      });
    return () => {
      live = false;
    };
  }, [item, user]);
  async function pick(file?: File) {
    if (!file) return;
    setPhotoBusy(true);
    setPhotoError("");
    try {
      setPhoto(await prepareItemImage(file));
    } catch (err) {
      setPhotoError(messageOf(err));
    } finally {
      setPhotoBusy(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || photoBusy || photoError) return;
    const parsed = itemInput.safeParse({
      ...Object.fromEntries(new FormData(event.currentTarget)),
      kind,
      imageDataUrl: photo,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    if (!item && kind === "found" && teacher && !parsed.data.storageLocation) {
      setError("보관 장소를 입력해 주세요.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave(item ? "item.edit" : "item.create", {
        id: id.current,
        value: parsed.data,
      });
      onClose();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      onClose={() => {
        if (!busy) onClose();
      }}
      title={
        item ? "글 수정" : kind === "lost" ? "잃어버렸어요" : "주인을 찾아요"
      }
      description={
        kind === "found" && !teacher
          ? "등록 후 물건을 선생님께 전달하세요. 인수 확인 전에는 다른 학생에게 공개되지 않습니다."
          : "필수 항목만 입력해도 등록할 수 있어요. 소유권 확인에 쓸 세부 특징은 일부 남겨 두세요."
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={busy || photoBusy} className="space-y-4">
          <Field label="물건 이름 (필수)">
            <Input
              name="title"
              required
              maxLength={80}
              defaultValue={item?.title}
              placeholder="예: 검정 무선 이어폰"
            />
          </Field>
          <Field
            label={
              kind === "lost" ? "마지막으로 본 장소 (필수)" : "주운 장소 (필수)"
            }
          >
            <Input
              name="location"
              required
              maxLength={120}
              defaultValue={item?.location}
              placeholder="기억나지 않으면 ‘모름’으로 입력하세요"
            />
          </Field>
          <Field label="날짜 (필수)">
            <Input
              name="dateText"
              required
              type="date"
              max={today()}
              defaultValue={item?.dateText || today()}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="분류 (선택)">
              <select
                name="category"
                defaultValue={item?.category || "기타"}
                className="h-11 w-full rounded-xl border bg-white px-3"
              >
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="색상 (선택)">
              <Input
                name="color"
                maxLength={30}
                defaultValue={item?.color}
                placeholder="예: 검정"
              />
            </Field>
          </div>
          <Field label="특징 (선택)">
            <Textarea
              name="description"
              maxLength={1500}
              defaultValue={item?.description}
              placeholder="다른 물건과 구분할 특징을 적어주세요."
              className="min-h-28"
            />
          </Field>
          {!item && teacher && kind === "found" && (
            <Field label="보관 장소 (필수)">
              <Input
                name="storageLocation"
                required
                maxLength={120}
                placeholder="예: 1층 교무실 분실물 보관함"
              />
            </Field>
          )}
          <div className="space-y-3 rounded-3xl border border-dashed bg-[#f5f6ff] p-4">
            <p className="text-sm font-bold">물건 사진 (선택)</p>
            {photo && (
              <div className="relative">
                <img
                  src={photo}
                  alt="등록할 사진 미리보기"
                  className="max-h-56 w-full rounded-2xl object-contain"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="absolute right-2 top-2 rounded-full"
                  onClick={() => setPhoto("")}
                  aria-label="선택 사진 제거"
                >
                  <X />
                </Button>
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full border bg-white px-3 text-sm font-bold focus-within:ring-2">
                <ImagePlus className="size-5" />
                사진 업로드
                <input
                  className="sr-only"
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    void pick(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full bg-primary px-3 text-sm font-bold text-white focus-within:ring-2">
                <Camera className="size-5" />
                바로 사진 촬영
                <input
                  className="sr-only"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    void pick(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </div>
        </fieldset>
        <p className="rounded-2xl bg-[#fff5d0] p-4 text-sm leading-6 text-[#68521c]">
          얼굴, 이름표, 학생증 정보와 전화번호를 가려 주세요. 사진은 저장 전에
          자동으로 압축합니다.
        </p>
        {photoBusy && <p role="status">사진을 준비하고 있습니다.</p>}
        <FormError text={photoError || error} />
        <Actions
          busy={busy}
          disabled={photoBusy || Boolean(photoError)}
          onClose={onClose}
          label={item ? "수정 저장" : "등록하기"}
        />
      </form>
    </Modal>
  );
}
export function ClueEditor({
  item,
  clue,
  onClose,
  onSave,
}: {
  item: Item;
  clue?: Clue;
  onClose: () => void;
  onSave: Save;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [detail, setDetail] = useState(clue?.detail || ""),
    id = useRef(clue?.id || crypto.randomUUID());
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const parsed = clueInput.safeParse(
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave(clue ? "clue.edit" : "clue.create", {
        id: id.current,
        itemId: item.id,
        value: parsed.data,
      });
      onClose();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      onClose={() => {
        if (!busy) onClose();
      }}
      title={clue ? "내 단서 수정" : "찾기 단서 남기기"}
      description={`${item.title}을 어디에서 보았나요? 전화번호와 SNS 계정은 적지 마세요.`}
    >
      <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={busy} className="space-y-4">
          <Field label="본 장소 (필수)">
            <Input
              name="place"
              required
              maxLength={120}
              defaultValue={clue?.place}
              placeholder="예: 도서관 반납대 옆"
            />
          </Field>
          <Field label="본 날짜 (필수)">
            <Input
              name="seenDate"
              type="date"
              required
              max={today()}
              defaultValue={clue?.seenDate || today()}
            />
          </Field>
          <Field label="대략적인 시간 (필수)">
            <Input
              name="seenTime"
              required
              maxLength={60}
              defaultValue={clue?.seenTime}
              placeholder="예: 점심시간, 오후 1시쯤"
            />
          </Field>
          <Field label="단서 내용 (필수)">
            <Textarea
              name="detail"
              required
              maxLength={1500}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="어떤 물건이 있었는지, 어디로 이동했는지 적어주세요."
              className="min-h-32"
            />
          </Field>
        </fieldset>
        <p className="text-sm text-muted-foreground">
          내용을 작성해야 등록할 수 있어요. 작성 횟수에는 제한이 없습니다.
        </p>
        <FormError text={error} />
        <Actions
          busy={busy}
          disabled={!detail.trim()}
          onClose={onClose}
          label={clue ? "수정 저장" : "단서 등록"}
        />
      </form>
    </Modal>
  );
}
export function ActionPrompt({
  prompt,
  onClose,
  onSave,
}: {
  prompt: Prompt;
  onClose: () => void;
  onSave: Save;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const value = String(
      new FormData(event.currentTarget).get("value") || "",
    ).trim();
    if (prompt.field && !value) {
      setError("내용을 입력해 주세요.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave(prompt.action, {
        ...prompt.input,
        ...(prompt.field ? { [prompt.field]: value } : {}),
      });
      onClose();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      onClose={() => {
        if (!busy) onClose();
      }}
      title={prompt.title}
      description={prompt.description}
    >
      <form onSubmit={submit} className="space-y-4">
        {prompt.field && (
          <Field label={prompt.label || "내용"}>
            {prompt.password ? (
              <Input
                name="value"
                type="password"
                autoComplete="new-password"
                minLength={prompt.action === "teacher.code" ? 12 : 8}
                maxLength={32}
                required
                disabled={busy}
              />
            ) : (
              <Textarea
                name="value"
                defaultValue={prompt.initial}
                maxLength={prompt.field === "storageLocation" ? 120 : 500}
                required
                disabled={busy}
              />
            )}
          </Field>
        )}
        <FormError text={error} />
        <Actions busy={busy} onClose={onClose} label="확인" />
      </form>
    </Modal>
  );
}
