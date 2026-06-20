import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { getGameFallbackImage } from "@/lib/utils-casino";

interface GameProps {
  id: number;
  name: string;
  category: string;
  provider: string;
  imageUrl?: string | null;
  isFeatured?: boolean;
  isHot?: boolean;
  isNew?: boolean;
}

export function GameCard({ id, name, category, provider, imageUrl, isFeatured, isHot, isNew }: GameProps) {
  const image = imageUrl || getGameFallbackImage(category);

  return (
    <Link href={`/games/${id}`}>
      <div className="group relative rounded-xl overflow-hidden bg-card border border-white/5 transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(234,179,8,0.15)] hover:border-primary/50 cursor-pointer">
        <div className="aspect-[4/3] w-full overflow-hidden relative">
          <img
            src={image}
            alt={name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            onError={(e) => {
              (e.target as HTMLImageElement).src = getGameFallbackImage(category);
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />
          
          <div className="absolute top-3 right-3 flex flex-col gap-2">
            {isHot && <Badge variant="destructive" className="shadow-[0_0_10px_rgba(220,38,38,0.8)] border-none">HOT</Badge>}
            {isNew && <Badge className="bg-blue-500 text-white shadow-[0_0_10px_rgba(59,130,246,0.8)] border-none">NEW</Badge>}
            {isFeatured && <Badge className="bg-primary text-primary-foreground shadow-[0_0_10px_rgba(234,179,8,0.8)] border-none">FEATURED</Badge>}
          </div>

          <div className="absolute bottom-0 left-0 w-full p-4 transform translate-y-2 group-hover:translate-y-0 transition-transform">
            <p className="text-xs font-semibold text-primary mb-1 uppercase tracking-wider">{category}</p>
            <h3 className="text-lg font-bold text-white leading-tight truncate">{name}</h3>
            <p className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity delay-100">{provider}</p>
          </div>
          
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 bg-black/40 backdrop-blur-[2px]">
            <div className="bg-primary text-primary-foreground font-bold px-6 py-2 rounded-full transform scale-90 group-hover:scale-100 transition-transform duration-300 shadow-[0_0_20px_rgba(234,179,8,0.6)]">
              PLAY NOW
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function GameCardSkeleton() {
  return (
    <div className="rounded-xl overflow-hidden bg-card border border-white/5 animate-pulse">
      <div className="aspect-[4/3] w-full bg-white/5 relative">
        <div className="absolute bottom-0 left-0 w-full p-4">
          <div className="h-3 w-16 bg-white/10 rounded mb-2" />
          <div className="h-5 w-3/4 bg-white/10 rounded" />
        </div>
      </div>
    </div>
  );
}
