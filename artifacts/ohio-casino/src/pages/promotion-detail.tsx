import { useParams, Link } from "wouter";
import { useGetPromotion, getGetPromotionQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function PromotionDetail() {
  const { id } = useParams();
  const promoId = parseInt(id || "0", 10);
  
  const { data: promo, isLoading } = useGetPromotion(promoId, {
    query: { queryKey: getGetPromotionQueryKey(promoId), enabled: !!promoId }
  });

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12 animate-pulse max-w-4xl">
        <div className="h-8 w-32 bg-white/5 rounded mb-8" />
        <div className="aspect-[21/9] w-full bg-white/5 rounded-2xl mb-12" />
        <div className="h-12 w-3/4 bg-white/5 rounded mb-6" />
        <div className="h-6 w-1/4 bg-white/5 rounded mb-12" />
        <div className="space-y-4">
          <div className="h-4 w-full bg-white/5 rounded" />
          <div className="h-4 w-full bg-white/5 rounded" />
          <div className="h-4 w-5/6 bg-white/5 rounded" />
        </div>
      </div>
    );
  }

  if (!promo) {
    return (
      <div className="container mx-auto px-4 py-32 text-center flex flex-col items-center justify-center">
        <h2 className="text-2xl font-bold text-white mb-4">Promotion Not Found</h2>
        <p className="text-muted-foreground mb-8">This offer may have expired or doesn't exist.</p>
        <Link href="/promotions">
          <Button>View All Promotions</Button>
        </Link>
      </div>
    );
  }

  const isExpired = new Date(promo.expiresAt) < new Date();

  return (
    <div className="container mx-auto px-4 py-12 flex flex-col gap-8 max-w-4xl">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/promotions" className="hover:text-white transition-colors">Promotions</Link>
        <span>/</span>
        <span className="text-white font-medium">{promo.title}</span>
      </div>

      <div className="relative aspect-[21/9] w-full rounded-2xl overflow-hidden bg-card border border-white/10 group">
        {promo.imageUrl ? (
          <img src={promo.imageUrl} alt={promo.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-card to-background flex items-center justify-center">
            <span className="text-6xl font-bold text-white/5 uppercase tracking-widest">{promo.type}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
        
        <div className="absolute bottom-0 left-0 w-full p-8 md:p-12">
          <Badge className="bg-primary/20 text-primary border-primary/30 mb-4 px-3 py-1 font-bold tracking-wider">{promo.type.toUpperCase()}</Badge>
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-2 leading-tight">{promo.title}</h1>
          <p className="text-3xl font-black text-primary drop-shadow-[0_0_10px_rgba(234,179,8,0.5)]">{promo.bonusAmount}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mt-4">
        <div className="md:col-span-2 flex flex-col gap-8">
          <div className="prose prose-invert max-w-none">
            <h2 className="text-2xl font-bold text-white mb-4">Offer Details</h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">{promo.description}</p>
            
            <h3 className="text-xl font-bold text-white mb-4">How to Claim</h3>
            <ol className="space-y-2 text-muted-foreground ml-4 list-decimal marker:text-primary marker:font-bold">
              <li>Log in to your BuckeyeBet account.</li>
              <li>Opt-in to this promotion via the cashier page.</li>
              <li>Make a qualifying deposit if required.</li>
              <li>Your bonus will be credited automatically.</li>
            </ol>
          </div>
        </div>

        <div className="md:col-span-1">
          <div className="bg-card border border-white/5 rounded-xl p-6 sticky top-24 flex flex-col gap-6">
            <Button 
              size="lg" 
              className="w-full text-lg h-14 bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_rgba(234,179,8,0.4)]"
              disabled={isExpired}
            >
              {isExpired ? "Offer Expired" : "Claim Offer"}
            </Button>
            
            <div className="space-y-4 pt-4 border-t border-white/5">
              {promo.wagerRequirement && (
                <div>
                  <span className="block text-xs text-muted-foreground uppercase tracking-wider mb-1">Wagering Requirement</span>
                  <span className="block text-lg font-bold text-white">{promo.wagerRequirement}x</span>
                </div>
              )}
              
              <div>
                <span className="block text-xs text-muted-foreground uppercase tracking-wider mb-1">Expires</span>
                <span className={`block text-lg font-bold ${isExpired ? 'text-destructive' : 'text-white'}`}>
                  {new Date(promo.expiresAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                </span>
              </div>
            </div>
            
            <div className="text-xs text-muted-foreground pt-4 border-t border-white/5">
              <p>Terms and conditions apply. Must be 21+ and physically present in OH. Gambling problem? Call 1-800-589-9966.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
