import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign, CreditCard, Bot, Users, Zap, Code, Shield, Terminal,
  BarChart3, Key, Bell, FileText, ArrowRight, Globe, Cpu, Package,
  TrendingUp, Network,
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
/*  Section 1: Hero — lead with Asia-first positioning                 */
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
          The home platform for Asian indie AI developers
        </h1>

        <p className="text-sm text-muted-foreground max-w-xl mx-auto mb-3 leading-relaxed">
          Every major AI marketplace is US-first. AgentForge is built for developers in
          Hong Kong, Japan, Taiwan, Korea, and Southeast Asia — sell subscriptions to your
          AI agents, tools, and content. Keep 90%.
        </p>

        <p className="text-xs text-muted-foreground/70 max-w-md mx-auto mb-8 leading-relaxed">
          The only marketplace where both humans and AI agents can subscribe to your work via API.
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
/*  Section 2: Why AgentForge — 3 differentiators                      */
/* ------------------------------------------------------------------ */

const differentiators = [
  {
    icon: Globe,
    title: "Asia-First, Not Asia-Afterthought",
    description:
      "MindStudio, GPT Store, Copilot Store — all US/English-first. We're built for 🇭🇰 🇯🇵 🇹🇼 🇰🇷 🇸🇬 developers from day one. Multilingual content, local community, Asian fintech integrations.",
  },
  {
    icon: Network,
    title: "Agent-to-Agent Economy",
    description:
      "Your subscribers aren't just humans. Other AI agents can discover and subscribe to your tools via API — building an autonomous agent supply chain. This market is projected to be 15-25% of e-commerce by 2027.",
  },
  {
    icon: Package,
    title: "Agents + Content Bundles",
    description:
      "MindStudio is agents-only. Patreon is content-only. AgentForge lets you bundle AI agents, developer tools, AND written/video content into subscription tiers. One platform, one audience.",
  },
];

function WhyAgentForge() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-16" data-testid="section-why">
      <div className="text-center mb-10">
        <SectionHeading>What makes us different</SectionHeading>
        <SectionSub>There are lots of AI marketplaces. Here's why we exist.</SectionSub>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {differentiators.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.title} className="border-border/60 bg-card/50" data-testid={`card-diff-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
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
/*  Section 3: The Economics — revenue comparison                      */
/* ------------------------------------------------------------------ */

const competitors = [
  { name: "GPT Store", share: "~1-3%", note: "Engagement-based, tiny payouts" },
  { name: "Shopify Apps", share: "80%", note: "20% platform cut" },
  { name: "Gumroad", share: "90%", note: "10% + $0.50/sale" },
  { name: "MindStudio", share: "100%", note: "You pay $20/mo platform fee + API costs" },
  { name: "AgentForge", share: "90%", note: "10% flat. No platform fee. No hidden costs.", highlight: true },
];

function Economics() {
  return (
    <section className="bg-muted/30 border-y border-border/40" data-testid="section-economics">
      <div className="mx-auto max-w-5xl px-4 py-16">
        <div className="text-center mb-10">
          <SectionHeading>The economics</SectionHeading>
          <SectionSub>No platform subscription fee. Simple 90/10 split on revenue.</SectionSub>
        </div>

        <div className="max-w-2xl mx-auto rounded-lg border border-border overflow-hidden">
          <div className="grid grid-cols-3 gap-0 text-xs font-semibold text-muted-foreground bg-muted/50 px-4 py-2.5 border-b border-border">
            <span>Platform</span>
            <span>Creator keeps</span>
            <span>Catch</span>
          </div>
          {competitors.map((c) => (
            <div
              key={c.name}
              className={`grid grid-cols-3 gap-0 text-xs px-4 py-3 border-b last:border-0 border-border/50 ${
                c.highlight ? "bg-primary/5 font-medium" : ""
              }`}
              data-testid={`row-${c.name.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <span className={c.highlight ? "text-primary font-semibold" : "text-foreground"}>{c.name}</span>
              <span className={c.highlight ? "text-primary font-semibold" : "text-foreground"}>{c.share}</span>
              <span className="text-muted-foreground">{c.note}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Section 4: What You Can Sell                                       */
/* ------------------------------------------------------------------ */

const sellItems = [
  {
    icon: Cpu,
    title: "AI Agents",
    description:
      "Trading bots, research agents, coding assistants — autonomous agents that do real work for subscribers.",
  },
  {
    icon: Code,
    title: "Developer Tools",
    description: "APIs, CLIs, SDKs, MCP servers, and automation utilities.",
  },
  {
    icon: FileText,
    title: "Content & Tutorials",
    description: "Written guides, video courses, datasets, prompt libraries — in any language.",
  },
  {
    icon: Package,
    title: "Bundled Tiers",
    description: "Mix agents + tools + content into subscription tiers. $10/mo basic, $50/mo pro — you set the price.",
  },
];

function WhatYouCanSell() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-16" data-testid="section-sell">
      <div className="text-center mb-10">
        <SectionHeading>What you can sell</SectionHeading>
        <SectionSub>List anything from autonomous AI agents to educational content — or bundle them together.</SectionSub>
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
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Section 5: How It Works                                            */
/* ------------------------------------------------------------------ */

const steps = [
  { num: 1, title: "Sign Up", description: "Create a free account and apply to become a creator." },
  { num: 2, title: "List Your Products", description: "Upload agents, tools, or content with pricing tiers." },
  { num: 3, title: "Connect Stripe", description: "Set up Stripe Connect for instant payouts." },
  { num: 4, title: "Earn Revenue", description: "Subscribers pay monthly, you get 90% deposited directly." },
];

function HowItWorks() {
  return (
    <section className="bg-muted/30 border-y border-border/40" data-testid="section-how-it-works">
      <div className="mx-auto max-w-5xl px-4 py-16">
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
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Section 6: Built for Developers                                    */
/* ------------------------------------------------------------------ */

const devFeatures = [
  { icon: Terminal, title: "Full API Access", description: "RESTful API with Bearer token auth. Subscribers integrate programmatically." },
  { icon: BarChart3, title: "Usage Analytics", description: "Track API calls, subscriber growth, revenue per product." },
  { icon: Shield, title: "Rate Limiting", description: "Configurable per-key rate limits to protect your endpoints." },
  { icon: Key, title: "API Key Management", description: "SHA-256 hashed keys, prefix-based identification." },
  { icon: Bell, title: "Webhook Events", description: "Get notified on new subscriptions, cancellations, payments." },
  { icon: FileText, title: "Public API Docs", description: "Your subscribers get beautiful, interactive API documentation." },
];

function BuiltForDevs() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-16" data-testid="section-devs">
      <div className="text-center mb-10">
        <SectionHeading>Built for developers</SectionHeading>
        <SectionSub>First-class developer experience with a powerful API and tooling.</SectionSub>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {devFeatures.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="flex items-start gap-3 p-4 rounded-lg border border-border/40 bg-muted/20" data-testid={`dev-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
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
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Section 7: Community — Asian focus with real context                */
/* ------------------------------------------------------------------ */

function Community() {
  return (
    <section className="bg-muted/30 border-y border-border/40" data-testid="section-community">
      <div className="mx-auto max-w-5xl px-4 py-16">
        <div className="text-center mb-8">
          <SectionHeading>Your community, your languages</SectionHeading>
          <SectionSub>
            We're not a Silicon Valley platform with a translated settings page.
            AgentForge is built in Hong Kong, for the Asian indie dev community.
          </SectionSub>
        </div>

        <div className="grid gap-6 sm:grid-cols-3 text-center mb-8">
          <div className="p-4 rounded-lg border border-border/40 bg-background/60">
            <div className="flex items-center justify-center gap-2 text-lg mb-2">
              <span>🇭🇰</span><span>🇹🇼</span><span>🇸🇬</span>
            </div>
            <h3 className="text-sm font-semibold text-foreground mb-1">中文 Content</h3>
            <p className="text-xs text-muted-foreground">Publish in Chinese. Reach developers across HK, Taiwan, Singapore, and the Chinese-speaking diaspora.</p>
          </div>
          <div className="p-4 rounded-lg border border-border/40 bg-background/60">
            <div className="flex items-center justify-center gap-2 text-lg mb-2">
              <span>🇯🇵</span>
            </div>
            <h3 className="text-sm font-semibold text-foreground mb-1">日本語 Content</h3>
            <p className="text-xs text-muted-foreground">Japan has one of the most active indie dev communities. We support Japanese creators and audiences natively.</p>
          </div>
          <div className="p-4 rounded-lg border border-border/40 bg-background/60">
            <div className="flex items-center justify-center gap-2 text-lg mb-2">
              <span>🇰🇷</span><span>🇮🇩</span><span>🇹🇭</span>
            </div>
            <h3 className="text-sm font-semibold text-foreground mb-1">Southeast Asia</h3>
            <p className="text-xs text-muted-foreground">Korea, Indonesia, Thailand — the next wave of AI builders. Get in early and grow your audience in these fast-growing markets.</p>
          </div>
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
          <Badge variant="outline" className="gap-1.5">
            <Globe size={12} /> 한국어
          </Badge>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Section 8: Bottom CTA                                              */
/* ------------------------------------------------------------------ */

function BottomCTA() {
  return (
    <section className="relative overflow-hidden" data-testid="section-cta">
      <div className="absolute inset-0 bg-gradient-to-t from-primary/5 via-background to-background pointer-events-none" />

      <div className="relative mx-auto max-w-3xl px-4 py-20 text-center">
        <SectionHeading>Ready to monetize your AI tools?</SectionHeading>
        <p className="text-sm text-muted-foreground mt-3 mb-6 max-w-lg mx-auto">
          Join as a founding creator. 0% platform fee for the first 3 months.
          Build your audience before the marketplace gets crowded.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
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
          <Zap size={12} className="mr-1" /> Founding creators: 0% fee for 3 months
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
      <WhyAgentForge />
      <Economics />
      <WhatYouCanSell />
      <HowItWorks />
      <BuiltForDevs />
      <Community />
      <BottomCTA />
    </div>
  );
}
