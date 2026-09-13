const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const MAX_OUTPUT_EDGE = 1600;
const JPEG_QUALITY = 0.82;

export function validateImageFile(file: File): string | null {
  if (!file.type.startsWith("image/")) return "이미지 파일만 선택할 수 있습니다.";
  if (file.size > MAX_SOURCE_BYTES) return "사진은 15MB 이하만 선택할 수 있습니다.";
  return null;
}

export async function prepareItemImage(file: File): Promise<File> {
  const validationError = validateImageFile(file);
  if (validationError) throw new Error(validationError);

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_OUTPUT_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("사진을 처리하지 못했습니다.");
  }

  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) throw new Error("사진을 처리하지 못했습니다.");

  return new File([blob], "item-photo.jpg", {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}
