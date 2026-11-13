import { useI18n, type Language } from "@/lib/i18n";

const copy = {
  en: {
    back: "← Back", startTimer: "Start timer", pauseTimer: "Pause", resumeTimer: "Resume", resetTimer: "Reset", timerDone: "Time's up for this step", timerSetTo: "Set to {time}", startCooking: "Start cooking", resumeCooking: "Resume cooking", cookingMode: "Cooking mode", exitCooking: "Exit cooking", stepOf: "Step {current} of {total}",
    prevStep: "Previous step", nextStepLabel: "Next step", finishCooking: "Finish cooking", zenMode: "Zen mode", currentStep: "Current step", goToStep: "Go to step {n}",
    restart: "Restart from step 1", confirmRestart: "Tap again to restart", showIngredients: "Ingredients for {count} servings", progressSaved: "Progress is saved while you're away.", more: "More actions", addToPlan: "Add to meal plan", servings: "{count} servings", servingsLabel: "Servings",
    decrease: "Fewer servings", increase: "More servings", servingsNote: "Quantities scaled from {base} servings. The saved recipe is unchanged.",
    servingsFixed: "Servings can't be adjusted: the recipe has no serving count.", ingredients: "Ingredients", instructions: "Instructions",
    prep: "Prep", ingredientView: "Ingredient view", viewOrder: "Recipe order", viewCategory: "By category", cook: "Cook", checked: "{done} of {total} ingredients checked", resetChecks: "Clear checks", minutes: "min",
    sourceFrom: "Recipe from {host}", sourceLink: "View original recipe", sourceVerified: "Source verified",
    editTimes: "Edit times", editCredit: "Edit credit", deleteRecipe: "Delete recipe", deleteTitle: "Delete this recipe?",
    deleteBody: "“{title}” will be removed from your recipes. This can't be undone.", cancel: "Cancel", delete: "Delete", deleteFailed: "Couldn't delete the recipe. Try again.",
    nutritionNone: "Nutrition information not available.", loading: "Loading recipe…", notFound: "Recipe not found", retry: "Try again", toRecipes: "My recipes",
    planTitle: "Add to meal plan", planDay: "Day", planMeal: "Meal", planServings: "Servings", planConfirm: "Add to plan", planReplace: "Replace meal",
    planSaved: "Added to {day} {meal}.", planViewPlanner: "Open weekly planner", planClose: "Done",
    planSame: "This recipe is already planned for {day} {meal}.", planConflict: "{day} {meal} already has “{title}”{span}. Replace it?",
    planSpan: " ({count} days)", planFull: "Your plan already has {count} recipes. Remove one in the planner first.",
    planLocked: "This week is locked in the planner. Unlock it there to make changes.", planFailed: "Couldn't save to the planner. Your plan was not changed.",
    days: "Sun,Mon,Tue,Wed,Thu,Fri,Sat", meals: "Breakfast,Lunch,Dinner", noImage: "No image",
    timesTitle: "Preparation and cooking time", creditTitle: "Recipe credit", close: "Close",
    cookingHeading: "My Cooking Experience", madeItTitle: "Made it?", madeItSubtitle: "How did it turn out?", madeItCta: "I made it! ✓",
    madeItDone: "You made it! 🎉", madeAgain: "I made it again", undo: "Undo", saving: "Saving…", saved: "Saved",
    madeCountOne: "You've made this once!", madeCountFew: "You've made this {count} times!", madeCountMany: "You've made this {count} times!", madeCountOther: "You've made this {count} times!",
    lastCooked: "Last cooked: {date}", madeBadge: "Made ×{count}", privateNote: "Only you can see this.",
    howWasIt: "How was it?", myNotes: "My Notes", notesPlaceholder: "What would you change next time?",
    myPhotos: "My Photos", addPhoto: "Add a photo", addingPhoto: "Adding photo…", photoFailed: "Couldn't add that photo. Try another one.",
    photoAlt: "My photo from {date}", deletePhoto: "Delete photo", deletePhotoTitle: "Delete this photo?", deletePhotoBody: "It will be removed from your cooking history.",
    earlierTimes: "Earlier times", madeItFailed: "Couldn't save. Check your connection and try again.", historyFailed: "Couldn't load your cooking history.", saveFailed: "Couldn't save.",
  },
  ru: {
    back: "← Назад", startTimer: "Запустить таймер", pauseTimer: "Пауза", resumeTimer: "Продолжить", resetTimer: "Сбросить", timerDone: "Время для этого шага вышло", timerSetTo: "Установлено на {time}", startCooking: "Начать готовить", resumeCooking: "Продолжить готовку", cookingMode: "Режим готовки", exitCooking: "Выйти из режима", stepOf: "Шаг {current} из {total}",
    prevStep: "Предыдущий шаг", nextStepLabel: "Следующий шаг", finishCooking: "Завершить готовку", zenMode: "Дзен-режим", currentStep: "Текущий шаг", goToStep: "Перейти к шагу {n}",
    restart: "Начать с шага 1", confirmRestart: "Нажмите ещё раз для сброса", showIngredients: "Ингредиенты на {count} порц.", progressSaved: "Прогресс сохраняется, пока вы отсутствуете.", more: "Ещё действия", addToPlan: "Добавить в план питания", servings: "{count} порц.", servingsLabel: "Порции",
    decrease: "Меньше порций", increase: "Больше порций", servingsNote: "Количества пересчитаны с {base} порц. Сохранённый рецепт не изменён.",
    servingsFixed: "Порции нельзя изменить: в рецепте не указано их число.", ingredients: "Ингредиенты", instructions: "Инструкция",
    prep: "Подготовка", ingredientView: "Вид ингредиентов", viewOrder: "Как в рецепте", viewCategory: "По категориям", cook: "Готовка", checked: "Отмечено {done} из {total}", resetChecks: "Снять отметки", minutes: "мин",
    sourceFrom: "Рецепт: {host}", sourceLink: "Открыть оригинал рецепта", sourceVerified: "Источник подтверждён",
    editTimes: "Изменить время", editCredit: "Изменить авторство", deleteRecipe: "Удалить рецепт", deleteTitle: "Удалить этот рецепт?",
    deleteBody: "«{title}» будет удалён из ваших рецептов. Это нельзя отменить.", cancel: "Отмена", delete: "Удалить", deleteFailed: "Не удалось удалить рецепт. Попробуйте снова.",
    nutritionNone: "Данные о пищевой ценности недоступны.", loading: "Загрузка рецепта…", notFound: "Рецепт не найден", retry: "Повторить", toRecipes: "Мои рецепты",
    planTitle: "Добавить в план питания", planDay: "День", planMeal: "Приём пищи", planServings: "Порции", planConfirm: "Добавить в план", planReplace: "Заменить",
    planSaved: "Добавлено: {day}, {meal}.", planViewPlanner: "Открыть планировщик", planClose: "Готово",
    planSame: "Этот рецепт уже запланирован: {day}, {meal}.", planConflict: "{day}, {meal}: уже «{title}»{span}. Заменить?",
    planSpan: " ({count} дн.)", planFull: "В плане уже {count} рецептов. Сначала удалите один в планировщике.",
    planLocked: "Неделя заблокирована в планировщике. Разблокируйте её там.", planFailed: "Не удалось сохранить в планировщик. План не изменён.",
    days: "Вс,Пн,Вт,Ср,Чт,Пт,Сб", meals: "Завтрак,Обед,Ужин", noImage: "Нет фото",
    timesTitle: "Время подготовки и готовки", creditTitle: "Авторство рецепта", close: "Закрыть",
    cookingHeading: "Мой кулинарный опыт", madeItTitle: "Приготовили?", madeItSubtitle: "Как получилось?", madeItCta: "Я приготовил(а)! ✓",
    madeItDone: "Получилось! 🎉", madeAgain: "Приготовил(а) снова", undo: "Отменить", saving: "Сохранение…", saved: "Сохранено",
    madeCountOne: "Вы готовили это {count} раз!", madeCountFew: "Вы готовили это {count} раза!", madeCountMany: "Вы готовили это {count} раз!", madeCountOther: "Вы готовили это {count} раза!",
    lastCooked: "Последний раз: {date}", madeBadge: "Приготовлено ×{count}", privateNote: "Это видите только вы.",
    howWasIt: "Как вам?", myNotes: "Мои заметки", notesPlaceholder: "Что бы вы изменили в следующий раз?",
    myPhotos: "Мои фото", addPhoto: "Добавить фото", addingPhoto: "Добавляем фото…", photoFailed: "Не удалось добавить фото. Попробуйте другое.",
    photoAlt: "Моё фото от {date}", deletePhoto: "Удалить фото", deletePhotoTitle: "Удалить это фото?", deletePhotoBody: "Оно будет удалено из вашей истории готовки.",
    earlierTimes: "Ранее", madeItFailed: "Не удалось сохранить. Проверьте подключение и попробуйте снова.", historyFailed: "Не удалось загрузить историю готовки.", saveFailed: "Не удалось сохранить.",
  },
  he: {
    back: "→ חזרה", startTimer: "הפעלת טיימר", pauseTimer: "השהיה", resumeTimer: "המשך", resetTimer: "איפוס", timerDone: "הזמן לשלב הזה נגמר", timerSetTo: "מוגדר ל-{time}", startCooking: "התחלת בישול", resumeCooking: "המשך בישול", cookingMode: "מצב בישול", exitCooking: "יציאה ממצב בישול", stepOf: "שלב {current} מתוך {total}",
    prevStep: "שלב קודם", nextStepLabel: "שלב הבא", finishCooking: "סיום בישול", zenMode: "מצב זן", currentStep: "השלב הנוכחי", goToStep: "מעבר לשלב {n}",
    restart: "התחלה מחדש משלב 1", confirmRestart: "לחצו שוב להתחלה מחדש", showIngredients: "מרכיבים ל-{count} מנות", progressSaved: "ההתקדמות נשמרת בזמן היעדרותכם.", more: "פעולות נוספות", addToPlan: "הוספה לתוכנית הארוחות", servings: "{count} מנות", servingsLabel: "מנות",
    decrease: "פחות מנות", increase: "יותר מנות", servingsNote: "הכמויות חושבו מחדש מתוך {base} מנות. המתכון השמור לא השתנה.",
    servingsFixed: "אי אפשר לשנות מנות: במתכון לא צוין מספר מנות.", ingredients: "מרכיבים", instructions: "הוראות הכנה",
    prep: "הכנה", ingredientView: "תצוגת מרכיבים", viewOrder: "לפי סדר המתכון", viewCategory: "לפי קטגוריה", cook: "בישול", checked: "סומנו {done} מתוך {total}", resetChecks: "ניקוי סימונים", minutes: "דק׳",
    sourceFrom: "מתכון מ-{host}", sourceLink: "למתכון המקורי", sourceVerified: "המקור אומת",
    editTimes: "עריכת זמנים", editCredit: "עריכת קרדיט", deleteRecipe: "מחיקת מתכון", deleteTitle: "למחוק את המתכון?",
    deleteBody: "“{title}” יימחק מהמתכונים שלך. אי אפשר לבטל.", cancel: "ביטול", delete: "מחיקה", deleteFailed: "מחיקת המתכון נכשלה. נסו שוב.",
    nutritionNone: "מידע תזונתי אינו זמין.", loading: "טוען מתכון…", notFound: "המתכון לא נמצא", retry: "נסו שוב", toRecipes: "המתכונים שלי",
    planTitle: "הוספה לתוכנית הארוחות", planDay: "יום", planMeal: "ארוחה", planServings: "מנות", planConfirm: "הוספה לתוכנית", planReplace: "החלפה",
    planSaved: "נוסף: {day} {meal}.", planViewPlanner: "פתיחת המתכנן השבועי", planClose: "סיום",
    planSame: "המתכון כבר מתוכנן: {day} {meal}.", planConflict: "ב{day} {meal} כבר יש “{title}”{span}. להחליף?",
    planSpan: " ({count} ימים)", planFull: "בתוכנית כבר {count} מתכונים. הסירו אחד במתכנן.",
    planLocked: "השבוע נעול במתכנן. בטלו את הנעילה שם.", planFailed: "השמירה במתכנן נכשלה. התוכנית לא השתנתה.",
    days: "א׳,ב׳,ג׳,ד׳,ה׳,ו׳,שבת", meals: "ארוחת בוקר,ארוחת צהריים,ארוחת ערב", noImage: "אין תמונה",
    timesTitle: "זמני הכנה ובישול", creditTitle: "קרדיט המתכון", close: "סגירה",
    cookingHeading: "חוויית הבישול שלי", madeItTitle: "הכנתם?", madeItSubtitle: "איך יצא?", madeItCta: "הכנתי! ✓",
    madeItDone: "הכנתם! 🎉", madeAgain: "הכנתי שוב", undo: "ביטול", saving: "שומר…", saved: "נשמר",
    madeCountOne: "הכנתם את זה פעם אחת!", madeCountFew: "הכנתם את זה {count} פעמים!", madeCountMany: "הכנתם את זה {count} פעמים!", madeCountOther: "הכנתם את זה {count} פעמים!",
    lastCooked: "בפעם האחרונה: {date}", madeBadge: "הוכן ×{count}", privateNote: "רק אתם רואים את זה.",
    howWasIt: "איך היה?", myNotes: "ההערות שלי", notesPlaceholder: "מה הייתם משנים בפעם הבאה?",
    myPhotos: "התמונות שלי", addPhoto: "הוספת תמונה", addingPhoto: "מוסיף תמונה…", photoFailed: "לא ניתן להוסיף את התמונה. נסו תמונה אחרת.",
    photoAlt: "התמונה שלי מ-{date}", deletePhoto: "מחיקת תמונה", deletePhotoTitle: "למחוק את התמונה?", deletePhotoBody: "היא תוסר מהיסטוריית הבישול שלכם.",
    earlierTimes: "פעמים קודמות", madeItFailed: "השמירה נכשלה. בדקו את החיבור ונסו שוב.", historyFailed: "לא ניתן לטעון את היסטוריית הבישול.", saveFailed: "השמירה נכשלה.",
  },
} satisfies Record<Language, Record<string, string>>;

export type RecipeViewKey = keyof typeof copy.en;

export function useRecipeViewCopy() {
  const { lang } = useI18n();
  const t = (key: RecipeViewKey, values?: Record<string, string | number>) => {
    let result: string = copy[lang]?.[key] ?? copy.en[key];
    for (const [name, value] of Object.entries(values ?? {})) result = result.replaceAll(`{${name}}`, String(value));
    return result;
  };
  const list = (key: "days" | "meals") => (copy[lang]?.[key] ?? copy.en[key]).split(",");
  return { t, list };
}
