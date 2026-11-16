const copy = {
  en: {
    actions: "Picture options", changePhoto: "Change picture", viewPhoto: "View picture", closePhoto: "Close picture",
    uploading: "Saving picture…", saveError: "Couldn’t save this picture. Try again.", retry: "Try again",
    loadError: "Pictures couldn’t be loaded. Try again to edit them.",
    addPhoto: "Add picture", optionalPhoto: "Optional · JPEG, PNG or WebP, up to 10 MB",
    preview: "Item picture", removePhoto: "Remove picture", saving: "Adding…", processing: "Preparing picture…",
    photoError: "Couldn’t use this picture. Choose a JPEG, PNG or WebP under 10 MB.",
    catalogError: "Suggestions are unavailable. You can still type any item.",
  },
  ru: {
    actions: "Действия с фото", changePhoto: "Заменить фото", viewPhoto: "Посмотреть фото", closePhoto: "Закрыть фото",
    uploading: "Сохранение фото…", saveError: "Не удалось сохранить фото. Попробуйте ещё раз.", retry: "Попробовать снова",
    loadError: "Не удалось загрузить фото. Попробуйте ещё раз, чтобы изменить их.",
    addPhoto: "Добавить фото", optionalPhoto: "Необязательно · JPEG, PNG или WebP до 10 МБ",
    preview: "Фото товара", removePhoto: "Удалить фото", saving: "Добавляем…", processing: "Подготовка фото…",
    photoError: "Не удалось добавить фото. Выберите JPEG, PNG или WebP до 10 МБ.",
    catalogError: "Подсказки недоступны. Можно ввести любой товар.",
  },
  he: {
    actions: "אפשרויות תמונה", changePhoto: "החלפת תמונה", viewPhoto: "הצגת תמונה", closePhoto: "סגירת תמונה",
    uploading: "שומר תמונה…", saveError: "לא ניתן לשמור את התמונה. נסו שוב.", retry: "ניסיון נוסף",
    loadError: "לא ניתן לטעון את התמונות. נסו שוב כדי לערוך אותן.",
    addPhoto: "הוספת תמונה", optionalPhoto: "לא חובה · JPEG, PNG או WebP עד 10 MB",
    preview: "תמונת הפריט", removePhoto: "הסרת תמונה", saving: "מוסיף…", processing: "מכין תמונה…",
    photoError: "לא ניתן להשתמש בתמונה. בחרו JPEG, PNG או WebP בגודל עד 10 MB.",
    catalogError: "ההצעות אינן זמינות. אפשר להקליד כל פריט.",
  },
};
export function groceryProductText(lang: string, key: keyof typeof copy.en): string {
  return copy[lang as keyof typeof copy]?.[key] ?? copy.en[key];
}
