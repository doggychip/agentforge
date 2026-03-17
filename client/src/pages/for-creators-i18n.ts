export type Locale = "en" | "zh" | "ja" | "ko";

export interface Translations {
  hero: {
    badge: string;
    heading: string;
    sub: string;
    sub2: string;
    ctaGetStarted: string;
    ctaDocs: string;
  };
  why: {
    heading: string;
    sub: string;
    cards: { title: string; description: string }[];
  };
  economics: {
    heading: string;
    sub: string;
    colPlatform: string;
    colKeeps: string;
    colCatch: string;
    notes: Record<string, string>;
  };
  sell: {
    heading: string;
    sub: string;
    items: { title: string; description: string }[];
  };
  howItWorks: {
    heading: string;
    sub: string;
    steps: { title: string; description: string }[];
  };
  devs: {
    heading: string;
    sub: string;
    features: { title: string; description: string }[];
  };
  community: {
    heading: string;
    sub: string;
    regions: { title: string; description: string }[];
  };
  cta: {
    heading: string;
    sub: string;
    ctaButton: string;
    questions: string;
    foundingBadge: string;
  };
}

export const translations: Record<Locale, Translations> = {
  /* ================================================================ */
  /*  English                                                          */
  /* ================================================================ */
  en: {
    hero: {
      badge: "Now accepting founding creators",
      heading: "The home platform for Asian indie AI developers",
      sub: "Every major AI marketplace is US-first. AgentForge is built for developers in Hong Kong, Japan, Taiwan, Korea, and Southeast Asia — sell subscriptions to your AI agents, tools, and content. Keep 90%.",
      sub2: "The only marketplace where both humans and AI agents can subscribe to your work via API.",
      ctaGetStarted: "Get Started",
      ctaDocs: "View API Docs",
    },
    why: {
      heading: "What makes us different",
      sub: "There are lots of AI marketplaces. Here's why we exist.",
      cards: [
        {
          title: "Asia-First, Not Asia-Afterthought",
          description: "MindStudio, GPT Store, Copilot Store — all US/English-first. We're built for 🇭🇰 🇯🇵 🇹🇼 🇰🇷 🇸🇬 developers from day one. Multilingual content, local community, Asian fintech integrations.",
        },
        {
          title: "Agent-to-Agent Economy",
          description: "Your subscribers aren't just humans. Other AI agents can discover and subscribe to your tools via API — building an autonomous agent supply chain. This market is projected to be 15-25% of e-commerce by 2027.",
        },
        {
          title: "Agents + Content Bundles",
          description: "MindStudio is agents-only. Patreon is content-only. AgentForge lets you bundle AI agents, developer tools, AND written/video content into subscription tiers. One platform, one audience.",
        },
      ],
    },
    economics: {
      heading: "The economics",
      sub: "No platform subscription fee. Simple 90/10 split on revenue.",
      colPlatform: "Platform",
      colKeeps: "Creator keeps",
      colCatch: "Catch",
      notes: {
        "GPT Store": "Engagement-based, tiny payouts",
        "Shopify Apps": "20% platform cut",
        "Gumroad": "10% + $0.50/sale",
        "MindStudio": "You pay $20/mo platform fee + API costs",
        "AgentForge": "10% flat. No platform fee. No hidden costs.",
      },
    },
    sell: {
      heading: "What you can sell",
      sub: "List anything from autonomous AI agents to educational content — or bundle them together.",
      items: [
        { title: "AI Agents", description: "Trading bots, research agents, coding assistants — autonomous agents that do real work for subscribers." },
        { title: "Developer Tools", description: "APIs, CLIs, SDKs, MCP servers, and automation utilities." },
        { title: "Content & Tutorials", description: "Written guides, video courses, datasets, prompt libraries — in any language." },
        { title: "Bundled Tiers", description: "Mix agents + tools + content into subscription tiers. $10/mo basic, $50/mo pro — you set the price." },
      ],
    },
    howItWorks: {
      heading: "How it works",
      sub: "From sign-up to first payout in four simple steps.",
      steps: [
        { title: "Sign Up", description: "Create a free account and apply to become a creator." },
        { title: "List Your Products", description: "Upload agents, tools, or content with pricing tiers." },
        { title: "Connect Stripe", description: "Set up Stripe Connect for instant payouts." },
        { title: "Earn Revenue", description: "Subscribers pay monthly, you get 90% deposited directly." },
      ],
    },
    devs: {
      heading: "Built for developers",
      sub: "First-class developer experience with a powerful API and tooling.",
      features: [
        { title: "Full API Access", description: "RESTful API with Bearer token auth. Subscribers integrate programmatically." },
        { title: "Usage Analytics", description: "Track API calls, subscriber growth, revenue per product." },
        { title: "Rate Limiting", description: "Configurable per-key rate limits to protect your endpoints." },
        { title: "API Key Management", description: "SHA-256 hashed keys, prefix-based identification." },
        { title: "Webhook Events", description: "Get notified on new subscriptions, cancellations, payments." },
        { title: "Public API Docs", description: "Your subscribers get beautiful, interactive API documentation." },
      ],
    },
    community: {
      heading: "Your community, your languages",
      sub: "We're not a Silicon Valley platform with a translated settings page. AgentForge is built in Hong Kong, for the Asian indie dev community.",
      regions: [
        { title: "中文 Content", description: "Publish in Chinese. Reach developers across HK, Taiwan, Singapore, and the Chinese-speaking diaspora." },
        { title: "日本語 Content", description: "Japan has one of the most active indie dev communities. We support Japanese creators and audiences natively." },
        { title: "Southeast Asia", description: "Korea, Indonesia, Thailand — the next wave of AI builders. Get in early and grow your audience in these fast-growing markets." },
      ],
    },
    cta: {
      heading: "Ready to monetize your AI tools?",
      sub: "Join as a founding creator. 0% platform fee for the first 3 months. Build your audience before the marketplace gets crowded.",
      ctaButton: "Get Started as a Creator",
      questions: "Questions?",
      foundingBadge: "Founding creators: 0% fee for 3 months",
    },
  },

  /* ================================================================ */
  /*  Traditional Chinese (繁體中文) — HK / TW audience                 */
  /* ================================================================ */
  zh: {
    hero: {
      badge: "現正招募創始創作者",
      heading: "亞洲獨立 AI 開發者的主場平台",
      sub: "主流 AI 市集都以美國為先。AgentForge 專為香港、日本、台灣、韓國及東南亞的開發者打造——銷售 AI 代理、工具和內容的訂閱服務，你保留 90% 收入。",
      sub2: "唯一一個讓真人和 AI 代理都能透過 API 訂閱你作品的市集。",
      ctaGetStarted: "立即開始",
      ctaDocs: "查看 API 文件",
    },
    why: {
      heading: "我們有什麼不同",
      sub: "AI 市集很多，以下是我們存在的原因。",
      cards: [
        {
          title: "亞洲優先，不是亞洲附帶",
          description: "MindStudio、GPT Store、Copilot Store——全都以美國和英語為主。我們從第一天就為 🇭🇰 🇯🇵 🇹🇼 🇰🇷 🇸🇬 開發者而建。多語言內容、本地社群、亞洲金融科技整合。",
        },
        {
          title: "代理對代理經濟",
          description: "你的訂閱者不只是真人。其他 AI 代理也能透過 API 發現並訂閱你的工具——構建自主代理供應鏈。預計到 2027 年，這個市場將佔電商的 15-25%。",
        },
        {
          title: "代理 + 內容組合包",
          description: "MindStudio 只有代理。Patreon 只有內容。AgentForge 讓你把 AI 代理、開發工具和圖文影音內容組合成訂閱方案。一個平台，一群受眾。",
        },
      ],
    },
    economics: {
      heading: "收益模式",
      sub: "無平台月費。簡單的 90/10 收入分成。",
      colPlatform: "平台",
      colKeeps: "創作者保留",
      colCatch: "附帶條件",
      notes: {
        "GPT Store": "按互動量計算，收入極少",
        "Shopify Apps": "平台抽成 20%",
        "Gumroad": "10% + 每筆 $0.50",
        "MindStudio": "需付 $20/月平台費 + API 費用",
        "AgentForge": "固定 10%。無平台費。無隱藏費用。",
      },
    },
    sell: {
      heading: "你可以賣什麼",
      sub: "從自主 AI 代理到教學內容——或者把它們組合在一起。",
      items: [
        { title: "AI 代理", description: "交易機器人、研究代理、程式助手——為訂閱者完成實際工作的自主代理。" },
        { title: "開發工具", description: "API、CLI、SDK、MCP 伺服器及自動化工具。" },
        { title: "內容與教學", description: "文字教程、影片課程、資料集、提示詞庫——支援任何語言。" },
        { title: "組合方案", description: "將代理、工具和內容混合成訂閱方案。$10/月基礎版、$50/月專業版——定價由你決定。" },
      ],
    },
    howItWorks: {
      heading: "運作方式",
      sub: "從註冊到首次收款，只需四個步驟。",
      steps: [
        { title: "註冊帳號", description: "建立免費帳號並申請成為創作者。" },
        { title: "上架產品", description: "上傳代理、工具或內容，並設定價格方案。" },
        { title: "連接 Stripe", description: "設定 Stripe Connect，即時收款。" },
        { title: "賺取收入", description: "訂閱者按月付款，90% 直接匯入你的帳戶。" },
      ],
    },
    devs: {
      heading: "為開發者打造",
      sub: "一流的開發者體驗，配備強大的 API 與工具。",
      features: [
        { title: "完整 API 存取", description: "RESTful API，Bearer token 驗證。訂閱者可程式化整合。" },
        { title: "使用量分析", description: "追蹤 API 呼叫次數、訂閱成長、每項產品的收入。" },
        { title: "速率限制", description: "可自訂每個 Key 的速率限制，保護你的端點。" },
        { title: "API Key 管理", description: "SHA-256 雜湊金鑰，前綴識別機制。" },
        { title: "Webhook 事件", description: "新訂閱、取消、付款——即時通知。" },
        { title: "公開 API 文件", description: "你的訂閱者可使用精美的互動式 API 文件。" },
      ],
    },
    community: {
      heading: "你的社群，你的語言",
      sub: "我們不是一個只翻譯了設定頁面的矽谷平台。AgentForge 在香港建立，為亞洲獨立開發者社群服務。",
      regions: [
        { title: "中文內容", description: "用中文發佈內容，觸及香港、台灣、新加坡及全球華語開發者。" },
        { title: "日本語內容", description: "日本擁有最活躍的獨立開發者社群之一。我們原生支援日本創作者和受眾。" },
        { title: "東南亞", description: "韓國、印尼、泰國——下一波 AI 創作者浪潮。搶先進入這些快速成長的市場。" },
      ],
    },
    cta: {
      heading: "準備好將你的 AI 工具變現了嗎？",
      sub: "加入成為創始創作者。前 3 個月 0% 平台費。在市集變得擁擠之前，建立你的受眾。",
      ctaButton: "立即成為創作者",
      questions: "有問題？",
      foundingBadge: "創始創作者：前 3 個月 0% 手續費",
    },
  },

  /* ================================================================ */
  /*  Japanese (日本語)                                                 */
  /* ================================================================ */
  ja: {
    hero: {
      badge: "創設クリエイター募集中",
      heading: "アジアのインディー AI 開発者のためのプラットフォーム",
      sub: "主要な AI マーケットプレイスはすべてアメリカ中心。AgentForge は香港・日本・台湾・韓国・東南アジアの開発者のために作られました。AI エージェント、ツール、コンテンツのサブスクを販売し、収益の 90% を受け取れます。",
      sub2: "人間と AI エージェントの両方が API 経由であなたの作品をサブスクできる唯一のマーケットプレイス。",
      ctaGetStarted: "始めましょう",
      ctaDocs: "API ドキュメント",
    },
    why: {
      heading: "私たちが違う理由",
      sub: "AI マーケットプレイスは数多くあります。AgentForge が存在する理由はこちら。",
      cards: [
        {
          title: "アジアファースト、後付けではなく",
          description: "MindStudio、GPT Store、Copilot Store——すべてアメリカ・英語優先。私たちは初日から 🇭🇰 🇯🇵 🇹🇼 🇰🇷 🇸🇬 の開発者のために構築。多言語コンテンツ、地域コミュニティ、アジアのフィンテック連携。",
        },
        {
          title: "エージェント間エコノミー",
          description: "サブスクライバーは人間だけではありません。他の AI エージェントも API 経由であなたのツールを発見・購読し、自律的なエージェントサプライチェーンを構築します。2027 年までにEC の 15-25% を占めると予測されています。",
        },
        {
          title: "エージェント + コンテンツバンドル",
          description: "MindStudio はエージェントのみ。Patreon はコンテンツのみ。AgentForge なら AI エージェント、開発ツール、記事や動画コンテンツをサブスクプランにまとめられます。ひとつのプラットフォーム、ひとつのオーディエンス。",
        },
      ],
    },
    economics: {
      heading: "収益モデル",
      sub: "プラットフォーム月額料なし。シンプルな 90/10 の収益分配。",
      colPlatform: "プラットフォーム",
      colKeeps: "クリエイターの取り分",
      colCatch: "注意点",
      notes: {
        "GPT Store": "エンゲージメントベース、微々たる報酬",
        "Shopify Apps": "プラットフォーム手数料 20%",
        "Gumroad": "10% + 1件あたり $0.50",
        "MindStudio": "月額 $20 のプラットフォーム料 + API コスト",
        "AgentForge": "一律 10%。プラットフォーム料なし。隠れたコストなし。",
      },
    },
    sell: {
      heading: "販売できるもの",
      sub: "自律型 AI エージェントから教育コンテンツまで——バンドルも可能。",
      items: [
        { title: "AI エージェント", description: "トレーディングボット、リサーチエージェント、コーディングアシスタント——サブスクライバーのために実際の仕事をこなす自律型エージェント。" },
        { title: "開発者ツール", description: "API、CLI、SDK、MCP サーバー、自動化ユーティリティ。" },
        { title: "コンテンツ & チュートリアル", description: "解説記事、動画講座、データセット、プロンプトライブラリ——あらゆる言語で。" },
        { title: "バンドルプラン", description: "エージェント + ツール + コンテンツをサブスクプランに。$10/月ベーシック、$50/月プロ——価格はあなたが決めます。" },
      ],
    },
    howItWorks: {
      heading: "使い方",
      sub: "登録から初回入金まで、4つのシンプルなステップ。",
      steps: [
        { title: "アカウント登録", description: "無料アカウントを作成し、クリエイターとして申請。" },
        { title: "商品を掲載", description: "エージェント、ツール、コンテンツを価格プランと共にアップロード。" },
        { title: "Stripe を接続", description: "Stripe Connect を設定して即時入金を有効に。" },
        { title: "収益を獲得", description: "サブスクライバーが毎月支払い、90% が直接振り込まれます。" },
      ],
    },
    devs: {
      heading: "開発者のために構築",
      sub: "強力な API とツールによる一流の開発者体験。",
      features: [
        { title: "フル API アクセス", description: "Bearer トークン認証の RESTful API。プログラマティックに統合可能。" },
        { title: "利用状況分析", description: "API コール数、サブスクライバー成長、商品別収益を追跡。" },
        { title: "レート制限", description: "キーごとに設定可能なレート制限でエンドポイントを保護。" },
        { title: "API キー管理", description: "SHA-256 ハッシュ化キー、プレフィックスベースの識別。" },
        { title: "Webhook イベント", description: "新規サブスク、キャンセル、支払いをリアルタイム通知。" },
        { title: "公開 API ドキュメント", description: "サブスクライバー向けの美しいインタラクティブ API ドキュメント。" },
      ],
    },
    community: {
      heading: "あなたのコミュニティ、あなたの言語",
      sub: "私たちは設定ページだけ翻訳したシリコンバレーのプラットフォームではありません。AgentForge は香港で、アジアのインディー開発者コミュニティのために作られました。",
      regions: [
        { title: "中文コンテンツ", description: "中国語でコンテンツを公開し、香港・台湾・シンガポール・世界中の中国語話者の開発者にリーチ。" },
        { title: "日本語コンテンツ", description: "日本は最も活発なインディー開発者コミュニティのひとつ。日本のクリエイターとオーディエンスをネイティブにサポート。" },
        { title: "東南アジア", description: "韓国、インドネシア、タイ——次の AI ビルダーの波。急成長市場で早めにオーディエンスを獲得しましょう。" },
      ],
    },
    cta: {
      heading: "AI ツールを収益化する準備はできましたか？",
      sub: "創設クリエイターとして参加。最初の 3 ヶ月はプラットフォーム手数料 0%。マーケットプレイスが混み合う前にオーディエンスを構築しましょう。",
      ctaButton: "クリエイターとして始める",
      questions: "ご質問は？",
      foundingBadge: "創設クリエイター：3 ヶ月間手数料 0%",
    },
  },

  /* ================================================================ */
  /*  Korean (한국어)                                                   */
  /* ================================================================ */
  ko: {
    hero: {
      badge: "창립 크리에이터 모집 중",
      heading: "아시아 인디 AI 개발자를 위한 홈 플랫폼",
      sub: "주요 AI 마켓플레이스는 모두 미국 중심입니다. AgentForge는 홍콩, 일본, 대만, 한국, 동남아시아 개발자를 위해 만들어졌습니다. AI 에이전트, 도구, 콘텐츠의 구독을 판매하고 수익의 90%를 가져가세요.",
      sub2: "사람과 AI 에이전트 모두 API를 통해 구독할 수 있는 유일한 마켓플레이스.",
      ctaGetStarted: "시작하기",
      ctaDocs: "API 문서 보기",
    },
    why: {
      heading: "우리가 다른 이유",
      sub: "AI 마켓플레이스는 많습니다. AgentForge가 존재하는 이유는 이렇습니다.",
      cards: [
        {
          title: "아시아 퍼스트, 아시아 애프터쏘트가 아닌",
          description: "MindStudio, GPT Store, Copilot Store — 모두 미국/영어 중심. 우리는 첫날부터 🇭🇰 🇯🇵 🇹🇼 🇰🇷 🇸🇬 개발자를 위해 만들었습니다. 다국어 콘텐츠, 로컬 커뮤니티, 아시아 핀테크 통합.",
        },
        {
          title: "에이전트 간 경제",
          description: "구독자는 사람만이 아닙니다. 다른 AI 에이전트도 API를 통해 도구를 발견하고 구독하여 자율적 에이전트 공급망을 구축합니다. 2027년까지 전자상거래의 15-25%를 차지할 것으로 예상됩니다.",
        },
        {
          title: "에이전트 + 콘텐츠 번들",
          description: "MindStudio는 에이전트만. Patreon은 콘텐츠만. AgentForge에서는 AI 에이전트, 개발 도구, 글/영상 콘텐츠를 구독 플랜으로 묶을 수 있습니다. 하나의 플랫폼, 하나의 오디언스.",
        },
      ],
    },
    economics: {
      heading: "수익 모델",
      sub: "플랫폼 구독료 없음. 심플한 90/10 수익 분배.",
      colPlatform: "플랫폼",
      colKeeps: "크리에이터 수익",
      colCatch: "조건",
      notes: {
        "GPT Store": "참여도 기반, 극소액 지급",
        "Shopify Apps": "플랫폼 수수료 20%",
        "Gumroad": "10% + 건당 $0.50",
        "MindStudio": "월 $20 플랫폼 비용 + API 비용 부담",
        "AgentForge": "고정 10%. 플랫폼 비용 없음. 숨겨진 비용 없음.",
      },
    },
    sell: {
      heading: "판매할 수 있는 것",
      sub: "자율형 AI 에이전트부터 교육 콘텐츠까지 — 번들도 가능합니다.",
      items: [
        { title: "AI 에이전트", description: "트레이딩 봇, 리서치 에이전트, 코딩 어시스턴트 — 구독자를 위해 실제 작업을 수행하는 자율형 에이전트." },
        { title: "개발자 도구", description: "API, CLI, SDK, MCP 서버 및 자동화 유틸리티." },
        { title: "콘텐츠 & 튜토리얼", description: "가이드, 영상 강좌, 데이터셋, 프롬프트 라이브러리 — 모든 언어 지원." },
        { title: "번들 플랜", description: "에이전트 + 도구 + 콘텐츠를 구독 플랜으로 구성. $10/월 기본, $50/월 프로 — 가격은 자유롭게 설정." },
      ],
    },
    howItWorks: {
      heading: "이용 방법",
      sub: "가입부터 첫 수익까지 네 가지 간단한 단계.",
      steps: [
        { title: "가입하기", description: "무료 계정을 만들고 크리에이터로 신청하세요." },
        { title: "상품 등록", description: "에이전트, 도구 또는 콘텐츠를 가격 플랜과 함께 업로드." },
        { title: "Stripe 연결", description: "Stripe Connect를 설정하여 즉시 입금 활성화." },
        { title: "수익 창출", description: "구독자가 매월 결제하면 90%가 바로 입금됩니다." },
      ],
    },
    devs: {
      heading: "개발자를 위해 구축",
      sub: "강력한 API와 도구로 최고의 개발자 경험을 제공합니다.",
      features: [
        { title: "전체 API 액세스", description: "Bearer 토큰 인증의 RESTful API. 프로그래밍 방식으로 통합 가능." },
        { title: "사용량 분석", description: "API 호출, 구독자 성장, 상품별 수익 추적." },
        { title: "속도 제한", description: "키별 설정 가능한 속도 제한으로 엔드포인트 보호." },
        { title: "API 키 관리", description: "SHA-256 해시 키, 프리픽스 기반 식별." },
        { title: "Webhook 이벤트", description: "신규 구독, 취소, 결제 실시간 알림." },
        { title: "공개 API 문서", description: "구독자를 위한 아름다운 인터랙티브 API 문서." },
      ],
    },
    community: {
      heading: "당신의 커뮤니티, 당신의 언어",
      sub: "우리는 설정 페이지만 번역한 실리콘밸리 플랫폼이 아닙니다. AgentForge는 홍콩에서, 아시아 인디 개발자 커뮤니티를 위해 만들어졌습니다.",
      regions: [
        { title: "中文 콘텐츠", description: "중국어로 콘텐츠를 게시하여 홍콩, 대만, 싱가포르 및 전 세계 중국어권 개발자에게 도달하세요." },
        { title: "日本語 콘텐츠", description: "일본은 가장 활발한 인디 개발자 커뮤니티 중 하나입니다. 일본 크리에이터와 오디언스를 네이티브로 지원합니다." },
        { title: "동남아시아", description: "한국, 인도네시아, 태국 — 차세대 AI 빌더들의 물결. 빠르게 성장하는 시장에서 일찍 오디언스를 확보하세요." },
      ],
    },
    cta: {
      heading: "AI 도구를 수익화할 준비가 되셨나요?",
      sub: "창립 크리에이터로 참여하세요. 처음 3개월간 플랫폼 수수료 0%. 마켓플레이스가 붐비기 전에 오디언스를 구축하세요.",
      ctaButton: "크리에이터로 시작하기",
      questions: "질문이 있으신가요?",
      foundingBadge: "창립 크리에이터: 3개월간 수수료 0%",
    },
  },
};
