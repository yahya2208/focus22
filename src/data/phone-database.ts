export interface PhoneModel {
  readonly model: string;
  readonly year: number;
}

export interface PhoneBrand {
  readonly brand: string;
  readonly models: readonly PhoneModel[];
}

export const PHONE_DATABASE: readonly PhoneBrand[] = [
  {
    brand: 'Apple',
    models: [
      { model: 'iPhone 16 Pro Max', year: 2024 },
      { model: 'iPhone 16 Pro', year: 2024 },
      { model: 'iPhone 16 Plus', year: 2024 },
      { model: 'iPhone 16', year: 2024 },
      { model: 'iPhone 15 Pro Max', year: 2023 },
      { model: 'iPhone 15 Pro', year: 2023 },
      { model: 'iPhone 15 Plus', year: 2023 },
      { model: 'iPhone 15', year: 2023 },
      { model: 'iPhone 14 Pro Max', year: 2022 },
      { model: 'iPhone 14 Pro', year: 2022 },
      { model: 'iPhone 14', year: 2022 },
      { model: 'iPhone 13 Pro Max', year: 2021 },
      { model: 'iPhone 13 Pro', year: 2021 },
      { model: 'iPhone 13', year: 2021 },
      { model: 'iPhone 13 mini', year: 2021 },
      { model: 'iPhone 12 Pro Max', year: 2020 },
      { model: 'iPhone 12 Pro', year: 2020 },
      { model: 'iPhone 12', year: 2020 },
      { model: 'iPhone 12 mini', year: 2020 },
      { model: 'iPhone SE (3rd gen)', year: 2022 },
      { model: 'iPhone SE (2nd gen)', year: 2020 },
    ],
  },
  {
    brand: 'Samsung',
    models: [
      { model: 'Galaxy S25 Ultra', year: 2025 },
      { model: 'Galaxy S25+', year: 2025 },
      { model: 'Galaxy S25', year: 2025 },
      { model: 'Galaxy S24 Ultra', year: 2024 },
      { model: 'Galaxy S24+', year: 2024 },
      { model: 'Galaxy S24', year: 2024 },
      { model: 'Galaxy S23 Ultra', year: 2023 },
      { model: 'Galaxy S23+', year: 2023 },
      { model: 'Galaxy S23', year: 2023 },
      { model: 'Galaxy S22 Ultra', year: 2022 },
      { model: 'Galaxy S22+', year: 2022 },
      { model: 'Galaxy S22', year: 2022 },
      { model: 'Galaxy Z Fold6', year: 2024 },
      { model: 'Galaxy Z Flip6', year: 2024 },
      { model: 'Galaxy Z Fold5', year: 2023 },
      { model: 'Galaxy Z Flip5', year: 2023 },
      { model: 'Galaxy A55', year: 2024 },
      { model: 'Galaxy A54', year: 2023 },
      { model: 'Galaxy A35', year: 2024 },
      { model: 'Galaxy A34', year: 2023 },
      { model: 'Galaxy A15', year: 2024 },
      { model: 'Galaxy A05s', year: 2023 },
    ],
  },
  {
    brand: 'Xiaomi',
    models: [
      { model: '15 Ultra', year: 2025 },
      { model: '15 Pro', year: 2025 },
      { model: '15', year: 2025 },
      { model: '14 Ultra', year: 2024 },
      { model: '14 Pro', year: 2024 },
      { model: '14', year: 2024 },
      { model: '13 Ultra', year: 2023 },
      { model: '13 Pro', year: 2023 },
      { model: '13', year: 2023 },
      { model: 'Redmi Note 14 Pro+', year: 2025 },
      { model: 'Redmi Note 14 Pro', year: 2025 },
      { model: 'Redmi Note 14', year: 2025 },
      { model: 'Redmi Note 13 Pro+', year: 2024 },
      { model: 'Redmi Note 13 Pro', year: 2024 },
      { model: 'Redmi Note 13', year: 2024 },
      { model: 'POCO F6 Pro', year: 2024 },
      { model: 'POCO F6', year: 2024 },
      { model: 'POCO X6 Pro', year: 2024 },
      { model: 'POCO X6', year: 2024 },
    ],
  },
  {
    brand: 'Huawei',
    models: [
      { model: 'Pura 70 Ultra', year: 2024 },
      { model: 'Pura 70 Pro+', year: 2024 },
      { model: 'Pura 70 Pro', year: 2024 },
      { model: 'Pura 70', year: 2024 },
      { model: 'Mate 60 Pro+', year: 2023 },
      { model: 'Mate 60 Pro', year: 2023 },
      { model: 'Mate 60', year: 2023 },
      { model: 'P60 Pro', year: 2023 },
      { model: 'P60', year: 2023 },
      { model: 'Nova 12 Pro', year: 2024 },
      { model: 'Nova 12', year: 2024 },
      { model: 'Nova 11', year: 2023 },
    ],
  },
  {
    brand: 'OnePlus',
    models: [
      { model: '13', year: 2025 },
      { model: '12', year: 2024 },
      { model: '11', year: 2023 },
      { model: 'Nord 4', year: 2024 },
      { model: 'Nord 3', year: 2023 },
      { model: 'Nord CE4', year: 2024 },
      { model: 'Nord CE3', year: 2023 },
    ],
  },
  {
    brand: 'Google',
    models: [
      { model: 'Pixel 9 Pro XL', year: 2024 },
      { model: 'Pixel 9 Pro', year: 2024 },
      { model: 'Pixel 9', year: 2024 },
      { model: 'Pixel 8 Pro', year: 2023 },
      { model: 'Pixel 8', year: 2023 },
      { model: 'Pixel 8a', year: 2024 },
      { model: 'Pixel 7 Pro', year: 2022 },
      { model: 'Pixel 7', year: 2022 },
      { model: 'Pixel 7a', year: 2023 },
    ],
  },
  {
    brand: 'Oppo',
    models: [
      { model: 'Find X7 Ultra', year: 2024 },
      { model: 'Find X7', year: 2024 },
      { model: 'Find X6 Pro', year: 2023 },
      { model: 'Reno 12 Pro', year: 2024 },
      { model: 'Reno 12', year: 2024 },
      { model: 'Reno 11 Pro', year: 2024 },
      { model: 'Reno 11', year: 2024 },
      { model: 'A3 Pro', year: 2024 },
    ],
  },
  {
    brand: 'Vivo',
    models: [
      { model: 'X200 Pro', year: 2024 },
      { model: 'X200', year: 2024 },
      { model: 'X100 Pro', year: 2023 },
      { model: 'X100', year: 2023 },
      { model: 'V30 Pro', year: 2024 },
      { model: 'V30', year: 2024 },
      { model: 'Y36', year: 2023 },
    ],
  },
  {
    brand: 'Realme',
    models: [
      { model: 'GT 6 Pro', year: 2024 },
      { model: 'GT 6', year: 2024 },
      { model: 'GT 5 Pro', year: 2023 },
      { model: '12 Pro+', year: 2024 },
      { model: '12 Pro', year: 2024 },
      { model: '12', year: 2024 },
      { model: 'C67', year: 2024 },
    ],
  },
  {
    brand: 'Nothing',
    models: [
      { model: 'Phone (2a) Plus', year: 2024 },
      { model: 'Phone (2a)', year: 2024 },
      { model: 'Phone (2)', year: 2023 },
      { model: 'Phone (1)', year: 2022 },
    ],
  },
  {
    brand: 'Honor',
    models: [
      { model: 'Magic7 Pro', year: 2025 },
      { model: 'Magic7', year: 2025 },
      { model: 'Magic6 Pro', year: 2024 },
      { model: 'Magic6', year: 2024 },
      { model: '200 Pro', year: 2024 },
      { model: '200', year: 2024 },
      { model: 'X8b', year: 2024 },
    ],
  },
  {
    brand: 'Motorola',
    models: [
      { model: 'Edge 50 Pro', year: 2024 },
      { model: 'Edge 50 Ultra', year: 2024 },
      { model: 'Edge 50 Fusion', year: 2024 },
      { model: 'Moto G84', year: 2023 },
      { model: 'Moto G54', year: 2023 },
      { model: 'Razr+ (2024)', year: 2024 },
      { model: 'Razr (2024)', year: 2024 },
    ],
  },
  {
    brand: 'Tecno',
    models: [
      { model: 'Phantom V Fold2', year: 2024 },
      { model: 'Phantom V Flip', year: 2023 },
      { model: 'Camon 30 Pro', year: 2024 },
      { model: 'Camon 30', year: 2024 },
      { model: 'Spark 20 Pro+', year: 2024 },
    ],
  },
  {
    brand: 'Infinix',
    models: [
      { model: 'Zero 40', year: 2024 },
      { model: 'Note 40 Pro', year: 2024 },
      { model: 'Note 40', year: 2024 },
      { model: 'Hot 40 Pro', year: 2024 },
      { model: 'Hot 40', year: 2024 },
    ],
  },
] as const;

export function getBrandNames(): readonly string[] {
  return PHONE_DATABASE.map((b) => b.brand);
}

export function getModelsForBrand(brand: string): readonly PhoneModel[] {
  return PHONE_DATABASE.find((b) => b.brand === brand)?.models ?? [];
}
