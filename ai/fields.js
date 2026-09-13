// Client Information Record fields (Blueprint p.12–14). Research teams may only fill these fields.

export const TEAMS = {
  business: {
    label: 'Business & Offers',
    labelAr: 'البيزنس والعروض',
    fields: {
      business_model: 'How the business makes money (e.g. online store, services, B2B, marketplace seller)',
      products_services: 'What it sells: main products / services / packages',
      product_count: 'How many products or services are offered',
      categories: 'Main categories or product lines',
      price_level: 'Price level or example prices and currency',
      markets: 'Countries / cities / markets served today',
      sales_channels: 'Where it sells: own website, marketplaces, social DMs, WhatsApp, branches',
      locations: 'Physical branches or showrooms',
      history: 'Age of the business, founding, origin',
      goals: 'Business goals stated by the client',
      constraints: 'Known constraints (budget, operations, legal, stock, shipping)',
    },
  },
  brand: {
    label: 'Brand & Market',
    labelAr: 'البراند والسوق',
    fields: {
      brand_personality: 'Tone and personality the brand shows',
      target_audience: 'Who the customers are',
      positioning: 'How the brand positions itself (premium, affordable, modest fashion, local, etc.)',
      differentiation: 'What makes it different, as the brand itself claims',
      communication_style: 'Language, dialect and style of communication',
      visual_identity: 'Consistency and quality of visuals, logo, colours, photography',
      competitors: 'Competitors named by the client or clearly shown in evidence',
      market_context: 'Market or seasonal context relevant to the brand',
    },
  },
  channels: {
    label: 'Channels & Digital Presence',
    labelAr: 'القنوات والحضور الرقمي',
    fields: {
      website_status: 'Website existence, platform and state',
      ecommerce_platform: 'Store platform (Zid, Salla, Shopify, …)',
      instagram: 'Instagram presence (handle, followers, activity) as visible',
      facebook: 'Facebook presence',
      tiktok: 'TikTok presence',
      snapchat: 'Snapchat presence',
      x_twitter: 'X / Twitter presence',
      youtube: 'YouTube presence',
      linkedin: 'LinkedIn presence',
      whatsapp: 'WhatsApp as a sales / contact channel',
      google_maps: 'Google Maps / business listing',
      search_visibility: 'How visible the brand is in search (checks, SEO audit)',
      paid_ads: 'Evidence of paid advertising',
      content_behavior: 'What content is posted, how often, formats',
      purchase_journey: 'How a customer buys: steps from discovery to order',
      tracking: 'Analytics / pixels installed',
    },
  },
};

export const ALL_FIELDS = Object.fromEntries(Object.values(TEAMS).flatMap((t) => Object.entries(t.fields)));
export const FIELD_TEAM = Object.fromEntries(Object.entries(TEAMS).flatMap(([team, t]) => Object.keys(t.fields).map((f) => [f, team])));

// Fields the diagnosis cannot work without (Blueprint: missing → targeted research → still unknown → human input).
export const REQUIRED_FIELDS = {
  business_model: { en: 'How does the business sell (online store, services, social DMs…)?', ar: 'البيزنس بيبيع إزاي (متجر إلكتروني، خدمات، رسائل السوشيال…)؟' },
  products_services: { en: 'What are the main products or services?', ar: 'إيه أهم المنتجات أو الخدمات؟' },
  markets: { en: 'Which countries / markets does the client serve or target?', ar: 'العميل بيخدم أو مستهدف أي أسواق/دول؟' },
  sales_channels: { en: 'Where do sales happen today (website, marketplaces, WhatsApp, branches)?', ar: 'المبيعات بتحصل فين حاليًا (الموقع، المنصات، واتساب، الفروع)؟' },
  target_audience: { en: 'Who is the target customer?', ar: 'مين العميل المستهدف؟' },
  positioning: { en: 'How does the brand want to be seen (premium, affordable, specialist…)?', ar: 'البراند عايز يتشاف إزاي (فاخر، اقتصادي، متخصص…)؟' },
  purchase_journey: { en: 'How does a customer usually buy (steps from seeing the brand to ordering)?', ar: 'العميل بيشتري عادة إزاي (من أول ما يشوف البراند لحد الطلب)؟' },
};

export const READINESS_KEYS = {
  tracking_installed: 'Analytics / ad pixels are installed on the website',
  ad_account_access: 'Al-Marketer can get access to the ad accounts',
  ad_budget: 'The client has a budget for paid ads',
  website_access: 'Al-Marketer can get admin access to the website / store',
  email_list: 'The client has a customer email list',
  product_access: 'Products are available for photography / content',
  content_assets: 'The client has photos / videos to use',
};
