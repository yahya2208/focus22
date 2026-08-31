/**
 * Master Product Catalog — seed data (ICONs.md, 8 of 18 categories).
 *
 * Generated faithfully from the Perplexity `ICONs.md` (the corrected sequential
 * parts PART 1..8: vegetables, fruits, grocery-dry, breakfast, bread-bakery,
 * sweets-snacks, dairy, meat-poultry-eggs). IDs, AR/FR/EN names, emoji icons,
 * aliases, default_unit and sort_order are preserved exactly — nothing renamed
 * or re-typed. This is a DATA-ONLY seed: no prices, no stock, no brands, no
 * variants (Master Catalog contract).
 *
 * EXTENSIBILITY: when Perplexity delivers the remaining 10 categories, add them
 * here as additional entries in `MASTER_CATALOG.categories` (or merge a fresh
 * dump) — no type/architecture change required.
 */

import type { MasterCatalog } from './types';

export const MASTER_CATALOG: MasterCatalog = {
  categories: [
  {
    "id": "vegetables",
    "name_ar": "الخضر",
    "name_fr": "Légumes",
    "icon": "🥬",
    "sort_order": 1,
    "subcategories": [
      {
        "id": "vegetables-root",
        "category_id": "vegetables",
        "name_ar": "الخضر الجذرية",
        "name_fr": "Légumes racines",
        "icon": "🥔",
        "sort_order": 1,
        "products": [
          {
            "id": "vegetables-root-potato",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-root",
            "name_ar": "بطاطا",
            "name_fr": "Pomme de terre",
            "name_en": "Potato",
            "icon": "🥔",
            "aliases_ar": [
              "بطاطس"
            ],
            "aliases_fr": [
              "Patate"
            ],
            "default_unit": "kg",
            "sort_order": 1
          },
          {
            "id": "vegetables-root-carrot",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-root",
            "name_ar": "جزر",
            "name_fr": "Carotte",
            "name_en": "Carrot",
            "icon": "🥕",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 2
          },
          {
            "id": "vegetables-root-onion",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-root",
            "name_ar": "بصل",
            "name_fr": "Oignon",
            "name_en": "Onion",
            "icon": "🧅",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 3
          },
          {
            "id": "vegetables-root-garlic",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-root",
            "name_ar": "ثوم",
            "name_fr": "Ail",
            "name_en": "Garlic",
            "icon": "🧄",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 4
          },
          {
            "id": "vegetables-root-beet",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-root",
            "name_ar": "شمندر",
            "name_fr": "Betterave",
            "name_en": "Beetroot",
            "icon": "🍠",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 5
          },
          {
            "id": "vegetables-root-turnip",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-root",
            "name_ar": "لفت",
            "name_fr": "Navet",
            "name_en": "Turnip",
            "icon": "🥬",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 6
          },
          {
            "id": "vegetables-root-radish",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-root",
            "name_ar": "فجل",
            "name_fr": "Radis",
            "name_en": "Radish",
            "icon": "🔴",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 7
          },
          {
            "id": "vegetables-root-celeriac",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-root",
            "name_ar": "كرفس جذري",
            "name_fr": "Céleri-rave",
            "name_en": "Celeriac",
            "icon": "🥬",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 8
          },
          {
            "id": "vegetables-root-ginger",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-root",
            "name_ar": "زنجبيل طازج",
            "name_fr": "Gingembre frais",
            "name_en": "Fresh ginger",
            "icon": "🫚",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 9
          }
        ]
      },
      {
        "id": "vegetables-fruit",
        "category_id": "vegetables",
        "name_ar": "خضر ثمرية",
        "name_fr": "Légumes fruits",
        "icon": "🍅",
        "sort_order": 2,
        "products": [
          {
            "id": "vegetables-fruit-tomato",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-fruit",
            "name_ar": "طماطم",
            "name_fr": "Tomate",
            "name_en": "Tomato",
            "icon": "🍅",
            "aliases_ar": [],
            "aliases_fr": [
              "Tomates",
              "Tomate fraîche"
            ],
            "default_unit": "kg",
            "sort_order": 1
          },
          {
            "id": "vegetables-fruit-pepper",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-fruit",
            "name_ar": "فلفل حلو",
            "name_fr": "Poivron",
            "name_en": "Bell pepper",
            "icon": "🫑",
            "aliases_ar": [
              "فلفل أخضر",
              "فلفل أحمر",
              "فلفل أصفر"
            ],
            "aliases_fr": [
              "Poivron vert",
              "Poivron rouge",
              "Poivron jaune"
            ],
            "default_unit": "kg",
            "sort_order": 2
          },
          {
            "id": "vegetables-fruit-chili",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-fruit",
            "name_ar": "فلفل حار",
            "name_fr": "Piment",
            "name_en": "Chili pepper",
            "icon": "🌶️",
            "aliases_ar": [
              "شيطا",
              "فلفل حار"
            ],
            "aliases_fr": [
              "Piment fort"
            ],
            "default_unit": "kg",
            "sort_order": 3
          },
          {
            "id": "vegetables-fruit-zucchini",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-fruit",
            "name_ar": "كوسة",
            "name_fr": "Courgette",
            "name_en": "Zucchini",
            "icon": "🥒",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 4
          },
          {
            "id": "vegetables-fruit-eggplant",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-fruit",
            "name_ar": "باذنجان",
            "name_fr": "Aubergine",
            "name_en": "Eggplant",
            "icon": "🍆",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 5
          },
          {
            "id": "vegetables-fruit-cucumber",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-fruit",
            "name_ar": "خيار",
            "name_fr": "Concombre",
            "name_en": "Cucumber",
            "icon": "🥒",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 6
          },
          {
            "id": "vegetables-fruit-okra",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-fruit",
            "name_ar": "ملوخية",
            "name_fr": "Gombo",
            "name_en": "Okra",
            "icon": "🥬",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 7
          },
          {
            "id": "vegetables-fruit-pumpkin",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-fruit",
            "name_ar": "يقطين",
            "name_fr": "Citrouille",
            "name_en": "Pumpkin",
            "icon": "🎃",
            "aliases_ar": [
              "قرع"
            ],
            "aliases_fr": [
              "Potiron"
            ],
            "default_unit": "kg",
            "sort_order": 8
          },
          {
            "id": "vegetables-fruit-squash",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-fruit",
            "name_ar": "قرع",
            "name_fr": "Courge",
            "name_en": "Squash",
            "icon": "🎃",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 9
          }
        ]
      },
      {
        "id": "vegetables-leafy",
        "category_id": "vegetables",
        "name_ar": "خضر ورقية",
        "name_fr": "Légumes feuilles",
        "icon": "🥬",
        "sort_order": 3,
        "products": [
          {
            "id": "vegetables-leafy-lettuce",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-leafy",
            "name_ar": "خس",
            "name_fr": "Laitue",
            "name_en": "Lettuce",
            "icon": "🥬",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 1
          },
          {
            "id": "vegetables-leafy-spinach",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-leafy",
            "name_ar": "سبانخ",
            "name_fr": "Épinards",
            "name_en": "Spinach",
            "icon": "🥬",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 2
          },
          {
            "id": "vegetables-leafy-cabbage",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-leafy",
            "name_ar": "ملفوف",
            "name_fr": "Chou",
            "name_en": "Cabbage",
            "icon": "🥬",
            "aliases_ar": [
              "كرنب"
            ],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 3
          },
          {
            "id": "vegetables-leafy-cauliflower",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-leafy",
            "name_ar": "قرنبيط",
            "name_fr": "Chou-fleur",
            "name_en": "Cauliflower",
            "icon": "🥦",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 4
          },
          {
            "id": "vegetables-leafy-broccoli",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-leafy",
            "name_ar": "بروكولي",
            "name_fr": "Brocoli",
            "name_en": "Broccoli",
            "icon": "🥦",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 5
          },
          {
            "id": "vegetables-leafy-parsley",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-leafy",
            "name_ar": "بقدونس",
            "name_fr": "Persil",
            "name_en": "Parsley",
            "icon": "🌿",
            "aliases_ar": [
              "معدنوس"
            ],
            "aliases_fr": [],
            "default_unit": "botte",
            "sort_order": 6
          },
          {
            "id": "vegetables-leafy-coriander",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-leafy",
            "name_ar": "كزبرة",
            "name_fr": "Coriandre",
            "name_en": "Coriander",
            "icon": "🌿",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "botte",
            "sort_order": 7
          },
          {
            "id": "vegetables-leafy-mint",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-leafy",
            "name_ar": "نعناع",
            "name_fr": "Menthe",
            "name_en": "Mint",
            "icon": "🌿",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "botte",
            "sort_order": 8
          },
          {
            "id": "vegetables-leafy-arugula",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-leafy",
            "name_ar": "جرجير",
            "name_fr": "Roquette",
            "name_en": "Arugula",
            "icon": "🥬",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "botte",
            "sort_order": 9
          },
          {
            "id": "vegetables-leafy-chard",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-leafy",
            "name_ar": "سلق",
            "name_fr": "Bettes",
            "name_en": "Swiss chard",
            "icon": "🥬",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "botte",
            "sort_order": 10
          },
          {
            "id": "vegetables-leafy-celery",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-leafy",
            "name_ar": "كرفس",
            "name_fr": "Céleri",
            "name_en": "Celery",
            "icon": "🌿",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "botte",
            "sort_order": 11
          },
          {
            "id": "vegetables-leafy-leek",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-leafy",
            "name_ar": "كراث",
            "name_fr": "Poireau",
            "name_en": "Leek",
            "icon": "🌿",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "botte",
            "sort_order": 12
          },
          {
            "id": "vegetables-leafy-fennel",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-leafy",
            "name_ar": "شومر",
            "name_fr": "Fenouil",
            "name_en": "Fennel",
            "icon": "🌿",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 13
          }
        ]
      },
      {
        "id": "vegetables-legumes-fresh",
        "category_id": "vegetables",
        "name_ar": "بقوليات طازجة",
        "name_fr": "Légumineuses fraîches",
        "icon": "🫛",
        "sort_order": 4,
        "products": [
          {
            "id": "vegetables-legumes-fresh-green-beans",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-legumes-fresh",
            "name_ar": "فاصوليا خضراء",
            "name_fr": "Haricots verts",
            "name_en": "Green beans",
            "icon": "🫛",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 1
          },
          {
            "id": "vegetables-legumes-fresh-peas",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-legumes-fresh",
            "name_ar": "بازلاء طازجة",
            "name_fr": "Petits pois frais",
            "name_en": "Fresh peas",
            "icon": "🫛",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 2
          },
          {
            "id": "vegetables-legumes-fresh-fava",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-legumes-fresh",
            "name_ar": "فول طازج",
            "name_fr": "Fèves fraîches",
            "name_en": "Fresh fava beans",
            "icon": "🫛",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 3
          },
          {
            "id": "vegetables-legumes-fresh-chickpeas-fresh",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-legumes-fresh",
            "name_ar": "حمص طازج",
            "name_fr": "Pois chiches frais",
            "name_en": "Fresh chickpeas",
            "icon": "🫛",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 4
          }
        ]
      },
      {
        "id": "vegetables-other",
        "category_id": "vegetables",
        "name_ar": "خضر أخرى",
        "name_fr": "Autres légumes",
        "icon": "🥕",
        "sort_order": 5,
        "products": [
          {
            "id": "vegetables-other-mushroom",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-other",
            "name_ar": "فطر طازج",
            "name_fr": "Champignons frais",
            "name_en": "Fresh mushrooms",
            "icon": "🍄",
            "aliases_ar": [
              "مشروم"
            ],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 1
          },
          {
            "id": "vegetables-other-asparagus",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-other",
            "name_ar": "هليون",
            "name_fr": "Asperges",
            "name_en": "Asparagus",
            "icon": "🌱",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 2
          },
          {
            "id": "vegetables-other-artichoke",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-other",
            "name_ar": "أرضي شوكي",
            "name_fr": "Artichaut",
            "name_en": "Artichoke",
            "icon": "🥬",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 3
          },
          {
            "id": "vegetables-other-avocado",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-other",
            "name_ar": "أفوكادو",
            "name_fr": "Avocat",
            "name_en": "Avocado",
            "icon": "🥑",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 4
          },
          {
            "id": "vegetables-other-corn-fresh",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-other",
            "name_ar": "ذرة طازجة",
            "name_fr": "Maïs frais",
            "name_en": "Fresh corn",
            "icon": "🌽",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 5
          },
          {
            "id": "vegetables-other-olives-fresh",
            "category_id": "vegetables",
            "subcategory_id": "vegetables-other",
            "name_ar": "زيتون طازج",
            "name_fr": "Olives fraîches",
            "name_en": "Fresh olives",
            "icon": "🫒",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 6
          }
        ]
      }
    ]
  },
  {
    "id": "fruits",
    "name_ar": "الفواكه",
    "name_fr": "Fruits",
    "icon": "🍎",
    "sort_order": 2,
    "subcategories": [
      {
        "id": "fruits-citrus",
        "category_id": "fruits",
        "name_ar": "الحمضيات",
        "name_fr": "Agrumes",
        "icon": "🍊",
        "sort_order": 1,
        "products": [
          {
            "id": "fruits-citrus-orange",
            "category_id": "fruits",
            "subcategory_id": "fruits-citrus",
            "name_ar": "برتقال",
            "name_fr": "Orange",
            "name_en": "Orange",
            "icon": "🍊",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 1
          },
          {
            "id": "fruits-citrus-lemon",
            "category_id": "fruits",
            "subcategory_id": "fruits-citrus",
            "name_ar": "ليمون",
            "name_fr": "Citron",
            "name_en": "Lemon",
            "icon": "🍋",
            "aliases_ar": [
              "حامض"
            ],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 2
          },
          {
            "id": "fruits-citrus-mandarin",
            "category_id": "fruits",
            "subcategory_id": "fruits-citrus",
            "name_ar": "يوسفي",
            "name_fr": "Clémentine",
            "name_en": "Mandarin",
            "icon": "🍊",
            "aliases_ar": [
              "كليمنتين"
            ],
            "aliases_fr": [
              "Mandarine"
            ],
            "default_unit": "kg",
            "sort_order": 3
          },
          {
            "id": "fruits-citrus-grapefruit",
            "category_id": "fruits",
            "subcategory_id": "fruits-citrus",
            "name_ar": "جريب فروت",
            "name_fr": "Pamplemousse",
            "name_en": "Grapefruit",
            "icon": "🍈",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 4
          },
          {
            "id": "fruits-citrus-lime",
            "category_id": "fruits",
            "subcategory_id": "fruits-citrus",
            "name_ar": "ليمون حامض",
            "name_fr": "Lime",
            "name_en": "Lime",
            "icon": "🍋",
            "aliases_ar": [
              "ليمون بلدي"
            ],
            "aliases_fr": [
              "Citron vert"
            ],
            "default_unit": "kg",
            "sort_order": 5
          },
          {
            "id": "fruits-citrus-clementine",
            "category_id": "fruits",
            "subcategory_id": "fruits-citrus",
            "name_ar": "كليمنتين",
            "name_fr": "Clémentine",
            "name_en": "Clementine",
            "icon": "🍊",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 6
          },
          {
            "id": "fruits-citrus-tangerine",
            "category_id": "fruits",
            "subcategory_id": "fruits-citrus",
            "name_ar": "طنجة",
            "name_fr": "Tangerine",
            "name_en": "Tangerine",
            "icon": "🍊",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 7
          }
        ]
      },
      {
        "id": "fruits-common",
        "category_id": "fruits",
        "name_ar": "فواكه شائعة",
        "name_fr": "Fruits communs",
        "icon": "🍎",
        "sort_order": 2,
        "products": [
          {
            "id": "fruits-common-apple",
            "category_id": "fruits",
            "subcategory_id": "fruits-common",
            "name_ar": "تفاح",
            "name_fr": "Pomme",
            "name_en": "Apple",
            "icon": "🍎",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 1
          },
          {
            "id": "fruits-common-banana",
            "category_id": "fruits",
            "subcategory_id": "fruits-common",
            "name_ar": "موز",
            "name_fr": "Banane",
            "name_en": "Banana",
            "icon": "🍌",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 2
          },
          {
            "id": "fruits-common-grape",
            "category_id": "fruits",
            "subcategory_id": "fruits-common",
            "name_ar": "عنب",
            "name_fr": "Raisin",
            "name_en": "Grape",
            "icon": "🍇",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 3
          },
          {
            "id": "fruits-common-strawberry",
            "category_id": "fruits",
            "subcategory_id": "fruits-common",
            "name_ar": "فراولة",
            "name_fr": "Fraise",
            "name_en": "Strawberry",
            "icon": "🍓",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 4
          },
          {
            "id": "fruits-common-watermelon",
            "category_id": "fruits",
            "subcategory_id": "fruits-common",
            "name_ar": "بطيخ",
            "name_fr": "Pastèque",
            "name_en": "Watermelon",
            "icon": "🍉",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 5
          },
          {
            "id": "fruits-common-melon",
            "category_id": "fruits",
            "subcategory_id": "fruits-common",
            "name_ar": "شمام",
            "name_fr": "Melon",
            "name_en": "Melon",
            "icon": "🍈",
            "aliases_ar": [
              "دلاع"
            ],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 6
          },
          {
            "id": "fruits-common-peach",
            "category_id": "fruits",
            "subcategory_id": "fruits-common",
            "name_ar": "خوخ",
            "name_fr": "Pêche",
            "name_en": "Peach",
            "icon": "🍑",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 7
          },
          {
            "id": "fruits-common-apricot",
            "category_id": "fruits",
            "subcategory_id": "fruits-common",
            "name_ar": "مشمش",
            "name_fr": "Abricot",
            "name_en": "Apricot",
            "icon": "🍑",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 8
          },
          {
            "id": "fruits-common-plum",
            "category_id": "fruits",
            "subcategory_id": "fruits-common",
            "name_ar": "برقوق",
            "name_fr": "Prune",
            "name_en": "Plum",
            "icon": "🫐",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 9
          },
          {
            "id": "fruits-common-cherry",
            "category_id": "fruits",
            "subcategory_id": "fruits-common",
            "name_ar": "كرز",
            "name_fr": "Cerise",
            "name_en": "Cherry",
            "icon": "🍒",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 10
          },
          {
            "id": "fruits-common-pear",
            "category_id": "fruits",
            "subcategory_id": "fruits-common",
            "name_ar": "إجاص",
            "name_fr": "Poire",
            "name_en": "Pear",
            "icon": "🍐",
            "aliases_ar": [
              "كمثرى"
            ],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 11
          },
          {
            "id": "fruits-common-fig",
            "category_id": "fruits",
            "subcategory_id": "fruits-common",
            "name_ar": "تين",
            "name_fr": "Figue",
            "name_en": "Fig",
            "icon": "🫐",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 12
          },
          {
            "id": "fruits-common-pomegranate",
            "category_id": "fruits",
            "subcategory_id": "fruits-common",
            "name_ar": "رمان",
            "name_fr": "Grenade",
            "name_en": "Pomegranate",
            "icon": "🔴",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 13
          },
          {
            "id": "fruits-common-kiwi",
            "category_id": "fruits",
            "subcategory_id": "fruits-common",
            "name_ar": "كيوي",
            "name_fr": "Kiwi",
            "name_en": "Kiwi",
            "icon": "🥝",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 14
          },
          {
            "id": "fruits-common-pineapple",
            "category_id": "fruits",
            "subcategory_id": "fruits-common",
            "name_ar": "أناناس",
            "name_fr": "Ananas",
            "name_en": "Pineapple",
            "icon": "🍍",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 15
          },
          {
            "id": "fruits-common-mango",
            "category_id": "fruits",
            "subcategory_id": "fruits-common",
            "name_ar": "مانجو",
            "name_fr": "Mangue",
            "name_en": "Mango",
            "icon": "🥭",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 16
          },
          {
            "id": "fruits-common-nectarine",
            "category_id": "fruits",
            "subcategory_id": "fruits-common",
            "name_ar": "نكتارين",
            "name_fr": "Nectarine",
            "name_en": "Nectarine",
            "icon": "🍑",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 17
          },
          {
            "id": "fruits-common-papaya",
            "category_id": "fruits",
            "subcategory_id": "fruits-common",
            "name_ar": "باباي",
            "name_fr": "Papaye",
            "name_en": "Papaya",
            "icon": "🥭",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 18
          },
          {
            "id": "fruits-common-date-fresh",
            "category_id": "fruits",
            "subcategory_id": "fruits-common",
            "name_ar": "تمر طازج",
            "name_fr": "Dattes fraîches",
            "name_en": "Fresh dates",
            "icon": "🫘",
            "aliases_ar": [
              "دقلة نور"
            ],
            "aliases_fr": [
              "Deglet Nour"
            ],
            "default_unit": "kg",
            "sort_order": 19
          },
          {
            "id": "fruits-common-coconut",
            "category_id": "fruits",
            "subcategory_id": "fruits-common",
            "name_ar": "جوز الهند",
            "name_fr": "Noix de coco",
            "name_en": "Coconut",
            "icon": "🥥",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 20
          },
          {
            "id": "fruits-common-passion-fruit",
            "category_id": "fruits",
            "subcategory_id": "fruits-common",
            "name_ar": "فاكهة العاطفة",
            "name_fr": "Fruit de la passion",
            "name_en": "Passion fruit",
            "icon": "🟣",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 21
          }
        ]
      },
      {
        "id": "fruits-dried",
        "category_id": "fruits",
        "name_ar": "فواكه مجففة",
        "name_fr": "Fruits secs",
        "icon": "🫘",
        "sort_order": 3,
        "products": [
          {
            "id": "fruits-dried-dates",
            "category_id": "fruits",
            "subcategory_id": "fruits-dried",
            "name_ar": "تمر مجفف",
            "name_fr": "Dattes sèches",
            "name_en": "Dried dates",
            "icon": "🫘",
            "aliases_ar": [
              "تمور",
              "دقلة نور"
            ],
            "aliases_fr": [
              "Deglet Nour"
            ],
            "default_unit": "kg",
            "sort_order": 1
          },
          {
            "id": "fruits-dried-raisins",
            "category_id": "fruits",
            "subcategory_id": "fruits-dried",
            "name_ar": "زبيب",
            "name_fr": "Raisins secs",
            "name_en": "Raisins",
            "icon": "🫘",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 2
          },
          {
            "id": "fruits-dried-apricots",
            "category_id": "fruits",
            "subcategory_id": "fruits-dried",
            "name_ar": "مشمش مجفف",
            "name_fr": "Abricots secs",
            "name_en": "Dried apricots",
            "icon": "🫘",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 3
          },
          {
            "id": "fruits-dried-prunes",
            "category_id": "fruits",
            "subcategory_id": "fruits-dried",
            "name_ar": "برقوق مجفف",
            "name_fr": "Pruneaux",
            "name_en": "Prunes",
            "icon": "🫘",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 4
          },
          {
            "id": "fruits-dried-figs",
            "category_id": "fruits",
            "subcategory_id": "fruits-dried",
            "name_ar": "تين مجفف",
            "name_fr": "Figues sèches",
            "name_en": "Dried figs",
            "icon": "🫘",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 5
          },
          {
            "id": "fruits-dried-banana",
            "category_id": "fruits",
            "subcategory_id": "fruits-dried",
            "name_ar": "موز مجفف",
            "name_fr": "Bananes séchées",
            "name_en": "Dried banana",
            "icon": "🫘",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 6
          },
          {
            "id": "fruits-dried-mango",
            "category_id": "fruits",
            "subcategory_id": "fruits-dried",
            "name_ar": "مانجو مجففة",
            "name_fr": "Mangues séchées",
            "name_en": "Dried mango",
            "icon": "🫘",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 7
          },
          {
            "id": "fruits-dried-cranberries",
            "category_id": "fruits",
            "subcategory_id": "fruits-dried",
            "name_ar": "توت بري مجفف",
            "name_fr": "Canneberges séchées",
            "name_en": "Dried cranberries",
            "icon": "🫘",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 8
          }
        ]
      },
      {
        "id": "fruits-nuts",
        "category_id": "fruits",
        "name_ar": "مكسرات",
        "name_fr": "Noix et fruits à coque",
        "icon": "🥜",
        "sort_order": 4,
        "products": [
          {
            "id": "fruits-nuts-almonds",
            "category_id": "fruits",
            "subcategory_id": "fruits-nuts",
            "name_ar": "لوز",
            "name_fr": "Amandes",
            "name_en": "Almonds",
            "icon": "🥜",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 1
          },
          {
            "id": "fruits-nuts-walnuts",
            "category_id": "fruits",
            "subcategory_id": "fruits-nuts",
            "name_ar": "جوز",
            "name_fr": "Noix",
            "name_en": "Walnuts",
            "icon": "🥜",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 2
          },
          {
            "id": "fruits-nuts-hazelnuts",
            "category_id": "fruits",
            "subcategory_id": "fruits-nuts",
            "name_ar": "بندق",
            "name_fr": "Noisettes",
            "name_en": "Hazelnuts",
            "icon": "🥜",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 3
          },
          {
            "id": "fruits-nuts-pistachios",
            "category_id": "fruits",
            "subcategory_id": "fruits-nuts",
            "name_ar": "فستق",
            "name_fr": "Pistaches",
            "name_en": "Pistachios",
            "icon": "🥜",
            "aliases_ar": [
              "فستق حلبي"
            ],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 4
          },
          {
            "id": "fruits-nuts-peanuts",
            "category_id": "fruits",
            "subcategory_id": "fruits-nuts",
            "name_ar": "فول سوداني",
            "name_fr": "Cacahuètes",
            "name_en": "Peanuts",
            "icon": "🥜",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 5
          },
          {
            "id": "fruits-nuts-cashews",
            "category_id": "fruits",
            "subcategory_id": "fruits-nuts",
            "name_ar": "كاجو",
            "name_fr": "Noix de cajou",
            "name_en": "Cashews",
            "icon": "🥜",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 6
          },
          {
            "id": "fruits-nuts-pine-nuts",
            "category_id": "fruits",
            "subcategory_id": "fruits-nuts",
            "name_ar": "صنوبر",
            "name_fr": "Pignons",
            "name_en": "Pine nuts",
            "icon": "🥜",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 7
          },
          {
            "id": "fruits-nuts-brazil-nuts",
            "category_id": "fruits",
            "subcategory_id": "fruits-nuts",
            "name_ar": "جوز برازيلي",
            "name_fr": "Noix du Brésil",
            "name_en": "Brazil nuts",
            "icon": "🥜",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 8
          },
          {
            "id": "fruits-nuts-macadamia",
            "category_id": "fruits",
            "subcategory_id": "fruits-nuts",
            "name_ar": "مكاديميا",
            "name_fr": "Noix de macadamia",
            "name_en": "Macadamia nuts",
            "icon": "🥜",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 9
          },
          {
            "id": "fruits-nuts-pecans",
            "category_id": "fruits",
            "subcategory_id": "fruits-nuts",
            "name_ar": "جوز أمريكي",
            "name_fr": "Noix de pécan",
            "name_en": "Pecans",
            "icon": "🥜",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 10
          },
          {
            "id": "fruits-nuts-chestnuts",
            "category_id": "fruits",
            "subcategory_id": "fruits-nuts",
            "name_ar": "كستناء",
            "name_fr": "Châtaignes",
            "name_en": "Chestnuts",
            "icon": "🌰",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 11
          }
        ]
      },
      {
        "id": "fruits-berries",
        "category_id": "fruits",
        "name_ar": "توتيات",
        "name_fr": "Baies",
        "icon": "🫐",
        "sort_order": 5,
        "products": [
          {
            "id": "fruits-berries-blueberry",
            "category_id": "fruits",
            "subcategory_id": "fruits-berries",
            "name_ar": "توت أزرق",
            "name_fr": "Myrtilles",
            "name_en": "Blueberries",
            "icon": "🫐",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 1
          },
          {
            "id": "fruits-berries-raspberry",
            "category_id": "fruits",
            "subcategory_id": "fruits-berries",
            "name_ar": "توت أحمر",
            "name_fr": "Framboises",
            "name_en": "Raspberries",
            "icon": "🍓",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 2
          },
          {
            "id": "fruits-berries-blackberry",
            "category_id": "fruits",
            "subcategory_id": "fruits-berries",
            "name_ar": "عليق",
            "name_fr": "Mûres",
            "name_en": "Blackberries",
            "icon": "🫐",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 3
          },
          {
            "id": "fruits-berries-cranberry",
            "category_id": "fruits",
            "subcategory_id": "fruits-berries",
            "name_ar": "توت بري",
            "name_fr": "Canneberges",
            "name_en": "Cranberries",
            "icon": "🔴",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 4
          },
          {
            "id": "fruits-berries-mulberry",
            "category_id": "fruits",
            "subcategory_id": "fruits-berries",
            "name_ar": "توت",
            "name_fr": "Mûres",
            "name_en": "Mulberries",
            "icon": "🫐",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 5
          }
        ]
      }
    ]
  },
  {
    "id": "grocery-dry",
    "name_ar": "البقالة الجافة",
    "name_fr": "Épicerie sèche",
    "icon": "🛒",
    "sort_order": 3,
    "subcategories": [
      {
        "id": "grocery-dry-flour-grains",
        "category_id": "grocery-dry",
        "name_ar": "الدقيق والحبوب",
        "name_fr": "Farines et céréales",
        "icon": "🌾",
        "sort_order": 1,
        "products": [
          {
            "id": "grocery-dry-flour-grains-flour",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-flour-grains",
            "name_ar": "فرينة",
            "name_fr": "Farine de blé",
            "name_en": "Wheat flour",
            "icon": "🌾",
            "aliases_ar": [
              "دقيق"
            ],
            "aliases_fr": [
              "Farine"
            ],
            "default_unit": "kg",
            "sort_order": 1
          },
          {
            "id": "grocery-dry-flour-grains-semolina",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-flour-grains",
            "name_ar": "سميد",
            "name_fr": "Semoule",
            "name_en": "Semolina",
            "icon": "🌾",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 2
          },
          {
            "id": "grocery-dry-flour-grains-couscous",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-flour-grains",
            "name_ar": "كسكس",
            "name_fr": "Couscous",
            "name_en": "Couscous",
            "icon": "🌾",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 3
          },
          {
            "id": "grocery-dry-flour-grains-rice-white",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-flour-grains",
            "name_ar": "أرز أبيض",
            "name_fr": "Riz blanc",
            "name_en": "White rice",
            "icon": "🍚",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 4
          },
          {
            "id": "grocery-dry-flour-grains-rice-brown",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-flour-grains",
            "name_ar": "أرز بني",
            "name_fr": "Riz complet",
            "name_en": "Brown rice",
            "icon": "🍚",
            "aliases_ar": [
              "أرز كامل"
            ],
            "aliases_fr": [
              "Riz brun"
            ],
            "default_unit": "kg",
            "sort_order": 5
          },
          {
            "id": "grocery-dry-flour-grains-oats",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-flour-grains",
            "name_ar": "شوفان",
            "name_fr": "Flocons d'avoine",
            "name_en": "Oats",
            "icon": "🌾",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 6
          },
          {
            "id": "grocery-dry-flour-grains-cornmeal",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-flour-grains",
            "name_ar": "فرينة ذرة",
            "name_fr": "Farine de maïs",
            "name_en": "Cornmeal",
            "icon": "🌽",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 7
          },
          {
            "id": "grocery-dry-flour-grains-bulgur",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-flour-grains",
            "name_ar": "برغل",
            "name_fr": "Boulgour",
            "name_en": "Bulgur",
            "icon": "🌾",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 8
          },
          {
            "id": "grocery-dry-flour-grains-quinoa",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-flour-grains",
            "name_ar": "كينوا",
            "name_fr": "Quinoa",
            "name_en": "Quinoa",
            "icon": "🌾",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 9
          }
        ]
      },
      {
        "id": "grocery-dry-pasta-noodles",
        "category_id": "grocery-dry",
        "name_ar": "المعكرونة والشعيرية",
        "name_fr": "Pâtes et vermicelles",
        "icon": "🍝",
        "sort_order": 2,
        "products": [
          {
            "id": "grocery-dry-pasta-noodles-pasta-spaghetti",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-pasta-noodles",
            "name_ar": "معكرونة سباجيتي",
            "name_fr": "Spaghetti",
            "name_en": "Spaghetti",
            "icon": "🍝",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 1
          },
          {
            "id": "grocery-dry-pasta-noodles-pasta-penne",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-pasta-noodles",
            "name_ar": "معكرونة قلم",
            "name_fr": "Pennes",
            "name_en": "Penne pasta",
            "icon": "🍝",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 2
          },
          {
            "id": "grocery-dry-pasta-noodles-pasta-macaroni",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-pasta-noodles",
            "name_ar": "معكرونة مكروني",
            "name_fr": "Macaronis",
            "name_en": "Macaroni",
            "icon": "🍝",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 3
          },
          {
            "id": "grocery-dry-pasta-noodles-pasta-lasagna",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-pasta-noodles",
            "name_ar": "معكرونة لازانيا",
            "name_fr": "Lasagnes",
            "name_en": "Lasagna",
            "icon": "🍝",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 4
          },
          {
            "id": "grocery-dry-pasta-noodles-noodles-vermicelli",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-pasta-noodles",
            "name_ar": "شعيرية",
            "name_fr": "Vermicelles",
            "name_en": "Vermicelli",
            "icon": "🍜",
            "aliases_ar": [
              "شعرية"
            ],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 5
          },
          {
            "id": "grocery-dry-pasta-noodles-noodles-egg",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-pasta-noodles",
            "name_ar": "شعيرية بالبيض",
            "name_fr": "Vermicelles aux œufs",
            "name_en": "Egg noodles",
            "icon": "🍜",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 6
          },
          {
            "id": "grocery-dry-pasta-noodles-mohamsa",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-pasta-noodles",
            "name_ar": "محمصة",
            "name_fr": "Mohamsa",
            "name_en": "Mohamsa",
            "icon": "🍝",
            "aliases_ar": [
              "لسان عصفور"
            ],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 7
          },
          {
            "id": "grocery-dry-pasta-noodles-orzo",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-pasta-noodles",
            "name_ar": "أورزو",
            "name_fr": "Orzo",
            "name_en": "Orzo",
            "icon": "🍝",
            "aliases_ar": [
              "لسان عصفور"
            ],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 8
          }
        ]
      },
      {
        "id": "grocery-dry-legumes-dry",
        "category_id": "grocery-dry",
        "name_ar": "البقوليات الجافة",
        "name_fr": "Légumineuses sèches",
        "icon": "🫘",
        "sort_order": 3,
        "products": [
          {
            "id": "grocery-dry-legumes-dry-lentils",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-legumes-dry",
            "name_ar": "عدس",
            "name_fr": "Lentilles",
            "name_en": "Lentils",
            "icon": "🫘",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 1
          },
          {
            "id": "grocery-dry-legumes-dry-chickpeas",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-legumes-dry",
            "name_ar": "حمص جاف",
            "name_fr": "Pois chiches secs",
            "name_en": "Dried chickpeas",
            "icon": "🫘",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 2
          },
          {
            "id": "grocery-dry-legumes-dry-beans-white",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-legumes-dry",
            "name_ar": "فاصوليا بيضاء",
            "name_fr": "Haricots blancs",
            "name_en": "White beans",
            "icon": "🫘",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 3
          },
          {
            "id": "grocery-dry-legumes-dry-beans-red",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-legumes-dry",
            "name_ar": "فاصوليا حمراء",
            "name_fr": "Haricots rouges",
            "name_en": "Red beans",
            "icon": "🫘",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 4
          },
          {
            "id": "grocery-dry-legumes-dry-fava-beans",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-legumes-dry",
            "name_ar": "فول جاف",
            "name_fr": "Fèves sèches",
            "name_en": "Dried fava beans",
            "icon": "🫘",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 5
          },
          {
            "id": "grocery-dry-legumes-dry-peas-split",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-legumes-dry",
            "name_ar": "بازلاء جافة",
            "name_fr": "Pois cassés",
            "name_en": "Split peas",
            "icon": "🫘",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 6
          },
          {
            "id": "grocery-dry-legumes-dry-soybeans",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-legumes-dry",
            "name_ar": "فول الصويا",
            "name_fr": "Soja",
            "name_en": "Soybeans",
            "icon": "🫘",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 7
          }
        ]
      },
      {
        "id": "grocery-dry-sugar-salt",
        "category_id": "grocery-dry",
        "name_ar": "السكر والملح",
        "name_fr": "Sucre et sel",
        "icon": "🧂",
        "sort_order": 4,
        "products": [
          {
            "id": "grocery-dry-sugar-salt-sugar-white",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-sugar-salt",
            "name_ar": "سكر أبيض",
            "name_fr": "Sucre blanc",
            "name_en": "White sugar",
            "icon": "🍬",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 1
          },
          {
            "id": "grocery-dry-sugar-salt-sugar-brown",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-sugar-salt",
            "name_ar": "سكر بني",
            "name_fr": "Sucre roux",
            "name_en": "Brown sugar",
            "icon": "🍬",
            "aliases_ar": [
              "سكر أحمر"
            ],
            "aliases_fr": [
              "Sucre brun"
            ],
            "default_unit": "kg",
            "sort_order": 2
          },
          {
            "id": "grocery-dry-sugar-salt-sugar-powder",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-sugar-salt",
            "name_ar": "سكر بودرة",
            "name_fr": "Sucre en poudre",
            "name_en": "Powdered sugar",
            "icon": "🍬",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 3
          },
          {
            "id": "grocery-dry-sugar-salt-salt-table",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-sugar-salt",
            "name_ar": "ملح المائدة",
            "name_fr": "Sel de table",
            "name_en": "Table salt",
            "icon": "🧂",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 4
          },
          {
            "id": "grocery-dry-sugar-salt-salt-coarse",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-sugar-salt",
            "name_ar": "ملح خشن",
            "name_fr": "Gros sel",
            "name_en": "Coarse salt",
            "icon": "🧂",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 5
          },
          {
            "id": "grocery-dry-sugar-salt-baking-soda",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-sugar-salt",
            "name_ar": "بيكربونات الصوديوم",
            "name_fr": "Bicarbonate de soude",
            "name_en": "Baking soda",
            "icon": "🧂",
            "aliases_ar": [
              "صودا الخبز"
            ],
            "aliases_fr": [],
            "default_unit": "boîte",
            "sort_order": 6
          }
        ]
      },
      {
        "id": "grocery-dry-oils-vinegar",
        "category_id": "grocery-dry",
        "name_ar": "الزيوت والخل",
        "name_fr": "Huiles et vinaigre",
        "icon": "🫒",
        "sort_order": 5,
        "products": [
          {
            "id": "grocery-dry-oils-vinegar-oil-olive",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-oils-vinegar",
            "name_ar": "زيت الزيتون",
            "name_fr": "Huile d'olive",
            "name_en": "Olive oil",
            "icon": "🫒",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "L",
            "sort_order": 1
          },
          {
            "id": "grocery-dry-oils-vinegar-oil-sunflower",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-oils-vinegar",
            "name_ar": "زيت عباد الشمس",
            "name_fr": "Huile de tournesol",
            "name_en": "Sunflower oil",
            "icon": "🌻",
            "aliases_ar": [
              "زيت المائدة"
            ],
            "aliases_fr": [
              "Huile de table"
            ],
            "default_unit": "L",
            "sort_order": 2
          },
          {
            "id": "grocery-dry-oils-vinegar-oil-vegetable",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-oils-vinegar",
            "name_ar": "زيت نباتي",
            "name_fr": "Huile végétale",
            "name_en": "Vegetable oil",
            "icon": "🌿",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "L",
            "sort_order": 3
          },
          {
            "id": "grocery-dry-oils-vinegar-oil-corn",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-oils-vinegar",
            "name_ar": "زيت الذرة",
            "name_fr": "Huile de maïs",
            "name_en": "Corn oil",
            "icon": "🌽",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "L",
            "sort_order": 4
          },
          {
            "id": "grocery-dry-oils-vinegar-oil-argan",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-oils-vinegar",
            "name_ar": "زيت الأرغان",
            "name_fr": "Huile d'argan",
            "name_en": "Argan oil",
            "icon": "🫒",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "ml",
            "sort_order": 5
          },
          {
            "id": "grocery-dry-oils-vinegar-vinegar-white",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-oils-vinegar",
            "name_ar": "خل أبيض",
            "name_fr": "Vinaigre blanc",
            "name_en": "White vinegar",
            "icon": "🫙",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "L",
            "sort_order": 6
          },
          {
            "id": "grocery-dry-oils-vinegar-vinegar-apple-cider",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-oils-vinegar",
            "name_ar": "خل التفاح",
            "name_fr": "Vinaigre de cidre",
            "name_en": "Apple cider vinegar",
            "icon": "🍎",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "L",
            "sort_order": 7
          },
          {
            "id": "grocery-dry-oils-vinegar-vinegar-red-wine",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-oils-vinegar",
            "name_ar": "خل النبيذ الأحمر",
            "name_fr": "Vinaigre de vin rouge",
            "name_en": "Red wine vinegar",
            "icon": "🍷",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "L",
            "sort_order": 8
          },
          {
            "id": "grocery-dry-oils-vinegar-vinegar-balsamic",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-oils-vinegar",
            "name_ar": "خل البلسميك",
            "name_fr": "Vinaigre balsamique",
            "name_en": "Balsamic vinegar",
            "icon": "🍇",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "L",
            "sort_order": 9
          }
        ]
      },
      {
        "id": "grocery-dry-spices-herbs",
        "category_id": "grocery-dry",
        "name_ar": "التوابل والأعشاب",
        "name_fr": "Épices et herbes",
        "icon": "🌿",
        "sort_order": 6,
        "products": [
          {
            "id": "grocery-dry-spices-herbs-cumin",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-spices-herbs",
            "name_ar": "كمون",
            "name_fr": "Cumin",
            "name_en": "Cumin",
            "icon": "🌿",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "g",
            "sort_order": 1
          },
          {
            "id": "grocery-dry-spices-herbs-paprika",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-spices-herbs",
            "name_ar": "بابريكا",
            "name_fr": "Paprika",
            "name_en": "Paprika",
            "icon": "🌶️",
            "aliases_ar": [
              "فلفل حلو"
            ],
            "aliases_fr": [],
            "default_unit": "g",
            "sort_order": 2
          },
          {
            "id": "grocery-dry-spices-herbs-cinnamon",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-spices-herbs",
            "name_ar": "قرفة",
            "name_fr": "Cannelle",
            "name_en": "Cinnamon",
            "icon": "🌿",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "g",
            "sort_order": 3
          },
          {
            "id": "grocery-dry-spices-herbs-ginger-ground",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-spices-herbs",
            "name_ar": "زنجبيل مطحون",
            "name_fr": "Gingembre moulu",
            "name_en": "Ground ginger",
            "icon": "🫚",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "g",
            "sort_order": 4
          },
          {
            "id": "grocery-dry-spices-herbs-turmeric",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-spices-herbs",
            "name_ar": "كركم",
            "name_fr": "Curcuma",
            "name_en": "Turmeric",
            "icon": "🌿",
            "aliases_ar": [
              "خرقوم"
            ],
            "aliases_fr": [],
            "default_unit": "g",
            "sort_order": 5
          },
          {
            "id": "grocery-dry-spices-herbs-black-pepper",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-spices-herbs",
            "name_ar": "فلفل أسود",
            "name_fr": "Poivre noir",
            "name_en": "Black pepper",
            "icon": "⚫",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "g",
            "sort_order": 6
          },
          {
            "id": "grocery-dry-spices-herbs-coriander-seeds",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-spices-herbs",
            "name_ar": "بذور الكزبرة",
            "name_fr": "Graines de coriandre",
            "name_en": "Coriander seeds",
            "icon": "🌿",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "g",
            "sort_order": 7
          },
          {
            "id": "grocery-dry-spices-herbs-coriander-ground",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-spices-herbs",
            "name_ar": "كزبرة مطحونة",
            "name_fr": "Coriandre moulue",
            "name_en": "Ground coriander",
            "icon": "🌿",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "g",
            "sort_order": 8
          },
          {
            "id": "grocery-dry-spices-herbs-cloves",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-spices-herbs",
            "name_ar": "قرنفل",
            "name_fr": "Clous de girofle",
            "name_en": "Cloves",
            "icon": "🌿",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "g",
            "sort_order": 9
          },
          {
            "id": "grocery-dry-spices-herbs-nutmeg",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-spices-herbs",
            "name_ar": "جوزة الطيب",
            "name_fr": "Noix de muscade",
            "name_en": "Nutmeg",
            "icon": "🌰",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "g",
            "sort_order": 10
          },
          {
            "id": "grocery-dry-spices-herbs-saffron",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-spices-herbs",
            "name_ar": "زعفران",
            "name_fr": "Safran",
            "name_en": "Saffron",
            "icon": "🌿",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "g",
            "sort_order": 11
          },
          {
            "id": "grocery-dry-spices-herbs-thyme-dried",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-spices-herbs",
            "name_ar": "زعتر مجفف",
            "name_fr": "Thym séché",
            "name_en": "Dried thyme",
            "icon": "🌿",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "g",
            "sort_order": 12
          },
          {
            "id": "grocery-dry-spices-herbs-oregano",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-spices-herbs",
            "name_ar": "أوريغانو",
            "name_fr": "Origan",
            "name_en": "Oregano",
            "icon": "🌿",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "g",
            "sort_order": 13
          },
          {
            "id": "grocery-dry-spices-herbs-bay-leaves",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-spices-herbs",
            "name_ar": "أوراق الغار",
            "name_fr": "Feuilles de laurier",
            "name_en": "Bay leaves",
            "icon": "🌿",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 14
          },
          {
            "id": "grocery-dry-spices-herbs-mint-dried",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-spices-herbs",
            "name_ar": "نعناع مجفف",
            "name_fr": "Menthe séchée",
            "name_en": "Dried mint",
            "icon": "🌿",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "g",
            "sort_order": 15
          },
          {
            "id": "grocery-dry-spices-herbs-chili-flakes",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-spices-herbs",
            "name_ar": "رقائق الفلفل الحار",
            "name_fr": "Flocons de piment",
            "name_en": "Chili flakes",
            "icon": "🌶️",
            "aliases_ar": [
              "فلفل أحمر مجفف"
            ],
            "aliases_fr": [],
            "default_unit": "g",
            "sort_order": 16
          },
          {
            "id": "grocery-dry-spices-herbs-garlic-powder",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-spices-herbs",
            "name_ar": "ثوم بودرة",
            "name_fr": "Ail en poudre",
            "name_en": "Garlic powder",
            "icon": "🧄",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "g",
            "sort_order": 17
          },
          {
            "id": "grocery-dry-spices-herbs-onion-powder",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-spices-herbs",
            "name_ar": "بصل بودرة",
            "name_fr": "Oignon en poudre",
            "name_en": "Onion powder",
            "icon": "🧅",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "g",
            "sort_order": 18
          },
          {
            "id": "grocery-dry-spices-herbs-mustard-seeds",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-spices-herbs",
            "name_ar": "بذور الخردل",
            "name_fr": "Graines de moutarde",
            "name_en": "Mustard seeds",
            "icon": "🌿",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "g",
            "sort_order": 19
          },
          {
            "id": "grocery-dry-spices-herbs-fenugreek",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-spices-herbs",
            "name_ar": "حلبة",
            "name_fr": "Fenugrec",
            "name_en": "Fenugreek",
            "icon": "🌿",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "g",
            "sort_order": 20
          },
          {
            "id": "grocery-dry-spices-herbs-anise",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-spices-herbs",
            "name_ar": "يانسون",
            "name_fr": "Anis",
            "name_en": "Anise",
            "icon": "🌿",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "g",
            "sort_order": 21
          },
          {
            "id": "grocery-dry-spices-herbs-fennel-seeds",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-spices-herbs",
            "name_ar": "بذور الشومر",
            "name_fr": "Graines de fenouil",
            "name_en": "Fennel seeds",
            "icon": "🌿",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "g",
            "sort_order": 22
          },
          {
            "id": "grocery-dry-spices-herbs-cardamom",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-spices-herbs",
            "name_ar": "هيل",
            "name_fr": "Cardamome",
            "name_en": "Cardamom",
            "icon": "🌿",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "g",
            "sort_order": 23
          },
          {
            "id": "grocery-dry-spices-herbs-star-anise",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-spices-herbs",
            "name_ar": "يانسون نجمي",
            "name_fr": "Badiane",
            "name_en": "Star anise",
            "icon": "⭐",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "g",
            "sort_order": 24
          },
          {
            "id": "grocery-dry-spices-herbs-ras-el-hanout",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-spices-herbs",
            "name_ar": "راس الحانوت",
            "name_fr": "Ras el hanout",
            "name_en": "Ras el hanout",
            "icon": "🌿",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "g",
            "sort_order": 25
          },
          {
            "id": "grocery-dry-spices-herbs-harissa-paste",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-spices-herbs",
            "name_ar": "هريس",
            "name_fr": "Harissa",
            "name_en": "Harissa",
            "icon": "🌶️",
            "aliases_ar": [
              "فلفل حار معجون"
            ],
            "aliases_fr": [],
            "default_unit": "boîte",
            "sort_order": 26
          }
        ]
      },
      {
        "id": "grocery-dry-sauces-condiments",
        "category_id": "grocery-dry",
        "name_ar": "الصلصات والتوابل",
        "name_fr": "Sauces et condiments",
        "icon": "🫙",
        "sort_order": 7,
        "products": [
          {
            "id": "grocery-dry-sauces-condiments-tomato-sauce",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-sauces-condiments",
            "name_ar": "صلصة طماطم",
            "name_fr": "Sauce tomate",
            "name_en": "Tomato sauce",
            "icon": "🍅",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "boîte",
            "sort_order": 1
          },
          {
            "id": "grocery-dry-sauces-condiments-tomato-paste",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-sauces-condiments",
            "name_ar": "معجون طماطم",
            "name_fr": "Concentré de tomates",
            "name_en": "Tomato paste",
            "icon": "🍅",
            "aliases_ar": [
              "طماطم مصبرة"
            ],
            "aliases_fr": [
              "Tomate concentrée"
            ],
            "default_unit": "boîte",
            "sort_order": 2
          },
          {
            "id": "grocery-dry-sauces-condiments-ketchup",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-sauces-condiments",
            "name_ar": "كاتشب",
            "name_fr": "Ketchup",
            "name_en": "Ketchup",
            "icon": "🍅",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "bouteille",
            "sort_order": 3
          },
          {
            "id": "grocery-dry-sauces-condiments-mayonnaise",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-sauces-condiments",
            "name_ar": "مايونيز",
            "name_fr": "Mayonnaise",
            "name_en": "Mayonnaise",
            "icon": "🥚",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "bouteille",
            "sort_order": 4
          },
          {
            "id": "grocery-dry-sauces-condiments-mustard",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-sauces-condiments",
            "name_ar": "خردل",
            "name_fr": "Moutarde",
            "name_en": "Mustard",
            "icon": "🌿",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "bouteille",
            "sort_order": 5
          },
          {
            "id": "grocery-dry-sauces-condiments-soy-sauce",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-sauces-condiments",
            "name_ar": "صلصة الصويا",
            "name_fr": "Sauce soja",
            "name_en": "Soy sauce",
            "icon": "🫙",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "bouteille",
            "sort_order": 6
          },
          {
            "id": "grocery-dry-sauces-condiments-worcestershire",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-sauces-condiments",
            "name_ar": "صلصة ورسيسترشاير",
            "name_fr": "Sauce Worcestershire",
            "name_en": "Worcestershire sauce",
            "icon": "🫙",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "bouteille",
            "sort_order": 7
          },
          {
            "id": "grocery-dry-sauces-condiments-hot-sauce",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-sauces-condiments",
            "name_ar": "صلصة حارة",
            "name_fr": "Sauce piquante",
            "name_en": "Hot sauce",
            "icon": "🌶️",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "bouteille",
            "sort_order": 8
          },
          {
            "id": "grocery-dry-sauces-condiments-bbq-sauce",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-sauces-condiments",
            "name_ar": "صلصة باربيكيو",
            "name_fr": "Sauce barbecue",
            "name_en": "BBQ sauce",
            "icon": "🍖",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "bouteille",
            "sort_order": 9
          },
          {
            "id": "grocery-dry-sauces-condiments-olive-tapenade",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-sauces-condiments",
            "name_ar": "تلامباد زيتون",
            "name_fr": "Tapenade d'olives",
            "name_en": "Olive tapenade",
            "icon": "🫒",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "boîte",
            "sort_order": 10
          }
        ]
      },
      {
        "id": "grocery-dry-sweet-spreads",
        "category_id": "grocery-dry",
        "name_ar": "المربيات والدهون الحلوة",
        "name_fr": "Confitures et pâtes à tartiner",
        "icon": "🍯",
        "sort_order": 8,
        "products": [
          {
            "id": "grocery-dry-sweet-spreads-honey",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-sweet-spreads",
            "name_ar": "عسل",
            "name_fr": "Miel",
            "name_en": "Honey",
            "icon": "🍯",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "g",
            "sort_order": 1
          },
          {
            "id": "grocery-dry-sweet-spreads-jam-strawberry",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-sweet-spreads",
            "name_ar": "مربى فراولة",
            "name_fr": "Confiture de fraise",
            "name_en": "Strawberry jam",
            "icon": "🍓",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "boîte",
            "sort_order": 2
          },
          {
            "id": "grocery-dry-sweet-spreads-jam-apricot",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-sweet-spreads",
            "name_ar": "مربى مشمش",
            "name_fr": "Confiture d'abricot",
            "name_en": "Apricot jam",
            "icon": "🍑",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "boîte",
            "sort_order": 3
          },
          {
            "id": "grocery-dry-sweet-spreads-jam-orange",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-sweet-spreads",
            "name_ar": "مربى برتقال",
            "name_fr": "Confiture d'orange",
            "name_en": "Orange jam",
            "icon": "🍊",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "boîte",
            "sort_order": 4
          },
          {
            "id": "grocery-dry-sweet-spreads-jam-fig",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-sweet-spreads",
            "name_ar": "مربى تين",
            "name_fr": "Confiture de figue",
            "name_en": "Fig jam",
            "icon": "🫐",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "boîte",
            "sort_order": 5
          },
          {
            "id": "grocery-dry-sweet-spreads-chocolate-spread",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-sweet-spreads",
            "name_ar": "شوكولاتة قابلة للدهن",
            "name_fr": "Pâte à tartiner chocolat",
            "name_en": "Chocolate spread",
            "icon": "🍫",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "boîte",
            "sort_order": 6
          },
          {
            "id": "grocery-dry-sweet-spreads-peanut-butter",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-sweet-spreads",
            "name_ar": "زبدة الفول السوداني",
            "name_fr": "Beurre de cacahuète",
            "name_en": "Peanut butter",
            "icon": "🥜",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "boîte",
            "sort_order": 7
          },
          {
            "id": "grocery-dry-sweet-spreads-almond-butter",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-sweet-spreads",
            "name_ar": "زبدة اللوز",
            "name_fr": "Beurre d'amande",
            "name_en": "Almond butter",
            "icon": "🥜",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "boîte",
            "sort_order": 8
          },
          {
            "id": "grocery-dry-sweet-spreads-date-syrup",
            "category_id": "grocery-dry",
            "subcategory_id": "grocery-dry-sweet-spreads",
            "name_ar": "دبس التمر",
            "name_fr": "Sirop de dattes",
            "name_en": "Date syrup",
            "icon": "🫘",
            "aliases_ar": [
              "رُب التمر"
            ],
            "aliases_fr": [],
            "default_unit": "bouteille",
            "sort_order": 9
          }
        ]
      }
    ]
  },
  {
    "id": "breakfast",
    "name_ar": "منتجات الإفطار",
    "name_fr": "Produits breakfast",
    "icon": "☕",
    "sort_order": 4,
    "subcategories": [
      {
        "id": "breakfast-coffee",
        "category_id": "breakfast",
        "name_ar": "القهوة",
        "name_fr": "Café",
        "icon": "☕",
        "sort_order": 1,
        "products": [
          {
            "id": "breakfast-coffee-ground",
            "category_id": "breakfast",
            "subcategory_id": "breakfast-coffee",
            "name_ar": "قهوة مطحونة",
            "name_fr": "Café moulu",
            "name_en": "Ground coffee",
            "icon": "☕",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "g",
            "sort_order": 1
          },
          {
            "id": "breakfast-coffee-beans",
            "category_id": "breakfast",
            "subcategory_id": "breakfast-coffee",
            "name_ar": "حبوب قهوة",
            "name_fr": "Grains de café",
            "name_en": "Coffee beans",
            "icon": "☕",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "g",
            "sort_order": 2
          },
          {
            "id": "breakfast-coffee-instant",
            "category_id": "breakfast",
            "subcategory_id": "breakfast-coffee",
            "name_ar": "قهوة سريعة التحضير",
            "name_fr": "Café soluble",
            "name_en": "Instant coffee",
            "icon": "☕",
            "aliases_ar": [
              "قهوة فورية"
            ],
            "aliases_fr": [
              "Café instantané"
            ],
            "default_unit": "g",
            "sort_order": 3
          },
          {
            "id": "breakfast-coffee-espresso",
            "category_id": "breakfast",
            "subcategory_id": "breakfast-coffee",
            "name_ar": "قهوة إسبريسو",
            "name_fr": "Café espresso",
            "name_en": "Espresso coffee",
            "icon": "☕",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "g",
            "sort_order": 4
          },
          {
            "id": "breakfast-coffee-decaf",
            "category_id": "breakfast",
            "subcategory_id": "breakfast-coffee",
            "name_ar": "قهوة منزوعة الكافيين",
            "name_fr": "Café décaféiné",
            "name_en": "Decaffeinated coffee",
            "icon": "☕",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "g",
            "sort_order": 5
          },
          {
            "id": "breakfast-coffee-cappuccino",
            "category_id": "breakfast",
            "subcategory_id": "breakfast-coffee",
            "name_ar": "كابوتشينو",
            "name_fr": "Cappuccino",
            "name_en": "Cappuccino",
            "icon": "☕",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "g",
            "sort_order": 6
          }
        ]
      },
      {
        "id": "breakfast-tea",
        "category_id": "breakfast",
        "name_ar": "الشاي والأعشاب",
        "name_fr": "Thé et infusions",
        "icon": "🍵",
        "sort_order": 2,
        "products": [
          {
            "id": "breakfast-tea-black",
            "category_id": "breakfast",
            "subcategory_id": "breakfast-tea",
            "name_ar": "شاي أسود",
            "name_fr": "Thé noir",
            "name_en": "Black tea",
            "icon": "🍵",
            "aliases_ar": [
              "أتاي"
            ],
            "aliases_fr": [],
            "default_unit": "boîte",
            "sort_order": 1
          },
          {
            "id": "breakfast-tea-green",
            "category_id": "breakfast",
            "subcategory_id": "breakfast-tea",
            "name_ar": "شاي أخضر",
            "name_fr": "Thé vert",
            "name_en": "Green tea",
            "icon": "🍵",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "boîte",
            "sort_order": 2
          },
          {
            "id": "breakfast-tea-mint",
            "category_id": "breakfast",
            "subcategory_id": "breakfast-tea",
            "name_ar": "شاي بالنعناع",
            "name_fr": "Thé à la menthe",
            "name_en": "Mint tea",
            "icon": "🌿",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "boîte",
            "sort_order": 3
          },
          {
            "id": "breakfast-tea-earl-grey",
            "category_id": "breakfast",
            "subcategory_id": "breakfast-tea",
            "name_ar": "شاي إيرل غراي",
            "name_fr": "Thé Earl Grey",
            "name_en": "Earl Grey tea",
            "icon": "🍵",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "boîte",
            "sort_order": 4
          },
          {
            "id": "breakfast-tea-chamomile",
            "category_id": "breakfast",
            "subcategory_id": "breakfast-tea",
            "name_ar": "شاي بابونج",
            "name_fr": "Infusion camomille",
            "name_en": "Chamomile tea",
            "icon": "🌼",
            "aliases_ar": [
              "بابونج"
            ],
            "aliases_fr": [
              "Camomille"
            ],
            "default_unit": "boîte",
            "sort_order": 5
          },
          {
            "id": "breakfast-tea-ginger",
            "category_id": "breakfast",
            "subcategory_id": "breakfast-tea",
            "name_ar": "شاي زنجبيل",
            "name_fr": "Infusion gingembre",
            "name_en": "Ginger tea",
            "icon": "🫚",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "boîte",
            "sort_order": 6
          },
          {
            "id": "breakfast-tea-lemon",
            "category_id": "breakfast",
            "subcategory_id": "breakfast-tea",
            "name_ar": "شاي ليمون",
            "name_fr": "Thé au citron",
            "name_en": "Lemon tea",
            "icon": "🍋",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "boîte",
            "sort_order": 7
          },
          {
            "id": "breakfast-tea-verveine",
            "category_id": "breakfast",
            "subcategory_id": "breakfast-tea",
            "name_ar": "فيرفين",
            "name_fr": "Verveine",
            "name_en": "Verbena",
            "icon": "🌿",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "boîte",
            "sort_order": 8
          },
          {
            "id": "breakfast-tea-anise",
            "category_id": "breakfast",
            "subcategory_id": "breakfast-tea",
            "name_ar": "شاي يانسون",
            "name_fr": "Infusion anis",
            "name_en": "Anise tea",
            "icon": "🌿",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "boîte",
            "sort_order": 9
          },
          {
            "id": "breakfast-tea-thyme",
            "category_id": "breakfast",
            "subcategory_id": "breakfast-tea",
            "name_ar": "شاي زعتر",
            "name_fr": "Infusion thym",
            "name_en": "Thyme tea",
            "icon": "🌿",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "boîte",
            "sort_order": 10
          }
        ]
      },
      {
        "id": "breakfast-cereals",
        "category_id": "breakfast",
        "name_ar": "حبوب الإفطار",
        "name_fr": "Céréales breakfast",
        "icon": "🥣",
        "sort_order": 3,
        "products": [
          {
            "id": "breakfast-cereals-cornflakes",
            "category_id": "breakfast",
            "subcategory_id": "breakfast-cereals",
            "name_ar": "كورن فليكس",
            "name_fr": "Corn flakes",
            "name_en": "Corn flakes",
            "icon": "🌽",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "boîte",
            "sort_order": 1
          },
          {
            "id": "breakfast-cereals-chocolate-cereal",
            "category_id": "breakfast",
            "subcategory_id": "breakfast-cereals",
            "name_ar": "حبوب شوكولاتة",
            "name_fr": "Céréales chocolat",
            "name_en": "Chocolate cereal",
            "icon": "🍫",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "boîte",
            "sort_order": 2
          },
          {
            "id": "breakfast-cereals-honey-cereal",
            "category_id": "breakfast",
            "subcategory_id": "breakfast-cereals",
            "name_ar": "حبوب بالعسل",
            "name_fr": "Céréales au miel",
            "name_en": "Honey cereal",
            "icon": "🍯",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "boîte",
            "sort_order": 3
          },
          {
            "id": "breakfast-cereals-oat-cereal",
            "category_id": "breakfast",
            "subcategory_id": "breakfast-cereals",
            "name_ar": "حبوب شوفان",
            "name_fr": "Céréales avoine",
            "name_en": "Oat cereal",
            "icon": "🌾",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "boîte",
            "sort_order": 4
          },
          {
            "id": "breakfast-cereals-rice-crispies",
            "category_id": "breakfast",
            "subcategory_id": "breakfast-cereals",
            "name_ar": "أرز مقرمش",
            "name_fr": "Riz soufflé",
            "name_en": "Rice crispies",
            "icon": "🍚",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "boîte",
            "sort_order": 5
          },
          {
            "id": "breakfast-cereals-wheat-flakes",
            "category_id": "breakfast",
            "subcategory_id": "breakfast-cereals",
            "name_ar": "رقائق قمح",
            "name_fr": "Flocons de blé",
            "name_en": "Wheat flakes",
            "icon": "🌾",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "boîte",
            "sort_order": 6
          },
          {
            "id": "breakfast-cereals-granola",
            "category_id": "breakfast",
            "subcategory_id": "breakfast-cereals",
            "name_ar": "جرانولا",
            "name_fr": "Granola",
            "name_en": "Granola",
            "icon": "🥣",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "boîte",
            "sort_order": 7
          },
          {
            "id": "breakfast-cereals-muesli",
            "category_id": "breakfast",
            "subcategory_id": "breakfast-cereals",
            "name_ar": "ميزلي",
            "name_fr": "Muesli",
            "name_en": "Muesli",
            "icon": "🥣",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "boîte",
            "sort_order": 8
          }
        ]
      },
      {
        "id": "breakfast-sweet-spreads",
        "category_id": "breakfast",
        "name_ar": "دهونات الإفطار",
        "name_fr": "Pâtes à tartiner",
        "icon": "🍯",
        "sort_order": 4,
        "products": [
          {
            "id": "breakfast-sweet-spreads-honey",
            "category_id": "breakfast",
            "subcategory_id": "breakfast-sweet-spreads",
            "name_ar": "عسل",
            "name_fr": "Miel",
            "name_en": "Honey",
            "icon": "🍯",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "g",
            "sort_order": 1
          },
          {
            "id": "breakfast-sweet-spreads-jam-mixed",
            "category_id": "breakfast",
            "subcategory_id": "breakfast-sweet-spreads",
            "name_ar": "مربى مشكل",
            "name_fr": "Confiture assortie",
            "name_en": "Mixed jam",
            "icon": "🍓",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "boîte",
            "sort_order": 2
          },
          {
            "id": "breakfast-sweet-spreads-chocolate-spread",
            "category_id": "breakfast",
            "subcategory_id": "breakfast-sweet-spreads",
            "name_ar": "شوكولاتة قابلة للدهن",
            "name_fr": "Pâte à tartiner chocolat",
            "name_en": "Chocolate spread",
            "icon": "🍫",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "boîte",
            "sort_order": 3
          },
          {
            "id": "breakfast-sweet-spreads-peanut-butter",
            "category_id": "breakfast",
            "subcategory_id": "breakfast-sweet-spreads",
            "name_ar": "زبدة الفول السوداني",
            "name_fr": "Beurre de cacahuète",
            "name_en": "Peanut butter",
            "icon": "🥜",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "boîte",
            "sort_order": 4
          },
          {
            "id": "breakfast-sweet-spreads-nougat",
            "category_id": "breakfast",
            "subcategory_id": "breakfast-sweet-spreads",
            "name_ar": "نوغا",
            "name_fr": "Nougat",
            "name_en": "Nougat",
            "icon": "🍬",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "boîte",
            "sort_order": 5
          }
        ]
      },
      {
        "id": "breakfast-hot-drinks",
        "category_id": "breakfast",
        "name_ar": "مشروبات ساخنة",
        "name_fr": "Boissons chaudes",
        "icon": "☕",
        "sort_order": 5,
        "products": [
          {
            "id": "breakfast-hot-drinks-chocolate-powder",
            "category_id": "breakfast",
            "subcategory_id": "breakfast-hot-drinks",
            "name_ar": "شوكولاتة ساخنة",
            "name_fr": "Chocolat chaud en poudre",
            "name_en": "Hot chocolate powder",
            "icon": "🍫",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "g",
            "sort_order": 1
          },
          {
            "id": "breakfast-hot-drinks-malted-drink",
            "category_id": "breakfast",
            "subcategory_id": "breakfast-hot-drinks",
            "name_ar": "مشروب الشعير",
            "name_fr": "Boisson maltée",
            "name_en": "Malted drink",
            "icon": "🌾",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "g",
            "sort_order": 2
          },
          {
            "id": "breakfast-hot-drinks-ovaltine",
            "category_id": "breakfast",
            "subcategory_id": "breakfast-hot-drinks",
            "name_ar": "أوفالتين",
            "name_fr": "Ovaltine",
            "name_en": "Ovaltine",
            "icon": "🥛",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "g",
            "sort_order": 3
          }
        ]
      }
    ]
  },
  {
    "id": "bread-bakery",
    "name_ar": "الخبز والمخبوزات",
    "name_fr": "Pain et boulangerie",
    "icon": "🥖",
    "sort_order": 5,
    "subcategories": [
      {
        "id": "bread-bakery-bread",
        "category_id": "bread-bakery",
        "name_ar": "الخبز",
        "name_fr": "Pain",
        "icon": "🍞",
        "sort_order": 1,
        "products": [
          {
            "id": "bread-bakery-bread-traditional",
            "category_id": "bread-bakery",
            "subcategory_id": "bread-bakery-bread",
            "name_ar": "خبز تقليدي",
            "name_fr": "Pain traditionnel",
            "name_en": "Traditional bread",
            "icon": "🍞",
            "aliases_ar": [
              "خبز عربي"
            ],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 1
          },
          {
            "id": "bread-bakery-bread-white",
            "category_id": "bread-bakery",
            "subcategory_id": "bread-bakery-bread",
            "name_ar": "خبز أبيض",
            "name_fr": "Pain blanc",
            "name_en": "White bread",
            "icon": "🍞",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 2
          },
          {
            "id": "bread-bakery-bread-whole",
            "category_id": "bread-bakery",
            "subcategory_id": "bread-bakery-bread",
            "name_ar": "خبز كامل",
            "name_fr": "Pain complet",
            "name_en": "Whole wheat bread",
            "icon": "🍞",
            "aliases_ar": [
              "خبز أسمر"
            ],
            "aliases_fr": [
              "Pain brun"
            ],
            "default_unit": "pièce",
            "sort_order": 3
          },
          {
            "id": "bread-bakery-bread-sandwich",
            "category_id": "bread-bakery",
            "subcategory_id": "bread-bakery-bread",
            "name_ar": "خبز الساندويتش",
            "name_fr": "Pain de mie",
            "name_en": "Sandwich bread",
            "icon": "🍞",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 4
          },
          {
            "id": "bread-bakery-bread-burger",
            "category_id": "bread-bakery",
            "subcategory_id": "bread-bakery-bread",
            "name_ar": "خبز البرغر",
            "name_fr": "Pain à burger",
            "name_en": "Burger buns",
            "icon": "🍔",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 5
          },
          {
            "id": "bread-bakery-bread-hotdog",
            "category_id": "bread-bakery",
            "subcategory_id": "bread-bakery-bread",
            "name_ar": "خبز الهوت دوغ",
            "name_fr": "Pain à hot-dog",
            "name_en": "Hot dog buns",
            "icon": "🌭",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 6
          },
          {
            "id": "bread-bakery-bread-toast",
            "category_id": "bread-bakery",
            "subcategory_id": "bread-bakery-bread",
            "name_ar": "خبز التوست",
            "name_fr": "Pain toast",
            "name_en": "Toast bread",
            "icon": "🍞",
            "aliases_ar": [
              "توست"
            ],
            "aliases_fr": [
              "Toast"
            ],
            "default_unit": "paquet",
            "sort_order": 7
          },
          {
            "id": "bread-bakery-bread-baguette",
            "category_id": "bread-bakery",
            "subcategory_id": "bread-bakery-bread",
            "name_ar": "باغيت",
            "name_fr": "Baguette",
            "name_en": "Baguette",
            "icon": "🥖",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 8
          },
          {
            "id": "bread-bakery-bread-pita",
            "category_id": "bread-bakery",
            "subcategory_id": "bread-bakery-bread",
            "name_ar": "خبز بيتا",
            "name_fr": "Pain pita",
            "name_en": "Pita bread",
            "icon": "🫓",
            "aliases_ar": [
              "خبز مسطح"
            ],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 9
          },
          {
            "id": "bread-bakery-bread-multigrain",
            "category_id": "bread-bakery",
            "subcategory_id": "bread-bakery-bread",
            "name_ar": "خبز متعدد الحبوب",
            "name_fr": "Pain multicéréales",
            "name_en": "Multigrain bread",
            "icon": "🌾",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 10
          },
          {
            "id": "bread-bakery-bread-sourdough",
            "category_id": "bread-bakery",
            "subcategory_id": "bread-bakery-bread",
            "name_ar": "خبز مخمر",
            "name_fr": "Pain au levain",
            "name_en": "Sourdough bread",
            "icon": "🍞",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 11
          },
          {
            "id": "bread-bakery-bread-rye",
            "category_id": "bread-bakery",
            "subcategory_id": "bread-bakery-bread",
            "name_ar": "خبز الشعير",
            "name_fr": "Pain de seigle",
            "name_en": "Rye bread",
            "icon": "🌾",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 12
          }
        ]
      },
      {
        "id": "bread-bakery-viennoiseries",
        "category_id": "bread-bakery",
        "name_ar": "المعجنات الحلوة",
        "name_fr": "Viennoiseries",
        "icon": "🥐",
        "sort_order": 2,
        "products": [
          {
            "id": "bread-bakery-viennoiseries-croissant",
            "category_id": "bread-bakery",
            "subcategory_id": "bread-bakery-viennoiseries",
            "name_ar": "كرواسون",
            "name_fr": "Croissant",
            "name_en": "Croissant",
            "icon": "🥐",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 1
          },
          {
            "id": "bread-bakery-viennoiseries-pain-au-chocolat",
            "category_id": "bread-bakery",
            "subcategory_id": "bread-bakery-viennoiseries",
            "name_ar": "بان أو شوكولا",
            "name_fr": "Pain au chocolat",
            "name_en": "Chocolate croissant",
            "icon": "🍫",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 2
          },
          {
            "id": "bread-bakery-viennoiseries-brioche",
            "category_id": "bread-bakery",
            "subcategory_id": "bread-bakery-viennoiseries",
            "name_ar": "بريوش",
            "name_fr": "Brioche",
            "name_en": "Brioche",
            "icon": "🍞",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 3
          },
          {
            "id": "bread-bakery-viennoiseries-danish",
            "category_id": "bread-bakery",
            "subcategory_id": "bread-bakery-viennoiseries",
            "name_ar": "دانشواز",
            "name_fr": "Danois",
            "name_en": "Danish pastry",
            "icon": "🥐",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 4
          },
          {
            "id": "bread-bakery-viennoiseries-muffin",
            "category_id": "bread-bakery",
            "subcategory_id": "bread-bakery-viennoiseries",
            "name_ar": "مافن",
            "name_fr": "Muffin",
            "name_en": "Muffin",
            "icon": "🧁",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 5
          },
          {
            "id": "bread-bakery-viennoiseries-donut",
            "category_id": "bread-bakery",
            "subcategory_id": "bread-bakery-viennoiseries",
            "name_ar": "دونات",
            "name_fr": "Donut",
            "name_en": "Donut",
            "icon": "🍩",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 6
          }
        ]
      },
      {
        "id": "bread-bakery-biscuits",
        "category_id": "bread-bakery",
        "name_ar": "البسكويت",
        "name_fr": "Biscuits",
        "icon": "🍪",
        "sort_order": 3,
        "products": [
          {
            "id": "bread-bakery-biscuits-sweet-biscuits",
            "category_id": "bread-bakery",
            "subcategory_id": "bread-bakery-biscuits",
            "name_ar": "بسكويت حلو",
            "name_fr": "Biscuits sucrés",
            "name_en": "Sweet biscuits",
            "icon": "🍪",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 1
          },
          {
            "id": "bread-bakery-biscuits-chocolate-biscuits",
            "category_id": "bread-bakery",
            "subcategory_id": "bread-bakery-biscuits",
            "name_ar": "بسكويت بالشوكولاتة",
            "name_fr": "Biscuits au chocolat",
            "name_en": "Chocolate biscuits",
            "icon": "🍫",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 2
          },
          {
            "id": "bread-bakery-biscuits-vanilla-biscuits",
            "category_id": "bread-bakery",
            "subcategory_id": "bread-bakery-biscuits",
            "name_ar": "بسكويت بالفانيليا",
            "name_fr": "Biscuits à la vanille",
            "name_en": "Vanilla biscuits",
            "icon": "🍪",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 3
          },
          {
            "id": "bread-bakery-biscuits-butter-biscuits",
            "category_id": "bread-bakery",
            "subcategory_id": "bread-bakery-biscuits",
            "name_ar": "بسكويت بالزبدة",
            "name_fr": "Biscuits au beurre",
            "name_en": "Butter biscuits",
            "icon": "🧈",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 4
          },
          {
            "id": "bread-bakery-biscuits-oat-biscuits",
            "category_id": "bread-bakery",
            "subcategory_id": "bread-bakery-biscuits",
            "name_ar": "بسكويت بالشوفان",
            "name_fr": "Biscuits à l'avoine",
            "name_en": "Oat biscuits",
            "icon": "🌾",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 5
          },
          {
            "id": "bread-bakery-biscuits-salty-biscuits",
            "category_id": "bread-bakery",
            "subcategory_id": "bread-bakery-biscuits",
            "name_ar": "بسكويت مالح",
            "name_fr": "Biscuits salés",
            "name_en": "Salty biscuits",
            "icon": "🧂",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 6
          },
          {
            "id": "bread-bakery-biscuits-crackers",
            "category_id": "bread-bakery",
            "subcategory_id": "bread-bakery-biscuits",
            "name_ar": "كراكر",
            "name_fr": "Crackers",
            "name_en": "Crackers",
            "icon": "🍘",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 7
          },
          {
            "id": "bread-bakery-biscuits-wafers",
            "category_id": "bread-bakery",
            "subcategory_id": "bread-bakery-biscuits",
            "name_ar": "ويفر",
            "name_fr": "Gaufrettes",
            "name_en": "Wafers",
            "icon": "🍪",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 8
          },
          {
            "id": "bread-bakery-biscuits-madeleines",
            "category_id": "bread-bakery",
            "subcategory_id": "bread-bakery-biscuits",
            "name_ar": "مادلين",
            "name_fr": "Madeleines",
            "name_en": "Madeleines",
            "icon": "🧁",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 9
          },
          {
            "id": "bread-bakery-biscuits-shortbread",
            "category_id": "bread-bakery",
            "subcategory_id": "bread-bakery-biscuits",
            "name_ar": "بسكويت قصير",
            "name_fr": "Sablés",
            "name_en": "Shortbread",
            "icon": "🍪",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 10
          }
        ]
      },
      {
        "id": "bread-bakery-cakes",
        "category_id": "bread-bakery",
        "name_ar": "الكعك والحلويات",
        "name_fr": "Gâteaux et pâtisseries",
        "icon": "🍰",
        "sort_order": 4,
        "products": [
          {
            "id": "bread-bakery-cakes-cake-vanilla",
            "category_id": "bread-bakery",
            "subcategory_id": "bread-bakery-cakes",
            "name_ar": "كيك فانيليا",
            "name_fr": "Gâteau vanille",
            "name_en": "Vanilla cake",
            "icon": "🍰",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 1
          },
          {
            "id": "bread-bakery-cakes-cake-chocolate",
            "category_id": "bread-bakery",
            "subcategory_id": "bread-bakery-cakes",
            "name_ar": "كيك شوكولاتة",
            "name_fr": "Gâteau au chocolat",
            "name_en": "Chocolate cake",
            "icon": "🍫",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 2
          },
          {
            "id": "bread-bakery-cakes-cake-marble",
            "category_id": "bread-bakery",
            "subcategory_id": "bread-bakery-cakes",
            "name_ar": "كيك رخامي",
            "name_fr": "Gâteau marbré",
            "name_en": "Marble cake",
            "icon": "🍰",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 3
          },
          {
            "id": "bread-bakery-cakes-cake-lemon",
            "category_id": "bread-bakery",
            "subcategory_id": "bread-bakery-cakes",
            "name_ar": "كيك ليمون",
            "name_fr": "Gâteau au citron",
            "name_en": "Lemon cake",
            "icon": "🍋",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 4
          },
          {
            "id": "bread-bakery-cakes-cake-orange",
            "category_id": "bread-bakery",
            "subcategory_id": "bread-bakery-cakes",
            "name_ar": "كيك برتقال",
            "name_fr": "Gâteau à l'orange",
            "name_en": "Orange cake",
            "icon": "🍊",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 5
          },
          {
            "id": "bread-bakery-cakes-brownies",
            "category_id": "bread-bakery",
            "subcategory_id": "bread-bakery-cakes",
            "name_ar": "براونيز",
            "name_fr": "Brownies",
            "name_en": "Brownies",
            "icon": "🍫",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 6
          },
          {
            "id": "bread-bakery-cakes-cupcakes",
            "category_id": "bread-bakery",
            "subcategory_id": "bread-bakery-cakes",
            "name_ar": "كب كيك",
            "name_fr": "Cupcakes",
            "name_en": "Cupcakes",
            "icon": "🧁",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 7
          },
          {
            "id": "bread-bakery-cakes-financiers",
            "category_id": "bread-bakery",
            "subcategory_id": "bread-bakery-cakes",
            "name_ar": "فينانسييه",
            "name_fr": "Financiers",
            "name_en": "Financiers",
            "icon": "🧁",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 8
          },
          {
            "id": "bread-bakery-cakes-tiramisu",
            "category_id": "bread-bakery",
            "subcategory_id": "bread-bakery-cakes",
            "name_ar": "تيراميسو",
            "name_fr": "Tiramisu",
            "name_en": "Tiramisu",
            "icon": "🍰",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 9
          },
          {
            "id": "bread-bakery-cakes-cheesecake",
            "category_id": "bread-bakery",
            "subcategory_id": "bread-bakery-cakes",
            "name_ar": "تشيز كيك",
            "name_fr": "Cheesecake",
            "name_en": "Cheesecake",
            "icon": "🍰",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 10
          }
        ]
      }
    ]
  },
  {
    "id": "sweets-snacks",
    "name_ar": "الحلويات والوجبات الخفيفة",
    "name_fr": "Sucreries et snacks",
    "icon": "🍬",
    "sort_order": 6,
    "subcategories": [
      {
        "id": "sweets-snacks-chocolate",
        "category_id": "sweets-snacks",
        "name_ar": "الشوكولاتة",
        "name_fr": "Chocolats",
        "icon": "🍫",
        "sort_order": 1,
        "products": [
          {
            "id": "sweets-snacks-chocolate-dark",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-chocolate",
            "name_ar": "شوكولاتة سوداء",
            "name_fr": "Chocolat noir",
            "name_en": "Dark chocolate",
            "icon": "🍫",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "barre",
            "sort_order": 1
          },
          {
            "id": "sweets-snacks-chocolate-milk",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-chocolate",
            "name_ar": "شوكولاتة بالحليب",
            "name_fr": "Chocolat au lait",
            "name_en": "Milk chocolate",
            "icon": "🍫",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "barre",
            "sort_order": 2
          },
          {
            "id": "sweets-snacks-chocolate-white",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-chocolate",
            "name_ar": "شوكولاتة بيضاء",
            "name_fr": "Chocolat blanc",
            "name_en": "White chocolate",
            "icon": "🍫",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "barre",
            "sort_order": 3
          },
          {
            "id": "sweets-snacks-chocolate-filled",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-chocolate",
            "name_ar": "شوكولاتة محشوة",
            "name_fr": "Chocolat fourré",
            "name_en": "Filled chocolate",
            "icon": "🍫",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "barre",
            "sort_order": 4
          },
          {
            "id": "sweets-snacks-chocolate-nuts",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-chocolate",
            "name_ar": "شوكولاتة بالمكسرات",
            "name_fr": "Chocolat aux noix",
            "name_en": "Chocolate with nuts",
            "icon": "🍫",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "barre",
            "sort_order": 5
          },
          {
            "id": "sweets-snacks-chocolate-caramel",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-chocolate",
            "name_ar": "شوكولاتة بالكراميل",
            "name_fr": "Chocolat au caramel",
            "name_en": "Caramel chocolate",
            "icon": "🍫",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "barre",
            "sort_order": 6
          },
          {
            "id": "sweets-snacks-chocolate-raisins",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-chocolate",
            "name_ar": "شوكولاتة بالزبيب",
            "name_fr": "Chocolat aux raisins",
            "name_en": "Chocolate with raisins",
            "icon": "🍫",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "barre",
            "sort_order": 7
          },
          {
            "id": "sweets-snacks-chocolate-cookies-cream",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-chocolate",
            "name_ar": "شوكولاتة بالكوكيز والكريمة",
            "name_fr": "Chocolat cookies crème",
            "name_en": "Cookies and cream chocolate",
            "icon": "🍪",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "barre",
            "sort_order": 8
          },
          {
            "id": "sweets-snacks-chocolate-bars",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-chocolate",
            "name_ar": "ألواح شوكولاتة",
            "name_fr": "Barres chocolatées",
            "name_en": "Chocolate bars",
            "icon": "🍫",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "barre",
            "sort_order": 9
          },
          {
            "id": "sweets-snacks-chocolate-boxes",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-chocolate",
            "name_ar": "علب شوكولاتة",
            "name_fr": "Boîtes de chocolats",
            "name_en": "Chocolate boxes",
            "icon": "🍫",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "boîte",
            "sort_order": 10
          }
        ]
      },
      {
        "id": "sweets-snacks-candy",
        "category_id": "sweets-snacks",
        "name_ar": "الحلوى",
        "name_fr": "Confiseries",
        "icon": "🍬",
        "sort_order": 2,
        "products": [
          {
            "id": "sweets-snacks-candy-hard",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-candy",
            "name_ar": "حلوى صلبة",
            "name_fr": "Bonbons durs",
            "name_en": "Hard candy",
            "icon": "🍬",
            "aliases_ar": [],
            "aliases_fr": [
              "Bonbons"
            ],
            "default_unit": "paquet",
            "sort_order": 1
          },
          {
            "id": "sweets-snacks-candy-soft",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-candy",
            "name_ar": "حلوى طرية",
            "name_fr": "Bonbons tendres",
            "name_en": "Soft candy",
            "icon": "🍬",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 2
          },
          {
            "id": "sweets-snacks-candy-caramel",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-candy",
            "name_ar": "كراميل",
            "name_fr": "Caramels",
            "name_en": "Caramels",
            "icon": "🍬",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 3
          },
          {
            "id": "sweets-snacks-candy-gummies",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-candy",
            "name_ar": "حلوى مطاطية",
            "name_fr": "Bonbons gélifiés",
            "name_en": "Gummy candy",
            "icon": "🐻",
            "aliases_ar": [
              "جيلي"
            ],
            "aliases_fr": [
              "Gummies"
            ],
            "default_unit": "paquet",
            "sort_order": 4
          },
          {
            "id": "sweets-snacks-candy-licorice",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-candy",
            "name_ar": "عرقسوس",
            "name_fr": "Réglisse",
            "name_en": "Licorice",
            "icon": "⚫",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 5
          },
          {
            "id": "sweets-snacks-candy-lollipops",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-candy",
            "name_ar": "مصاصة",
            "name_fr": "Sucettes",
            "name_en": "Lollipops",
            "icon": "🍭",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 6
          },
          {
            "id": "sweets-snacks-candy-chewing-gum",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-candy",
            "name_ar": "علكة",
            "name_fr": "Chewing-gum",
            "name_en": "Chewing gum",
            "icon": "🫧",
            "aliases_ar": [
              "لبان"
            ],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 7
          },
          {
            "id": "sweets-snacks-candy-marshmallows",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-candy",
            "name_ar": "مارشميلو",
            "name_fr": "Guimauves",
            "name_en": "Marshmallows",
            "icon": "⚪",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 8
          },
          {
            "id": "sweets-snacks-candy-jelly-beans",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-candy",
            "name_ar": "حلوى الفاصوليا",
            "name_fr": "Dragées",
            "name_en": "Jelly beans",
            "icon": "🌈",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 9
          },
          {
            "id": "sweets-snacks-candy-sour-candy",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-candy",
            "name_ar": "حلوى حامضة",
            "name_fr": "Bonbons acidulés",
            "name_en": "Sour candy",
            "icon": "🍋",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 10
          },
          {
            "id": "sweets-snacks-candy-fruit-candy",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-candy",
            "name_ar": "حلوى الفواكه",
            "name_fr": "Bonbons aux fruits",
            "name_en": "Fruit candy",
            "icon": "🍓",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 11
          },
          {
            "id": "sweets-snacks-candy-mint-candy",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-candy",
            "name_ar": "حلوى النعناع",
            "name_fr": "Bonbons à la menthe",
            "name_en": "Mint candy",
            "icon": "🌿",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 12
          }
        ]
      },
      {
        "id": "sweets-snacks-chips",
        "category_id": "sweets-snacks",
        "name_ar": "رقائق البطاطس",
        "name_fr": "Chips",
        "icon": "🥔",
        "sort_order": 3,
        "products": [
          {
            "id": "sweets-snacks-chips-potato",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-chips",
            "name_ar": "شيبس بطاطس",
            "name_fr": "Chips de pommes de terre",
            "name_en": "Potato chips",
            "icon": "🥔",
            "aliases_ar": [
              "شيبس"
            ],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 1
          },
          {
            "id": "sweets-snacks-chips-tortilla",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-chips",
            "name_ar": "شيبس تورتيلا",
            "name_fr": "Chips tortilla",
            "name_en": "Tortilla chips",
            "icon": "🌮",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 2
          },
          {
            "id": "sweets-snacks-chips-corn",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-chips",
            "name_ar": "شيبس ذرة",
            "name_fr": "Chips de maïs",
            "name_en": "Corn chips",
            "icon": "🌽",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 3
          },
          {
            "id": "sweets-snacks-chips-vegetable",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-chips",
            "name_ar": "شيبس خضر",
            "name_fr": "Chips de légumes",
            "name_en": "Vegetable chips",
            "icon": "🥕",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 4
          },
          {
            "id": "sweets-snacks-chips-banana",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-chips",
            "name_ar": "شيبس موز",
            "name_fr": "Chips de banane",
            "name_en": "Banana chips",
            "icon": "🍌",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 5
          }
        ]
      },
      {
        "id": "sweets-snacks-popcorn",
        "category_id": "sweets-snacks",
        "name_ar": "البوب كورن",
        "name_fr": "Popcorn",
        "icon": "🍿",
        "sort_order": 4,
        "products": [
          {
            "id": "sweets-snacks-popcorn-salted",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-popcorn",
            "name_ar": "بوب كورن مالح",
            "name_fr": "Popcorn salé",
            "name_en": "Salted popcorn",
            "icon": "🍿",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 1
          },
          {
            "id": "sweets-snacks-popcorn-butter",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-popcorn",
            "name_ar": "بوب كورن بالزبدة",
            "name_fr": "Popcorn au beurre",
            "name_en": "Butter popcorn",
            "icon": "🧈",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 2
          },
          {
            "id": "sweets-snacks-popcorn-caramel",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-popcorn",
            "name_ar": "بوب كورن بالكراميل",
            "name_fr": "Popcorn au caramel",
            "name_en": "Caramel popcorn",
            "icon": "🍬",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 3
          },
          {
            "id": "sweets-snacks-popcorn-chocolate",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-popcorn",
            "name_ar": "بوب كورن بالشوكولاتة",
            "name_fr": "Popcorn au chocolat",
            "name_en": "Chocolate popcorn",
            "icon": "🍫",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 4
          },
          {
            "id": "sweets-snacks-popcorn-cheese",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-popcorn",
            "name_ar": "بوب كورن بالجبن",
            "name_fr": "Popcorn au fromage",
            "name_en": "Cheese popcorn",
            "icon": "🧀",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 5
          }
        ]
      },
      {
        "id": "sweets-snacks-nuts-seeds",
        "category_id": "sweets-snacks",
        "name_ar": "المكسرات والبذور",
        "name_fr": "Noix et graines",
        "icon": "🥜",
        "sort_order": 5,
        "products": [
          {
            "id": "sweets-snacks-nuts-seeds-peanuts-roasted",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-nuts-seeds",
            "name_ar": "فول سوداني محمص",
            "name_fr": "Cacahuètes grillées",
            "name_en": "Roasted peanuts",
            "icon": "🥜",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 1
          },
          {
            "id": "sweets-snacks-nuts-seeds-peanuts-salted",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-nuts-seeds",
            "name_ar": "فول سوداني مالح",
            "name_fr": "Cacahuètes salées",
            "name_en": "Salted peanuts",
            "icon": "🥜",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 2
          },
          {
            "id": "sweets-snacks-nuts-seeds-almonds-roasted",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-nuts-seeds",
            "name_ar": "لوز محمص",
            "name_fr": "Amandes grillées",
            "name_en": "Roasted almonds",
            "icon": "🥜",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 3
          },
          {
            "id": "sweets-snacks-nuts-seeds-cashews-roasted",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-nuts-seeds",
            "name_ar": "كاجو محمص",
            "name_fr": "Noix de cajou grillées",
            "name_en": "Roasted cashews",
            "icon": "🥜",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 4
          },
          {
            "id": "sweets-snacks-nuts-seeds-pistachios-roasted",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-nuts-seeds",
            "name_ar": "فستق محمص",
            "name_fr": "Pistaches grillées",
            "name_en": "Roasted pistachios",
            "icon": "🥜",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 5
          },
          {
            "id": "sweets-snacks-nuts-seeds-walnuts",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-nuts-seeds",
            "name_ar": "جوز",
            "name_fr": "Noix",
            "name_en": "Walnuts",
            "icon": "🥜",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 6
          },
          {
            "id": "sweets-snacks-nuts-seeds-hazelnuts",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-nuts-seeds",
            "name_ar": "بندق",
            "name_fr": "Noisettes",
            "name_en": "Hazelnuts",
            "icon": "🥜",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 7
          },
          {
            "id": "sweets-snacks-nuts-seeds-mixed-nuts",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-nuts-seeds",
            "name_ar": "مكسرات مشكلة",
            "name_fr": "Noix mélangées",
            "name_en": "Mixed nuts",
            "icon": "🥜",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 8
          },
          {
            "id": "sweets-snacks-nuts-seeds-sunflower-seeds",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-nuts-seeds",
            "name_ar": "بذور عباد الشمس",
            "name_fr": "Graines de tournesol",
            "name_en": "Sunflower seeds",
            "icon": "🌻",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 9
          },
          {
            "id": "sweets-snacks-nuts-seeds-pumpkin-seeds",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-nuts-seeds",
            "name_ar": "بذور اليقطين",
            "name_fr": "Graines de citrouille",
            "name_en": "Pumpkin seeds",
            "icon": "🎃",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 10
          },
          {
            "id": "sweets-snacks-nuts-seeds-sesame-seeds",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-nuts-seeds",
            "name_ar": "بذور السمسم",
            "name_fr": "Graines de sésame",
            "name_en": "Sesame seeds",
            "icon": "🌿",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 11
          }
        ]
      },
      {
        "id": "sweets-snacks-dried-fruit",
        "category_id": "sweets-snacks",
        "name_ar": "الفواكه المجففة",
        "name_fr": "Fruits secs",
        "icon": "🫘",
        "sort_order": 6,
        "products": [
          {
            "id": "sweets-snacks-dried-fruit-raisins",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-dried-fruit",
            "name_ar": "زبيب",
            "name_fr": "Raisins secs",
            "name_en": "Raisins",
            "icon": "🫘",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 1
          },
          {
            "id": "sweets-snacks-dried-fruit-apricots",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-dried-fruit",
            "name_ar": "مشمش مجفف",
            "name_fr": "Abricots secs",
            "name_en": "Dried apricots",
            "icon": "🫘",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 2
          },
          {
            "id": "sweets-snacks-dried-fruit-prunes",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-dried-fruit",
            "name_ar": "برقوق مجفف",
            "name_fr": "Pruneaux",
            "name_en": "Prunes",
            "icon": "🫘",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 3
          },
          {
            "id": "sweets-snacks-dried-fruit-figs",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-dried-fruit",
            "name_ar": "تين مجفف",
            "name_fr": "Figues sèches",
            "name_en": "Dried figs",
            "icon": "🫘",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 4
          },
          {
            "id": "sweets-snacks-dried-fruit-dates",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-dried-fruit",
            "name_ar": "تمر",
            "name_fr": "Dattes",
            "name_en": "Dates",
            "icon": "🫘",
            "aliases_ar": [
              "دقلة نور"
            ],
            "aliases_fr": [
              "Deglet Nour"
            ],
            "default_unit": "paquet",
            "sort_order": 5
          },
          {
            "id": "sweets-snacks-dried-fruit-banana",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-dried-fruit",
            "name_ar": "موز مجفف",
            "name_fr": "Bananes séchées",
            "name_en": "Dried banana",
            "icon": "🫘",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 6
          },
          {
            "id": "sweets-snacks-dried-fruit-mango",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-dried-fruit",
            "name_ar": "مانجو مجففة",
            "name_fr": "Mangues séchées",
            "name_en": "Dried mango",
            "icon": "🫘",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 7
          },
          {
            "id": "sweets-snacks-dried-fruit-cranberries",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-dried-fruit",
            "name_ar": "توت بري مجفف",
            "name_fr": "Canneberges séchées",
            "name_en": "Dried cranberries",
            "icon": "🫘",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 8
          },
          {
            "id": "sweets-snacks-dried-fruit-mixed",
            "category_id": "sweets-snacks",
            "subcategory_id": "sweets-snacks-dried-fruit",
            "name_ar": "فواكه مجففة مشكلة",
            "name_fr": "Fruits secs mélangés",
            "name_en": "Mixed dried fruit",
            "icon": "🫘",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 9
          }
        ]
      }
    ]
  },
  {
    "id": "dairy",
    "name_ar": "منتجات الألبان",
    "name_fr": "Produits laitiers",
    "icon": "🥛",
    "sort_order": 7,
    "subcategories": [
      {
        "id": "dairy-milk",
        "category_id": "dairy",
        "name_ar": "الحليب",
        "name_fr": "Lait",
        "icon": "🥛",
        "sort_order": 1,
        "products": [
          {
            "id": "dairy-milk-whole",
            "category_id": "dairy",
            "subcategory_id": "dairy-milk",
            "name_ar": "حليب كامل الدسم",
            "name_fr": "Lait entier",
            "name_en": "Whole milk",
            "icon": "🥛",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "L",
            "sort_order": 1
          },
          {
            "id": "dairy-milk-semi-skimmed",
            "category_id": "dairy",
            "subcategory_id": "dairy-milk",
            "name_ar": "حليب نصف دسم",
            "name_fr": "Lait demi-écrémé",
            "name_en": "Semi-skimmed milk",
            "icon": "🥛",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "L",
            "sort_order": 2
          },
          {
            "id": "dairy-milk-skimmed",
            "category_id": "dairy",
            "subcategory_id": "dairy-milk",
            "name_ar": "حليب خالي الدسم",
            "name_fr": "Lait écrémé",
            "name_en": "Skimmed milk",
            "icon": "🥛",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "L",
            "sort_order": 3
          },
          {
            "id": "dairy-milk-chocolate",
            "category_id": "dairy",
            "subcategory_id": "dairy-milk",
            "name_ar": "حليب شوكولاتة",
            "name_fr": "Lait chocolat",
            "name_en": "Chocolate milk",
            "icon": "🍫",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "L",
            "sort_order": 4
          },
          {
            "id": "dairy-milk-strawberry",
            "category_id": "dairy",
            "subcategory_id": "dairy-milk",
            "name_ar": "حليب فراولة",
            "name_fr": "Lait fraise",
            "name_en": "Strawberry milk",
            "icon": "🍓",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "L",
            "sort_order": 5
          },
          {
            "id": "dairy-milk-vanilla",
            "category_id": "dairy",
            "subcategory_id": "dairy-milk",
            "name_ar": "حليب فانيليا",
            "name_fr": "Lait vanille",
            "name_en": "Vanilla milk",
            "icon": "🌿",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "L",
            "sort_order": 6
          },
          {
            "id": "dairy-milk-fresh",
            "category_id": "dairy",
            "subcategory_id": "dairy-milk",
            "name_ar": "حليب طازج",
            "name_fr": "Lait frais",
            "name_en": "Fresh milk",
            "icon": "🥛",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "L",
            "sort_order": 7
          },
          {
            "id": "dairy-milk-long-life",
            "category_id": "dairy",
            "subcategory_id": "dairy-milk",
            "name_ar": "حليب طويل الأمد",
            "name_fr": "Lait longue conservation",
            "name_en": "Long-life milk",
            "icon": "🥛",
            "aliases_ar": [
              "حليب معقم"
            ],
            "aliases_fr": [
              "Lait UHT"
            ],
            "default_unit": "L",
            "sort_order": 8
          },
          {
            "id": "dairy-milk-powder",
            "category_id": "dairy",
            "subcategory_id": "dairy-milk",
            "name_ar": "حليب بودرة",
            "name_fr": "Lait en poudre",
            "name_en": "Powdered milk",
            "icon": "🥛",
            "aliases_ar": [
              "حليب مجفف"
            ],
            "aliases_fr": [
              "Lait poudre"
            ],
            "default_unit": "g",
            "sort_order": 9
          }
        ]
      },
      {
        "id": "dairy-yogurt",
        "category_id": "dairy",
        "name_ar": "الياغورت",
        "name_fr": "Yaourts",
        "icon": "🥄",
        "sort_order": 2,
        "products": [
          {
            "id": "dairy-yogurt-natural",
            "category_id": "dairy",
            "subcategory_id": "dairy-yogurt",
            "name_ar": "ياغورت طبيعي",
            "name_fr": "Yaourt naturel",
            "name_en": "Natural yogurt",
            "icon": "🥄",
            "aliases_ar": [
              "رايب"
            ],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 1
          },
          {
            "id": "dairy-yogurt-strawberry",
            "category_id": "dairy",
            "subcategory_id": "dairy-yogurt",
            "name_ar": "ياغورت فراولة",
            "name_fr": "Yaourt fraise",
            "name_en": "Strawberry yogurt",
            "icon": "🍓",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 2
          },
          {
            "id": "dairy-yogurt-vanilla",
            "category_id": "dairy",
            "subcategory_id": "dairy-yogurt",
            "name_ar": "ياغورت فانيليا",
            "name_fr": "Yaourt vanille",
            "name_en": "Vanilla yogurt",
            "icon": "🌿",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 3
          },
          {
            "id": "dairy-yogurt-chocolate",
            "category_id": "dairy",
            "subcategory_id": "dairy-yogurt",
            "name_ar": "ياغورت شوكولاتة",
            "name_fr": "Yaourt chocolat",
            "name_en": "Chocolate yogurt",
            "icon": "🍫",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 4
          },
          {
            "id": "dairy-yogurt-peach",
            "category_id": "dairy",
            "subcategory_id": "dairy-yogurt",
            "name_ar": "ياغورت خوخ",
            "name_fr": "Yaourt pêche",
            "name_en": "Peach yogurt",
            "icon": "🍑",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 5
          },
          {
            "id": "dairy-yogurt-apricot",
            "category_id": "dairy",
            "subcategory_id": "dairy-yogurt",
            "name_ar": "ياغورت مشمش",
            "name_fr": "Yaourt abricot",
            "name_en": "Apricot yogurt",
            "icon": "🍑",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 6
          },
          {
            "id": "dairy-yogurt-banana",
            "category_id": "dairy",
            "subcategory_id": "dairy-yogurt",
            "name_ar": "ياغورت موز",
            "name_fr": "Yaourt banane",
            "name_en": "Banana yogurt",
            "icon": "🍌",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 7
          },
          {
            "id": "dairy-yogurt-lemon",
            "category_id": "dairy",
            "subcategory_id": "dairy-yogurt",
            "name_ar": "ياغورت ليمون",
            "name_fr": "Yaourt citron",
            "name_en": "Lemon yogurt",
            "icon": "🍋",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 8
          },
          {
            "id": "dairy-yogurt-greek",
            "category_id": "dairy",
            "subcategory_id": "dairy-yogurt",
            "name_ar": "ياغورت يوناني",
            "name_fr": "Yaourt grec",
            "name_en": "Greek yogurt",
            "icon": "🥄",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 9
          },
          {
            "id": "dairy-yogurt-drinking",
            "category_id": "dairy",
            "subcategory_id": "dairy-yogurt",
            "name_ar": "ياغورت سائل",
            "name_fr": "Yaourt à boire",
            "name_en": "Drinking yogurt",
            "icon": "🥤",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "bouteille",
            "sort_order": 10
          }
        ]
      },
      {
        "id": "dairy-cheese",
        "category_id": "dairy",
        "name_ar": "الجبن",
        "name_fr": "Fromages",
        "icon": "🧀",
        "sort_order": 3,
        "products": [
          {
            "id": "dairy-cheese-processed",
            "category_id": "dairy",
            "subcategory_id": "dairy-cheese",
            "name_ar": "جبن مطبوخ",
            "name_fr": "Fromage fondu",
            "name_en": "Processed cheese",
            "icon": "🧀",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "boîte",
            "sort_order": 1
          },
          {
            "id": "dairy-cheese-triangles",
            "category_id": "dairy",
            "subcategory_id": "dairy-cheese",
            "name_ar": "جبن مثلثات",
            "name_fr": "Fromage en triangles",
            "name_en": "Triangle cheese",
            "icon": "🔺",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "boîte",
            "sort_order": 2
          },
          {
            "id": "dairy-cheese-spreadable",
            "category_id": "dairy",
            "subcategory_id": "dairy-cheese",
            "name_ar": "جبن قابل للدهن",
            "name_fr": "Fromage à tartiner",
            "name_en": "Spreadable cheese",
            "icon": "🧀",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "boîte",
            "sort_order": 3
          },
          {
            "id": "dairy-cheese-cheddar",
            "category_id": "dairy",
            "subcategory_id": "dairy-cheese",
            "name_ar": "جبن شيدر",
            "name_fr": "Fromage cheddar",
            "name_en": "Cheddar cheese",
            "icon": "🧀",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "tranche",
            "sort_order": 4
          },
          {
            "id": "dairy-cheese-edam",
            "category_id": "dairy",
            "subcategory_id": "dairy-cheese",
            "name_ar": "جبن إيدام",
            "name_fr": "Fromage edam",
            "name_en": "Edam cheese",
            "icon": "🧀",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "tranche",
            "sort_order": 5
          },
          {
            "id": "dairy-cheese-gouda",
            "category_id": "dairy",
            "subcategory_id": "dairy-cheese",
            "name_ar": "جبن غودا",
            "name_fr": "Fromage gouda",
            "name_en": "Gouda cheese",
            "icon": "🧀",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "tranche",
            "sort_order": 6
          },
          {
            "id": "dairy-cheese-mozzarella",
            "category_id": "dairy",
            "subcategory_id": "dairy-cheese",
            "name_ar": "جبن موزاريلا",
            "name_fr": "Fromage mozzarella",
            "name_en": "Mozzarella cheese",
            "icon": "🧀",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "boule",
            "sort_order": 7
          },
          {
            "id": "dairy-cheese-parmesan",
            "category_id": "dairy",
            "subcategory_id": "dairy-cheese",
            "name_ar": "جبن بارميزان",
            "name_fr": "Fromage parmesan",
            "name_en": "Parmesan cheese",
            "icon": "🧀",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "g",
            "sort_order": 8
          },
          {
            "id": "dairy-cheese-grated",
            "category_id": "dairy",
            "subcategory_id": "dairy-cheese",
            "name_ar": "جبن مبشور",
            "name_fr": "Fromage râpé",
            "name_en": "Grated cheese",
            "icon": "🧀",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "paquet",
            "sort_order": 9
          },
          {
            "id": "dairy-cheese-cream-cheese",
            "category_id": "dairy",
            "subcategory_id": "dairy-cheese",
            "name_ar": "جبن كريمي",
            "name_fr": "Fromage à la crème",
            "name_en": "Cream cheese",
            "icon": "🧀",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "boîte",
            "sort_order": 10
          },
          {
            "id": "dairy-cheese-cottage",
            "category_id": "dairy",
            "subcategory_id": "dairy-cheese",
            "name_ar": "جبن قريش",
            "name_fr": "Fromage blanc",
            "name_en": "Cottage cheese",
            "icon": "🥄",
            "aliases_ar": [],
            "aliases_fr": [
              "Fromage frais"
            ],
            "default_unit": "pièce",
            "sort_order": 11
          },
          {
            "id": "dairy-cheese-ricotta",
            "category_id": "dairy",
            "subcategory_id": "dairy-cheese",
            "name_ar": "جبن ريكوتا",
            "name_fr": "Fromage ricotta",
            "name_en": "Ricotta cheese",
            "icon": "🧀",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "boîte",
            "sort_order": 12
          },
          {
            "id": "dairy-cheese-feta",
            "category_id": "dairy",
            "subcategory_id": "dairy-cheese",
            "name_ar": "جبن فيتا",
            "name_fr": "Fromage feta",
            "name_en": "Feta cheese",
            "icon": "🧀",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "boîte",
            "sort_order": 13
          },
          {
            "id": "dairy-cheese-brie",
            "category_id": "dairy",
            "subcategory_id": "dairy-cheese",
            "name_ar": "جبن بري",
            "name_fr": "Fromage brie",
            "name_en": "Brie cheese",
            "icon": "🧀",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 14
          },
          {
            "id": "dairy-cheese-camembert",
            "category_id": "dairy",
            "subcategory_id": "dairy-cheese",
            "name_ar": "جبن كاممبير",
            "name_fr": "Fromage camembert",
            "name_en": "Camembert cheese",
            "icon": "🧀",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 15
          }
        ]
      },
      {
        "id": "dairy-butter-margarine",
        "category_id": "dairy",
        "name_ar": "الزبدة والمارغرين",
        "name_fr": "Beurre et margarine",
        "icon": "🧈",
        "sort_order": 4,
        "products": [
          {
            "id": "dairy-butter-margarine-butter-salted",
            "category_id": "dairy",
            "subcategory_id": "dairy-butter-margarine",
            "name_ar": "زبدة مالحة",
            "name_fr": "Beurre salé",
            "name_en": "Salted butter",
            "icon": "🧈",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "g",
            "sort_order": 1
          },
          {
            "id": "dairy-butter-margarine-butter-unsalted",
            "category_id": "dairy",
            "subcategory_id": "dairy-butter-margarine",
            "name_ar": "زبدة غير مالحة",
            "name_fr": "Beurre doux",
            "name_en": "Unsalted butter",
            "icon": "🧈",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "g",
            "sort_order": 2
          },
          {
            "id": "dairy-butter-margarine-butter-clarified",
            "category_id": "dairy",
            "subcategory_id": "dairy-butter-margarine",
            "name_ar": "زبدة مصفاة",
            "name_fr": "Beurre clarifié",
            "name_en": "Clarified butter",
            "icon": "🧈",
            "aliases_ar": [
              "سمن"
            ],
            "aliases_fr": [
              "Ghee"
            ],
            "default_unit": "g",
            "sort_order": 3
          },
          {
            "id": "dairy-butter-margarine-margarine",
            "category_id": "dairy",
            "subcategory_id": "dairy-butter-margarine",
            "name_ar": "مارغرين",
            "name_fr": "Margarine",
            "name_en": "Margarine",
            "icon": "🧈",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "g",
            "sort_order": 4
          }
        ]
      },
      {
        "id": "dairy-cream",
        "category_id": "dairy",
        "name_ar": "الكريمة",
        "name_fr": "Crème",
        "icon": "🥄",
        "sort_order": 5,
        "products": [
          {
            "id": "dairy-cream-cooking",
            "category_id": "dairy",
            "subcategory_id": "dairy-cream",
            "name_ar": "كريمة طبخ",
            "name_fr": "Crème de cuisine",
            "name_en": "Cooking cream",
            "icon": "🥄",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "ml",
            "sort_order": 1
          },
          {
            "id": "dairy-cream-whipping",
            "category_id": "dairy",
            "subcategory_id": "dairy-cream",
            "name_ar": "كريمة خفق",
            "name_fr": "Crème fouettée",
            "name_en": "Whipping cream",
            "icon": "🥄",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "ml",
            "sort_order": 2
          },
          {
            "id": "dairy-cream-double",
            "category_id": "dairy",
            "subcategory_id": "dairy-cream",
            "name_ar": "كريمة مزدوجة",
            "name_fr": "Crème double",
            "name_en": "Double cream",
            "icon": "🥄",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "ml",
            "sort_order": 3
          },
          {
            "id": "dairy-cream-sour",
            "category_id": "dairy",
            "subcategory_id": "dairy-cream",
            "name_ar": "كريمة حامضة",
            "name_fr": "Crème aigre",
            "name_en": "Sour cream",
            "icon": "🥄",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "ml",
            "sort_order": 4
          },
          {
            "id": "dairy-cream-dessert",
            "category_id": "dairy",
            "subcategory_id": "dairy-cream",
            "name_ar": "كريمة حلوى",
            "name_fr": "Crème dessert",
            "name_en": "Dessert cream",
            "icon": "🍮",
            "aliases_ar": [
              "فلان"
            ],
            "aliases_fr": [
              "Flan"
            ],
            "default_unit": "pièce",
            "sort_order": 5
          }
        ]
      },
      {
        "id": "dairy-desserts",
        "category_id": "dairy",
        "name_ar": "حلويات الألبان",
        "name_fr": "Desserts laitiers",
        "icon": "🍮",
        "sort_order": 6,
        "products": [
          {
            "id": "dairy-desserts-rice-pudding",
            "category_id": "dairy",
            "subcategory_id": "dairy-desserts",
            "name_ar": "أرز بالحليب",
            "name_fr": "Riz au lait",
            "name_en": "Rice pudding",
            "icon": "🍚",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 1
          },
          {
            "id": "dairy-desserts-chocolate-pudding",
            "category_id": "dairy",
            "subcategory_id": "dairy-desserts",
            "name_ar": "بودينغ شوكولاتة",
            "name_fr": "Pudding au chocolat",
            "name_en": "Chocolate pudding",
            "icon": "🍫",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 2
          },
          {
            "id": "dairy-desserts-vanilla-pudding",
            "category_id": "dairy",
            "subcategory_id": "dairy-desserts",
            "name_ar": "بودينغ فانيليا",
            "name_fr": "Pudding à la vanille",
            "name_en": "Vanilla pudding",
            "icon": "🌿",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 3
          },
          {
            "id": "dairy-desserts-caramel",
            "category_id": "dairy",
            "subcategory_id": "dairy-desserts",
            "name_ar": "كراميل",
            "name_fr": "Crème caramel",
            "name_en": "Caramel cream",
            "icon": "🍮",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 4
          },
          {
            "id": "dairy-desserts-mousse",
            "category_id": "dairy",
            "subcategory_id": "dairy-desserts",
            "name_ar": "موس",
            "name_fr": "Mousse",
            "name_en": "Mousse",
            "icon": "🍮",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 5
          }
        ]
      }
    ]
  },
  {
    "id": "meat-poultry-eggs",
    "name_ar": "اللحوم والدجاج والبيض",
    "name_fr": "Viandes, volailles et œufs",
    "icon": "🥩",
    "sort_order": 8,
    "subcategories": [
      {
        "id": "meat-poultry-eggs-beef",
        "category_id": "meat-poultry-eggs",
        "name_ar": "لحم بقري",
        "name_fr": "Viande bovine",
        "icon": "🥩",
        "sort_order": 1,
        "products": [
          {
            "id": "meat-poultry-eggs-beef-fresh",
            "category_id": "meat-poultry-eggs",
            "subcategory_id": "meat-poultry-eggs-beef",
            "name_ar": "لحم بقري طازج",
            "name_fr": "Viande bovine fraîche",
            "name_en": "Fresh beef",
            "icon": "🥩",
            "aliases_ar": [
              "لحم بقر"
            ],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 1
          },
          {
            "id": "meat-poultry-eggs-beef-minced",
            "category_id": "meat-poultry-eggs",
            "subcategory_id": "meat-poultry-eggs-beef",
            "name_ar": "لحم بقري مفروم",
            "name_fr": "Viande bovine hachée",
            "name_en": "Ground beef",
            "icon": "🥩",
            "aliases_ar": [
              "لحم مفروم"
            ],
            "aliases_fr": [
              "Viande hachée"
            ],
            "default_unit": "kg",
            "sort_order": 2
          },
          {
            "id": "meat-poultry-eggs-beef-steak",
            "category_id": "meat-poultry-eggs",
            "subcategory_id": "meat-poultry-eggs-beef",
            "name_ar": "ستيك بقري",
            "name_fr": "Steak de bœuf",
            "name_en": "Beef steak",
            "icon": "🥩",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 3
          },
          {
            "id": "meat-poultry-eggs-beef-cubes",
            "category_id": "meat-poultry-eggs",
            "subcategory_id": "meat-poultry-eggs-beef",
            "name_ar": "لحم بقري مكعبات",
            "name_fr": "Viande bovine en cubes",
            "name_en": "Beef cubes",
            "icon": "🥩",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 4
          },
          {
            "id": "meat-poultry-eggs-beef-liver",
            "category_id": "meat-poultry-eggs",
            "subcategory_id": "meat-poultry-eggs-beef",
            "name_ar": "كبد بقري",
            "name_fr": "Foie de bœuf",
            "name_en": "Beef liver",
            "icon": "🫀",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 5
          }
        ]
      },
      {
        "id": "meat-poultry-eggs-lamb",
        "category_id": "meat-poultry-eggs",
        "name_ar": "لحم غنم",
        "name_fr": "Viande ovine",
        "icon": "🐑",
        "sort_order": 2,
        "products": [
          {
            "id": "meat-poultry-eggs-lamb-fresh",
            "category_id": "meat-poultry-eggs",
            "subcategory_id": "meat-poultry-eggs-lamb",
            "name_ar": "لحم غنم طازج",
            "name_fr": "Viande ovine fraîche",
            "name_en": "Fresh lamb",
            "icon": "🍖",
            "aliases_ar": [
              "لحم خروف"
            ],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 1
          },
          {
            "id": "meat-poultry-eggs-lamb-chops",
            "category_id": "meat-poultry-eggs",
            "subcategory_id": "meat-poultry-eggs-lamb",
            "name_ar": "أضلاع غنم",
            "name_fr": "Côtelettes d'agneau",
            "name_en": "Lamb chops",
            "icon": "🍖",
            "aliases_ar": [
              "كوتليت"
            ],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 2
          },
          {
            "id": "meat-poultry-eggs-lamb-leg",
            "category_id": "meat-poultry-eggs",
            "subcategory_id": "meat-poultry-eggs-lamb",
            "name_ar": "فخذ غنم",
            "name_fr": "Gigot d'agneau",
            "name_en": "Leg of lamb",
            "icon": "🍖",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 3
          },
          {
            "id": "meat-poultry-eggs-lamb-shoulder",
            "category_id": "meat-poultry-eggs",
            "subcategory_id": "meat-poultry-eggs-lamb",
            "name_ar": "كتف غنم",
            "name_fr": "Épaule d'agneau",
            "name_en": "Lamb shoulder",
            "icon": "🍖",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 4
          },
          {
            "id": "meat-poultry-eggs-lamb-liver",
            "category_id": "meat-poultry-eggs",
            "subcategory_id": "meat-poultry-eggs-lamb",
            "name_ar": "كبد غنم",
            "name_fr": "Foie d'agneau",
            "name_en": "Lamb liver",
            "icon": "🫀",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 5
          }
        ]
      },
      {
        "id": "meat-poultry-eggs-chicken",
        "category_id": "meat-poultry-eggs",
        "name_ar": "الدجاج",
        "name_fr": "Poulet",
        "icon": "🍗",
        "sort_order": 3,
        "products": [
          {
            "id": "meat-poultry-eggs-chicken-whole",
            "category_id": "meat-poultry-eggs",
            "subcategory_id": "meat-poultry-eggs-chicken",
            "name_ar": "دجاج كامل",
            "name_fr": "Poulet entier",
            "name_en": "Whole chicken",
            "icon": "🍗",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 1
          },
          {
            "id": "meat-poultry-eggs-chicken-breast",
            "category_id": "meat-poultry-eggs",
            "subcategory_id": "meat-poultry-eggs-chicken",
            "name_ar": "صدر دجاج",
            "name_fr": "Poitrine de poulet",
            "name_en": "Chicken breast",
            "icon": "🍗",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 2
          },
          {
            "id": "meat-poultry-eggs-chicken-thighs",
            "category_id": "meat-poultry-eggs",
            "subcategory_id": "meat-poultry-eggs-chicken",
            "name_ar": "أفخاذ دجاج",
            "name_fr": "Cuisses de poulet",
            "name_en": "Chicken thighs",
            "icon": "🍗",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 3
          },
          {
            "id": "meat-poultry-eggs-chicken-wings",
            "category_id": "meat-poultry-eggs",
            "subcategory_id": "meat-poultry-eggs-chicken",
            "name_ar": "أجنحة دجاج",
            "name_fr": "Ailes de poulet",
            "name_en": "Chicken wings",
            "icon": "🍗",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 4
          },
          {
            "id": "meat-poultry-eggs-chicken-drumsticks",
            "category_id": "meat-poultry-eggs",
            "subcategory_id": "meat-poultry-eggs-chicken",
            "name_ar": "أرجل دجاج",
            "name_fr": "Pilons de poulet",
            "name_en": "Chicken drumsticks",
            "icon": "🍗",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 5
          },
          {
            "id": "meat-poultry-eggs-chicken-minced",
            "category_id": "meat-poultry-eggs",
            "subcategory_id": "meat-poultry-eggs-chicken",
            "name_ar": "دجاج مفروم",
            "name_fr": "Poulet haché",
            "name_en": "Ground chicken",
            "icon": "🍗",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 6
          },
          {
            "id": "meat-poultry-eggs-chicken-liver",
            "category_id": "meat-poultry-eggs",
            "subcategory_id": "meat-poultry-eggs-chicken",
            "name_ar": "كبد دجاج",
            "name_fr": "Foie de poulet",
            "name_en": "Chicken liver",
            "icon": "🫀",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 7
          },
          {
            "id": "meat-poultry-eggs-chicken-gizzard",
            "category_id": "meat-poultry-eggs",
            "subcategory_id": "meat-poultry-eggs-chicken",
            "name_ar": "قوانص دجاج",
            "name_fr": "Gésiers de poulet",
            "name_en": "Chicken gizzard",
            "icon": "🫀",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 8
          }
        ]
      },
      {
        "id": "meat-poultry-eggs-other-poultry",
        "category_id": "meat-poultry-eggs",
        "name_ar": "دواجن أخرى",
        "name_fr": "Autres volailles",
        "icon": "🦆",
        "sort_order": 4,
        "products": [
          {
            "id": "meat-poultry-eggs-other-poultry-duck",
            "category_id": "meat-poultry-eggs",
            "subcategory_id": "meat-poultry-eggs-other-poultry",
            "name_ar": "بط",
            "name_fr": "Canard",
            "name_en": "Duck",
            "icon": "🦆",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 1
          },
          {
            "id": "meat-poultry-eggs-other-poultry-turkey",
            "category_id": "meat-poultry-eggs",
            "subcategory_id": "meat-poultry-eggs-other-poultry",
            "name_ar": "ديك رومي",
            "name_fr": "Dinde",
            "name_en": "Turkey",
            "icon": "🦃",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 2
          },
          {
            "id": "meat-poultry-eggs-other-poultry-quail",
            "category_id": "meat-poultry-eggs",
            "subcategory_id": "meat-poultry-eggs-other-poultry",
            "name_ar": "حجل",
            "name_fr": "Caille",
            "name_en": "Quail",
            "icon": "🐦",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 3
          }
        ]
      },
      {
        "id": "meat-poultry-eggs-eggs",
        "category_id": "meat-poultry-eggs",
        "name_ar": "البيض",
        "name_fr": "Œufs",
        "icon": "🥚",
        "sort_order": 5,
        "products": [
          {
            "id": "meat-poultry-eggs-eggs-chicken",
            "category_id": "meat-poultry-eggs",
            "subcategory_id": "meat-poultry-eggs-eggs",
            "name_ar": "بيض دجاج",
            "name_fr": "Œufs de poule",
            "name_en": "Chicken eggs",
            "icon": "🥚",
            "aliases_ar": [
              "بيض عادي"
            ],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 1
          },
          {
            "id": "meat-poultry-eggs-eggs-large",
            "category_id": "meat-poultry-eggs",
            "subcategory_id": "meat-poultry-eggs-eggs",
            "name_ar": "بيض كبير",
            "name_fr": "Gros œufs",
            "name_en": "Large eggs",
            "icon": "🥚",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 2
          },
          {
            "id": "meat-poultry-eggs-eggs-medium",
            "category_id": "meat-poultry-eggs",
            "subcategory_id": "meat-poultry-eggs-eggs",
            "name_ar": "بيض متوسط",
            "name_fr": "Œufs moyens",
            "name_en": "Medium eggs",
            "icon": "🥚",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 3
          },
          {
            "id": "meat-poultry-eggs-eggs-small",
            "category_id": "meat-poultry-eggs",
            "subcategory_id": "meat-poultry-eggs-eggs",
            "name_ar": "بيض صغير",
            "name_fr": "Petits œufs",
            "name_en": "Small eggs",
            "icon": "🥚",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 4
          },
          {
            "id": "meat-poultry-eggs-eggs-baladi",
            "category_id": "meat-poultry-eggs",
            "subcategory_id": "meat-poultry-eggs-eggs",
            "name_ar": "بيض بلدي",
            "name_fr": "Œufs fermiers",
            "name_en": "Farm eggs",
            "icon": "🥚",
            "aliases_ar": [
              "بيض حر"
            ],
            "aliases_fr": [
              "Œufs de ferme"
            ],
            "default_unit": "pièce",
            "sort_order": 5
          },
          {
            "id": "meat-poultry-eggs-eggs-duck",
            "category_id": "meat-poultry-eggs",
            "subcategory_id": "meat-poultry-eggs-eggs",
            "name_ar": "بيض بط",
            "name_fr": "Œufs de canard",
            "name_en": "Duck eggs",
            "icon": "🥚",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 6
          },
          {
            "id": "meat-poultry-eggs-eggs-quail",
            "category_id": "meat-poultry-eggs",
            "subcategory_id": "meat-poultry-eggs-eggs",
            "name_ar": "بيض حجل",
            "name_fr": "Œufs de caille",
            "name_en": "Quail eggs",
            "icon": "🥚",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "pièce",
            "sort_order": 7
          }
        ]
      },
      {
        "id": "meat-poultry-eggs-offal",
        "category_id": "meat-poultry-eggs",
        "name_ar": "الأحشاء",
        "name_fr": "Abats",
        "icon": "🫀",
        "sort_order": 6,
        "products": [
          {
            "id": "meat-poultry-eggs-offal-beef-liver",
            "category_id": "meat-poultry-eggs",
            "subcategory_id": "meat-poultry-eggs-offal",
            "name_ar": "كبد بقري",
            "name_fr": "Foie de bœuf",
            "name_en": "Beef liver",
            "icon": "🫀",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 1
          },
          {
            "id": "meat-poultry-eggs-offal-lamb-liver",
            "category_id": "meat-poultry-eggs",
            "subcategory_id": "meat-poultry-eggs-offal",
            "name_ar": "كبد غنم",
            "name_fr": "Foie d'agneau",
            "name_en": "Lamb liver",
            "icon": "🫀",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 2
          },
          {
            "id": "meat-poultry-eggs-offal-chicken-liver",
            "category_id": "meat-poultry-eggs",
            "subcategory_id": "meat-poultry-eggs-offal",
            "name_ar": "كبد دجاج",
            "name_fr": "Foie de poulet",
            "name_en": "Chicken liver",
            "icon": "🫀",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 3
          },
          {
            "id": "meat-poultry-eggs-offal-heart",
            "category_id": "meat-poultry-eggs",
            "subcategory_id": "meat-poultry-eggs-offal",
            "name_ar": "قلب",
            "name_fr": "Cœur",
            "name_en": "Heart",
            "icon": "🫀",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 4
          },
          {
            "id": "meat-poultry-eggs-offal-kidney",
            "category_id": "meat-poultry-eggs",
            "subcategory_id": "meat-poultry-eggs-offal",
            "name_ar": "كلى",
            "name_fr": "Reins",
            "name_en": "Kidney",
            "icon": "🫀",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 5
          },
          {
            "id": "meat-poultry-eggs-offal-tripe",
            "category_id": "meat-poultry-eggs",
            "subcategory_id": "meat-poultry-eggs-offal",
            "name_ar": "كرشة",
            "name_fr": "Tripes",
            "name_en": "Tripe",
            "icon": "🫀",
            "aliases_ar": [],
            "aliases_fr": [],
            "default_unit": "kg",
            "sort_order": 6
          }
        ]
      }
    ]
  }
],
};
