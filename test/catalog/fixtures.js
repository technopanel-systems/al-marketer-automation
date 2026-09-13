// Small valid catalog used by unit tests (independent of the real catalog data).
export function sampleCatalog() {
  const svc = (id, sortOrder, nameEn, strategic, capability = 5) => ({
    id, sortOrder, nameEn, nameAr: `خدمة ${sortOrder}`, strategic, capability, descriptionAr: '', notionName: '', notionPageId: '', active: true,
  });
  const del = (id, parentId, sortOrder, stage, extra = {}) => ({
    id, parentId, sortOrder, nameEn: id.replace('del.', ''), nameAr: `تسليم ${sortOrder}`, kind: 'fixed', stage,
    recurring: false, visual: false, dependsOn: [], descriptionAr: '', notionName: '', notionPageId: '', active: true, ...extra,
  });
  return {
    services: [
      svc('svc.portfolio', 10, 'Product Portfolio Management', true),
      svc('svc.brand', 20, 'Brand Management', true),
      svc('svc.marketing', 30, 'Marketing Management', true),
      svc('svc.website', 40, 'Website Management', false, 3),
    ],
    offerings: [
      { id: 'off.seo', serviceId: 'svc.website', sortOrder: 10, nameEn: 'SEO', nameAr: 'الظهور في البحث', descriptionAr: '', notionName: '', notionPageId: '', active: true },
    ],
    deliverables: [
      del('del.master_sheet', 'svc.portfolio', 10, 'strategic'),
      del('del.brand_book', 'svc.brand', 20, 'strategic'),
      del('del.loyalty', 'svc.brand', 25, 'strategic', { kind: 'conditional' }),
      del('del.strategy_map', 'svc.marketing', 30, 'strategic'),
      del('del.seo_plan', 'off.seo', 40, 'plan'),
      del('del.seo_implementation', 'off.seo', 50, 'execution', { recurring: true, dependsOn: ['del.seo_plan'] }),
    ],
  };
}

export const clone = (x) => JSON.parse(JSON.stringify(x));
