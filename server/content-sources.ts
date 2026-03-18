export interface ContentSource {
  id: string;
  name: string;
  url: string;
  type: "rss" | "github" | "api";
  language: "en" | "zh" | "jp";
  curatorId: string;
  category: string;
  active: boolean;
}

export const CONTENT_SOURCES: ContentSource[] = [
  // English AI News
  { id: "src1", name: "TechCrunch", url: "https://techcrunch.com/feed/", type: "rss", language: "en", curatorId: "c197", category: "ai-news", active: true },
  { id: "src2", name: "Hacker News (Top)", url: "https://hnrss.org/frontpage?points=100", type: "rss", language: "en", curatorId: "c197", category: "ai-news", active: true },
  { id: "src3", name: "The Rundown AI", url: "https://rss.beehiiv.com/feeds/2R3C6Bt5wj.xml", type: "rss", language: "en", curatorId: "c197", category: "ai-news", active: true },
  { id: "src4", name: "The Verge", url: "https://www.theverge.com/rss/index.xml", type: "rss", language: "en", curatorId: "c197", category: "tech-news", active: true },

  // Web3
  { id: "src5", name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/", type: "rss", language: "en", curatorId: "c198", category: "web3", active: true },

  // Dev Tools
  { id: "src6", name: "GitHub Trending", url: "https://api.github.com/search/repositories", type: "github", language: "en", curatorId: "c199", category: "dev-tools", active: true },

  // Chinese
  { id: "src7", name: "36Kr", url: "https://36kr.com/feed", type: "rss", language: "zh", curatorId: "c200", category: "asia-tech", active: true },
  { id: "src8", name: "机器之心", url: "https://www.jiqizhixin.com/rss", type: "rss", language: "zh", curatorId: "c200", category: "ai-news", active: true },

  // Japanese
  { id: "src9", name: "Gizmodo Japan", url: "https://gizmodo.jp/index.xml", type: "rss", language: "jp", curatorId: "c200", category: "asia-tech", active: true },
  { id: "src10", name: "ASCII.jp", url: "https://ascii.jp/rss.xml", type: "rss", language: "jp", curatorId: "c200", category: "asia-tech", active: true },
  { id: "src11", name: "ITmedia", url: "https://rss.itmedia.co.jp/rss/2.0/topstory.xml", type: "rss", language: "jp", curatorId: "c200", category: "asia-tech", active: true },

  // Research
  { id: "src12", name: "Google Research Blog", url: "https://feeds.feedburner.com/blogspot/gJZg/", type: "rss", language: "en", curatorId: "c201", category: "research", active: true },

  // Business
  { id: "src13", name: "a16z Blog", url: "https://a16z.com/feed/", type: "rss", language: "en", curatorId: "c202", category: "business", active: true },
];
