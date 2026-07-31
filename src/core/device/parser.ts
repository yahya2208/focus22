export interface DeviceBrandModel {
  readonly brand: string;
  readonly model: string;
  readonly marketingName: string;
}

const ANDROID_BRANDS: Record<string, RegExp[]> = {
  Samsung: [/SM-[A-Z0-9]+/i, /SAMSUNG/i, /Galaxy/i],
  Xiaomi: [/Mi\d+/i, /Xiaomi/i, /Redmi/i, /POCO/i, /M2007J/i],
  Huawei: [/Huawei/i, /Honor/i, /MAR-LX/i, /JNY-LX/i, /ALP-AL/i],
  Oppo: [/Oppo/i, /CPH\d+/i, /A37/i, /F11/i, /Reno/i],
  Vivo: [/Vivo/i, /V2029/i, /V2030/i, /I2012/i],
  OnePlus: [/OnePlus/i, /IN201\d/i, /HD190\d/i, /AC200\d/i, /KB200\d/i],
  Google: [/Pixel/i, /Pixel \d/i, /Pixel \d [A-Za-z]/i],
  Motorola: [/Moto/i, /Motorola/i, /XT\d+/i],
  Nokia: [/Nokia/i, /TA-\d+/i],
  Sony: [/Sony/i, /Xperia/i],
  LG: [/LG/i, /LM-\d+/i, /VS\d+/i, /LG-\d+/i],
  Realme: [/Realme/i, /RMX\d+/i],
  Tecno: [/Tecno/i, /TECNO/i, /Camon/i, /Spark/i],
  Infinix: [/Infinix/i, /X\d+/i],
  Asus: [/ASUS/i, /ZenFone/i, /ROG Phone/i],
  Lenovo: [/Lenovo/i, /TB-\d+/i],
  HTC: [/HTC/i],
  BlackBerry: [/BB\d+/i, /BlackBerry/i],
};

const IOS_BRANDS: Record<string, RegExp[]> = {
  Apple: [/iPhone/i, /iPad/i, /iPod/i],
};

const DESKTOP_BRANDS: Record<string, RegExp[]> = {
  Apple: [/Macintosh/i, /Mac OS X/i],
  Microsoft: [/Surface/i, /Windows NT/i],
  Google: [/CrOS/i, /Chromebook/i],
  Dell: [/Dell/i, /XPS/i, /Latitude/i],
  HP: [/HP/i, /Pavilion/i, /EliteBook/i, /ProBook/i],
  Lenovo: [/ThinkPad/i, /Lenovo/i, /IdeaPad/i, /Yoga/i],
  ASUS: [/ASUS/i, /VivoBook/i, /ZenBook/i],
  Acer: [/Acer/i, /Aspire/i, /Predator/i],
};

function extractAndroidModel(ua: string): string {
  const modelMatch = ua.match(/; (?:Android )?([^;)]+?)(?: Build\/|[;)])/);
  if (modelMatch) {
    let model = (modelMatch[1] ?? '').trim();
    model = model.replace(/_/g, ' ');
    const parts = model.split(/\s+/);
    if (parts.length > 2) {
      for (let i = parts.length; i > 0; i--) {
        const candidate = parts.slice(0, i).join(' ');
        if (/[A-Z]/.test(candidate[0] ?? '') || /\d/.test(candidate)) {
          return candidate;
        }
      }
    }
    return model;
  }
  const buildMatch = ua.match(/Build\/([A-Z0-9.]+)/);
  if (buildMatch) return buildMatch[1] ?? 'Unknown';
  return 'Unknown';
}

function extractIosModel(ua: string): string {
  if (ua.includes('iPhone')) {
    const match = ua.match(/iPhone(\d+,\d+)/);
    if (match) {
      const parts = (match[1] ?? '0,0').split(',');
      const major = parseInt(parts[0] ?? '0');
      if (major >= 15) return 'iPhone 16';
      if (major >= 14) return 'iPhone 15';
      if (major >= 13) return 'iPhone 14';
      if (major >= 12) return 'iPhone 13';
      if (major >= 11) return 'iPhone 12';
      if (major >= 10) return 'iPhone X';
      if (major >= 9) return 'iPhone 7/8';
      if (major >= 8) return 'iPhone 6';
      return 'iPhone';
    }
    return 'iPhone';
  }
  if (ua.includes('iPad')) {
    const match = ua.match(/iPad(\d+,\d+)/);
    if (match) return `iPad (${match[1]})`;
    return 'iPad';
  }
  return 'iOS Device';
}

function detectBrandFromUA(ua: string): string | null {
  const allBrands = { ...ANDROID_BRANDS, ...IOS_BRANDS, ...DESKTOP_BRANDS };
  for (const [brand, patterns] of Object.entries(allBrands)) {
    for (const pattern of patterns) {
      if (pattern.test(ua)) return brand;
    }
  }
  return null;
}

function detectDesktopModel(ua: string): string {
  if (ua.includes('Windows')) {
    if (ua.includes('Surface')) return 'Surface';
    if (ua.includes('WOW64') || ua.includes('Win64')) return 'PC (64-bit)';
    return 'PC';
  }
  if (ua.includes('Macintosh') || ua.includes('Mac OS X')) return 'Mac';
  if (ua.includes('CrOS')) return 'Chromebook';
  if (ua.includes('Linux')) return 'Linux PC';
  return 'Desktop';
}

export function parseDeviceBrandModel(ua: string): DeviceBrandModel {
  const lower = ua.toLowerCase();

  if (lower.includes('iphone') || lower.includes('ipad') || lower.includes('ipod')) {
    const model = extractIosModel(ua);
    return { brand: 'Apple', model, marketingName: model };
  }

  if (lower.includes('android')) {
    let brand = detectBrandFromUA(ua) || 'Android';
    const rawModel = extractAndroidModel(ua);

    let model = rawModel;
    let marketingName = rawModel;

    if (brand === 'Samsung' || ua.includes('SM-')) {
      const modelCode = ua.match(/SM-[A-Z0-9]+/i);
      if (modelCode) {
        model = modelCode[0].toUpperCase();
        marketingName = samsungModelName(model) || model;
      }
    }

    if (brand === 'Xiaomi' || brand === 'Redmi' || lower.includes('mi ') || lower.includes('redmi')) {
      brand = 'Xiaomi';
      const miMatch = ua.match(/(?:Mi|Redmi|POCO)\s*(\w+)/i);
      if (miMatch) {
        model = miMatch[0];
        marketingName = model;
      }
    }

    if (brand === 'Google' && lower.includes('pixel')) {
      const pixelMatch = ua.match(/Pixel\s*(\d[^\s;)]*)/i);
      if (pixelMatch) {
        model = `Pixel ${pixelMatch[1]}`;
        marketingName = model;
      } else {
        model = 'Pixel';
        marketingName = 'Pixel';
      }
    }

    if (!model || model === 'Unknown') {
      model = 'Android Device';
      marketingName = 'Android Device';
    }

    return { brand, model, marketingName };
  }

  const brand = detectBrandFromUA(ua) || detectOSBrand(ua);
  const model = detectDesktopModel(ua);

  return {
    brand: brand || 'Unknown',
    model,
    marketingName: brand ? `${brand} ${model}` : model,
  };
}

function detectOSBrand(ua: string): string {
  if (ua.includes('Windows')) return 'Microsoft';
  if (ua.includes('Macintosh') || ua.includes('Mac OS X')) return 'Apple';
  if (ua.includes('CrOS') || ua.includes('Chromebook')) return 'Google';
  if (ua.includes('Linux')) return 'Linux';
  return '';
}

const SAMSUNG_MODELS: Record<string, string> = {
  'SM-A015': 'Galaxy A01',
  'SM-A025': 'Galaxy A02s',
  'SM-A035': 'Galaxy A03s',
  'SM-A045': 'Galaxy A04s',
  'SM-A055': 'Galaxy A05s',
  'SM-A105': 'Galaxy A10',
  'SM-A107': 'Galaxy A10s',
  'SM-A115': 'Galaxy A11',
  'SM-A125': 'Galaxy A12',
  'SM-A135': 'Galaxy A13',
  'SM-A145': 'Galaxy A14',
  'SM-A155': 'Galaxy A15',
  'SM-A156': 'Galaxy A15 5G',
  'SM-A165': 'Galaxy A16',
  'SM-A205': 'Galaxy A20',
  'SM-A207': 'Galaxy A20s',
  'SM-A215': 'Galaxy A21',
  'SM-A217': 'Galaxy A21s',
  'SM-A225': 'Galaxy A22',
  'SM-A226': 'Galaxy A22 5G',
  'SM-A235': 'Galaxy A23',
  'SM-A236': 'Galaxy A23 5G',
  'SM-A245': 'Galaxy A24',
  'SM-A255': 'Galaxy A25',
  'SM-A265': 'Galaxy A26',
  'SM-A305': 'Galaxy A30',
  'SM-A307': 'Galaxy A30s',
  'SM-A315': 'Galaxy A31',
  'SM-A325': 'Galaxy A32',
  'SM-A326': 'Galaxy A32 5G',
  'SM-A335': 'Galaxy A33',
  'SM-A345': 'Galaxy A34',
  'SM-A346': 'Galaxy A34 5G',
  'SM-A355': 'Galaxy A35',
  'SM-A356': 'Galaxy A35 5G',
  'SM-A365': 'Galaxy A36',
  'SM-A505': 'Galaxy A50',
  'SM-A507': 'Galaxy A50s',
  'SM-A515': 'Galaxy A51',
  'SM-A516': 'Galaxy A51 5G',
  'SM-A525': 'Galaxy A52',
  'SM-A526': 'Galaxy A52 5G',
  'SM-A535': 'Galaxy A53',
  'SM-A536': 'Galaxy A53 5G',
  'SM-A545': 'Galaxy A54',
  'SM-A546': 'Galaxy A54 5G',
  'SM-A555': 'Galaxy A55',
  'SM-A556': 'Galaxy A55 5G',
  'SM-A565': 'Galaxy A56',
  'SM-A605': 'Galaxy A6+',
  'SM-A705': 'Galaxy A70',
  'SM-A715': 'Galaxy A71',
  'SM-A725': 'Galaxy A72',
  'SM-A735': 'Galaxy A73',
  'SM-A750': 'Galaxy A7',
  'SM-A805': 'Galaxy A80',
  'SM-A905': 'Galaxy A90',
  'SM-F700': 'Galaxy Z Flip',
  'SM-F711': 'Galaxy Z Flip3',
  'SM-F721': 'Galaxy Z Flip4',
  'SM-F731': 'Galaxy Z Flip5',
  'SM-F741': 'Galaxy Z Flip6',
  'SM-F900': 'Galaxy Fold',
  'SM-F916': 'Galaxy Z Fold2',
  'SM-F926': 'Galaxy Z Fold3',
  'SM-F936': 'Galaxy Z Fold4',
  'SM-F946': 'Galaxy Z Fold5',
  'SM-F956': 'Galaxy Z Fold6',
  'SM-G960': 'Galaxy S9',
  'SM-G965': 'Galaxy S9+',
  'SM-G970': 'Galaxy S10e',
  'SM-G973': 'Galaxy S10',
  'SM-G975': 'Galaxy S10+',
  'SM-G977': 'Galaxy S10 5G',
  'SM-G780': 'Galaxy S20 FE',
  'SM-G781': 'Galaxy S20 FE 5G',
  'SM-G980': 'Galaxy S20',
  'SM-G985': 'Galaxy S20+',
  'SM-G988': 'Galaxy S20 Ultra',
  'SM-G990': 'Galaxy S21 FE',
  'SM-G991': 'Galaxy S21',
  'SM-G996': 'Galaxy S21+',
  'SM-G998': 'Galaxy S21 Ultra',
  'SM-S901': 'Galaxy S22',
  'SM-S906': 'Galaxy S22+',
  'SM-S908': 'Galaxy S22 Ultra',
  'SM-S911': 'Galaxy S23',
  'SM-S916': 'Galaxy S23+',
  'SM-S918': 'Galaxy S23 Ultra',
  'SM-S921': 'Galaxy S24',
  'SM-S926': 'Galaxy S24+',
  'SM-S928': 'Galaxy S24 Ultra',
  'SM-S931': 'Galaxy S25',
  'SM-S936': 'Galaxy S25+',
  'SM-S938': 'Galaxy S25 Ultra',
  'SM-M315': 'Galaxy M31',
  'SM-M515': 'Galaxy M51',
  'SM-N960': 'Galaxy Note9',
  'SM-N970': 'Galaxy Note10',
  'SM-N971': 'Galaxy Note10 5G',
  'SM-N975': 'Galaxy Note10+',
  'SM-N976': 'Galaxy Note10+ 5G',
  'SM-N980': 'Galaxy Note20',
  'SM-N981': 'Galaxy Note20 5G',
  'SM-N985': 'Galaxy Note20+',
  'SM-N986': 'Galaxy Note20 Ultra',
  'SM-T500': 'Galaxy Tab A7',
  'SM-T505': 'Galaxy Tab A7 LTE',
  'SM-T510': 'Galaxy Tab A 10.1',
  'SM-T515': 'Galaxy Tab A 10.5',
  'SM-T720': 'Galaxy Tab S6',
  'SM-T725': 'Galaxy Tab S6 5G',
  'SM-T860': 'Galaxy Tab S6',
  'SM-T865': 'Galaxy Tab S6',
  'SM-T870': 'Galaxy Tab S7',
  'SM-T875': 'Galaxy Tab S7+',
  'SM-T900': 'Galaxy Tab S8 Ultra',
  'SM-T970': 'Galaxy Tab S8+',
};

function samsungModelName(modelCode: string): string | null {
  const prefix = modelCode.slice(0, 7);
  if (SAMSUNG_MODELS[prefix]) return SAMSUNG_MODELS[prefix];
  const shorter = modelCode.slice(0, 6);
  if (SAMSUNG_MODELS[shorter]) return SAMSUNG_MODELS[shorter];
  const shorter5 = modelCode.slice(0, 5);
  if (SAMSUNG_MODELS[shorter5]) return SAMSUNG_MODELS[shorter5];
  return null;
}
