import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface PromotionProps {
  id: number;
  title: string;
  description: string;
  type: string;
  bonusAmount: string;
  imageUrl?: string | null;
  isHighlighted?: boolean;
}

export function PromotionCard({ id, title, description, type, bonusAmount, imageUrl, isHighlighted }: PromotionProps) {
  return (
    <div className={`group relative rounded-xl overflow-hidden bg-card border ${isHighlighted ? 'border-primary shadow-[0_0_20px_rgba(234,179,8,0.2)]' : 'border-white/5'} transition-all duration-300 hover:scale-[1.02] hover:border-primary/50 flex flex-col h-full`}>
      <div className="aspect-[21/9] w-full bg-muted relative overflow-hidden">
        {imageUrl ? (
          <img src={imageUrl} alt={title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-background to-card flex items-center justify-center">
            <span className="text-4xl font-bold text-white/10 uppercase tracking-widest">{type}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" />
        
        {isHighlighted && (
          <div className="absolute top-3 right-3">
            <Badge className="bg-primary text-primary-foreground shadow-[0_0_10px_rgba(234,179,8,0.8)] border-none px-3 py-1">BEST OFFER</Badge>
          </div>
        )}
      </div>

      <div className="p-6 flex flex-col flex-1 relative z-10 -mt-8">
        <div className="flex justify-between items-start mb-2">
          <Badge variant="outline" className="bg-background/50 backdrop-blur-sm border-white/10 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{type}</Badge>
          <span className="text-2xl font-bold text-primary drop-shadow-[0_0_4px_rgba(234,179,8,0.3)]">{bonusAmount}</span>
        </div>
        
        <h3 className="text-xl font-bold text-white mb-2 line-clamp-1">{title}</h3>
        <p className="text-sm text-muted-foreground mb-6 line-clamp-2 flex-1">{description}</p>
        
        <Link href={`/promotions/${id}`}>
          <Button className="w-full bg-white/5 hover:bg-primary hover:text-primary-foreground border border-white/10 hover:border-primary transition-all duration-300">
            View Details
          </Button>
        </Link>
      </div>
    </div>
  );
}

export function PromotionCardSkeleton() {
  return (
    <div className="rounded-xl overflow-hidden bg-card border border-white/5 animate-pulse h-full flex flex-col">
      <div className="aspect-[21/9] w-full bg-white/5" />
      <div className="p-6 flex flex-col flex-1 -mt-8">
        <div className="flex justify-between mb-4">
          <div className="h-6 w-20 bg-white/10 rounded" />
          <div className="h-8 w-24 bg-white/10 rounded" />
        </div>
        <div className="h-6 w-3/4 bg-white/10 rounded mb-2" />
        <div className="h-4 w-full bg-white/10 rounded mb-1" />
        <div className="h-4 w-5/6 bg-white/10 rounded mb-6 flex-1" />
        <div className="h-10 w-full bg-white/10 rounded" />
      </div>
    </div>
  );
}
