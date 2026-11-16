import type { ShareRole } from "./schema";

/** What someone may do on a shared grocery list: the link's role, or "owner" for the browser that made the link. */
export type Access = ShareRole | "owner";
const rank: Record<Access, number> = { view: 0, add: 1, edit: 2, owner: 3 };
export const can = (access: Access, needed: Access) => rank[access] >= rank[needed];
