import { useListPromotions, getListPromotionsQueryKey } from "@workspace/api-client-react";
import { PromotionCard, PromotionCardSkeleton } from "@/components/promotion-card";

export function Promotions() {
  const { data: promotions, isLoading } = useListPromotions({
    query: { queryKey: getListPromotionsQueryKey() }
  });

  return (
    <div className="container mx-auto px-4 py-12 flex flex-col gap-12">
      <div className="text-center max-w-3xl mx-auto mb-8">
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-6 tracking-tight">VIP Rewards & Promotions</h1>
        <p className="text-xl text-muted-foreground">Maximize your action with Ohio's best casino bonuses, reload offers, and exclusive VIP perks.</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {Array.from({ length: 6 }).map((_, i) => <PromotionCardSkeleton key={i} />)}
        </div>
      ) : promotions && promotions.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {promotions.map(promo => (
            <PromotionCard key={promo.id} {...promo} />
          ))}
        </div>
      ) : (
        <div className="py-24 text-center border border-white/5 rounded-xl bg-card/30 border-dashed">
          <h3 className="text-2xl font-bold text-white mb-2">No active promotions</h3>
          <p className="text-muted-foreground">Check back later for new offers.</p>
        </div>
      )}
    </div>
  );
}
