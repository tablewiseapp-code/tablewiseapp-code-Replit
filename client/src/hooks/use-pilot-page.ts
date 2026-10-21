import { useEffect } from "react";
import { recordPilotEvent } from "@/lib/pilot-analytics";

export function usePilotPage(name: "planner_opened" | "grocery_list_opened", week: string, enabled = true) {
  useEffect(() => {
    if (enabled) recordPilotEvent(name, week);
  }, [name, week, enabled]);
}
