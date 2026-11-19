import { useI18n } from "@/lib/i18n";
import { lockStorageKey, planStorageKey } from "@/lib/meal-plan";
import { settingsKey } from "@/lib/basic-settings";

const copy = {
  en: {
    title: "Sign in", intro: "Open your Week, Home tasks and cooking history on any device.",
    email: "Email", password: "Password", passwordHint: "At least 8 characters.",
    newHere: "New here? Enter your email and choose a password. Your account is created the first time you sign in.",
    submit: "Sign in", busy: "Signing in…", guest: "Continue as guest", guestHint: "As a guest, your data stays in this browser only.",
    invalid: "Enter a valid email and a password of at least 8 characters.", wrongPassword: "Wrong password for this email.",
    tooMany: "Too many attempts. Try again in 15 minutes.", failed: "Couldn’t sign in. Try again.",
    account: "Account", signedInAs: "Signed in as {email}", guestNote: "You are using TableWise as a guest.",
    signOut: "Sign out", signOutFailed: "Couldn’t sign out. Try again.",
    name: "Your name", save: "Save", saved: "Saved", addPhoto: "Add photo", changePhoto: "Change photo", removePhoto: "Remove photo",
    profileFailed: "Couldn’t save. Try again.", photoFailed: "Use a JPEG, PNG or WebP picture under 10 MB.",
  },
  ru: {
    title: "Вход", intro: "Ваша неделя, дела по дому и история готовки на любом устройстве.",
    email: "Эл. почта", password: "Пароль", passwordHint: "Не меньше 8 символов.",
    newHere: "Впервые здесь? Введите эл. почту и придумайте пароль. Аккаунт будет создан при первом входе.",
    submit: "Войти", busy: "Входим…", guest: "Продолжить как гость", guestHint: "У гостя данные хранятся только в этом браузере.",
    invalid: "Введите правильный адрес эл. почты и пароль не короче 8 символов.", wrongPassword: "Неверный пароль для этой эл. почты.",
    tooMany: "Слишком много попыток. Попробуйте через 15 минут.", failed: "Не удалось войти. Попробуйте ещё раз.",
    account: "Аккаунт", signedInAs: "Вы вошли как {email}", guestNote: "Вы пользуетесь TableWise как гость.",
    signOut: "Выйти", signOutFailed: "Не удалось выйти. Попробуйте ещё раз.",
    name: "Ваше имя", save: "Сохранить", saved: "Сохранено", addPhoto: "Добавить фото", changePhoto: "Сменить фото", removePhoto: "Удалить фото",
    profileFailed: "Не удалось сохранить. Попробуйте ещё раз.", photoFailed: "Выберите JPEG, PNG или WebP до 10 МБ.",
  },
  he: {
    title: "כניסה", intro: "השבוע, משימות הבית והיסטוריית הבישול שלכם בכל מכשיר.",
    email: "אימייל", password: "סיסמה", passwordHint: "לפחות 8 תווים.",
    newHere: "חדשים כאן? הזינו אימייל ובחרו סיסמה. החשבון נוצר בכניסה הראשונה.",
    submit: "כניסה", busy: "נכנסים…", guest: "המשך כאורח", guestHint: "כאורחים, הנתונים נשמרים רק בדפדפן הזה.",
    invalid: "הזינו אימייל תקין וסיסמה של 8 תווים לפחות.", wrongPassword: "סיסמה שגויה לאימייל הזה.",
    tooMany: "יותר מדי ניסיונות. נסו שוב בעוד 15 דקות.", failed: "לא ניתן להיכנס. נסו שוב.",
    account: "חשבון", signedInAs: "מחוברים בתור {email}", guestNote: "אתם משתמשים ב־TableWise כאורחים.",
    signOut: "יציאה", signOutFailed: "לא ניתן לצאת. נסו שוב.",
    name: "השם שלכם", save: "שמירה", saved: "נשמר", addPhoto: "הוספת תמונה", changePhoto: "החלפת תמונה", removePhoto: "הסרת תמונה",
    profileFailed: "לא ניתן לשמור. נסו שוב.", photoFailed: "בחרו תמונת JPEG, PNG או WebP עד 10MB.",
  },
};
export type AccountCopyKey = keyof typeof copy.en;
export function useAccountCopy() {
  const { lang } = useI18n();
  return (key: AccountCopyKey, params: Record<string, string> = {}) =>
    (copy[lang as keyof typeof copy] ?? copy.en)[key].replace(/\{(\w+)\}/g, (_, name) => params[name] ?? "");
}

/** "Continue as guest" is remembered per browser so the sign-in screen shows once. A UI choice, not user data. */
const guestKey = "tablewise_guest_v1";
export const choseGuest = () => { try { return localStorage.getItem(guestKey) === "1"; } catch { return false; } };
export const setGuestChoice = (on: boolean) => { try { on ? localStorage.setItem(guestKey, "1") : localStorage.removeItem(guestKey); } catch {} };

/** Who is signed in; email is null for a guest. */
export type Me = { email: string | null; name?: string | null; photo?: string | null };

/** The Week's and Basic Settings' browser copies belong to whoever was signed in; drop them so the next person loads their own. */
export function switchPerson() {
  try { [planStorageKey, lockStorageKey, settingsKey].forEach(key => localStorage.removeItem(key)); } catch {}
  window.location.assign("/");
}
