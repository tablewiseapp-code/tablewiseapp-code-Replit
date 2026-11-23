/** Ticked rows below the others, source order kept within both groups; derived on every render, so a second tap puts a
 * row back where it was. Used by Find my dish, the recipe page's ingredients, cooking mode and Groceries' Checked items. */
export const checkedLast = <T,>(rows: readonly T[], on: (row: T) => boolean): T[] => [...rows.filter(r => !on(r)), ...rows.filter(on)];
/** Keep focus on a row React just moved (a moved node can lose focus) without scrolling the page. */
export const keepFocus = (el: HTMLElement) => requestAnimationFrame(() => el.focus({ preventScroll: true }));
