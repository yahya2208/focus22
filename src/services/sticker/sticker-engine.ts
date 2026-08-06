import type { StickerConfig, StickerContent, StickerType, ContentType, StickerTheme } from './sticker-types';
import { STICKER_TYPES_CONFIG, STICKER_CTA_URLS, LAYOUT_CONFIG } from './sticker-types';
import { getRandomWisdom, getWisdomById, getRandomQuestion, type WisdomEntry, type QuestionEntry } from '../../data/wisdom-database';
import { generateQRDataUrl } from '../../core/qr/generate';
import { getBasePath } from '../../core/base-path';
import { getNextSerialNumber, estimateSerialNumber, registerPrintBatch } from './sticker-database';

export function getMessage(key: string, locale: 'ar' | 'en' | 'tr'): string {
  const messages = MESSAGES[key];
  return messages?.[locale] || messages?.ar || key;
}

export function getTypeTitle(type: StickerType, locale: 'ar' | 'en' | 'tr'): string {
  const titles = TYPE_TITLES[type];
  return titles?.[locale] || type;
}

export function getThemeLabel(theme: StickerTheme, locale: 'ar' | 'en' | 'tr'): string {
  const labels: Record<string, Record<'ar' | 'en' | 'tr', string>> = {
    classic: { ar: 'كلاسيك', en: 'Classic', tr: 'Klasik' },
    modern: { ar: 'حديث', en: 'Modern', tr: 'Modern' },
    minimal: { ar: 'بسيط', en: 'Minimal', tr: 'Minimal' },
    dark: { ar: 'داكن', en: 'Dark', tr: 'Karanlık' },
    gold: { ar: 'ذهبي', en: 'Gold', tr: 'Altın' },
    glass: { ar: 'زجاجي', en: 'Glass', tr: 'Cam' },
    kids: { ar: 'أطفال', en: 'Kids', tr: 'Çocuk' },
    business: { ar: 'أعمال', en: 'Business', tr: 'İş' },
    elegant: { ar: 'أنيق', en: 'Elegant', tr: 'Zarif' },
    neon: { ar: 'نيون', en: 'Neon', tr: 'Neon' },
  };
  return labels[theme]?.[locale] || theme;
}

export function getContentLabel(type: ContentType, locale: 'ar' | 'en' | 'tr'): string {
  const labels = {
    wisdom: { ar: 'حكمة', en: 'Wisdom', tr: 'Bilgelik' },
    question: { ar: 'سؤال', en: 'Question', tr: 'Soru' },
  };
  return labels[type]?.[locale] || type;
}

function pickContent(config: StickerConfig, locale: 'ar' | 'en' | 'tr'): { text: string; source: string } {
  if (config.contentType === 'question') {
    let question: QuestionEntry | undefined;
    if (config.quoteMode === 'single' && config.quoteId) {
      question = getRandomQuestion(config.quoteCategory);
    } else if (config.quoteMode === 'category' && config.quoteCategory) {
      question = getRandomQuestion(config.quoteCategory);
    } else {
      question = getRandomQuestion();
    }
    if (!question) return { text: '', source: '?' };
    return {
      text: locale === 'en' ? question.english : locale === 'tr' ? question.turkish : question.arabic,
      source: locale === 'en' ? 'Question' : locale === 'tr' ? 'Soru' : 'سؤال',
    };
  }
  let wisdom: WisdomEntry | undefined;
  if (config.quoteMode === 'single' && config.quoteId) {
    wisdom = getWisdomById(config.quoteId);
  } else if (config.quoteMode === 'category' && config.quoteCategory) {
    wisdom = getRandomWisdom(config.quoteCategory);
  } else {
    wisdom = getRandomWisdom();
  }
  if (!wisdom) return { text: '', source: '' };
  return {
    text: locale === 'en' ? wisdom.english : locale === 'tr' ? wisdom.turkish : wisdom.arabic,
    source: locale === 'en' ? 'Wisdom' : locale === 'tr' ? 'Bilgelik' : 'حكمة',
  };
}

export async function generateStickerContent(
  config: StickerConfig,
  locale: 'ar' | 'en' | 'tr',
  serialNumber?: string,
): Promise<StickerContent> {
  const typeConfig = STICKER_TYPES_CONFIG[config.type];
  const content = pickContent(config, locale);
  const title = getTypeTitle(config.type, locale);
  const message = config.customMessage || getMessage(typeConfig.defaultMessageKey, locale);
  const cta = typeConfig.defaultCTA;
  const serial = serialNumber || getNextSerialNumber();
  const campaign = 'general';
  const printDate = new Date().toLocaleDateString(
    locale === 'en' ? 'en-US' : locale === 'tr' ? 'tr-TR' : 'ar-SA',
    { year: 'numeric', month: 'short', day: 'numeric' },
  );

  let qrUrl = '';
  if (config.showQR) {
    try {
      const base = getBasePath();
      const urlBuilder = STICKER_CTA_URLS[cta];
      const url = urlBuilder(base, serial);
      qrUrl = await generateQRDataUrl(url, { width: 120, margin: 1 });
    } catch { qrUrl = ''; }
  }

  return {
    type: config.type,
    contentType: config.contentType,
    title,
    message,
    wisdom: content.text,
    wisdomSource: content.source,
    icon: typeConfig.icon,
    accentColor: typeConfig.accentColor,
    qrUrl,
    serialNumber: serial,
    campaign,
    cta,
    printDate,
  };
}

export async function generateStickerPage(
  config: StickerConfig,
  locale: 'ar' | 'en' | 'tr',
  pageIndex: number,
): Promise<StickerContent[]> {
  const layout = LAYOUT_CONFIG[config.layout];
  const count = layout.cols * layout.rows;
  const stickers: StickerContent[] = [];

  for (let i = 0; i < count; i++) {
    const stickerConfig: StickerConfig = { ...config };
    if (config.stickerMode === 'mixed' && i < 3) {
      const types: StickerType[] = ['focus_game', 'repair', 'exchange'];
      stickerConfig.type = types[i % types.length] as StickerType;
    }
    if (config.stickerMode === 'different') {
      stickerConfig.quoteMode = 'random' as const;
      stickerConfig.quoteId = undefined;
      stickerConfig.quoteCategory = undefined;
    }
    const stickerIndex = pageIndex * count + i;
    const serial = estimateSerialNumber(stickerIndex);
    stickers.push(await generateStickerContent(stickerConfig, locale, serial));
  }

  return stickers;
}

export async function generateAllPages(
  config: StickerConfig,
  locale: 'ar' | 'en' | 'tr',
): Promise<StickerContent[][]> {
  const layout = LAYOUT_CONFIG[config.layout];
  const perPage = layout.cols * layout.rows;
  const totalStickers = config.copies * perPage;
  const cta = STICKER_TYPES_CONFIG[config.type].defaultCTA;

  registerPrintBatch(totalStickers, 'general', config.type, config.contentType, config.theme, cta);

  const pages: StickerContent[][] = [];
  for (let i = 0; i < config.copies; i++) {
    pages.push(await generateStickerPage(config, locale, i));
  }
  return pages;
}

const MESSAGES: Record<string, Record<'ar' | 'en' | 'tr', string>> = {
  'sticker.msg.focusChallenge': {
    ar: 'هل تظن أنك سريع؟ اختبر نفسك. كم تبلغ سرعة تركيزك؟ جرب الآن.',
    en: 'Think you\'re fast? Test yourself. How fast is your focus? Try now.',
    tr: 'Hızlı olduğunu mu düşünüyorsun? Kendini test et. Odaklanma hızın ne kadar? Hemen dene.',
  },
  'sticker.msg.repair': {
    ar: 'أصلح هاتفك بأمان. خبرة وجودة وضمان.',
    en: 'Fix your phone safely. Expertise, quality, and warranty.',
    tr: 'Telefonunu güvenle tamir ettir. Uzmanlık, kalite ve garanti.',
  },
  'sticker.msg.buyPhone': {
    ar: 'اطلب هاتفك الجديد. أحدث الموديلات بأفضل الأسعار.',
    en: 'Order your new phone. Latest models at best prices.',
    tr: 'Yeni telefonunu sipariş et. En son modeller en iyi fiyatlarla.',
  },
  'sticker.msg.sellPhone': {
    ar: 'نشتري جميع الهواتف. قدّر هاتفك الآن.',
    en: 'We buy all phones. Value your phone now.',
    tr: 'Tüm telefonları satın alıyoruz. Telefonunu şimdi değerlendir.',
  },
  'sticker.msg.exchange': {
    ar: 'استبدل هاتفك بسهولة. لا ترم هاتفك، قد يكون له قيمة.',
    en: 'Exchange your phone easily. Don\'t throw your phone away, it may have value.',
    tr: 'Telefonunu kolayca değiştir. Telefonunu atma, değeri olabilir.',
  },
  'sticker.msg.evaluation': {
    ar: 'قيم هاتفك مجاناً. احصل على السعر العادل.',
    en: 'Evaluate your phone for free. Get a fair price.',
    tr: 'Telefonunu ücretsiz değerlendir. Adil fiyat al.',
  },
  'sticker.msg.bestOffers': {
    ar: 'أفضل العروض في انتظارك. لا تفوت الفرصة.',
    en: 'Best offers await you. Don\'t miss out.',
    tr: 'En iyi fırsatlar seni bekliyor. Kaçırma.',
  },
  'sticker.msg.usedPhones': {
    ar: 'هواتف مستعملة بحالة ممتازة. بأسعار مناسبة.',
    en: 'Used phones in excellent condition. At great prices.',
    tr: 'Mükemmel durumda ikinci el telefonlar. Uygun fiyatlarla.',
  },
  'sticker.msg.newPhones': {
    ar: 'هواتف جديدة بأحدث التقنيات. مع الضمان الرسمي.',
    en: 'New phones with latest technology. With official warranty.',
    tr: 'En yeni teknolojiye sahip yeni telefonlar. Resmi garantiyle.',
  },
  'sticker.msg.storeServices': {
    ar: 'كل ما تحتاجه من خدمات المحل في مكان واحد.',
    en: 'All the store services you need in one place.',
    tr: 'İhtiyacınız olan tüm mağaza hizmetleri tek bir yerde.',
  },
};

const TYPE_TITLES: Record<StickerType, Record<'ar' | 'en' | 'tr', string>> = {
  focus_game: { ar: '🎯 لعبة التركيز', en: '🎯 Focus Game', tr: '🎯 Odak Oyunu' },
  repair: { ar: '🔧 تصليح الهواتف', en: '🔧 Phone Repair', tr: '🔧 Telefon Tamiri' },
  buy_phone: { ar: '📱 شراء هاتف', en: '📱 Buy Phone', tr: '📱 Telefon Satın Al' },
  sell_phone: { ar: '💰 بيع هاتف', en: '💰 Sell Phone', tr: '💰 Telefon Sat' },
  exchange: { ar: '🔄 استبدال', en: '🔄 Exchange', tr: '🔄 Takas' },
  phone_evaluation: { ar: '📊 تقييم الهاتف', en: '📊 Phone Evaluation', tr: '📱 Telefon Değerlendirme' },
  best_offers: { ar: '🏆 أفضل العروض', en: '🏆 Best Offers', tr: '🏆 En İyi Fırsatlar' },
  used_phones: { ar: '♻️ هواتف مستعملة', en: '♻️ Used Phones', tr: '♻️ İkinci El Telefonlar' },
  new_phones: { ar: '🆕 هواتف جديدة', en: '🆕 New Phones', tr: '🆕 Yeni Telefonlar' },
  store_services: { ar: '🏪 خدمات المحل', en: '🏪 Store Services', tr: '🏪 Mağaza Hizmetleri' },
};
