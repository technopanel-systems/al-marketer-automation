// The closing call-to-action slide, built by code from rules/agency.json (never written by AI).

// "+966543348930" → "+966 54 334 8930"; other numbers are grouped in threes after the country code.
export function formatPhone(raw) {
  const digits = String(raw || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('966') && digits.length === 12) return `+966 ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  if (digits.startsWith('20') && digits.length === 12) return `+20 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  return `+${digits.replace(/(\d{3})(?=\d)/g, '$1 ')}`;
}

export function ctaModel(agency, { clientName = '', logo = null } = {}) {
  if (!agency?.whatsapp && !agency?.email) return null;
  const phone = String(agency.whatsapp || '').replace(/[^\d]/g, '');
  const message = [agency.cta?.whatsappMessageAr, clientName ? `(${clientName})` : ''].filter(Boolean).join(' ');
  const firstSocial = Object.values(agency.socials || {})[0] || '';
  return {
    title: agency.cta?.titleAr || 'جاهزين [[نبدأ]]؟',
    text: agency.cta?.textAr || '',
    button: agency.cta?.buttonAr || 'احجز استشارة',
    whatsappUrl: phone ? `https://wa.me/${phone}${message ? `?text=${encodeURIComponent(message)}` : ''}` : agency.website,
    whatsappDisplay: formatPhone(agency.whatsapp),
    email: agency.email || '',
    website: agency.website || '',
    websiteDisplay: String(agency.website || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''),
    handle: agency.handle || '',
    socialUrl: firstSocial,
    clientLogo: logo,
  };
}
