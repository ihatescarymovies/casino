import { getUncachableStripeClient } from "../../artifacts/api-server/src/lib/stripeClient";

const PACKAGES = [
  {
    name: "Starter Pack",
    description: "Get in the game — perfect for new players",
    amount: 2500,
    tier: "starter",
  },
  {
    name: "Player Pack",
    description: "The most popular deposit for regular players",
    amount: 10000,
    tier: "pro",
  },
  {
    name: "High Roller",
    description: "For serious players who mean business",
    amount: 25000,
    tier: "elite",
  },
  {
    name: "VIP Bundle",
    description: "Maximum value — exclusive VIP access included",
    amount: 50000,
    tier: "vip",
  },
];

async function seedDepositPackages() {
  const stripe = await getUncachableStripeClient();
  console.log("Seeding Charter & Oak deposit packages...");

  for (const pkg of PACKAGES) {
    const existing = await stripe.products.search({
      query: `name:'${pkg.name}' AND active:'true'`,
    });

    if (existing.data.length > 0) {
      console.log(`  Already exists: ${pkg.name} (${existing.data[0].id})`);
      continue;
    }

    const product = await stripe.products.create({
      name: pkg.name,
      description: pkg.description,
      metadata: { tier: pkg.tier, type: "deposit" },
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: pkg.amount,
      currency: "usd",
    });

    console.log(
      `  Created: ${pkg.name} — $${pkg.amount / 100} (${price.id})`
    );
  }

  console.log("Done!");
}

seedDepositPackages().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
