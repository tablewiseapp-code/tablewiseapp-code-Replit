import { useI18n } from "@/lib/i18n";

// The Week (/meals): the cooking plan by cooking day, its dish cards, dialogs, approval and Weekly deals (docs/cooking-plan.md).

const en = {
  title: "Weekly cooking plan", prevWeek: "Previous week", nextWeek: "Next week", today: "Today",
  prefsChanged: "Your preferences have been changed", prefsChangedBody: "Update the week to plan it again from your new preferences. This replaces this week's dishes.", updateWeek: "Update the week", keepWeek: "Keep my week",
  statusDraft: "Draft", statusApproved: "Approved", statusChanged: "Changes not saved",
  approve: "Approve plan", saveChanges: "Save changes", groceries: "View groceries",
  approveHint: "Approval builds your grocery list.", changedHint: "Save changes to update your groceries.",
  browse: "Browse recipes", backToWeek: "Back to week", loading: "Loading your week…", loadFailed: "Couldn't load this week.", retry: "Try again",
  addMealTitle: "{meal} · {date}", moveDay: "Move day",
  forDates: "For {dates}", yieldNeeded: "Servings unknown",
  addDish: "+ Add dish", addDishTo: "Add dish to {date}", moveDayFor: "Move day: {date}", servings: "{count} servings", minutes: "{count} min", editServingsFor: "Edit servings for {title}", swap: "Swap", swapFor: "Swap {title}", tryAnother: "Try another", tryAnotherFor: "Try another instead of {title}", noOther: "No other recipe fits this day.",
  removeDish: "Remove dish", removeDishFor: "Remove {title}", dishActions: "{title}, cooked {date}",
  swapTitle: "Swap {title}", search: "Search recipes", noOptions: "No recipe fits this day.",
  servingsTitle: "Servings for {title}", servingDates: "Serving dates", adults: "Adults", kids: "Kids",
  setAmount: "Set servings", useCounts: "Use adults and kids", amountFor: "Servings on {date}",
  fewer: "Fewer {who}", more: "More {who}", total: "Total: {count} servings",
  yieldAsk: "This recipe doesn't say how many servings it makes. How many does it make?", yieldLabel: "Recipe makes (servings)",
  errNoDates: "Choose at least one serving date.", errTotal: "The total must be more than 0.", errYield: "Enter how many servings the recipe makes.",
  moveTitle: "Move cooking day · {date}", moveTo: "New cooking day", moveConflicts: "These portions would be eaten before the new cooking day:",
  conflictRow: "{title} · {date} · {count} servings", conflictMove: "Move to {date}", conflictRemove: "Remove portions",
  moveUnresolved: "Choose what happens to each portion.", moveEmpty: "Each dish needs at least one serving date.", moveBtn: "Move",
  added: "{title} added to {date}.", swapped: "{title} is in the plan now.", moved: "Moved to {date}.", removed: "Removed {title}.", undo: "Undo",
  save: "Save", cancel: "Cancel",
  saveFailed: "Couldn't save your plan. Nothing was changed.",
  deals: "Weekly deals · {count} offers", dealsOne: "Weekly deals · 1 offer", dealFor: "For {title}", dealUntil: "Until {date}", dealSample: "Sample deal", dealRecipes: "Find recipes",
};
const ru: typeof en = {
  title: "План готовки на неделю", prevWeek: "Предыдущая неделя", nextWeek: "Следующая неделя", today: "Сегодня",
  prefsChanged: "Ваши предпочтения изменились", prefsChangedBody: "Обновите неделю, чтобы спланировать её заново по новым предпочтениям. Блюда этой недели будут заменены.", updateWeek: "Обновить неделю", keepWeek: "Оставить мою неделю",
  statusDraft: "Черновик", statusApproved: "Утверждено", statusChanged: "Изменения не сохранены",
  approve: "Утвердить план", saveChanges: "Сохранить изменения", groceries: "Список покупок",
  approveHint: "После утверждения появится список покупок.", changedHint: "Сохраните изменения, чтобы обновить список покупок.",
  browse: "Все рецепты", backToWeek: "Назад к неделе", loading: "Загружаем неделю…", loadFailed: "Не удалось загрузить неделю.", retry: "Повторить",
  addMealTitle: "{meal} · {date}", moveDay: "Перенести день",
  forDates: "На {dates}", yieldNeeded: "Число порций неизвестно",
  addDish: "+ Добавить блюдо", addDishTo: "Добавить блюдо на {date}", moveDayFor: "Перенести день: {date}", servings: "Порций: {count}", minutes: "{count} мин", editServingsFor: "Изменить порции: {title}", swap: "Заменить", swapFor: "Заменить {title}", tryAnother: "Другой рецепт", tryAnotherFor: "Другой рецепт вместо «{title}»", noOther: "Других подходящих рецептов на этот день нет.",
  removeDish: "Удалить блюдо", removeDishFor: "Удалить {title}", dishActions: "{title}, готовим {date}",
  swapTitle: "Замена: {title}", search: "Поиск рецептов", noOptions: "На этот день рецептов нет.",
  servingsTitle: "Порции: {title}", servingDates: "Дни, на которые готовим", adults: "Взрослые", kids: "Дети",
  setAmount: "Указать порции", useCounts: "Считать по взрослым и детям", amountFor: "Порций на {date}",
  fewer: "Меньше: {who}", more: "Больше: {who}", total: "Всего порций: {count}",
  yieldAsk: "В рецепте не сказано, на сколько порций он рассчитан. Сколько порций получается?", yieldLabel: "Рецепт даёт (порций)",
  errNoDates: "Выберите хотя бы один день.", errTotal: "Всего должно быть больше 0 порций.", errYield: "Укажите, сколько порций даёт рецепт.",
  moveTitle: "Перенести день готовки · {date}", moveTo: "Новый день готовки", moveConflicts: "Эти порции пришлись бы на дни до нового дня готовки:",
  conflictRow: "{title} · {date} · порций: {count}", conflictMove: "Перенести на {date}", conflictRemove: "Убрать порции",
  moveUnresolved: "Выберите, что сделать с каждой порцией.", moveEmpty: "У каждого блюда должен остаться хотя бы один день.", moveBtn: "Перенести",
  added: "«{title}» добавлено на {date}.", swapped: "Теперь в плане «{title}».", moved: "Перенесено на {date}.", removed: "«{title}» удалено.", undo: "Отменить",
  save: "Сохранить", cancel: "Отмена",
  saveFailed: "Не удалось сохранить план. Ничего не изменилось.",
  deals: "Скидки недели · предложений: {count}", dealsOne: "Скидки недели · 1 предложение", dealFor: "Для «{title}»", dealUntil: "До {date}", dealSample: "Пример скидки", dealRecipes: "Найти рецепты",
};
const he: typeof en = {
  title: "תוכנית הבישול השבועית", prevWeek: "השבוע הקודם", nextWeek: "השבוע הבא", today: "היום",
  prefsChanged: "ההעדפות שלכם השתנו", prefsChangedBody: "עדכנו את השבוע כדי לתכנן אותו מחדש לפי ההעדפות החדשות. המנות של השבוע הזה יוחלפו.", updateWeek: "עדכון השבוע", keepWeek: "השארת השבוע שלי",
  statusDraft: "טיוטה", statusApproved: "מאושר", statusChanged: "השינויים לא נשמרו",
  approve: "אישור התוכנית", saveChanges: "שמירת השינויים", groceries: "לרשימת הקניות",
  approveHint: "האישור בונה את רשימת הקניות.", changedHint: "שמרו את השינויים כדי לעדכן את רשימת הקניות.",
  browse: "עיון במתכונים", backToWeek: "חזרה לשבוע", loading: "טוענים את השבוע…", loadFailed: "לא הצלחנו לטעון את השבוע.", retry: "לנסות שוב",
  addMealTitle: "{meal} · {date}", moveDay: "העברת היום",
  forDates: "עבור {dates}", yieldNeeded: "מספר המנות לא ידוע",
  addDish: "+ הוספת מנה", addDishTo: "הוספת מנה ל{date}", moveDayFor: "העברת היום: {date}", servings: "{count} מנות", minutes: "{count} דק׳", editServingsFor: "עריכת מנות עבור {title}", swap: "החלפה", swapFor: "החלפת {title}", tryAnother: "מתכון אחר", tryAnotherFor: "מתכון אחר במקום „{title}”", noOther: "אין מתכון אחר שמתאים ליום הזה.",
  removeDish: "הסרת מנה", removeDishFor: "הסרת {title}", dishActions: "{title}, מבשלים ב{date}",
  swapTitle: "החלפה: {title}", search: "חיפוש מתכונים", noOptions: "אין מתכון שמתאים ליום הזה.",
  servingsTitle: "מנות עבור {title}", servingDates: "ימי הגשה", adults: "מבוגרים", kids: "ילדים",
  setAmount: "הזנת מספר מנות", useCounts: "לפי מבוגרים וילדים", amountFor: "מנות ב{date}",
  fewer: "פחות {who}", more: "יותר {who}", total: "סה״כ: {count} מנות",
  yieldAsk: "במתכון לא כתוב לכמה מנות הוא מספיק. לכמה מנות?", yieldLabel: "המתכון מספיק ל(מנות)",
  errNoDates: "בחרו לפחות יום הגשה אחד.", errTotal: "הסך חייב להיות גדול מ-0.", errYield: "הזינו לכמה מנות המתכון מספיק.",
  moveTitle: "העברת יום הבישול · {date}", moveTo: "יום הבישול החדש", moveConflicts: "המנות האלה ייאכלו לפני יום הבישול החדש:",
  conflictRow: "{title} · {date} · {count} מנות", conflictMove: "להעביר ל{date}", conflictRemove: "להסיר את המנות",
  moveUnresolved: "בחרו מה לעשות בכל מנה.", moveEmpty: "לכל מנה צריך להישאר לפחות יום הגשה אחד.", moveBtn: "העברה",
  added: "„{title}” נוסף ל{date}.", swapped: "„{title}” בתוכנית עכשיו.", moved: "הועבר ל{date}.", removed: "„{title}” הוסר.", undo: "ביטול",
  save: "שמירה", cancel: "ביטול",
  saveFailed: "לא הצלחנו לשמור את התוכנית. שום דבר לא השתנה.",
  deals: "מבצעי השבוע · {count} הצעות", dealsOne: "מבצעי השבוע · הצעה אחת", dealFor: "עבור „{title}”", dealUntil: "עד {date}", dealSample: "מבצע לדוגמה", dealRecipes: "מציאת מתכונים",
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
