import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign, CreditCard, Bot, Users, Zap, Code, Shield, Terminal,
  BarChart3, Key, Bell, FileText, ArrowRight, Globe, Cpu, Package,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Tiny helpers                                                       */
/* ------------------------------------------------------------------ */

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xl font-bold tracking-tight text-foreground">{children}</h2>;
}

function SectionSub({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground max-w-2xl mx-auto leading-relaxed">{children}</p>;
}

function IconBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section 1: Hero                                                    */
/* ------------------------------------------------------------------ */

function Hero() {
  return (
    <section className="relative overflow-hidden" data-testid="section-hero">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-primary/10 pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl pointer-events-none" />

      <div className="relative mx-auto max-w-4xl px-4 py-20 text-center">
        <Badge variant="secondary" className="mb-4" data-testid="badge-founding">
          <Zap size={12} className="mr-1" /> Now accepting founding creators
        </Badge>

        <h1 className="text-xl font-bold tracking-tight text-foreground mb-4">
          Turn your AI agents into a business
        </h1>

        <p className="text-sm text-muted-foreground max-w-xl mx-auto mb-8 leading-relaxed">
          AgentForge is a marketplace where developers sell subscriptions to AI agents, tools, and
          content. You keep 90% of revenue.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link href="/become-creator" className="no-underline">
            <Button size="lg" className="gap-2 font-medium" data-testid="button-hero-get-started">
              Get Started <ArrowRight size={16} />
            </Button>
          </Link>
          <Link href="/docs" className="no-underline">
            <Button size="lg" variant="outline" className="gap-2 font-medium" data-testid="button-hero-docs">
              <FileText size={16} /> View API Docs
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Section 2: Value Props                                             */
/* ------------------------------------------------------------------ */

const valueProps = [
  {
    icon: DollarSign,
    title: "90% Revenue Share",
    description:
      "Keep 90% of every subscription. We only take 10% to keep the lights on. No hidden fees.",
  },
  {
    icon: CreditCard,
    title: "Stripe Connect Payments",
    description:
      "Instant payouts via Stripe Connect. Support for global currencies and automatic tax handling.",
  },
  {
    icon: Users,
    title: "Human & Agent Subscribers",
    description:
      "Your tools can be subscribed to by real developers AND other AI agents via API. Build once, serve both.",
  },
];

function ValueProps() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-16" data-testid="section-value-props">
      <div className="text-center mb-10">
        <SectionHeading>Why creators choose AgentForge</SectionHeading>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {valueProps.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.title} className="border-border/60 bg-card/50" data-testid={`card-vp-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
              <CardContent className="pt-6">
                <IconBox><Icon size={20} /></IconBox>
                <h3 className="text-sm font-semibold mt-4 mb-2 text-foreground">{item.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Section 3: What You Can Sell                                       */
/* ------------------------------------------------------------------ */

const sellItems = [
  {
    icon: Cpu,
    title: "AI Agents",
    description:
      "Autonomous agents that perform tasks — trading bots, research agents, coding assistants.",
  },
  {
    icon: Code,
    title: "Developer Tools",
    description: "APIs, CLIs, SDKs, and automation utilities.",
  },
  {
    icon: FileText,
    title: "Content & Tutorials",
    description: "Written guides, video courses, datasets, prompt libraries.",
  },
  {
    icon: Package,
    title: "Bundled Offerings",
    description: "Combine agents + tools + content into subscription tiers.",
  },
];

function WhatYouCanSell() {
  return (
    <section className="bg-muted/30 border-y border-border/40" data-testid="section-sell">
      <div className="mx-auto max-w-5xl px-4 py-16">
        <div className="text-center mb-10">
          <SectionHeading>What you can sell</SectionHeading>
          <SectionSub>List anything from autonomous AI agents to educational content.</SectionSub>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          {sellItems.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="flex items-start gap-4 p-4 rounded-lg border border-border/40 bg-background/60" data-testid={`sell-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                <IconBox><Icon size={20} /></IconBox>
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-1">{item.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Section 4: How It Works                                            */
/* ------------------------------------------------------------------ */

const steps = [
  { num: 1, title: "Sign Up", description: "Create a free account and apply to become a creator." },
  { num: 2, title: "List Your Products", description: "Upload agents, tools, or content with pricing tiers." },
  { num: 3, title: "Connect Stripe", description: "Set up Stripe Connect for instant payouts." },
  { num: 4, title: "Earn Revenue", description: "Subscribers pay monthly, you get 90% deposited directly." },
];

function HowItWorks() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-16" data-testid="section-how-it-works">
      <div className="text-center mb-10">
        <SectionHeading>How it works</SectionHeading>
        <SectionSub>From sign-up to first payout in four simple steps.</SectionSub>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step) => (
          <div key={step.num} className="text-center" data-testid={`step-${step.num}`}>
            <div className="mx-auto mb-3 h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
              {step.num}
            </div>
            <h3 className="text-sm font-semibold text-foreground mb-1">{step.title}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{step.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Section 5: Built for Developers                                    */
/* ------------------------------------------------------------------ */

const devFeatures = [
  { icon: Terminal, title: "Full API Access", description: "RESTful API with Bearer token auth. Subscribers can integrate programmatically." },
  { icon: BarChart3, title: "Usage Analytics", description: "Track API calls, subscriber growth, revenue per product." },
  { icon: Shield, title: "Rate Limiting", description: "Configurable per-key rate limits to protect your endpoints." },
  { icon: Key, title: "API Key Management", description: "SHA-256 hashed keys, prefix-based identification." },
  { icon: Bell, title: "Webhook Events", description: "Get notified on new subscriptions, cancellations, payments." },
  { icon: FileText, title: "Public API Docs", description: "Your subscribers get beautiful, interactive API documentation." },
];

function BuiltForDevs() {
  return (
    <section className="bg-muted/30 border-y border-border/40" data-testid="section-devs">
      <div className="mx-auto max-w-5xl px-4 py-16">
        <div className="text-center mb-10">
          <SectionHeading>Built for developers</SectionHeading>
          <SectionSub>First-class developer experience with a powerful API and tooling.</SectionSub>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {devFeatures.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="flex items-start gap-3 p-4 rounded-lg border border-border/40 bg-background/60" data-testid={`dev-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <Icon size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-0.5">{item.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Section 6: Asian Developer Focus                                   */
/* ------------------------------------------------------------------ */

function AsianFocus() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-16" data-testid="section-asia">
      <div className="text-center mb-8">
        <SectionHeading>Built for the Asian developer community</SectionHeading>
        <SectionSub>
          AgentForge is focused on creators in Hong Kong, Japan, Taiwan, Korea, and Southeast Asia.
          Multilingual support. Local payment methods.
        </SectionSub>
      </div>

      <div className="flex items-center justify-center gap-6 text-2xl mb-6" data-testid="region-flags">
        <span title="Hong Kong">🇭🇰</span>
        <span title="Japan">🇯🇵</span>
        <span title="Taiwan">🇹🇼</span>
        <span title="Korea">🇰🇷</span>
        <span title="Singapore">🇸🇬</span>
      </div>

      <div className="flex items-center justify-center gap-3 flex-wrap">
        <Badge variant="outline" className="gap-1.5">
          <Globe size={12} /> English
        </Badge>
        <Badge variant="outline" className="gap-1.5">
          <Globe size={12} /> 中文
        </Badge>
        <Badge variant="outline" className="gap-1.5">
          <Globe size={12} /> 日本語
        </Badge>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Section 7: Bottom CTA                                              */
/* ------------------------------------------------------------------ */

function BottomCTA() {
  return (
    <section className="relative overflow-hidden border-t border-border/40" data-testid="section-cta">
      <div className="absolute inset-0 bg-gradient-to-t from-primary/5 via-background to-background pointer-events-none" />

      <div className="relative mx-auto max-w-3xl px-4 py-20 text-center">
        <SectionHeading>Ready to monetize your AI tools?</SectionHeading>

        <div className="mt-6">
          <Link href="/become-creator" className="no-underline">
            <Button size="lg" className="gap-2 font-medium" data-testid="button-cta-get-started">
              Get Started as a Creator <ArrowRight size={16} />
            </Button>
          </Link>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Questions?{" "}
          <a href="mailto:doggychip888@gmail.com" className="text-primary hover:underline">
            doggychip888@gmail.com
          </a>
        </p>

        <Badge variant="secondary" className="mt-4">
          <Zap size={12} className="mr-1" /> 0% platform fee for the first 3 months for founding creators
        </Badge>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function ForCreators() {
  return (
    <div data-testid="page-for-creators">
      <Hero />
      <ValueProps />
      <WhatYouCanSell />
      <HowItWorks />
      <BuiltForDevs />
      <AsianFocus />
      <BottomCTA />
    </div>
  );
}
