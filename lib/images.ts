const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const MAX_OUTPUT_EDGE = 1000;
const MAX_DATA_URL_LENGTH = 450_000;
const QUALITY_STEPS = [0.78, 0.68, 0.58, 0.48];

export function validateImageFile(file: File): string | null {
  if (!file.type.startsWith("image/")) return "이미지 파일만 선택할 수 있습니다.";
  if (file.size > MAX_SOURCE_BYTES) return "사진은 15MB 이하만 선택할 수 있습니다.";
  return null;
}

async function loadImage(file: File): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close(),
    };
  }

  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  await image.decode();
  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    cleanup: () => URL.revokeObjectURL(url),
  };
}

export async function prepareItemImage(file: File): Promise<string> {
  const validationError = validateImageFile(file);
  if (validationError) throw new Error(validationError);

  const image = await loadImage(file);
  const scale = Math.min(1, MAX_OUTPUT_EDGE / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));

  const context = canvas.getContext("2d");
  if (!context) {
    image.cleanup();
    throw new Error("사진을 처리하지 못했습니다.");
  }

  context.drawImage(image.source, 0, 0, canvas.width, canvas.height);
  image.cleanup();

  for (const quality of QUALITY_STEPS) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.length <= MAX_DATA_URL_LENGTH) return dataUrl;
  }

  throw new Error("사진 용량을 충분히 줄이지 못했습니다. 다른 사진을 선택해 주세요.");
}
