import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Zap, Users, Bot } from "lucide-react";

const tiers = [
  {
    name: "Free",
    price: "$0",
    period: "",
    description: "Get started with free AI agents",
    icon: Bot,
    features: [
      "Browse & discover agents",
      "Use free agents",
      "Community access",
    ],
    cta: "Get Started",
    ctaLink: "/auth",
    variant: "outline" as const,
    highlight: false,
  },
  {
    name: "Pro",
    price: "$9",
    period: "/mo",
    description: "Unlock the full platform experience",
    icon: Zap,
    features: [
      "Everything in Free",
      "Priority support",
      "Early access to new agents",
      "Advanced API access",
    ],
    cta: "Subscribe",
    ctaLink: "/auth",
    variant: "default" as const,
    highlight: true,
  },
  {
    name: "Creator",
    price: "Free",
    period: " to join",
    description: "Publish agents and earn revenue",
    icon: Users,
    features: [
      "Publish unlimited agents",
      "Set your own pricing",
      "90% revenue share",
      "Analytics dashboard",
    ],
    cta: "Become a Creator",
    ctaLink: "/become-creator",
    variant: "outline" as const,
    highlight: false,
  },
];

export default function Pricing() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold tracking-tight text-foreground mb-3">
          Simple, transparent pricing
        </h1>
        <p className="text-muted-foreground max-w-lg mx-auto">
          Free agents are always free. Paid agents are priced by their creators.
          Creators keep 90% of every subscription.
        </p>
      </div>

      {/* Tier Cards */}
      <div className="grid md:grid-cols-3 gap-6">
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={`rounded-xl border bg-card p-6 flex flex-col ${
              tier.highlight
                ? "border-primary ring-1 ring-primary/20 relative"
                : "border-border"
            }`}
          >
            {tier.highlight && (
              <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] px-2.5">
                Popular
              </Badge>
            )}

            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <tier.icon size={18} className="text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">{tier.name}</h2>
            </div>

            <div className="mb-4">
              <span className="text-3xl font-bold text-foreground">{tier.price}</span>
              {tier.period && (
                <span className="text-sm text-muted-foreground">{tier.period}</span>
              )}
            </div>

            <p className="text-sm text-muted-foreground mb-6">{tier.description}</p>

            <ul className="space-y-3 mb-8 flex-1">
              {tier.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-foreground">
                  <Check size={15} className="text-primary mt-0.5 shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>

            <Link href={tier.ctaLink}>
              <Button variant={tier.variant} className="w-full">
                {tier.cta}
              </Button>
            </Link>
          </div>
        ))}
      </div>

      {/* Platform fee note */}
      <div className="text-center mt-10">
        <p className="text-xs text-muted-foreground">
          Creators pay a 10% platform fee on earnings. No hidden fees. Cancel anytime.
        </p>
      </div>
    </div>
  );
}
