import { useI18n } from "@/lib/i18n";

// The store picker (Your household and Groceries → My stores). English, Russian, Hebrew. Store names stay as branded.
const en = {
  heading: "Where do you buy your groceries?", helper: "Choose how you shop at each store.",
  delivery: "Delivery", walkIn: "Walk-in", toggle: "{store}: {method}",
  addAnother: "+ Add another store", storeName: "Store name", add: "Add store", cancel: "Cancel",
  needMethod: "Choose Delivery, Walk-in or both.", saveError: "Couldn’t save. Try again.",
  myStores: "My stores", done: "Done",
};
type Copy = typeof en;
const ru: Copy = {
  heading: "Где вы покупаете продукты?", helper: "Выберите, как вы покупаете в каждом магазине.",
  delivery: "Доставка", walkIn: "В магазине", toggle: "{store}: {method}",
  addAnother: "+ Добавить другой магазин", storeName: "Название магазина", add: "Добавить магазин", cancel: "Отмена",
  needMethod: "Выберите доставку, покупку в магазине или оба варианта.", saveError: "Не удалось сохранить. Попробуйте ещё раз.",
  myStores: "Мои магазины", done: "Готово",
};
const he: Copy = {
  heading: "איפה אתם קונים מצרכים?", helper: "בחרו איך אתם קונים בכל חנות.",
  delivery: "משלוח", walkIn: "קנייה בחנות", toggle: "{store}: {method}",
  addAnother: "+ הוספת חנות אחרת", storeName: "שם החנות", add: "הוספת חנות", cancel: "ביטול",
  needMethod: "בחרו משלוח, קנייה בחנות או את שניהם.", saveError: "לא ניתן היה לשמור. נסו שוב.",
  myStores: "החנויות שלי", done: "סיום",
};
const copies = { en, ru, he };

export function useStorePickerCopy() {
  const { lang } = useI18n();
  return (key: keyof Copy, values: Record<string, string> = {}) =>
    copies[lang][key].replace(/\{(\w+)\}/g, (_, name: string) => values[name] ?? "");
}
