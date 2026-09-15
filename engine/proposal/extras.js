// Proposal v2 sections built by code from approved data — no AI text, no new numbers:
//   summary  — the confirmed problems, the services in scope and where the work starts
//   audit    — the website checks measured by code (speed, search basics, measurement, contact paths)
//   next     — what happens after approval and what the client needs to provide (from readiness)

const unique = (list) => [...new Set(list.filter(Boolean))];

export function summaryModel({ problems = [], scope, schedule }) {
  const findings = problems.slice(0, 4).map((p) => p.title).filter(Boolean);
  const actions = scope.groups.map((g) => ({ name: g.nameAr, when: g.mandatory ? 'الأساس في أول أسبوع' : g.phase === 'P1' ? 'يبدأ في الشهر الأول' : 'يبدأ في الشهر الثاني' }));
  const week1 = unique((schedule.weeks[1] || []).map((i) => i.nameAr));
  if (!findings.length || !actions.length) return null;
  return {
    title: 'الخلاصة في [[صفحة واحدة]]',
    intro: 'أهم اللي لقيناه، واللي هنشتغل عليه، ونبدأ منين.',
    findingsLabel: 'اللي لقيناه',
    findings,
    actionsLabel: 'اللي هنشتغل عليه',
    actions: actions.slice(0, 6),
    startLabel: 'البداية',
    start: week1.length ? `الأسبوع الأول: ${week1.join('، ')}` : '',
  };
}

const present = (label) => (c) => (c.result === 'present' ? { label, value: 'موجود', status: 'good' } : c.result === 'absent' ? { label, value: 'غير موجود', status: 'needs' } : null);
const AUDIT_GROUPS = [
  {
    title: 'السرعة على الموبايل',
    icon: 'gauge',
    items: {
      psi_mobile: (c) => {
        const n = Number((String(c.value).match(/performance (\d+)\/100/) || [])[1]);
        return Number.isFinite(n) ? { label: 'تقييم Google PageSpeed', value: `${n}/100`, status: n >= 90 ? 'good' : n >= 50 ? 'needs' : 'poor' } : null;
      },
      perf_mobile_lcp: (c) => {
        const s = Number((String(c.value).match(/([\d.]+)\s*s\b/) || [])[1]);
        return Number.isFinite(s) ? { label: 'ظهور المحتوى الرئيسي', value: `${s} ثانية`, status: s <= 2.5 ? 'good' : s <= 4 ? 'needs' : 'poor' } : null;
      },
    },
  },
  {
    title: 'أساسيات الظهور في جوجل',
    icon: 'search',
    items: {
      seo_https: present('اتصال آمن HTTPS'),
      seo_meta_description: present('وصف الصفحة في نتائج البحث'),
      seo_h1: present('عنوان رئيسي H1'),
      seo_structured_data: present('بيانات منظمة schema'),
      seo_sitemap: present('خريطة الموقع sitemap'),
      seo_viewport: present('تهيئة للموبايل'),
      seo_noindex: (c) => (c.result === 'present' ? { label: 'الصفحة مفتوحة لجوجل', value: 'مقفولة', status: 'poor' } : c.result === 'absent' ? { label: 'الصفحة مفتوحة لجوجل', value: 'مفتوحة', status: 'good' } : null),
      seo_image_alt: (c) => {
        const [, a, b] = String(c.value).match(/(\d+) of (\d+)/) || [];
        return a ? { label: 'صور بدون وصف بديل', value: `${a} من ${b}`, status: Number(a) === 0 ? 'good' : 'needs' } : null;
      },
    },
  },
  {
    title: 'أدوات القياس والتتبع',
    icon: 'chart-no-axes-combined',
    items: {
      tech_ga4: present('Google Analytics 4'),
      tech_gtm: present('Google Tag Manager'),
      tech_google_ads_tag: present('تتبع تحويلات Google Ads'),
      tech_meta_pixel: present('بيكسل ميتا'),
      tech_tiktok_pixel: present('بيكسل تيك توك'),
      tech_snap_pixel: present('بيكسل سناب شات'),
    },
  },
  {
    title: 'طرق التواصل',
    icon: 'message-circle',
    items: {
      tech_whatsapp_link: present('رابط واتساب'),
      tech_newsletter_form: present('نموذج تسجيل بريد'),
    },
  },
];

export function auditModel(checks = []) {
  const byKey = new Map(checks.map((c) => [c.key, c]));
  const reachable = byKey.get('website_reachable');
  if (!reachable || !/^yes/i.test(String(reachable.value || ''))) return null;
  const groups = AUDIT_GROUPS.map((g) => ({
    title: g.title,
    icon: g.icon,
    items: Object.entries(g.items).map(([key, fn]) => (byKey.has(key) ? fn(byKey.get(key)) : null)).filter(Boolean),
  })).filter((g) => g.items.length);
  const all = groups.flatMap((g) => g.items);
  if (all.length < 6) return null;
  const toFix = all.filter((i) => i.status !== 'good').length;
  const date = new Date(reachable.at || Date.now());
  return {
    title: 'فحص [[الموقع]] والقياس',
    intro: `فحص آلي للصفحة الرئيسية: ${all.length} نقطة، منهم ${toFix} محتاجين شغل.`,
    groups,
    note: `قياسات آلية من الصفحة الرئيسية بتاريخ ${date.getUTCDate()}/${date.getUTCMonth() + 1}/${date.getUTCFullYear()}. السرعة تتغير من قياس لقياس، فبنقيسها تاني قبل ما نبدأ.`,
  };
}

// Readiness items the client can provide; ads-related ones only when paid ads are in scope.
const ASKS = {
  website_access: { text: 'صلاحية إدارة الموقع', needs: ['svc.website_management', 'svc.performance_marketing', 'svc.marketing_automation'] },
  tracking_installed: { text: 'صلاحية تركيب أدوات القياس على الموقع', needs: null },
  ad_account_access: { text: 'صلاحية دخول حسابات الإعلانات', needs: ['svc.performance_marketing'] },
  ad_budget: { text: 'تحديد ميزانية الإعلانات الشهرية', needs: ['svc.performance_marketing'] },
  content_assets: { text: 'الصور والفيديوهات المتاحة عندكم', needs: null },
  product_access: { text: 'إتاحة المنتجات أو المشاريع للتصوير', needs: ['svc.media_production', 'svc.social_media_management'] },
  email_list: { text: 'قائمة بيانات العملاء لو موجودة', needs: ['svc.email_marketing', 'svc.marketing_automation'] },
};

export function nextStepsModel({ scope, schedule, readiness = {} }) {
  const inScope = new Set(scope.groups.map((g) => g.serviceId));
  const week1 = unique((schedule.weeks[1] || []).map((i) => i.nameAr));
  const asks = Object.entries(ASKS)
    .filter(([key, a]) => (readiness[key]?.value ?? readiness[key] ?? 'unknown') !== 'yes' && (!a.needs || a.needs.some((id) => inScope.has(id))))
    .map(([, a]) => a.text)
    .slice(0, 6);
  return {
    title: 'الخطوات [[الجاية]]',
    intro: 'من الموافقة لأول تسليمات، وإيه اللي محتاجينه من حضرتك عشان نبدأ بسرعة.',
    steps: [
      { title: 'الموافقة على العرض', text: 'نثبّت النطاق والخطة زي ما هي في العرض.' },
      { title: 'اجتماع البداية', text: 'نتفق على الأولويات ونستلم الصلاحيات والملفات.' },
      { title: 'الأسبوع الأول', text: week1.length ? week1.join('، ') : 'نبدأ بتسليمات الأساس.' },
    ],
    asksLabel: 'محتاجين من حضرتك',
    asks,
  };
}
