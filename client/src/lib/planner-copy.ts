import { useI18n } from "@/lib/i18n";

// The Week calendar (/meals): header, meal cards, Swap, Move meal, Change servings and approval.
const en = {
  title: "Weekly meals", prevWeek: "Previous week", nextWeek: "Next week",
  statusReady: "Ready for review", statusNeededOne: "1 meal still needed", statusNeeded: "{count} meals still needed", statusApproved: "Approved",
  approve: "Approve week", edit: "Edit week", grocery: "Create grocery list", approveHint: "Choose a recipe for every meal to approve the week.",
  browse: "Browse recipes", backToWeek: "Back to week", loading: "Loading your week…", loadFailed: "Couldn't load this week.", retry: "Try again",
  servings: "{count} servings", swap: "Swap", choose: "Choose recipe", noEligible: "No eligible recipe",
  more: "Actions for {title}", changeServings: "Change servings", move: "Move meal",
  slotEmpty: "{day} {meal}: no recipe yet.", slotFilled: "{day} {meal}: {title}",
  swapTitle: "Swap {day} {meal}", chooseTitle: "Choose {day} {meal}", search: "Search recipes", noOptions: "No other recipe fits this meal.",
  moveTitle: "Move {title}", day: "Day", meal: "Meal", moveTrade: "{day} {meal} has “{title}”. The two meals will trade places.", moveBtn: "Move",
  servingsTitle: "Servings for {title}", servingsLabel: "Servings", fewer: "Fewer servings", more2: "More servings",
  save: "Save", cancel: "Cancel",
  swapped: "{day} {meal}: {title}", moved: "Moved to {day} {meal}.",
  saveFailed: "Couldn't save your plan. Nothing was changed.", locked: "This week is approved. Use Edit week to make changes.",
};
const ru: typeof en = {
  title: "Меню на неделю", prevWeek: "Предыдущая неделя", nextWeek: "Следующая неделя",
  statusReady: "Готово к проверке", statusNeededOne: "Нужно выбрать ещё 1 блюдо", statusNeeded: "Нужно выбрать ещё блюд: {count}", statusApproved: "Утверждено",
  approve: "Утвердить неделю", edit: "Изменить неделю", grocery: "Создать список покупок", approveHint: "Выберите рецепт для каждого приёма пищи, чтобы утвердить неделю.",
  browse: "Все рецепты", backToWeek: "Назад к неделе", loading: "Загружаем неделю…", loadFailed: "Не удалось загрузить неделю.", retry: "Повторить",
  servings: "{count} порц.", swap: "Заменить", choose: "Выбрать рецепт", noEligible: "Нет подходящего рецепта",
  more: "Действия: {title}", changeServings: "Изменить порции", move: "Перенести",
  slotEmpty: "{day}, {meal}: рецепт не выбран.", slotFilled: "{day}, {meal}: {title}",
  swapTitle: "Замена: {day}, {meal}", chooseTitle: "Выбор: {day}, {meal}", search: "Поиск рецептов", noOptions: "Других подходящих рецептов нет.",
  moveTitle: "Перенести «{title}»", day: "День", meal: "Приём пищи", moveTrade: "{day}, {meal}: «{title}». Блюда поменяются местами.", moveBtn: "Перенести",
  servingsTitle: "Порции: {title}", servingsLabel: "Порции", fewer: "Меньше порций", more2: "Больше порций",
  save: "Сохранить", cancel: "Отмена",
  swapped: "{day}, {meal}: {title}", moved: "Перенесено: {day}, {meal}.",
  saveFailed: "Не удалось сохранить план. Ничего не изменилось.", locked: "Неделя утверждена. Нажмите «Изменить неделю», чтобы внести изменения.",
};
const he: typeof en = {
  title: "ארוחות השבוע", prevWeek: "השבוע הקודם", nextWeek: "השבוע הבא",
  statusReady: "מוכן לבדיקה", statusNeededOne: "חסרה עוד ארוחה אחת", statusNeeded: "חסרות עוד {count} ארוחות", statusApproved: "מאושר",
  approve: "אישור השבוע", edit: "עריכת השבוע", grocery: "יצירת רשימת קניות", approveHint: "בחרו מתכון לכל ארוחה כדי לאשר את השבוע.",
  browse: "עיון במתכונים", backToWeek: "חזרה לשבוע", loading: "טוענים את השבוע…", loadFailed: "לא הצלחנו לטעון את השבוע.", retry: "לנסות שוב",
  servings: "{count} מנות", swap: "החלפה", choose: "בחירת מתכון", noEligible: "אין מתכון מתאים",
  more: "פעולות עבור {title}", changeServings: "שינוי מספר מנות", move: "העברת ארוחה",
  slotEmpty: "{day}, {meal}: עדיין אין מתכון.", slotFilled: "{day}, {meal}: {title}",
  swapTitle: "החלפה: {day}, {meal}", chooseTitle: "בחירה: {day}, {meal}", search: "חיפוש מתכונים", noOptions: "אין מתכון אחר שמתאים לארוחה הזו.",
  moveTitle: "העברת {title}", day: "יום", meal: "ארוחה", moveTrade: "ב{day}, {meal} יש את „{title}”. שתי הארוחות יתחלפו.", moveBtn: "העברה",
  servingsTitle: "מנות עבור {title}", servingsLabel: "מנות", fewer: "פחות מנות", more2: "יותר מנות",
  save: "שמירה", cancel: "ביטול",
  swapped: "{day}, {meal}: {title}", moved: "הועבר ל{day}, {meal}.",
  saveFailed: "לא הצלחנו לשמור את התוכנית. שום דבר לא השתנה.", locked: "השבוע מאושר. לחצו על „עריכת השבוע” כדי לשנות.",
};
const copy = { en, ru, he } as Record<string, typeof en>;

export type PlannerKey = keyof typeof en;
export function usePlannerCopy() {
  const { lang } = useI18n();
  return (key: PlannerKey, values?: Record<string, string | number>) => {
    let out = (copy[lang] ?? en)[key] ?? en[key];
    for (const [name, value] of Object.entries(values ?? {})) out = out.replaceAll(`{${name}}`, String(value));
    return out;
  };
}
