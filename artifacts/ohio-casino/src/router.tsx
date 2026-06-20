import { Switch, Route } from "wouter";
import { Layout } from "@/components/layout";
import { Home } from "@/pages/home";
import { Games } from "@/pages/games";
import { GameDetail } from "@/pages/game-detail";
import { Promotions } from "@/pages/promotions";
import { PromotionDetail } from "@/pages/promotion-detail";
import { Winners } from "@/pages/winners";
import NotFound from "@/pages/not-found";

export function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/games" component={Games} />
        <Route path="/games/:id" component={GameDetail} />
        <Route path="/promotions" component={Promotions} />
        <Route path="/promotions/:id" component={PromotionDetail} />
        <Route path="/winners" component={Winners} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}
