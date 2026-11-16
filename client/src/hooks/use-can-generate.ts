import { useQuery } from "@tanstack/react-query";

/** True once the server confirms this visitor may generate AI recipes. AI controls stay hidden until then. */
export function useCanGenerate(): boolean {
  const { data } = useQuery<{ generation?: boolean }>({ queryKey: ["/api/operator/session"] });
  return data?.generation === true;
}
