import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Agent, Creator } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign, CreditCard, Bot, Users, Zap, Code, Shield, Terminal,
  BarChart3, Key, Bell, FileText, ArrowRight, Globe, Cpu, Package,
  TrendingUp, Network, Star,
} from "lucide-react";
import { translations, type Locale, type Translations } from "./for-creators-i18n";
import { AgentAvatar } from "@/components/AgentAvatar";

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
/*  Language switcher (compact)                                        */
/* ------------------------------------------------------------------ */

const localeLabels: { locale: Locale; label: string }[] = [
  { locale: "en", label: "EN" },
  { locale: "zh", label: "中文" },
  { locale: "ja", label: "日本語" },
  { locale: "ko", label: "한국어" },
];

function LangSwitcher({ locale, setLocale }: { locale: Locale; setLocale: (l: Locale) => void }) {
  return (
    <div className="flex items-center gap-1" data-testid="lang-switcher">
      {localeLabels.map((item) => (
        <button
          key={item.locale}
          onClick={() => {
            setLocale(item.locale);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
            locale === item.locale
              ? "bg-primary text-primary-foreground"
              : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
          data-testid={`lang-${item.locale}`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section 1: Hero — lead with Asia-first positioning                 */
/* ------------------------------------------------------------------ */

function Hero({ t, locale, setLocale }: { t: Translations; locale: Locale; setLocale: (l: Locale) => void }) {
  return (
    <section className="relative overflow-hidden" data-testid="section-hero">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-primary/10 pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl pointer-events-none" />

      {/* Floating lang switcher */}
      <div className="absolute top-4 right-4 z-10">
        <LangSwitcher locale={locale} setLocale={setLocale} />
      </div>

      <div className="relative mx-auto max-w-4xl px-4 py-20 text-center">
        <Badge variant="secondary" className="mb-4" data-testid="badge-founding">
          <Zap size={12} className="mr-1" /> {t.hero.badge}
        </Badge>

        <h1 className="text-xl font-bold tracking-tight text-foreground mb-4">
          {t.hero.heading}
        </h1>

        <p className="text-sm text-muted-foreground max-w-xl mx-auto mb-3 leading-relaxed">
          {t.hero.sub}
        </p>

        <p className="text-xs text-muted-foreground/70 max-w-md mx-auto mb-8 leading-relaxed">
          {t.hero.sub2}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link href="/become-creator" className="no-underline">
            <Button size="lg" className="gap-2 font-medium" data-testid="button-hero-get-started">
              {t.hero.ctaGetStarted} <ArrowRight size={16} />
            </Button>
          </Link>
          <Link href="/docs" className="no-underline">
            <Button size="lg" variant="outline" className="gap-2 font-medium" data-testid="button-hero-docs">
              <FileText size={16} /> {t.hero.ctaDocs}
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

const diffIcons = [Globe, Network, Package];

function WhyAgentForge({ t }: { t: Translations }) {
  return (
    <section className="mx-auto max-w-5xl px-4 py-16" data-testid="section-why">
      <div className="text-center mb-10">
        <SectionHeading>{t.why.heading}</SectionHeading>
        <SectionSub>{t.why.sub}</SectionSub>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {t.why.cards.map((card, i) => {
          const Icon = diffIcons[i];
          return (
            <Card key={i} className="border-border/60 bg-card/50" data-testid={`card-diff-${i}`}>
              <CardContent className="pt-6">
                <IconBox><Icon size={20} /></IconBox>
                <h3 className="text-sm font-semibold mt-4 mb-2 text-foreground">{card.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{card.description}</p>
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
  { name: "GPT Store", share: "~1-3%", highlight: false },
  { name: "Shopify Apps", share: "80%", highlight: false },
  { name: "Gumroad", share: "90%", highlight: false },
  { name: "MindStudio", share: "100%", highlight: false },
  { name: "AgentForge", share: "90%", highlight: true },
];

function Economics({ t }: { t: Translations }) {
  return (
    <section className="bg-muted/30 border-y border-border/40" data-testid="section-economics">
      <div className="mx-auto max-w-5xl px-4 py-16">
        <div className="text-center mb-10">
          <SectionHeading>{t.economics.heading}</SectionHeading>
          <SectionSub>{t.economics.sub}</SectionSub>
        </div>

        <div className="max-w-2xl mx-auto rounded-lg border border-border overflow-hidden">
          <div className="grid grid-cols-3 gap-0 text-xs font-semibold text-muted-foreground bg-muted/50 px-4 py-2.5 border-b border-border">
            <span>{t.economics.colPlatform}</span>
            <span>{t.economics.colKeeps}</span>
            <span>{t.economics.colCatch}</span>
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
              <span className="text-muted-foreground">{t.economics.notes[c.name]}</span>
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

const sellIcons = [Cpu, Code, FileText, Package];

function WhatYouCanSell({ t }: { t: Translations }) {
  return (
    <section className="mx-auto max-w-5xl px-4 py-16" data-testid="section-sell">
      <div className="text-center mb-10">
        <SectionHeading>{t.sell.heading}</SectionHeading>
        <SectionSub>{t.sell.sub}</SectionSub>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {t.sell.items.map((item, i) => {
          const Icon = sellIcons[i];
          return (
            <div key={i} className="flex items-start gap-4 p-4 rounded-lg border border-border/40 bg-background/60" data-testid={`sell-${i}`}>
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

function HowItWorks({ t }: { t: Translations }) {
  return (
    <section className="bg-muted/30 border-y border-border/40" data-testid="section-how-it-works">
      <div className="mx-auto max-w-5xl px-4 py-16">
        <div className="text-center mb-10">
          <SectionHeading>{t.howItWorks.heading}</SectionHeading>
          <SectionSub>{t.howItWorks.sub}</SectionSub>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {t.howItWorks.steps.map((step, i) => (
            <div key={i} className="text-center" data-testid={`step-${i + 1}`}>
              <div className="mx-auto mb-3 h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                {i + 1}
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

const devIcons = [Terminal, BarChart3, Shield, Key, Bell, FileText];

function BuiltForDevs({ t }: { t: Translations }) {
  return (
    <section className="mx-auto max-w-5xl px-4 py-16" data-testid="section-devs">
      <div className="text-center mb-10">
        <SectionHeading>{t.devs.heading}</SectionHeading>
        <SectionSub>{t.devs.sub}</SectionSub>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {t.devs.features.map((item, i) => {
          const Icon = devIcons[i];
          return (
            <div key={i} className="flex items-start gap-3 p-4 rounded-lg border border-border/40 bg-muted/20" data-testid={`dev-${i}`}>
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

const regionFlags = [
  ["🇭🇰", "🇹🇼", "🇸🇬"],
  ["🇯🇵"],
  ["🇰🇷", "🇮🇩", "🇹🇭"],
];

const regionLocales: Locale[] = ["zh", "ja", "ko"];

function Community({ t, locale, setLocale }: { t: Translations; locale: Locale; setLocale: (l: Locale) => void }) {
  return (
    <section className="bg-muted/30 border-y border-border/40" data-testid="section-community">
      <div className="mx-auto max-w-5xl px-4 py-16">
        <div className="text-center mb-8">
          <SectionHeading>{t.community.heading}</SectionHeading>
          <SectionSub>{t.community.sub}</SectionSub>
        </div>

        <div className="grid gap-6 sm:grid-cols-3 text-center mb-8">
          {t.community.regions.map((region, i) => (
            <button
              key={i}
              onClick={() => {
                setLocale(regionLocales[i]);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className={`p-4 rounded-lg border text-left transition-colors cursor-pointer ${
                locale === regionLocales[i]
                  ? "border-primary/60 bg-primary/5"
                  : "border-border/40 bg-background/60 hover:border-border"
              }`}
              data-testid={`region-card-${i}`}
            >
              <div className="flex items-center justify-center gap-2 text-lg mb-2">
                {regionFlags[i].map((flag, fi) => <span key={fi}>{flag}</span>)}
              </div>
              <h3 className="text-sm font-semibold text-foreground mb-1 text-center">{region.title}</h3>
              <p className="text-xs text-muted-foreground text-center">{region.description}</p>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-center gap-3 flex-wrap">
          {localeLabels.map((item) => (
            <Badge
              key={item.locale}
              variant={locale === item.locale ? "default" : "outline"}
              className="gap-1.5 cursor-pointer"
              onClick={() => {
                setLocale(item.locale);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              data-testid={`badge-lang-${item.locale}`}
            >
              <Globe size={12} /> {item.label}
            </Badge>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Section 8: Featured Agents                                         */
/* ------------------------------------------------------------------ */

function formatPrice(price: number | null, pricing: string) {
  if (pricing === "free" || !price) return "Free";
  if (pricing === "usage") return `$${(price / 100).toFixed(2)}/call`;
  return `$${(price / 100).toFixed(0)}/mo`;
}

function formatNumber(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

function FeaturedAgents() {
  const { data: agents } = useQuery<Agent[]>({
    queryKey: ["/api/agents/featured"],
  });

  const displayed = agents?.slice(0, 6) ?? [];

  if (displayed.length === 0) return null;

  return (
    <section className="mx-auto max-w-5xl px-4 py-16" data-testid="section-featured-agents">
      <div className="text-center mb-10">
        <SectionHeading>Popular agents</SectionHeading>
        <SectionSub>Discover top-rated agents built by our creator community</SectionSub>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {displayed.map((agent) => (
          <Link
            key={agent.id}
            href={`/agents/${agent.id}`}
            className="group block no-underline"
          >
            <Card className="border-border/60 bg-card/50 h-full transition-all duration-200 hover:border-primary/30 hover:shadow-md">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-start gap-3 mb-3">
                  <AgentAvatar name={agent.name} className="w-10 h-10" />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                      {agent.name}
                    </h3>
                    <Badge variant="secondary" className="text-[10px] font-medium uppercase tracking-wider mt-1">
                      {agent.category}
                    </Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mb-3">
                  {agent.description}
                </p>
                <div className="flex items-center justify-between pt-2 border-t border-border/40">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Star size={12} className="text-yellow-500" />
                    {formatNumber(agent.stars)}
                  </span>
                  <span className={`text-xs font-semibold ${agent.pricing === "free" ? "text-emerald-500" : "text-primary"}`}>
                    {formatPrice(agent.price, agent.pricing)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="text-center mt-8">
        <Link href="/agents" className="no-underline">
          <Button variant="outline" className="gap-2 text-sm font-medium">
            View all agents <ArrowRight size={14} />
          </Button>
        </Link>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Section 9: Featured Creators                                       */
/* ------------------------------------------------------------------ */

function FeaturedCreators() {
  const { data: creators } = useQuery<Creator[]>({
    queryKey: ["/api/creators/featured"],
  });

  const displayed = creators?.slice(0, 6) ?? [];

  if (displayed.length === 0) return null;

  return (
    <section className="bg-muted/30 border-y border-border/40" data-testid="section-featured-creators">
      <div className="mx-auto max-w-5xl px-4 py-16">
        <div className="text-center mb-10">
          <SectionHeading>Top creators</SectionHeading>
          <SectionSub>Meet the builders powering the AgentForge ecosystem</SectionSub>
        </div>

        <div className="flex items-center justify-center gap-8 flex-wrap">
          {displayed.map((creator) => (
            <Link
              key={creator.id}
              href={`/creators/${creator.id}`}
              className="group no-underline flex flex-col items-center gap-2 w-24"
            >
              <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-border/60 group-hover:border-primary/50 transition-colors">
                <img
                  src={creator.avatar}
                  alt={creator.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="text-xs font-medium text-foreground text-center truncate w-full group-hover:text-primary transition-colors">
                {creator.name}
              </span>
            </Link>
          ))}
        </div>

        <div className="text-center mt-8">
          <Link href="/creators" className="no-underline">
            <Button variant="outline" className="gap-2 text-sm font-medium">
              Discover creators <ArrowRight size={14} />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Section 10: Final CTA                                              */
/* ------------------------------------------------------------------ */

function FinalCTA() {
  return (
    <section className="relative overflow-hidden" data-testid="section-final-cta">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-primary/5 pointer-events-none" />
      <div className="relative mx-auto max-w-3xl px-4 py-20 text-center">
        <h2 className="text-xl font-bold tracking-tight text-foreground mb-3">Ready to get started?</h2>
        <p className="text-sm text-muted-foreground max-w-lg mx-auto mb-8 leading-relaxed">
          Join a growing community of creators and users building the future of AI agents. Whether you want to discover powerful tools or share your own creations, AgentForge is the place.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link href="/agents" className="no-underline">
            <Button size="lg" variant="outline" className="gap-2 font-medium">
              <Bot size={16} /> Browse Agents
            </Button>
          </Link>
          <Link href="/become-creator" className="no-underline">
            <Button size="lg" className="gap-2 font-medium">
              Become a Creator <ArrowRight size={16} />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Section 11: Bottom CTA                                             */
/* ------------------------------------------------------------------ */

function BottomCTA({ t }: { t: Translations }) {
  return (
    <section className="relative overflow-hidden" data-testid="section-cta">
      <div className="absolute inset-0 bg-gradient-to-t from-primary/5 via-background to-background pointer-events-none" />

      <div className="relative mx-auto max-w-3xl px-4 py-20 text-center">
        <SectionHeading>{t.cta.heading}</SectionHeading>
        <p className="text-sm text-muted-foreground mt-3 mb-6 max-w-lg mx-auto">
          {t.cta.sub}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link href="/become-creator" className="no-underline">
            <Button size="lg" className="gap-2 font-medium" data-testid="button-cta-get-started">
              {t.cta.ctaButton} <ArrowRight size={16} />
            </Button>
          </Link>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          {t.cta.questions}{" "}
          <a href="mailto:doggychip888@gmail.com" className="text-primary hover:underline">
            doggychip888@gmail.com
          </a>
        </p>

        <Badge variant="secondary" className="mt-4">
          <Zap size={12} className="mr-1" /> {t.cta.foundingBadge}
        </Badge>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function ForCreators() {
  const [locale, setLocale] = useState<Locale>("en");
  const t = translations[locale];

  return (
    <div data-testid="page-for-creators">
      <Hero t={t} locale={locale} setLocale={setLocale} />
      <WhyAgentForge t={t} />
      <Economics t={t} />
      <WhatYouCanSell t={t} />
      <HowItWorks t={t} />
      <BuiltForDevs t={t} />
      <Community t={t} locale={locale} setLocale={setLocale} />
      <FeaturedAgents />
      <FeaturedCreators />
      <FinalCTA />
      <BottomCTA t={t} />
    </div>
  );
}
