import { useI18n } from "@/lib/i18n";

// Your household (/household) and the suggested week on Week → plan. English, Russian, Hebrew.
const en = {
  title: "Your household", intro: "Answer a few questions and we’ll suggest dinners for your week. You can change anything later.",
  styleQ: "What kind of meals would you like us to suggest?",
  style_quick: "Quick & easy", style_quickHint: "Few steps and little prep.",
  style_everyday: "Everyday cooking", style_everydayHint: "Familiar meals with some variety.",
  style_chef: "Chef challenge", style_chefHint: "More involved recipes and techniques.",
  servingsQ: "How many people are you cooking for?", servingsN: "{n} servings", fewer: "Fewer servings", more: "More servings",
  restrictionsQ: "Any dietary restrictions or allergies?", none: "None", dietLabel: "Dietary requirements", allergyLabel: "Allergies",
  restrictionsHint: "Diets, gluten and milk need the recipe’s explicit mark. Other allergies are checked by ingredient wording, and unclear wording counts as unsafe. Always check product labels.",
  alsoApplied: "Also applied from Basic Settings: {list}", membersApplied: "Allergies and diets of your household members in Basic Settings also apply.",
  eveningsQ: "How many evenings a week do you usually cook?", notSure: "Not sure yet", notSureHint: "We’ll suggest {n} evenings.",
  fixedQ: "Any evenings you already know you’ll cook?", optional: "Optional", fixedHint: "Even one day is enough. We’ll suggest the rest.",
  tooManyDays: "You picked {days} evenings but cook {count} a week.", raiseCount: "Cook {days} evenings",
  filtersQ: "Recipe filters", filtersHint: "The same filters as on the Week page. Total time starts at 30 minutes: choose Any for longer dinners.", weeknightQ: "Weekday cooking time (Mon–Fri)", noLimit: "No limit", upTo: "Up to {n} min",
  weeknightHint: "Total time for each meal. Recipes over it are never suggested for that meal on weekdays.", weeknightChefHint: "Your chef challenge evening is not limited.", equipmentQ: "Kitchen equipment you have", equipmentHint: "Required. Recipes that need equipment you don’t have are never suggested.", equipmentRequired: "Select the kitchen equipment you have.", restrictionsRequired: "Choose your dietary restrictions or allergies, or None.", add: "Add", remove: "Remove {item}",
  challengeQ: "When would you like a chef challenge?", challenge_day: "On a day I choose", challenge_any: "Any cooking day", challenge_every: "Every cooking day",
  summary: "Your choices", suggest: "Suggest my week", skip: "Skip for now", working: "Suggesting…",
  catalogError: "Couldn’t load recipes. Try again.", retry: "Try again", saveError: "Couldn’t save. Nothing was changed.",
  keptLocked: "Your approved week was kept. Choose “Edit week” to change it.",
  // Week → plan review
  reviewTitle: "Your dinners this week", reviewDraft: "Suggested from Your household. Approve it, or swap anything first.", reviewApproved: "Approved. Groceries use these dinners.", openNoMatch: "{day}: no dinner matches all your restrictions.", openFiltered: "{day}: no dinner matches your filters.", openAllUsed: "{day}: every matching dinner is already in your week.", openFull: "{day}: your week already has 12 recipes.", approve: "Approve week", edit: "Edit week", swap: "Swap dinner", update: "Update",
  minutes: "{n} min", timeUnknown: "Time not recorded", servings: "{n} servings", openEvening: "Open evening",
  swapped: "{day}: {title}", noAlternative: "No other dinner matches your preferences for {day}.",
  move: "Move to another evening", moveTo: "Move to {day}", choose: "Choose another recipe", leaveOpen: "Leave this evening open",
  leftOpen: "{day} is open.", moved: "Moved to {day}.", chooseTitle: "Dinners for {day}", chooseEmpty: "No other dinner matches your preferences for {day}.", openBecause: "Most often excluded by:",
  editPrefs: "Edit preferences", changeHousehold: "Your household",
  suggestRecipe: "Suggest a recipe", suggestTitle: "Something to cook today", suggestUsing: "Uses your household restrictions. Your Week and groceries stay the same.",
  startCooking: "Start cooking", suggestNone: "No dinner matches your household restrictions.",
};
type Copy = typeof en;
const ru: Copy = {
  title: "Ваша семья", intro: "Ответьте на несколько вопросов, и мы предложим ужины на неделю. Всё можно изменить позже.",
  styleQ: "Какие блюда вам предлагать?",
  style_quick: "Быстро и просто", style_quickHint: "Мало шагов и подготовки.",
  style_everyday: "Обычная готовка", style_everydayHint: "Знакомые блюда с разнообразием.",
  style_chef: "Вызов шефу", style_chefHint: "Более сложные рецепты и техники.",
  servingsQ: "На сколько человек вы готовите?", servingsN: "Порций: {n}", fewer: "Меньше порций", more: "Больше порций",
  restrictionsQ: "Есть ли ограничения в питании или аллергии?", none: "Нет", dietLabel: "Питание", allergyLabel: "Аллергии",
  restrictionsHint: "Для диет, глютена и молока нужна явная отметка в рецепте. Другие аллергены проверяются по составу, а неясный состав считается небезопасным. Всегда проверяйте этикетки.",
  alsoApplied: "Также действует из «Основных настроек»: {list}", membersApplied: "Аллергии и питание членов семьи из «Основных настроек» тоже учитываются.",
  eveningsQ: "Сколько вечеров в неделю вы обычно готовите?", notSure: "Пока не знаю", notSureHint: "Предложим вечеров: {n}.",
  fixedQ: "В какие вечера вы точно будете готовить?", optional: "Необязательно", fixedHint: "Достаточно одного дня. Остальные мы предложим.",
  tooManyDays: "Вы выбрали вечеров: {days}, а готовите {count} в неделю.", raiseCount: "Готовить {days} вечеров",
  filtersQ: "Фильтры рецептов", filtersHint: "Те же фильтры, что на странице «Неделя». Общее время по умолчанию — 30 минут: выберите «Любое» для более долгих ужинов.", weeknightQ: "Время готовки в будни (пн–пт)", noLimit: "Без ограничения", upTo: "До {n} мин",
  weeknightHint: "Общее время для каждого приёма пищи. Рецепты дольше этого в будни не предлагаются.", weeknightChefHint: "На вечер «вызова шефу» ограничение не действует.", equipmentQ: "Техника на вашей кухне", equipmentHint: "Обязательно. Рецепты для техники, которой у вас нет, не предлагаются.", equipmentRequired: "Выберите технику, которая есть на вашей кухне.", restrictionsRequired: "Выберите ограничения в питании или аллергии либо «Нет».", add: "Добавить", remove: "Убрать {item}",
  challengeQ: "Когда устроить «вызов шефу»?", challenge_day: "В выбранный день", challenge_any: "В любой день готовки", challenge_every: "Каждый день готовки",
  summary: "Ваш выбор", suggest: "Предложить неделю", skip: "Пропустить", working: "Подбираем…",
  catalogError: "Не удалось загрузить рецепты. Попробуйте ещё раз.", retry: "Попробовать снова", saveError: "Не удалось сохранить. Ничего не изменено.",
  keptLocked: "Ваша утверждённая неделя сохранена. Чтобы изменить её, нажмите «Изменить неделю».",
  reviewTitle: "Ваши ужины на неделю", reviewDraft: "Предложено по данным «Ваша семья». Утвердите неделю или сначала замените что-нибудь.", reviewApproved: "Утверждено. Список покупок строится по этим ужинам.", openNoMatch: "{day}: ни один ужин не подходит под все ограничения.", openFiltered: "{day}: ни один ужин не подходит под ваши фильтры.", openAllUsed: "{day}: все подходящие ужины уже есть в неделе.", openFull: "{day}: в неделе уже 12 рецептов.", approve: "Утвердить неделю", edit: "Изменить неделю", swap: "Заменить ужин", update: "Изменить",
  minutes: "{n} мин", timeUnknown: "Время не указано", servings: "Порций: {n}", openEvening: "Свободный вечер",
  swapped: "{day}: {title}", noAlternative: "Других подходящих ужинов на {day} нет.",
  move: "Перенести на другой вечер", moveTo: "Перенести на {day}", choose: "Выбрать другой рецепт", leaveOpen: "Оставить вечер свободным",
  leftOpen: "{day} — свободный вечер.", moved: "Перенесено на {day}.", chooseTitle: "Ужины на {day}", chooseEmpty: "Других подходящих ужинов на {day} нет.", openBecause: "Чаще всего исключено по причине:",
  editPrefs: "Изменить предпочтения", changeHousehold: "Ваша семья",
  suggestRecipe: "Предложить рецепт", suggestTitle: "Что приготовить сегодня", suggestUsing: "С учётом ограничений вашей семьи. Неделя и список покупок не меняются.",
  startCooking: "Начать готовить", suggestNone: "Ни один ужин не подходит под ограничения вашей семьи.",
};
const he: Copy = {
  title: "משק הבית שלכם", intro: "ענו על כמה שאלות ונציע ארוחות ערב לשבוע. אפשר לשנות הכול אחר כך.",
  styleQ: "אילו ארוחות להציע לכם?",
  style_quick: "מהיר ופשוט", style_quickHint: "מעט שלבים ומעט הכנה.",
  style_everyday: "בישול יומיומי", style_everydayHint: "ארוחות מוכרות עם קצת גיוון.",
  style_chef: "אתגר שף", style_chefHint: "מתכונים וטכניקות מורכבים יותר.",
  servingsQ: "לכמה אנשים אתם מבשלים?", servingsN: "{n} מנות", fewer: "פחות מנות", more: "יותר מנות",
  restrictionsQ: "יש הגבלות תזונתיות או אלרגיות?", none: "אין", dietLabel: "דרישות תזונה", allergyLabel: "אלרגיות",
  restrictionsHint: "לתזונה, לגלוטן ולחלב נדרש סימון מפורש במתכון. אלרגיות אחרות נבדקות לפי ניסוח הרכיבים, וניסוח לא ברור נחשב לא בטוח. תמיד בדקו את תוויות המוצרים.",
  alsoApplied: "חל גם מההגדרות הבסיסיות: {list}", membersApplied: "גם האלרגיות והתזונה של בני הבית מההגדרות הבסיסיות חלות.",
  eveningsQ: "כמה ערבים בשבוע אתם בדרך כלל מבשלים?", notSure: "עוד לא בטוחים", notSureHint: "נציע {n} ערבים.",
  fixedQ: "יש ערבים שבהם אתם יודעים שתבשלו?", optional: "לא חובה", fixedHint: "מספיק יום אחד. את השאר נציע אנחנו.",
  tooManyDays: "בחרתם {days} ערבים אבל מבשלים {count} בשבוע.", raiseCount: "לבשל {days} ערבים",
  filtersQ: "מסנני מתכונים", filtersHint: "אותם מסננים כמו בעמוד השבוע. הזמן הכולל מתחיל ב־30 דקות: בחרו „הכול” לארוחות ארוכות יותר.", weeknightQ: "זמן בישול בימי חול (ב׳–ו׳)", noLimit: "ללא הגבלה", upTo: "עד {n} דק׳",
  weeknightHint: "זמן כולל לכל ארוחה. מתכונים ארוכים מזה לא יוצעו לארוחה הזו בימי חול.", weeknightChefHint: "ערב אתגר השף אינו מוגבל.", equipmentQ: "ציוד המטבח שלכם", equipmentHint: "חובה. מתכונים שדורשים ציוד שאין לכם לא יוצעו.", equipmentRequired: "בחרו את ציוד המטבח שיש לכם.", restrictionsRequired: "בחרו הגבלות תזונתיות או אלרגיות, או „אין”.", add: "הוספה", remove: "הסרת {item}",
  challengeQ: "מתי תרצו אתגר שף?", challenge_day: "ביום שאבחר", challenge_any: "בכל ערב בישול", challenge_every: "בכל ערבי הבישול",
  summary: "הבחירות שלכם", suggest: "הציעו לי שבוע", skip: "דילוג בינתיים", working: "מציעים…",
  catalogError: "לא ניתן לטעון מתכונים. נסו שוב.", retry: "ניסיון נוסף", saveError: "לא ניתן לשמור. שום דבר לא השתנה.",
  keptLocked: "השבוע המאושר שלכם נשמר. בחרו „עריכת השבוע” כדי לשנות אותו.",
  reviewTitle: "ארוחות הערב שלכם השבוע", reviewDraft: "הוצע לפי משק הבית שלכם. אשרו, או החליפו משהו קודם.", reviewApproved: "מאושר. רשימת הקניות מבוססת על הארוחות האלה.", openNoMatch: "{day}: אף ארוחת ערב לא עומדת בכל ההגבלות.", openFiltered: "{day}: אף ארוחת ערב לא מתאימה למסננים שלכם.", openAllUsed: "{day}: כל הארוחות המתאימות כבר בשבוע.", openFull: "{day}: בשבוע כבר יש 12 מתכונים.", approve: "אישור השבוע", edit: "עריכת השבוע", swap: "החלפת ארוחה", update: "עדכון",
  minutes: "{n} דק׳", timeUnknown: "הזמן לא מתועד", servings: "{n} מנות", openEvening: "ערב פנוי",
  swapped: "{day}: {title}", noAlternative: "אין ארוחת ערב אחרת שמתאימה להעדפות שלכם ליום {day}.",
  move: "העברה לערב אחר", moveTo: "העברה ליום {day}", choose: "בחירת מתכון אחר", leaveOpen: "להשאיר את הערב פנוי",
  leftOpen: "יום {day} פנוי.", moved: "הועבר ליום {day}.", chooseTitle: "ארוחות ערב ליום {day}", chooseEmpty: "אין ארוחת ערב אחרת שמתאימה להעדפות שלכם ליום {day}.", openBecause: "הסיבות הנפוצות ביותר:",
  editPrefs: "עריכת ההעדפות", changeHousehold: "משק הבית שלכם",
  suggestRecipe: "הציעו מתכון", suggestTitle: "משהו לבשל היום", suggestUsing: "לפי ההגבלות של משק הבית. השבוע ורשימת הקניות לא משתנים.",
  startCooking: "מתחילים לבשל", suggestNone: "אף ארוחת ערב לא מתאימה להגבלות של משק הבית.",
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
