const copy = {
  en: {
    addPhoto: "Add picture", optionalPhoto: "Optional · JPEG, PNG or WebP, up to 10 MB",
    preview: "Item picture", removePhoto: "Remove picture", saving: "Adding…", processing: "Preparing picture…",
    photoError: "Couldn’t use this picture. Choose a JPEG, PNG or WebP under 10 MB.",
    catalogError: "Suggestions are unavailable. You can still type any item.",
  },
  ru: {
    addPhoto: "Добавить фото", optionalPhoto: "Необязательно · JPEG, PNG или WebP до 10 МБ",
    preview: "Фото товара", removePhoto: "Удалить фото", saving: "Добавляем…", processing: "Подготовка фото…",
    photoError: "Не удалось добавить фото. Выберите JPEG, PNG или WebP до 10 МБ.",
    catalogError: "Подсказки недоступны. Можно ввести любой товар.",
  },
  he: {
    addPhoto: "הוספת תמונה", optionalPhoto: "לא חובה · JPEG, PNG או WebP עד 10 MB",
    preview: "תמונת הפריט", removePhoto: "הסרת תמונה", saving: "מוסיף…", processing: "מכין תמונה…",
    photoError: "לא ניתן להשתמש בתמונה. בחרו JPEG, PNG או WebP בגודל עד 10 MB.",
    catalogError: "ההצעות אינן זמינות. אפשר להקליד כל פריט.",
  },
};
export function groceryProductText(lang: string, key: keyof typeof copy.en): string {
  return copy[lang as keyof typeof copy]?.[key] ?? copy.en[key];
}
