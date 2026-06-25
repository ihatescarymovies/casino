import { useQuery } from "@tanstack/react-query";
import { useGetWallet } from "@workspace/api-client-react";
import { API_BASE_URL } from "@/lib/config";

interface GameWalletData {
  balance: number;
  demo: boolean;
}

export function useGameWallet(demo: boolean) {
  const realWallet = useGetWallet({
    query: { queryKey: ["wallet"], enabled: !demo },
  });

  const demoWallet = useQuery<GameWalletData>({
    queryKey: ["demo-wallet"],
    enabled: demo,
    queryFn: async (): Promise<GameWalletData> => {
      const res = await fetch(`${API_BASE_URL}/api/demo/wallet`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = (await res.json()) as { balance: number };
      return { balance: data.balance, demo: true };
    },
  });

  return demo
    ? {
        data: demoWallet.data,
        isLoading: demoWallet.isLoading,
        error: demoWallet.error,
      }
    : {
        data: realWallet.data
          ? { balance: realWallet.data.balance, demo: false }
          : undefined,
        isLoading: realWallet.isLoading,
        error: realWallet.error,
      };
}
