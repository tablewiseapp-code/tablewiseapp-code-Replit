// My Cooking Experience: private cooking history, served by /api/cooking-sessions for the current browser owner.
export type CookingSession = {
  id: string; recipeId: string; cookedAt: string; rating: number | null; notes: string | null;
  photoIds: string[]; createdAt: string; updatedAt: string;
};

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`${response.status}`);
  return response.status === 204 ? (undefined as T) : response.json();
}

export const cookingKey = (recipeId: string) => ["/api/cooking-sessions", recipeId] as const;
export const fetchCookingSessions = (recipeId: string) =>
  call<CookingSession[]>("GET", `/api/cooking-sessions?recipeId=${encodeURIComponent(recipeId)}`);
/** The caller keeps `id` for retries: the server treats a repeated id as the same session, never a duplicate. */
export const recordCooking = (id: string, recipeId: string) => call<CookingSession>("POST", "/api/cooking-sessions", { id, recipeId });
export const updateCooking = (id: string, patch: { rating?: number | null; notes?: string | null }) =>
  call<CookingSession>("PATCH", `/api/cooking-sessions/${id}`, patch);
export const deleteCooking = (id: string) => call<void>("DELETE", `/api/cooking-sessions/${id}`);
export const deleteCookingPhoto = (id: string) => call<void>("DELETE", `/api/cooking-photos/${id}`);
export const cookingPhotoURL = (id: string, thumb = false) => `/api/cooking-photos/${id}${thumb ? "?size=thumb" : ""}`;
export async function addCookingPhoto(sessionId: string, file: File): Promise<string> {
  const { id } = await call<{ id: string }>("POST", `/api/cooking-sessions/${sessionId}/photos`, await preparePhoto(file));
  return id;
}

// randomUUID needs a secure context; plain-http LAN testing on a phone falls back to getRandomValues.
export const newCookingId = (): string => globalThis.crypto.randomUUID?.() ??
  "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
    (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16));

export function cookingSummary(sessions: CookingSession[]) {
  return { count: sessions.length, lastCookedAt: sessions.reduce<string | null>((last, s) => !last || s.cookedAt > last ? s.cookedAt : last, null) };
}

// Re-encoding through a canvas resizes the photo, applies its orientation and drops EXIF (including GPS location).
const PHOTO_MAX = 1600, THUMB_MAX = 400, PHOTO_BYTES = 1_500_000;
async function preparePhoto(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const encode = async (max: number, quality: number) => {
      const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d")!;
      context.fillStyle = "#fff"; // transparent PNGs become white, not black
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
      if (!blob) throw new Error("encode");
      return blob;
    };
    let photo = await encode(PHOTO_MAX, 0.82);
    if (photo.size > PHOTO_BYTES) photo = await encode(PHOTO_MAX, 0.6);
    return { image: await base64(photo), thumbnail: await base64(await encode(THUMB_MAX, 0.75)) };
  } finally {
    URL.revokeObjectURL(url);
  }
}
const base64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(",")[1]);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});
