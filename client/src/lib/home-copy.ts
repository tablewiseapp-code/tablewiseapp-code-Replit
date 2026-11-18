const copy = {
  en: {
    title: "Home", todaysMeals: "Today’s meals", viewWeek: "View week", noMeals: "No meals planned for today", planMeals: "Plan meals",
    groceries: "Grocery list", openList: "Open list", toBuy: "{count} items to buy", toBuyOne: "1 item to buy",
    allChecked: "All groceries checked.", noItems: "Your grocery list is empty.", addItem: "Add item",
    loading: "Loading…", loadError: "Couldn’t load this section.", retry: "Try again",
  },
  ru: {
    title: "Главная", todaysMeals: "Еда на сегодня", viewWeek: "Открыть неделю", noMeals: "На сегодня ничего не запланировано", planMeals: "Спланировать",
    groceries: "Список покупок", openList: "Открыть список", toBuy: "Осталось купить: {count}", toBuyOne: "Осталось купить: 1",
    allChecked: "Всё куплено.", noItems: "Список покупок пуст.", addItem: "Добавить товар",
    loading: "Загрузка…", loadError: "Не удалось загрузить этот раздел.", retry: "Попробовать снова",
  },
  he: {
    title: "בית", todaysMeals: "הארוחות של היום", viewWeek: "לתפריט השבועי", noMeals: "לא תוכננו ארוחות להיום", planMeals: "תכנון ארוחות",
    groceries: "רשימת קניות", openList: "לרשימה", toBuy: "{count} פריטים לקנות", toBuyOne: "פריט אחד לקנות",
    allChecked: "כל הקניות סומנו.", noItems: "רשימת הקניות ריקה.", addItem: "הוספת פריט",
    loading: "טוען…", loadError: "לא ניתן לטעון את החלק הזה.", retry: "ניסיון נוסף",
  },
};
export function homeText(lang: string, key: keyof typeof copy.en, values: Record<string, string | number> = {}): string {
  const text = copy[lang as keyof typeof copy]?.[key] ?? copy.en[key];
  return text.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ""));
}
