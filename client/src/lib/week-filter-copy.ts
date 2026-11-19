import { useI18n } from "@/lib/i18n";

// Week → Plan filters and Food deals. Option keys are the stored filter values (planner-filters.ts, food-deals.ts).
const en = {
  cookingLevel: "Cooking level", level_easy: "Easy wins", level_confident: "Cook with confidence", level_challenge: "Chef challenge",
  totalTime: "Total time", upTo: "≤{count} min",
  dietary: "Dietary", moreDietary: "More dietary options", fewerDietary: "Fewer dietary options",
  group_eatingStyles: "Eating styles", group_nutritionGoals: "Nutrition goals", group_exclusions: "Ingredient exclusions", group_religious: "Religious requirements",
  "Gluten-free": "Gluten-free", "Dairy-free": "Dairy-free", Vegetarian: "Vegetarian", "High-protein": "High-protein", "Low-carb": "Low-carb",
  Vegan: "Vegan", Pescatarian: "Pescatarian", "Mediterranean-style": "Mediterranean-style", Keto: "Keto", Paleo: "Paleo",
  "Lower-calorie": "Lower-calorie", "High-fibre": "High-fibre", "Low-sodium": "Low-sodium", "Low added sugar": "Low added sugar",
  "Egg-free": "Egg-free", "Peanut-free": "Peanut-free", "Tree-nut-free": "Tree-nut-free", "Soy-free": "Soy-free",
  Kosher: "Kosher", Halal: "Halal",
  kidFavourites: "Kid favourites", kitchenTools: "Kitchen tools",
  moreFilters: "More filters", fewerFilters: "Fewer filters",
  foodDeals: "Food deals", sampleDeals: "Sample deals", categories: "Food categories", addCategory: "Add a food category",
  cat_protein: "Protein", cat_produce: "Fruits & Vegetables", cat_baking: "Baking", cat_dairyEggs: "Dairy & Eggs",
  cat_grainsPasta: "Grains & Pasta", cat_pantry: "Pantry Staples", cat_frozen: "Frozen Foods",
  suggestions: "Suggestions", customCategory: "Or type your own", categoryPlaceholder: "Category name", add: "Add", cancel: "Cancel",
  blankCategory: "Type a category name.", duplicateCategory: "That category is already there.",
  noDeals: "No deals in this category yet.",
  "deal_chicken-thighs": "Chicken thighs", "deal_ground-beef": "Ground beef", perLb: "{price}/lb",
  showRecipes: "Show recipes", dealChip: "Deal: {name}", removeDeal: "Remove deal filter",
  noRecipesMatch: "No recipes match your filters.",
};
type Key = keyof typeof en;
const ru: Record<Key, string> = {
  cookingLevel: "Уровень готовки", level_easy: "Легко и быстро", level_confident: "Готовлю уверенно", level_challenge: "Вызов шефу",
  totalTime: "Общее время", upTo: "≤{count} мин",
  dietary: "Диета", moreDietary: "Другие варианты диеты", fewerDietary: "Меньше вариантов диеты",
  group_eatingStyles: "Стиль питания", group_nutritionGoals: "Цели питания", group_exclusions: "Без ингредиентов", group_religious: "Религиозные требования",
  "Gluten-free": "Без глютена", "Dairy-free": "Без молочного", Vegetarian: "Вегетарианское", "High-protein": "Много белка", "Low-carb": "Мало углеводов",
  Vegan: "Веганское", Pescatarian: "Пескетарианское", "Mediterranean-style": "Средиземноморское", Keto: "Кето", Paleo: "Палео",
  "Lower-calorie": "Меньше калорий", "High-fibre": "Много клетчатки", "Low-sodium": "Мало соли", "Low added sugar": "Мало добавленного сахара",
  "Egg-free": "Без яиц", "Peanut-free": "Без арахиса", "Tree-nut-free": "Без орехов", "Soy-free": "Без сои",
  Kosher: "Кошерное", Halal: "Халяль",
  kidFavourites: "Любимое детьми", kitchenTools: "Кухонная техника",
  moreFilters: "Больше фильтров", fewerFilters: "Меньше фильтров",
  foodDeals: "Скидки на продукты", sampleDeals: "Пример скидок", categories: "Категории продуктов", addCategory: "Добавить категорию продуктов",
  cat_protein: "Белок", cat_produce: "Фрукты и овощи", cat_baking: "Выпечка", cat_dairyEggs: "Молочное и яйца",
  cat_grainsPasta: "Крупы и паста", cat_pantry: "Основные запасы", cat_frozen: "Замороженное",
  suggestions: "Варианты", customCategory: "Или введите свою", categoryPlaceholder: "Название категории", add: "Добавить", cancel: "Отмена",
  blankCategory: "Введите название категории.", duplicateCategory: "Такая категория уже есть.",
  noDeals: "В этой категории пока нет скидок.",
  "deal_chicken-thighs": "Куриные бёдра", "deal_ground-beef": "Говяжий фарш", perLb: "{price}/фунт",
  showRecipes: "Показать рецепты", dealChip: "Скидка: {name}", removeDeal: "Убрать фильтр скидки",
  noRecipesMatch: "Нет рецептов по вашим фильтрам.",
};
const he: Record<Key, string> = {
  cookingLevel: "רמת בישול", level_easy: "הצלחות קלות", level_confident: "בישול בביטחון", level_challenge: "אתגר שף",
  totalTime: "זמן כולל", upTo: "≤{count} דק׳",
  dietary: "תזונה", moreDietary: "עוד אפשרויות תזונה", fewerDietary: "פחות אפשרויות תזונה",
  group_eatingStyles: "סגנונות אכילה", group_nutritionGoals: "יעדים תזונתיים", group_exclusions: "בלי מרכיבים", group_religious: "דרישות דתיות",
  "Gluten-free": "ללא גלוטן", "Dairy-free": "ללא חלב", Vegetarian: "צמחוני", "High-protein": "עשיר בחלבון", "Low-carb": "דל פחמימות",
  Vegan: "טבעוני", Pescatarian: "פסקטריאני", "Mediterranean-style": "בסגנון ים תיכוני", Keto: "קטו", Paleo: "פליאו",
  "Lower-calorie": "פחות קלוריות", "High-fibre": "עשיר בסיבים", "Low-sodium": "דל נתרן", "Low added sugar": "מעט סוכר מוסף",
  "Egg-free": "ללא ביצים", "Peanut-free": "ללא בוטנים", "Tree-nut-free": "ללא אגוזים", "Soy-free": "ללא סויה",
  Kosher: "כשר", Halal: "חלאל",
  kidFavourites: "אהובי הילדים", kitchenTools: "כלי מטבח",
  moreFilters: "עוד סינון", fewerFilters: "פחות סינון",
  foodDeals: "מבצעי מזון", sampleDeals: "מבצעים לדוגמה", categories: "קטגוריות מזון", addCategory: "הוספת קטגוריית מזון",
  cat_protein: "חלבון", cat_produce: "פירות וירקות", cat_baking: "אפייה", cat_dairyEggs: "מוצרי חלב וביצים",
  cat_grainsPasta: "דגנים ופסטה", cat_pantry: "מצרכי יסוד", cat_frozen: "קפואים",
  suggestions: "הצעות", customCategory: "או הקלידו קטגוריה משלכם", categoryPlaceholder: "שם הקטגוריה", add: "הוספה", cancel: "ביטול",
  blankCategory: "הקלידו שם קטגוריה.", duplicateCategory: "הקטגוריה הזו כבר קיימת.",
  noDeals: "אין עדיין מבצעים בקטגוריה הזו.",
  "deal_chicken-thighs": "ירכי עוף", "deal_ground-beef": "בשר בקר טחון", perLb: "{price} לליברה",
  showRecipes: "הצגת מתכונים", dealChip: "מבצע: {name}", removeDeal: "הסרת סינון המבצע",
  noRecipesMatch: "אין מתכונים שתואמים את הסינון.",
};
const copy: Record<string, Record<Key, string>> = { en, ru, he };

export function useWeekFilterCopy() {
  const { lang } = useI18n();
  return (key: string, values?: Record<string, string | number>) => {
    let out = (copy[lang] ?? en)[key as Key] ?? en[key as Key] ?? key;
    for (const [name, value] of Object.entries(values ?? {})) out = out.replaceAll(`{${name}}`, String(value));
    return out;
  };
}
