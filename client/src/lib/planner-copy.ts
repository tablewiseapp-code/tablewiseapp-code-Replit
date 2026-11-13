import { useI18n } from "@/lib/i18n";

const en = {
  title: "Plan your week", subtitle: "Choose when you'll enjoy your selected recipes.", back: "← Back to selection",
  summary: "{recipes} selected · {planned} of {total} meals planned", recipeOne: "1 recipe", recipeMany: "{count} recipes",
  selected: "Selected recipes", hint: "Choose a recipe and add it to any day.", dragHint: "Drag a recipe onto a day, or use Plan.", allPlanned: "Every selected recipe is on the calendar. Use Add meal to plan one again.",
  plan: "Plan", view: "View recipe", prep: "{count} min prep", servings: "{count} servings",
  addMeal: "Add meal", more: "Actions for {title}", replace: "Replace recipe", repeat: "Repeat on other days", changeServings: "Change servings", remove: "Remove from slot",
  slotEmpty: "{day} {meal}: empty. Add a meal.", slotFilled: "{day} {meal}: {title}", linked: "{count} days",
  planTitle: "Plan {title}", day: "Day", meal: "Meal", servingsLabel: "Servings", fewer: "Fewer servings", more2: "More servings",
  add: "Add to plan", cancel: "Cancel", replaceBtn: "Replace meal", done: "Done",
  conflict: "{day} {meal} already has “{title}”. Replace it?", conflictLinked: "{day} {meal} already has “{title}” ({count} linked days). Replace it?",
  same: "This recipe is already planned for {day} {meal}.", full: "Your plan already has {count} recipes. Remove one first.",
  pickTitle: "Add to {day} {meal}", replaceTitle: "Replace {day} {meal}", pickEmpty: "Select recipes first.",
  repeatTitle: "Repeat {title}", repeatHelp: "Pick the days and meals to repeat on. Taken slots are skipped.", taken: "taken", repeatBtn: "Repeat",
  servingsTitle: "Servings for {title}", save: "Save",
  removeTitle: "Remove {title}?", removeBody: "This clears {day} {meal}. The recipe stays selected.", removeLinked: "This clears all {count} linked days from {day} {meal}. The recipe stays selected.",
  added: "Added to {day} {meal}.", replaced: "Replaced {day} {meal}.", removed: "Removed from {day} {meal}.", moved: "Moved to {day} {meal}.", repeated: "Added to {added} more slots.", repeatedSkip: "Added to {added}; {skipped} taken slots skipped.",
  saveFailed: "Couldn't save your plan. Nothing was changed.", slotTaken: "That slot is taken. Use Replace on it instead.", locked: "This week is finalized. Unlock it to make changes.",
  finalize: "Finalize week", unlock: "Unlock", finalized: "Week finalized", grocery: "Create grocery list", groceryNone: "Plan at least one meal to create a grocery list.",
  clear: "Clear plan", emptyTitle: "No recipes selected yet", emptyBody: "Choose a few recipes to start planning your week.", chooseRecipes: "Choose recipes",
};
const ru: typeof en = {
  title: "Планируйте неделю", subtitle: "Выберите, когда приготовить выбранные рецепты.", back: "← Назад к выбору",
  summary: "Выбрано: {recipes} · запланировано {planned} из {total} приёмов пищи", recipeOne: "1 рецепт", recipeMany: "{count} рецептов",
  selected: "Выбранные рецепты", hint: "Выберите рецепт и добавьте его в любой день.", dragHint: "Перетащите рецепт на день или нажмите «В план».", allPlanned: "Все выбранные рецепты уже в календаре. Нажмите «Добавить», чтобы запланировать снова.",
  plan: "В план", view: "Открыть рецепт", prep: "{count} мин подготовки", servings: "{count} порц.",
  addMeal: "Добавить", more: "Действия: {title}", replace: "Заменить рецепт", repeat: "Повторить в другие дни", changeServings: "Изменить порции", remove: "Убрать",
  slotEmpty: "{day}, {meal}: пусто. Добавить блюдо.", slotFilled: "{day}, {meal}: {title}", linked: "{count} дн.",
  planTitle: "В план: {title}", day: "День", meal: "Приём пищи", servingsLabel: "Порции", fewer: "Меньше порций", more2: "Больше порций",
  add: "Добавить в план", cancel: "Отмена", replaceBtn: "Заменить", done: "Готово",
  conflict: "{day}, {meal}: уже «{title}». Заменить?", conflictLinked: "{day}, {meal}: уже «{title}» ({count} дн. подряд). Заменить?",
  same: "Этот рецепт уже запланирован: {day}, {meal}.", full: "В плане уже {count} рецептов. Сначала удалите один.",
  pickTitle: "Добавить: {day}, {meal}", replaceTitle: "Заменить: {day}, {meal}", pickEmpty: "Сначала выберите рецепты.",
  repeatTitle: "Повторить: {title}", repeatHelp: "Выберите дни и приёмы пищи. Занятые пропускаются.", taken: "занято", repeatBtn: "Повторить",
  servingsTitle: "Порции: {title}", save: "Сохранить",
  removeTitle: "Убрать «{title}»?", removeBody: "Освободится {day}, {meal}. Рецепт останется выбранным.", removeLinked: "Освободятся все {count} дн. подряд с {day}, {meal}. Рецепт останется выбранным.",
  added: "Добавлено: {day}, {meal}.", replaced: "Заменено: {day}, {meal}.", removed: "Убрано: {day}, {meal}.", moved: "Перенесено: {day}, {meal}.", repeated: "Добавлено в слотов: {added}.", repeatedSkip: "Добавлено: {added}; занято, пропущено: {skipped}.",
  saveFailed: "Не удалось сохранить план. Ничего не изменилось.", slotTaken: "Слот занят. Используйте «Заменить».", locked: "Неделя завершена. Разблокируйте её для изменений.",
  finalize: "Завершить неделю", unlock: "Разблокировать", finalized: "Неделя завершена", grocery: "Создать список покупок", groceryNone: "Запланируйте хотя бы одно блюдо.",
  clear: "Очистить план", emptyTitle: "Рецепты ещё не выбраны", emptyBody: "Выберите несколько рецептов, чтобы спланировать неделю.", chooseRecipes: "Выбрать рецепты",
};
const he: typeof en = {
  title: "תכננו את השבוע", subtitle: "בחרו מתי תיהנו מהמתכונים שבחרתם.", back: "→ חזרה לבחירה",
  summary: "נבחרו {recipes} · {planned} מתוך {total} ארוחות מתוכננות", recipeOne: "מתכון אחד", recipeMany: "{count} מתכונים",
  selected: "מתכונים שנבחרו", hint: "בחרו מתכון והוסיפו אותו לכל יום.", dragHint: "גררו מתכון ליום, או השתמשו ב״לתוכנית״.", allPlanned: "כל המתכונים שנבחרו כבר בלוח. השתמשו ב״הוספת ארוחה״ כדי לתכנן שוב.",
  plan: "לתוכנית", view: "צפייה במתכון", prep: "{count} דק׳ הכנה", servings: "{count} מנות",
  addMeal: "הוספת ארוחה", more: "פעולות עבור {title}", replace: "החלפת מתכון", repeat: "חזרה בימים נוספים", changeServings: "שינוי מספר מנות", remove: "הסרה מהמשבצת",
  slotEmpty: "{day} {meal}: ריק. הוסיפו ארוחה.", slotFilled: "{day} {meal}: {title}", linked: "{count} ימים",
  planTitle: "לתוכנית: {title}", day: "יום", meal: "ארוחה", servingsLabel: "מנות", fewer: "פחות מנות", more2: "יותר מנות",
  add: "הוספה לתוכנית", cancel: "ביטול", replaceBtn: "החלפת ארוחה", done: "סיום",
  conflict: "ב{day} {meal} כבר יש ״{title}״. להחליף?", conflictLinked: "ב{day} {meal} כבר יש ״{title}״ ({count} ימים מקושרים). להחליף?",
  same: "המתכון הזה כבר מתוכנן ל{day} {meal}.", full: "בתוכנית כבר יש {count} מתכונים. הסירו אחד קודם.",
  pickTitle: "הוספה ל{day} {meal}", replaceTitle: "החלפה ב{day} {meal}", pickEmpty: "בחרו מתכונים קודם.",
  repeatTitle: "חזרה על {title}", repeatHelp: "בחרו ימים וארוחות לחזרה. משבצות תפוסות מדולגות.", taken: "תפוס", repeatBtn: "חזרה",
  servingsTitle: "מנות עבור {title}", save: "שמירה",
  removeTitle: "להסיר את {title}?", removeBody: "הפעולה מנקה את {day} {meal}. המתכון נשאר נבחר.", removeLinked: "הפעולה מנקה את כל {count} הימים המקושרים החל מ{day} {meal}. המתכון נשאר נבחר.",
  added: "נוסף ל{day} {meal}.", replaced: "הוחלף ב{day} {meal}.", removed: "הוסר מ{day} {meal}.", moved: "הועבר ל{day} {meal}.", repeated: "נוסף ל-{added} משבצות נוספות.", repeatedSkip: "נוסף ל-{added}; {skipped} משבצות תפוסות דולגו.",
  saveFailed: "לא הצלחנו לשמור את התוכנית. דבר לא השתנה.", slotTaken: "המשבצת תפוסה. השתמשו בהחלפה.", locked: "השבוע סופי. בטלו את הנעילה כדי לשנות.",
  finalize: "סיום השבוע", unlock: "ביטול נעילה", finalized: "השבוע סופי", grocery: "יצירת רשימת קניות", groceryNone: "תכננו לפחות ארוחה אחת כדי ליצור רשימת קניות.",
  clear: "ניקוי התוכנית", emptyTitle: "עדיין לא נבחרו מתכונים", emptyBody: "בחרו כמה מתכונים כדי להתחיל לתכנן את השבוע.", chooseRecipes: "בחירת מתכונים",
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
