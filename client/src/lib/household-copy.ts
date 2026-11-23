import { useI18n } from "@/lib/i18n";
import { settingsText } from "@/lib/settings-copy";
import { mealSlots } from "@shared/cooking-plan";
import type { BasicSettings } from "@/lib/basic-settings";

// Your household (/household), its controls on the Week and Cook now. English, Russian, Hebrew.
const en = {
  // Personalize my recipes (2026-11-21)
  personalizeIntro: "Saved changes apply to Cook now, the Week and every suggestion.", favoriteCuisines: "Favorite cuisines",
  favoriteCuisinesHint: "Recipes from these cuisines come first. Other recipes still appear.", cookingPrefs: "Cooking preferences (optional)",
  moreInSettings: "Favorites, dislikes, cooking times and weekday or weekend routines are in Settings.", personalizeShort: "Personalize",
  sumOnly: "Only {list} recipes.", sumNo: "No {list}.", sumNone: "No food requirements.", sumNotSet: "Food requirements not set yet.",
  sumCuisines: "{list} dishes first.", sumKid: "Kid-friendly lunches and dinners first.", sumWeeknight: "Mon–Fri: {list}.", sumMealUpTo: "{meal} up to {n} min",
  noLongerFits: "No longer fits your preferences: {why}", timeLimit: "Time for this meal", anyTime: "Any time", upToMinutes: "≤ {n} min", noneInTime: "No suggestion fits in {n} min. Your saved preferences are unchanged.",
  // Guided setup (2026-11-21)
  stepOf: "Step {n} of {total}", back: "Back", next: "Continue", useEveryday: "Use everyday cooking",
  peopleQ: "Who are you cooking for?", kidFriendly: "Kid-friendly meals", kidFriendlyHint: "Lunch and dinner suggestions start with dishes marked kid-friendly.", adults: "Adults", children: "Children", fewerOf: "Fewer: {who}", moreOf: "More: {who}",
  peoplePreview: "{servings} servings by default: 1 per adult, ½ per child.", peopleRequired: "Add at least one person.",
  removeInSettings: "{names} have their own diets, allergies or likes, so they’re removed in Settings, not here.", openSettings: "Open Settings", fixedNote: "Settings use a fixed {n} servings. Changing these counts replaces it.",
  requirementsQ: "Family food preferences", requirementsHint: "Your preferences apply to everyone at the table.",
  noRequirements: "No requirements", chooseDiet: "Choose a diet", addExclusions: "Add allergies or exclusions", exclusionLabel: "Another ingredient to avoid",
  requirementsRequired: "Choose No requirements, a diet, or an allergy or exclusion.",
  kitchenQ: "My kitchen", noAppliances: "No cooking appliances", kitchenHint: "Recipes that need an appliance you don’t have are never suggested.",
  noAppliancesHint: "Only recipes reviewed as no-cook are suggested.", kitchenRequired: "Choose your appliances, or No cooking appliances.",
  doneQ: "What would you like to do?", cookNow: "Cook now", cookNowHint: "One recipe for today. Your Week stays the same.",
  planWeek: "Plan my week", planWeekHint: "Choose your cooking days, then review the dishes.", personalize: "Personalize my recipes",
  saving: "Saving…", saveFailed: "Couldn’t save your answers. They are kept here.",
  cookNowNone: "No recipe meets all your requirements and kitchen equipment. Nothing was relaxed.", reviewPrefs: "Review preferences", reviewKitchen: "My kitchen",
  suggested: "Suggested for you", showAnother: "Show another", backToSetup: "Back to Your household",
  scheduleTitle: "Your cooking days", scheduleIntro: "We’ll put one dish on each cooking day. You can change it any time.", reviseDays: "Cook more evenings, or unselect some days.",
  cookingDays: "Cooking days", cancel: "Cancel", save: "Save",
  title: "Your household",
  styleQ: "What kind of meals would you like us to suggest?",
  style_quick: "Quick & easy", style_quickHint: "Few steps and little prep.",
  style_everyday: "Everyday cooking", style_everydayHint: "Familiar meals with some variety.",
  style_chef: "Chef challenge", style_chefHint: "More involved recipes and techniques.",
  servingsQ: "How many people are you cooking for?", fewer: "Fewer servings", more: "More servings",
  restrictionsHint: "For a diet, or no gluten or milk, we only suggest recipes marked that way. For other allergies we read the ingredients and skip any recipe we’re not sure about. Always check product labels.",
  alsoApplied: "Also applied from Basic Settings: {list}", membersApplied: "Allergies and diets of your household members in Basic Settings also apply.",
  eveningsQ: "How many evenings a week do you usually cook?", notSure: "Not sure yet", notSureHint: "We’ll suggest {n} evenings.",
  fixedQ: "Any evenings you already know you’ll cook?", optional: "Optional", fixedHint: "Even one day is enough. We’ll suggest the rest.",
  tooManyDays: "You picked {days} evenings but cook {count} a week.", raiseCount: "Cook {days} evenings",
  weeknightQ: "Weekday cooking time (Mon–Fri)", noLimit: "No limit",
  weeknightHint: "Total time for each meal. Recipes over it are never suggested for that meal on weekdays.", weeknightChefHint: "Your chef challenge evening is not limited.", add: "Add", remove: "Remove {item}",
  challengeQ: "When would you like a chef challenge?", challenge_day: "On a day I choose", challenge_any: "Any cooking day", challenge_every: "Every cooking day",
  retry: "Try again",
  minutes: "{n} min", servings: "{n} servings",
  changeHousehold: "Your household",
  suggestRecipe: "Suggest a recipe",
  startCooking: "Start cooking",
};
type Copy = typeof en;
const ru: Copy = {
  personalizeIntro: "Сохранённые изменения действуют в «Приготовить сейчас», на неделе и во всех предложениях.", favoriteCuisines: "Любимые кухни",
  favoriteCuisinesHint: "Рецепты этих кухонь предлагаются первыми. Остальные тоже появляются.", cookingPrefs: "Предпочтения в готовке (необязательно)",
  moreInSettings: "Любимые и нелюбимые продукты, время готовки и распорядок будней и выходных — в «Настройках».", personalizeShort: "Настроить",
  sumOnly: "Только рецепты: {list}.", sumNo: "Без: {list}.", sumNone: "Нет требований к питанию.", sumNotSet: "Требования к питанию ещё не указаны.",
  sumCuisines: "Сначала кухни: {list}.", sumKid: "Сначала обеды и ужины для детей.", sumWeeknight: "Пн–пт: {list}.", sumMealUpTo: "{meal} — до {n} мин",
  noLongerFits: "Больше не подходит под ваши предпочтения: {why}", timeLimit: "Время на это блюдо", anyTime: "Любое время", upToMinutes: "≤ {n} мин", noneInTime: "Нет предложений на {n} мин. Сохранённые предпочтения не изменились.",
  stepOf: "Шаг {n} из {total}", back: "Назад", next: "Продолжить", useEveryday: "Обычная готовка",
  peopleQ: "Для кого вы готовите?", kidFriendly: "Блюда для детей", kidFriendlyHint: "В обедах и ужинах сначала предлагаются блюда с отметкой «для детей».", adults: "Взрослые", children: "Дети", fewerOf: "Меньше: {who}", moreOf: "Больше: {who}",
  peoplePreview: "По умолчанию порций: {servings} — 1 на взрослого, ½ на ребёнка.", peopleRequired: "Добавьте хотя бы одного человека.",
  removeInSettings: "У этих людей есть свои диеты, аллергии или предпочтения ({names}), поэтому их удаляют в «Настройках», а не здесь.", openSettings: "Открыть настройки", fixedNote: "В «Настройках» указано фиксированное число порций: {n}. Новые числа заменят его.",
  requirementsQ: "Пищевые предпочтения семьи", requirementsHint: "Ваши предпочтения действуют для всех за столом.",
  noRequirements: "Нет требований", chooseDiet: "Выбрать диету", addExclusions: "Добавить аллергии или исключения", exclusionLabel: "Другой продукт, которого избегать",
  requirementsRequired: "Выберите «Нет требований», диету, аллергию или исключение.",
  kitchenQ: "Моя кухня", noAppliances: "Нет кухонной техники", kitchenHint: "Рецепты для техники, которой у вас нет, не предлагаются.",
  noAppliancesHint: "Предлагаются только проверенные рецепты без готовки.", kitchenRequired: "Выберите технику или «Нет кухонной техники».",
  doneQ: "Что вы хотите сделать?", cookNow: "Приготовить сейчас", cookNowHint: "Один рецепт на сегодня. Неделя не меняется.",
  planWeek: "Спланировать неделю", planWeekHint: "Выберите дни готовки, затем проверьте блюда.", personalize: "Настроить мои рецепты",
  saving: "Сохраняем…", saveFailed: "Не удалось сохранить ответы. Они остались здесь.",
  cookNowNone: "Ни один рецепт не подходит под все требования и технику. Ничего не ослаблено.", reviewPrefs: "Проверить предпочтения", reviewKitchen: "Моя кухня",
  suggested: "Предложено для вас", showAnother: "Показать другой", backToSetup: "Назад к «Ваша семья»",
  scheduleTitle: "Ваши дни готовки", scheduleIntro: "В каждый день готовки поставим одно блюдо. Изменить можно в любой момент.", reviseDays: "Готовьте больше вечеров или снимите выбор с некоторых дней.",
  cookingDays: "Дни готовки", cancel: "Отмена", save: "Сохранить",
  title: "Ваша семья",
  styleQ: "Какие блюда вам предлагать?",
  style_quick: "Быстро и просто", style_quickHint: "Мало шагов и подготовки.",
  style_everyday: "Обычная готовка", style_everydayHint: "Знакомые блюда с разнообразием.",
  style_chef: "Вызов шефу", style_chefHint: "Более сложные рецепты и техники.",
  servingsQ: "На сколько человек вы готовите?", fewer: "Меньше порций", more: "Больше порций",
  restrictionsHint: "Для диеты, а также без глютена или молока мы предлагаем только рецепты с такой отметкой. При других аллергиях мы проверяем состав и пропускаем рецепты, в которых не уверены. Всегда проверяйте этикетки.",
  alsoApplied: "Также действует из «Основных настроек»: {list}", membersApplied: "Аллергии и питание членов семьи из «Основных настроек» тоже учитываются.",
  eveningsQ: "Сколько вечеров в неделю вы обычно готовите?", notSure: "Пока не знаю", notSureHint: "Предложим вечеров: {n}.",
  fixedQ: "В какие вечера вы точно будете готовить?", optional: "Необязательно", fixedHint: "Достаточно одного дня. Остальные мы предложим.",
  tooManyDays: "Вы выбрали вечеров: {days}, а готовите {count} в неделю.", raiseCount: "Готовить {days} вечеров",
  weeknightQ: "Время готовки в будни (пн–пт)", noLimit: "Без ограничения",
  weeknightHint: "Общее время для каждого приёма пищи. Рецепты дольше этого в будни не предлагаются.", weeknightChefHint: "На вечер «вызова шефу» ограничение не действует.", add: "Добавить", remove: "Убрать {item}",
  challengeQ: "Когда устроить «вызов шефу»?", challenge_day: "В выбранный день", challenge_any: "В любой день готовки", challenge_every: "Каждый день готовки",
  retry: "Попробовать снова",
  minutes: "{n} мин", servings: "Порций: {n}",
  changeHousehold: "Ваша семья",
  suggestRecipe: "Предложить рецепт",
  startCooking: "Начать готовить",
};
const he: Copy = {
  personalizeIntro: "שינויים שנשמרו חלים על „לבשל עכשיו”, על השבוע ועל כל ההצעות.", favoriteCuisines: "מטבחים אהובים",
  favoriteCuisinesHint: "מתכונים מהמטבחים האלה יופיעו קודם. גם מתכונים אחרים יופיעו.", cookingPrefs: "העדפות בישול (לא חובה)",
  moreInSettings: "אהובים, לא אהובים, זמני בישול ושגרת ימי חול וסופי שבוע נמצאים בהגדרות.", personalizeShort: "התאמה",
  sumOnly: "רק מתכונים: {list}.", sumNo: "בלי: {list}.", sumNone: "אין דרישות תזונה.", sumNotSet: "דרישות התזונה עוד לא נקבעו.",
  sumCuisines: "קודם מטבחים: {list}.", sumKid: "קודם ארוחות צהריים וערב שילדים אוהבים.", sumWeeknight: "ב׳–ו׳: {list}.", sumMealUpTo: "{meal} עד {n} דק׳",
  noLongerFits: "כבר לא מתאים להעדפות שלכם: {why}", timeLimit: "זמן לארוחה הזו", anyTime: "כל זמן", upToMinutes: "≤ {n} דק׳", noneInTime: "אין הצעה שמתאימה ל־{n} דק׳. ההעדפות השמורות לא השתנו.",
  stepOf: "שלב {n} מתוך {total}", back: "חזרה", next: "המשך", useEveryday: "בישול יומיומי",
  peopleQ: "בשביל מי אתם מבשלים?", kidFriendly: "ארוחות שילדים אוהבים", kidFriendlyHint: "בהצעות לצהריים ולערב יופיעו קודם מנות שמסומנות כמתאימות לילדים.", adults: "מבוגרים", children: "ילדים", fewerOf: "פחות: {who}", moreOf: "יותר: {who}",
  peoplePreview: "{servings} מנות כברירת מחדל: 1 למבוגר, ½ לילד.", peopleRequired: "הוסיפו לפחות אדם אחד.",
  removeInSettings: "ל־{names} יש תזונה, אלרגיות או העדפות משלהם, ולכן מסירים אותם בהגדרות ולא כאן.", openSettings: "פתיחת ההגדרות", fixedNote: "בהגדרות נקבע מספר קבוע של {n} מנות. שינוי המספרים כאן מחליף אותו.",
  requirementsQ: "העדפות התזונה של המשפחה", requirementsHint: "ההעדפות שלכם חלות על כל מי שסביב השולחן.",
  noRequirements: "אין דרישות", chooseDiet: "בחירת תזונה", addExclusions: "הוספת אלרגיות או החרגות", exclusionLabel: "רכיב נוסף שיש להימנע ממנו",
  requirementsRequired: "בחרו „אין דרישות”, תזונה, או אלרגיה או החרגה.",
  kitchenQ: "המטבח שלי", noAppliances: "אין מכשירי בישול", kitchenHint: "מתכונים שדורשים מכשיר שאין לכם לא יוצעו.",
  noAppliancesHint: "מוצעים רק מתכונים שנבדקו כללא בישול.", kitchenRequired: "בחרו את המכשירים שלכם, או „אין מכשירי בישול”.",
  doneQ: "מה תרצו לעשות?", cookNow: "לבשל עכשיו", cookNowHint: "מתכון אחד להיום. השבוע לא משתנה.",
  planWeek: "לתכנן את השבוע", planWeekHint: "בחרו ימי בישול, ואז עברו על המנות.", personalize: "התאמת המתכונים שלי",
  saving: "שומרים…", saveFailed: "לא ניתן היה לשמור את התשובות. הן נשמרו כאן.",
  cookNowNone: "אף מתכון לא עומד בכל הדרישות ובציוד המטבח. שום דבר לא הוקל.", reviewPrefs: "בדיקת ההעדפות", reviewKitchen: "המטבח שלי",
  suggested: "הוצע בשבילכם", showAnother: "להציג אחר", backToSetup: "חזרה למשק הבית שלכם",
  scheduleTitle: "ימי הבישול שלכם", scheduleIntro: "נשבץ מנה אחת בכל יום בישול. אפשר לשנות בכל עת.", reviseDays: "בשלו בעוד ערבים, או בטלו את הבחירה בחלק מהימים.",
  cookingDays: "ימי בישול", cancel: "ביטול", save: "שמירה",
  title: "משק הבית שלכם",
  styleQ: "אילו ארוחות להציע לכם?",
  style_quick: "מהיר ופשוט", style_quickHint: "מעט שלבים ומעט הכנה.",
  style_everyday: "בישול יומיומי", style_everydayHint: "ארוחות מוכרות עם קצת גיוון.",
  style_chef: "אתגר שף", style_chefHint: "מתכונים וטכניקות מורכבים יותר.",
  servingsQ: "לכמה אנשים אתם מבשלים?", fewer: "פחות מנות", more: "יותר מנות",
  restrictionsHint: "לדיאטה, או ללא גלוטן או חלב, נציע רק מתכונים שמסומנים כך. באלרגיות אחרות נבדוק את הרכיבים ונדלג על כל מתכון שאיננו בטוחים לגביו. תמיד בדקו את תוויות המוצרים.",
  alsoApplied: "חל גם מההגדרות הבסיסיות: {list}", membersApplied: "גם האלרגיות והתזונה של בני הבית מההגדרות הבסיסיות חלות.",
  eveningsQ: "כמה ערבים בשבוע אתם בדרך כלל מבשלים?", notSure: "עוד לא בטוחים", notSureHint: "נציע {n} ערבים.",
  fixedQ: "יש ערבים שבהם אתם יודעים שתבשלו?", optional: "לא חובה", fixedHint: "מספיק יום אחד. את השאר נציע אנחנו.",
  tooManyDays: "בחרתם {days} ערבים אבל מבשלים {count} בשבוע.", raiseCount: "לבשל {days} ערבים",
  weeknightQ: "זמן בישול בימי חול (ב׳–ו׳)", noLimit: "ללא הגבלה",
  weeknightHint: "זמן כולל לכל ארוחה. מתכונים ארוכים מזה לא יוצעו לארוחה הזו בימי חול.", weeknightChefHint: "ערב אתגר השף אינו מוגבל.", add: "הוספה", remove: "הסרת {item}",
  challengeQ: "מתי תרצו אתגר שף?", challenge_day: "ביום שאבחר", challenge_any: "בכל ערב בישול", challenge_every: "בכל ערבי הבישול",
  retry: "ניסיון נוסף",
  minutes: "{n} דק׳", servings: "{n} מנות",
  changeHousehold: "משק הבית שלכם",
  suggestRecipe: "הציעו מתכון",
  startCooking: "מתחילים לבשל",
};
const copy = { en, ru, he };
export type HouseholdKey = keyof Copy;
export function householdText(lang: string, key: HouseholdKey, values: Record<string, string | number> = {}) {
  return (copy[lang as keyof typeof copy] ?? en)[key].replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ""));
}
export function useHouseholdCopy() {
  const { lang } = useI18n();
  return (key: HouseholdKey, values?: Record<string, string | number>) => householdText(lang, key, values);
}

/** Personalize my recipes: the household's preferences in plain words, e.g. "Only Vegetarian recipes. No Sesame. Asian dishes first." */
export function preferenceSummary(s: BasicSettings, lang: string, mealName: (meal: string) => string): string {
  const t = (key: HouseholdKey, values?: Record<string, string | number>) => householdText(lang, key, values);
  const st = (key: string) => settingsText(lang, key);
  const list = (items: string[]) => new Intl.ListFormat(lang, { type: "conjunction" }).format(items);
  const d = s.dietary;
  const avoid = [...d.allergies.map(a => st(`allergen_${a}`)), ...d.customAllergies];
  const limits = mealSlots.filter(m => s.setup.weeknightMax[m] !== null).map(m => t("sumMealUpTo", { meal: mealName(m), n: s.setup.weeknightMax[m]! }));
  return [
    d.diets.length ? t("sumOnly", { list: list(d.diets.map(x => st(`diet_${x}`))) }) : "",
    avoid.length ? t("sumNo", { list: list(avoid) }) : "",
    !d.diets.length && !avoid.length ? t(s.setup.noRestrictions ? "sumNone" : "sumNotSet") : "",
    d.preferredCuisines.length ? t("sumCuisines", { list: list(d.preferredCuisines.map(c => st(`cuisine_${c}`))) }) : "",
    s.household.kidFriendly ? t("sumKid") : "",
    limits.length ? t("sumWeeknight", { list: list(limits) }) : "",
  ].filter(Boolean).join(" ");
}
