export interface WisdomEntry {
  id: string;
  category: string;
  arabic: string;
  english: string;
  turkish: string;
  enabled: boolean;
  weight: number;
}

export interface QuestionEntry {
  id: string;
  category: string;
  arabic: string;
  english: string;
  turkish: string;
  enabled: boolean;
  weight: number;
}

const WISDOM_CATEGORIES = [
  'happiness', 'optimism', 'patience', 'success', 'work',
  'ethics', 'parents', 'brotherhood', 'marriage', 'love',
  'supplication', 'time', 'learning', 'honesty', 'trust',
  'trade', 'confidence', 'health', 'mind', 'focus',
  'hope', 'responsibility', 'respect', 'cleanliness', 'cooperation',
] as const;

export type WisdomCategory = typeof WISDOM_CATEGORIES[number];

export const CATEGORY_LABELS: Record<WisdomCategory, { arabic: string; english: string; turkish: string }> = {
  happiness: { arabic: 'السعادة', english: 'Happiness', turkish: 'Mutluluk' },
  optimism: { arabic: 'التفاؤل', english: 'Optimism', turkish: 'İyimserlik' },
  patience: { arabic: 'الصبر', english: 'Patience', turkish: 'Sabır' },
  success: { arabic: 'النجاح', english: 'Success', turkish: 'Başarı' },
  work: { arabic: 'العمل', english: 'Work', turkish: 'Çalışma' },
  ethics: { arabic: 'الأخلاق', english: 'Ethics', turkish: 'Ahlak' },
  parents: { arabic: 'بر الوالدين', english: 'Parents', turkish: 'Ebeveynler' },
  brotherhood: { arabic: 'الأخوة', english: 'Brotherhood', turkish: 'Kardeşlik' },
  marriage: { arabic: 'الزواج', english: 'Marriage', turkish: 'Evlilik' },
  love: { arabic: 'الحب الحلال', english: 'Halal Love', turkish: 'Helal Aşk' },
  supplication: { arabic: 'الدعاء', english: 'Supplication', turkish: 'Dua' },
  time: { arabic: 'الوقت', english: 'Time', turkish: 'Zaman' },
  learning: { arabic: 'العلم', english: 'Learning', turkish: 'Öğrenme' },
  honesty: { arabic: 'الصدق', english: 'Honesty', turkish: 'Doğruluk' },
  trust: { arabic: 'الأمانة', english: 'Trust', turkish: 'Güven' },
  trade: { arabic: 'التجارة', english: 'Trade', turkish: 'Ticaret' },
  confidence: { arabic: 'الثقة', english: 'Confidence', turkish: 'Özgüven' },
  health: { arabic: 'الصحة', english: 'Health', turkish: 'Sağlık' },
  mind: { arabic: 'العقل', english: 'Mind', turkish: 'Akıl' },
  focus: { arabic: 'التركيز', english: 'Focus', turkish: 'Odak' },
  hope: { arabic: 'الأمل', english: 'Hope', turkish: 'Umut' },
  responsibility: { arabic: 'المسؤولية', english: 'Responsibility', turkish: 'Sorumluluk' },
  respect: { arabic: 'الاحترام', english: 'Respect', turkish: 'Saygı' },
  cleanliness: { arabic: 'النظافة', english: 'Cleanliness', turkish: 'Temizlik' },
  cooperation: { arabic: 'التعاون', english: 'Cooperation', turkish: 'İşbirliği' },
};

const WISDOM_DATA: WisdomEntry[] = [
  // ── Patience ──
  { id: 'w001', category: 'patience', enabled: true, weight: 1,
    arabic: 'لا تحزن، فلن يتوقف شيء لحزنك، عش يومك بسعادة.',
    english: 'Don\'t let sadness stop your life. Live today with joy.',
    turkish: 'Üzüntü hayatı durdurmaz. Bugünü mutlulukla yaşa.' },
  { id: 'w002', category: 'patience', enabled: true, weight: 1,
    arabic: 'الصبر مفتاح الفرج، وبعد العسر يسراً.',
    english: 'Patience is the key to relief. After hardship comes ease.',
    turkish: 'Sabır, ferahlığın anahtarıdır. Zorluktan sonra kolaylık gelir.' },
  { id: 'w003', category: 'patience', enabled: true, weight: 1,
    arabic: 'إن الله مع الصابرين.',
    english: 'Indeed, Allah is with the patient.',
    turkish: 'Şüphesiz Allah sabredenlerle beraberdir.' },
  { id: 'w101', category: 'patience', enabled: true, weight: 1,
    arabic: 'ما أعطى الله عبداً عوضاً خيراً من الصبر.',
    english: 'Allah has given no servant a better reward than patience.',
    turkish: 'Allah bir kula sabırdan daha hayırlı bir ödül vermemiştir.' },
  { id: 'w102', category: 'patience', enabled: true, weight: 1,
    arabic: 'اصبر قليلاً فبعد العسر تيسير، وكل أمر له وقت وتدبير.',
    english: 'Be patient, after hardship comes ease. Everything has its time.',
    turkish: 'Biraz sabret, zorluktan sonra kolaylık gelir. Her şeyin bir zamanı vardır.' },
  { id: 'w103', category: 'patience', enabled: true, weight: 1,
    arabic: 'الصبر ليس مجرد تحمل الألم، بل تحمله برضا.',
    english: 'Patience is not just enduring pain, but enduring it with contentment.',
    turkish: 'Sabır sadece acıya katlanmak değil, onu hoşnutlukla karşılamaktır.' },

  // ── Hope ──
  { id: 'w004', category: 'hope', enabled: true, weight: 1,
    arabic: 'لا تيأس من روح الله، إن رحمته قريبة.',
    english: 'Do not despair of Allah\'s mercy. His mercy is near.',
    turkish: 'Allah\'ın rahmetinden ümit kesmeyin. Rahmeti yakındır.' },
  { id: 'w005', category: 'hope', enabled: true, weight: 1,
    arabic: 'بعد الظلام يأتي الفجر، وبعد الشتاء يأتي الربيع.',
    english: 'After darkness comes dawn. After winter comes spring.',
    turkish: 'Karanlıktan sonra şafak söker. Kıştan sonra bahar gelir.' },
  { id: 'w006', category: 'hope', enabled: true, weight: 1,
    arabic: 'الأمل هو النور الذي يضيء طريقك في أحلك اللحظات.',
    english: 'Hope is the light that guides you through the darkest moments.',
    turkish: 'Umut, en karanlık anlarda size yol gösteren ışıktır.' },
  { id: 'w104', category: 'hope', enabled: true, weight: 1,
    arabic: 'الأمل يجعلك ترى النور حتى في أعمق الأنفاق.',
    english: 'Hope lets you see light even in the deepest tunnels.',
    turkish: 'Umut, en derin tünellerde bile ışığı görmenizi sağlar.' },
  { id: 'w105', category: 'hope', enabled: true, weight: 1,
    arabic: 'لا تيأس، فالقادم أجمل بإذن الله.',
    english: 'Do not despair, the future is better, God willing.',
    turkish: 'Ümitsizliğe kapılma, gelecek daha güzel inşallah.' },
  { id: 'w106', category: 'hope', enabled: true, weight: 1,
    arabic: 'الأمل أن ترى النور في عيون من فقدوا البصر.',
    english: 'Hope is seeing light in the eyes of those who have lost sight.',
    turkish: 'Umut, görme yetisini kaybedenlerin gözlerinde ışığı görmektir.' },

  // ── Happiness ──
  { id: 'w107', category: 'happiness', enabled: true, weight: 1,
    arabic: 'السعادة ليست في امتلاك الأشياء، بل في الاستمتاع بها.',
    english: 'Happiness is not in owning things, but in enjoying them.',
    turkish: 'Mutluluk bir şeye sahip olmakta değil, ondan zevk almaktadır.' },
  { id: 'w108', category: 'happiness', enabled: true, weight: 1,
    arabic: 'سعادة الإنسان في رضا ربه ورضا والديه.',
    english: 'Human happiness is in the pleasure of God and parents.',
    turkish: 'İnsan mutluluğu Rabbinin ve anne babasının hoşnutluğundadır.' },
  { id: 'w109', category: 'happiness', enabled: true, weight: 1,
    arabic: 'السعادة قرار، لا تأتي من الخارج بل تنبع من الداخل.',
    english: 'Happiness is a decision. It comes from within, not from outside.',
    turkish: 'Mutluluk bir karardır. Dışarıdan gelmez, içten doğar.' },

  // ── Ethics ──
  { id: 'w007', category: 'ethics', enabled: true, weight: 1,
    arabic: 'إنما بعثت لأتمم مكارم الأخلاق.',
    english: 'I was sent to perfect noble character.',
    turkish: 'Güzel ahlakı tamamlamak için gönderildim.' },
  { id: 'w008', category: 'ethics', enabled: true, weight: 1,
    arabic: 'خيركم أحسنكم أخلاقاً.',
    english: 'The best among you are those with the best character.',
    turkish: 'En hayırlınız, ahlakı en güzel olanınızdır.' },
  { id: 'w009', category: 'ethics', enabled: true, weight: 1,
    arabic: 'الصدق طريق النجاة، والكذب مهلكة.',
    english: 'Honesty is the path to salvation. Lies lead to ruin.',
    turkish: 'Doğruluk kurtuluş yoludur. Yalan yıkıma götürür.' },
  { id: 'w110', category: 'ethics', enabled: true, weight: 1,
    arabic: 'حسن الخلق يذيب الخطايا كما تذيب الشمس الجليد.',
    english: 'Good character melts sins as the sun melts ice.',
    turkish: 'Güzel ahlak, güneşin buzu erittiği gibi günahları eritir.' },
  { id: 'w111', category: 'ethics', enabled: true, weight: 1,
    arabic: 'أكثر الناس كرماً من عفا عن من ظلمه.',
    english: 'The most generous person is the one who forgives those who wronged them.',
    turkish: 'En cömert insan, kendisine zulmedeni bağışlayandır.' },

  // ── Work ──
  { id: 'w010', category: 'work', enabled: true, weight: 1,
    arabic: 'اعمل لدنياك كأنك تعيش أبداً، واعمل لآخرتك كأنك تموت غداً.',
    english: 'Work for your world as if you will live forever. Work for your hereafter as if you will die tomorrow.',
    turkish: 'Dünyan için sonsuza kadar yaşayacakmış gibi çalış. Ahiretin için yarın ölecekmiş gibi çalış.' },
  { id: 'w011', category: 'work', enabled: true, weight: 1,
    arabic: 'الإتقان في العمل عبادة.',
    english: 'Perfection in work is worship.',
    turkish: 'İşte mükemmellik ibadettir.' },
  { id: 'w012', category: 'work', enabled: true, weight: 1,
    arabic: 'من جد وجد، ومن زرع حصد.',
    english: 'Whoever strives finds, whoever plants reaps.',
    turkish: 'Çalışan bulur, eken biçer.' },
  { id: 'w112', category: 'work', enabled: true, weight: 1,
    arabic: 'خير العمل ما أخلص فيه العامل نيته.',
    english: 'The best work is that in which the worker is sincere in intention.',
    turkish: 'En hayırlı iş, çalışanın niyetini ihlaslı kıldığı iştir.' },

  // ── Success ──
  { id: 'w013', category: 'success', enabled: true, weight: 1,
    arabic: 'النجاح ليس غياب الفشل، بل الاستمرار بعد الفشل.',
    english: 'Success is not the absence of failure, but persistence after failure.',
    turkish: 'Başarı, başarısızlığın olmaması değil, başarısızlıktan sonra devam edebilmektir.' },
  { id: 'w014', category: 'success', enabled: true, weight: 1,
    arabic: 'من سار على الدرب وصل.',
    english: 'Whoever walks the path arrives.',
    turkish: 'Yolda yürüyen varır.' },
  { id: 'w015', category: 'success', enabled: true, weight: 1,
    arabic: 'النجاح رحلة وليس وجهة.',
    english: 'Success is a journey, not a destination.',
    turkish: 'Başarı bir yolculuktur, varış noktası değil.' },
  { id: 'w113', category: 'success', enabled: true, weight: 1,
    arabic: 'لا نجاح بلا خطة، ولا خطة بلا هدف.',
    english: 'No success without a plan, no plan without a goal.',
    turkish: 'Plansız başarı olmaz, hedef olmadan plan olmaz.' },
  { id: 'w114', category: 'success', enabled: true, weight: 1,
    arabic: 'النجاح لا يصنع الفرد، بل تصنعه الجماعة.',
    english: 'Success is not made by the individual but by the team.',
    turkish: 'Başarıyı birey değil, takım oluşturur.' },

  // ── Parents ──
  { id: 'w025', category: 'parents', enabled: true, weight: 1,
    arabic: 'الوالدان بابان من أبواب الجنة.',
    english: 'Parents are two gates to paradise.',
    turkish: 'Anne baba cennetin iki kapısıdır.' },
  { id: 'w026', category: 'parents', enabled: true, weight: 1,
    arabic: 'رضا الرب في رضا الوالدين.',
    english: 'The Lord\'s pleasure is in the pleasure of parents.',
    turkish: 'Rabbin rızası anne babanın rızasındadır.' },
  { id: 'w027', category: 'parents', enabled: true, weight: 1,
    arabic: 'لا تقل لهما أف ولا تنهرهما.',
    english: 'Do not say to them a word of disrespect nor scold them.',
    turkish: 'Onlara öf bile deme, onları azarlama.' },
  { id: 'w115', category: 'parents', enabled: true, weight: 1,
    arabic: 'الجنة تحت أقدام الأمهات.',
    english: 'Paradise lies at the feet of mothers.',
    turkish: 'Cennet annelerin ayakları altındadır.' },
  { id: 'w116', category: 'parents', enabled: true, weight: 1,
    arabic: 'بر الوالدين من أحب الأعمال إلى الله.',
    english: 'Kindness to parents is among the most beloved deeds to Allah.',
    turkish: 'Anne babaya iyilik, Allah\'a en sevgili amellerdendir.' },

  // ── Brotherhood ──
  { id: 'w021', category: 'brotherhood', enabled: true, weight: 1,
    arabic: 'المؤمن للمؤمن كالبنيان يشد بعضه بعضاً.',
    english: 'The believer to another believer is like a building, each part supports the other.',
    turkish: 'Mümin, müminin kardeşidir. Bir bina gibi birbirini destekler.' },
  { id: 'w022', category: 'brotherhood', enabled: true, weight: 1,
    arabic: 'لا تكن وحيداً في زحام الحياة، الأخوة سند.',
    english: 'Don\'t be alone in the crowd of life. Brotherhood is support.',
    turkish: 'Hayat kalabalığında yalnız olma. Kardeşlik destektir.' },
  { id: 'w117', category: 'brotherhood', enabled: true, weight: 1,
    arabic: 'المسلم أخو المسلم، لا يظلمه ولا يسلمه.',
    english: 'A Muslim is the brother of another Muslim. He does not wrong him nor abandon him.',
    turkish: 'Müslüman, Müslümanın kardeşidir. Ona zulmetmez ve onu yalnız bırakmaz.' },

  // ── Marriage ──
  { id: 'w118', category: 'marriage', enabled: true, weight: 1,
    arabic: 'الزواج نصف الدين، فليتق الله أحدكم في النصف الباقي.',
    english: 'Marriage is half of faith, so let one fear Allah regarding the remaining half.',
    turkish: 'Evlilik imanın yarısıdır. Geri kalan yarısında Allah\'tan korkun.' },
  { id: 'w119', category: 'marriage', enabled: true, weight: 1,
    arabic: 'خير النساء من تسره إذا نظر وتطيعه إذا أمر.',
    english: 'The best woman is one who pleases you when you look and obeys when you command.',
    turkish: 'En hayırlı kadın, baktığında seni sevindiren ve emrettiğinde itaat edendir.' },
  { id: 'w120', category: 'marriage', enabled: true, weight: 1,
    arabic: 'السكن والمودة ركنان أساسيان في الزواج السعيد.',
    english: 'Tranquility and affection are two pillars of a happy marriage.',
    turkish: 'Huzur ve sevgi mutlu bir evliliğin iki temel direğidir.' },

  // ── Love ──
  { id: 'w023', category: 'love', enabled: true, weight: 1,
    arabic: 'الحب الحلال طهارة وسكينة.',
    english: 'Halal love is purity and tranquility.',
    turkish: 'Helal aşk saflık ve huzurdur.' },
  { id: 'w024', category: 'love', enabled: true, weight: 1,
    arabic: 'إذا أحب عبداً ابتلاه، فمن صبر فله الصبر، ومن جزع فله الجزع.',
    english: 'When Allah loves a servant, He tests him. Whoever is patient has patience, whoever panics has panic.',
    turkish: 'Allah bir kulu severse onu imtihan eder.' },
  { id: 'w121', category: 'love', enabled: true, weight: 1,
    arabic: 'الحب في الله من أوثق عرى الإيمان.',
    english: 'Love for the sake of Allah is the firmest bond of faith.',
    turkish: 'Allah için sevmek imanın en sağlam bağıdır.' },
  { id: 'w122', category: 'love', enabled: true, weight: 1,
    arabic: 'إذا أحب الله عبداً ابتلاه، فإن صبر اجتباه.',
    english: 'When Allah loves a servant He tests him. If he is patient, He chooses him.',
    turkish: 'Allah bir kulu severse onu sınar. Sabrederse onu seçer.' },

  // ── Supplication ──
  { id: 'w123', category: 'supplication', enabled: true, weight: 1,
    arabic: 'الدعاء هو العبادة.',
    english: 'Supplication is worship.',
    turkish: 'Dua ibadettir.' },
  { id: 'w124', category: 'supplication', enabled: true, weight: 1,
    arabic: 'ادعوني أستجيب لكم.',
    english: 'Call upon Me, I will respond to you.',
    turkish: 'Bana dua edin, size cevap vereyim.' },
  { id: 'w125', category: 'supplication', enabled: true, weight: 1,
    arabic: 'لا يرد القضاء إلا الدعاء.',
    english: 'Nothing repels destiny except supplication.',
    turkish: 'Kaderi ancak dua geri çevirir.' },

  // ── Time ──
  { id: 'w037', category: 'time', enabled: true, weight: 1,
    arabic: 'الوقت كالسيف إن لم تقطعه قطعك.',
    english: 'Time is like a sword. If you don\'t cut it, it cuts you.',
    turkish: 'Zaman kılıç gibidir. Sen onu kesmezsen o seni keser.' },
  { id: 'w038', category: 'time', enabled: true, weight: 1,
    arabic: 'اغتنم خمساً قبل خمس: شبابك قبل هرمك، وصحتك قبل سقمك.',
    english: 'Take advantage of five before five: your youth before old age, your health before sickness.',
    turkish: 'Beş şey gelmeden önce beş şeyin kıymetini bil.' },
  { id: 'w039', category: 'time', enabled: true, weight: 1,
    arabic: 'أضاعوا وقتهم في التسويف، وندموا حين لا ينفع الندم.',
    english: 'They wasted their time procrastinating and regretted when regret was useless.',
    turkish: 'Zamanlarını erteleyerek harcadılar ve pişmanlık fayda vermediğinde pişman oldular.' },
  { id: 'w126', category: 'time', enabled: true, weight: 1,
    arabic: 'الوقت من ذهب، فمن ضيعه ضاع.',
    english: 'Time is gold. Whoever wastes it is lost.',
    turkish: 'Zaman altındır. Onu boşa harcayan kaybeder.' },

  // ── Learning ──
  { id: 'w028', category: 'learning', enabled: true, weight: 1,
    arabic: 'اطلب العلم من المهد إلى اللحد.',
    english: 'Seek knowledge from the cradle to the grave.',
    turkish: 'Beşikten mezara kadar ilim öğren.' },
  { id: 'w029', category: 'learning', enabled: true, weight: 1,
    arabic: 'العلم نور والجهل ظلام.',
    english: 'Knowledge is light, ignorance is darkness.',
    turkish: 'İlim nurdur, cehalet karanlıktır.' },
  { id: 'w030', category: 'learning', enabled: true, weight: 1,
    arabic: 'أول العلم الصمت، والثاني الاستماع، والثالث الحفظ، والرابع العمل.',
    english: 'The first step of learning is silence, the second is listening, the third is memorizing, the fourth is acting.',
    turkish: 'İlmin ilk adımı susmak, ikincisi dinlemek, üçüncüsü ezberlemek, dördüncüsü uygulamaktır.' },
  { id: 'w127', category: 'learning', enabled: true, weight: 1,
    arabic: 'العلم أفضل من المال، لأن العلم يحرسك وأنت تحرس المال.',
    english: 'Knowledge is better than wealth because knowledge guards you while you guard wealth.',
    turkish: 'İlim maldan hayırlıdır. Çünkü ilim seni korur, sen ise malını korursun.' },

  // ── Honesty ──
  { id: 'w128', category: 'honesty', enabled: true, weight: 1,
    arabic: 'عليكم بالصدق، فإن الصدق يهدي إلى البر.',
    english: 'Be truthful, for truthfulness leads to righteousness.',
    turkish: 'Doğru olun, çünkü doğruluk takvaya götürür.' },
  { id: 'w129', category: 'honesty', enabled: true, weight: 1,
    arabic: 'الكذب مهلكة، والصدق منجاة.',
    english: 'Lies destroy, honesty saves.',
    turkish: 'Yalan yıkıma götürür, doğruluk kurtarır.' },
  { id: 'w130', category: 'honesty', enabled: true, weight: 1,
    arabic: 'الصدق طمأنينة والكذب ريبة.',
    english: 'Honesty brings peace of mind, lies bring doubt.',
    turkish: 'Doğruluk huzur verir, yalan şüphe getirir.' },

  // ── Trust ──
  { id: 'w034', category: 'trust', enabled: true, weight: 1,
    arabic: 'توكل على الله فهو حسبك.',
    english: 'Trust in Allah, He is sufficient for you.',
    turkish: 'Allah\'a güven, O sana yeter.' },
  { id: 'w035', category: 'trust', enabled: true, weight: 1,
    arabic: 'الثقة بالله تريح القلب.',
    english: 'Trust in Allah gives peace to the heart.',
    turkish: 'Allah\'a güvenmek kalbe huzur verir.' },
  { id: 'w036', category: 'trust', enabled: true, weight: 1,
    arabic: 'من يتوكل على الله فهو حسبه.',
    english: 'Whoever trusts in Allah, He is sufficient for them.',
    turkish: 'Kim Allah\'a güvenirse O ona yeter.' },
  { id: 'w131', category: 'trust', enabled: true, weight: 1,
    arabic: 'أد الأمانة إلى من ائتمنك، ولا تخن من خانك.',
    english: 'Return the trust to those who entrusted you, and do not betray those who betray you.',
    turkish: 'Sana güvenenin emanetini ver, sana ihanet edene ihanet etme.' },

  // ── Trade ──
  { id: 'w031', category: 'trade', enabled: true, weight: 1,
    arabic: 'البيع بالصدق والبيان.',
    english: 'Sell with truthfulness and transparency.',
    turkish: 'Doğruluk ve şeffaflıkla sat.' },
  { id: 'w032', category: 'trade', enabled: true, weight: 1,
    arabic: 'التاجر الصديق مع الصديقين.',
    english: 'The truthful merchant is among the truthful.',
    turkish: 'Doğru tacir, doğrulardandır.' },
  { id: 'w033', category: 'trade', enabled: true, weight: 1,
    arabic: 'البركة في المعاملة الحسنة.',
    english: 'Blessings are in good dealings.',
    turkish: 'Bereket güzel muamelededir.' },
  { id: 'w132', category: 'trade', enabled: true, weight: 1,
    arabic: 'التاجر الأمين مع النبيين والصديقين والشهداء.',
    english: 'The trustworthy merchant is with the prophets, the truthful, and the martyrs.',
    turkish: 'Güvenilir tacir, peygamberler, sıddıklar ve şehitlerle beraberdir.' },

  // ── Confidence ──
  { id: 'w133', category: 'confidence', enabled: true, weight: 1,
    arabic: 'الثقة بالنفس هي أول طريق النجاح.',
    english: 'Self-confidence is the first path to success.',
    turkish: 'Özgüven başarının ilk yoludur.' },
  { id: 'w134', category: 'confidence', enabled: true, weight: 1,
    arabic: 'لا تنتظر أحداً ليمنحك الثقة، ابدأ بنفسك.',
    english: 'Don\'t wait for someone to give you confidence. Start with yourself.',
    turkish: 'Birinin size güven vermesini beklemeyin. Kendinizle başlayın.' },
  { id: 'w135', category: 'confidence', enabled: true, weight: 1,
    arabic: 'قدرتك على الثقة بنفسك هي وقود نجاحك.',
    english: 'Your ability to trust yourself is the fuel of your success.',
    turkish: 'Kendine güvenme yeteneğin başarının yakıtıdır.' },
  { id: 'w136', category: 'confidence', enabled: true, weight: 1,
    arabic: 'لا تقارن نفسك بأحد، فلك قدراتك الفريدة.',
    english: 'Don\'t compare yourself to anyone. You have your own unique abilities.',
    turkish: 'Kendini kimseyle kıyaslama. Senin kendine özgü yeteneklerin var.' },

  // ── Health ──
  { id: 'w043', category: 'health', enabled: true, weight: 1,
    arabic: 'العقل السليم في الجسم السليم.',
    english: 'A healthy mind is in a healthy body.',
    turkish: 'Sağlam kafa sağlam vücutta bulunur.' },
  { id: 'w044', category: 'health', enabled: true, weight: 1,
    arabic: 'الصحة تاج على رؤوس الأصحاء لا يراه إلا المرضى.',
    english: 'Health is a crown worn by the healthy that only the sick can see.',
    turkish: 'Sağlık, sağlıklıların başında görünmeyen bir taçtır, onu sadece hastalar fark eder.' },
  { id: 'w045', category: 'health', enabled: true, weight: 1,
    arabic: 'درهم وقاية خير من قنطار علاج.',
    english: 'A dirham of prevention is better than a quintal of cure.',
    turkish: 'Bir gram önlem, bir kilo tedaviden iyidir.' },
  { id: 'w137', category: 'health', enabled: true, weight: 1,
    arabic: 'الصحة ثروة لا تقدر بثمن.',
    english: 'Health is a priceless wealth.',
    turkish: 'Sağlık paha biçilmez bir servettir.' },

  // ── Mind ──
  { id: 'w138', category: 'mind', enabled: true, weight: 1,
    arabic: 'العقل زينة الإنسان، به يعرف ربه.',
    english: 'The mind is the ornament of man; through it he knows his Lord.',
    turkish: 'Akıl insanın süsüdür; onunla Rabbini tanır.' },
  { id: 'w139', category: 'mind', enabled: true, weight: 1,
    arabic: 'أفضل ما وهب الله للإنسان العقل.',
    english: 'The best gift Allah gave to man is the mind.',
    turkish: 'Allah\'ın insana verdiği en iyi hediye akıldır.' },
  { id: 'w140', category: 'mind', enabled: true, weight: 1,
    arabic: 'استعمل عقلك قبل أن يستعملك غيرك.',
    english: 'Use your mind before others use it for you.',
    turkish: 'Başkalarının senin için kullanmasından önce aklını kullan.' },

  // ── Focus ──
  { id: 'w049', category: 'focus', enabled: true, weight: 1,
    arabic: 'التركيز هو مفتاح الإتقان.',
    english: 'Focus is the key to mastery.',
    turkish: 'Odaklanma, ustalığın anahtarıdır.' },
  { id: 'w050', category: 'focus', enabled: true, weight: 1,
    arabic: 'ركز على هدفك ولا تلتفت للمشتتات.',
    english: 'Focus on your goal and ignore distractions.',
    turkish: 'Hedefine odaklan ve dikkat dağıtıcılara aldırma.' },
  { id: 'w051', category: 'focus', enabled: true, weight: 1,
    arabic: 'من يطارد عصفورين يفقدهما جميعاً.',
    english: 'Whoever chases two birds loses them both.',
    turkish: 'İki tavşanı birden kovalayan birini bile yakalayamaz.' },
  { id: 'w141', category: 'focus', enabled: true, weight: 1,
    arabic: 'التركيز العميق هو ما يميز المبدعين.',
    english: 'Deep focus is what distinguishes creative people.',
    turkish: 'Derin odaklanma, yaratıcı insanları ayıran şeydir.' },

  // ── Optimism ──
  { id: 'w040', category: 'optimism', enabled: true, weight: 1,
    arabic: 'تفاءلوا بالخير تجدوه.',
    english: 'Be optimistic about good, you will find it.',
    turkish: 'Hayra yorun, bulursunuz.' },
  { id: 'w041', category: 'optimism', enabled: true, weight: 1,
    arabic: 'لا تظلم نفسك بالتشاؤم، الغد أجمل.',
    english: 'Don\'t wrong yourself with pessimism. Tomorrow is better.',
    turkish: 'Karamsarlıkla kendine haksızlık etme. Yarın daha güzel.' },
  { id: 'w042', category: 'optimism', enabled: true, weight: 1,
    arabic: 'ابتسم فالحياة أجمل مما تتصور.',
    english: 'Smile, life is more beautiful than you imagine.',
    turkish: 'Gülümse, hayat hayal ettiğinden daha güzel.' },
  { id: 'w142', category: 'optimism', enabled: true, weight: 1,
    arabic: 'التفاؤل يجعلك ترى الفرص حيث يرى غيرك العقبات.',
    english: 'Optimism lets you see opportunities where others see obstacles.',
    turkish: 'İyimserlik, başkalarının engel gördüğü yerde fırsatları görmenizi sağlar.' },

  // ── Responsibility ──
  { id: 'w143', category: 'responsibility', enabled: true, weight: 1,
    arabic: 'كلكم راع وكلكم مسؤول عن رعيته.',
    english: 'Each of you is a shepherd and each is responsible for their flock.',
    turkish: 'Hepiniz çobansınız ve hepiniz sürünüzden sorumlusunuz.' },
  { id: 'w144', category: 'responsibility', enabled: true, weight: 1,
    arabic: 'المسؤولية أمانة، والسؤال عنها شديد.',
    english: 'Responsibility is a trust, and the questioning about it is severe.',
    turkish: 'Sorumluluk bir emanettir ve hesabı çetindir.' },
  { id: 'w145', category: 'responsibility', enabled: true, weight: 1,
    arabic: 'الحرية الحقيقية تأتي مع المسؤولية.',
    english: 'True freedom comes with responsibility.',
    turkish: 'Gerçek özgürlük sorumlulukla gelir.' },

  // ── Respect ──
  { id: 'w054', category: 'respect', enabled: true, weight: 1,
    arabic: 'ليس منا من لم يوقر كبيرنا ويرحم صغيرنا.',
    english: 'He is not from us who does not respect our elder and show mercy to our young.',
    turkish: 'Büyüğümüze saygı, küçüğümüze merhamet etmeyen bizden değildir.' },
  { id: 'w055', category: 'respect', enabled: true, weight: 1,
    arabic: 'الاحترام ليس فقط للكبار، بل للجميع.',
    english: 'Respect is not only for elders, but for everyone.',
    turkish: 'Saygı sadece büyüklere değil, herkese gösterilmelidir.' },
  { id: 'w056', category: 'respect', enabled: true, weight: 1,
    arabic: 'أكرم الناس من أكرم غيره.',
    english: 'The most honorable person is the one who honors others.',
    turkish: 'En onurlu insan başkalarına değer verendir.' },
  { id: 'w146', category: 'respect', enabled: true, weight: 1,
    arabic: 'الاحترام متبادل، فلا تطلب ما لا تعطي.',
    english: 'Respect is mutual. Don\'t demand what you don\'t give.',
    turkish: 'Saygı karşılıklıdır. Vermediğini talep etme.' },

  // ── Cleanliness ──
  { id: 'w147', category: 'cleanliness', enabled: true, weight: 1,
    arabic: 'النظافة من الإيمان.',
    english: 'Cleanliness is part of faith.',
    turkish: 'Temizlik imandandır.' },
  { id: 'w148', category: 'cleanliness', enabled: true, weight: 1,
    arabic: 'تنظيف المكان من علامات الإيمان.',
    english: 'Cleaning the place is a sign of faith.',
    turkish: 'Mekanı temizlemek iman alametidir.' },
  { id: 'w149', category: 'cleanliness', enabled: true, weight: 1,
    arabic: 'النظافة عنوان الحضارة والرقي.',
    english: 'Cleanliness is the hallmark of civilization and sophistication.',
    turkish: 'Temizlik medeniyetin ve gelişmişliğin işaretidir.' },

  // ── Cooperation ──
  { id: 'w150', category: 'cooperation', enabled: true, weight: 1,
    arabic: 'تعاونوا على البر والتقوى ولا تعاونوا على الإثم والعدوان.',
    english: 'Cooperate in righteousness and piety, do not cooperate in sin and aggression.',
    turkish: 'İyilik ve takvada yardımlaşın, günah ve düşmanlıkta yardımlaşmayın.' },
  { id: 'w151', category: 'cooperation', enabled: true, weight: 1,
    arabic: 'يد الله مع الجماعة.',
    english: 'The hand of Allah is with the group.',
    turkish: 'Allah\'ın yardımı cemaatle beraberdir.' },
  { id: 'w152', category: 'cooperation', enabled: true, weight: 1,
    arabic: 'العمل الجماعي طريق النجاح.',
    english: 'Teamwork is the path to success.',
    turkish: 'Takım çalışması başarıya giden yoldur.' },
];

const QUESTION_DATA: QuestionEntry[] = [
  // ── Curiosity ──
  { id: 'q001', category: 'focus', enabled: true, weight: 1,
    arabic: 'هل تعرف سرعة رد فعلك؟ جرب اختبار التركيز الآن.',
    english: 'Do you know your reaction speed? Try the focus test now.',
    turkish: 'Tepki hızını biliyor musun? Şimdi odak testini dene.' },
  { id: 'q002', category: 'parents', enabled: true, weight: 1,
    arabic: 'متى شكرت والدتك آخر مرة؟',
    english: 'When was the last time you thanked your mother?',
    turkish: 'Annene en son ne zaman teşekkür ettin?' },
  { id: 'q003', category: 'work', enabled: true, weight: 1,
    arabic: 'هل هاتفك يستحق التغيير؟ قيّمه الآن.',
    english: 'Does your phone deserve an upgrade? Evaluate it now.',
    turkish: 'Telefonun değişmeye değer mi? Şimdi değerlendir.' },
  { id: 'q004', category: 'focus', enabled: true, weight: 1,
    arabic: 'هل تضيع وقتك على الهاتف؟ اكتشف مستوى تركيزك.',
    english: 'Are you wasting time on your phone? Discover your focus level.',
    turkish: 'Telefonda zaman mı harcıyorsun? Odak seviyeni keşfet.' },
  { id: 'q005', category: 'focus', enabled: true, weight: 1,
    arabic: 'هل تثق بتركيزك؟ اختبر نفسك في 30 ثانية.',
    english: 'Do you trust your focus? Test yourself in 30 seconds.',
    turkish: 'Odağına güveniyor musun? 30 saniyede kendini test et.' },
  { id: 'q006', category: 'patience', enabled: true, weight: 1,
    arabic: 'كم مرة غضبت اليوم؟ تعلم كيف تتحكم بأعصابك.',
    english: 'How many times did you get angry today? Learn to control your nerves.',
    turkish: 'Bugün kaç kez sinirlendin? Sinirlerini kontrol etmeyi öğren.' },
  { id: 'q007', category: 'ethics', enabled: true, weight: 1,
    arabic: 'هل تعلم أن حسن الخلق أثقل في الميزان؟',
    english: 'Did you know good character is heaviest on the scale?',
    turkish: 'Güzel ahlakın terazide en ağır olduğunu biliyor muydun?' },
  { id: 'q008', category: 'time', enabled: true, weight: 1,
    arabic: 'أين تذهب أيامك؟ هل تدير وقتك بحكمة؟',
    english: 'Where do your days go? Do you manage your time wisely?',
    turkish: 'Günlerin nereye gidiyor? Zamanını iyi yönetiyor musun?' },
  { id: 'q009', category: 'trade', enabled: true, weight: 1,
    arabic: 'هل تعرف قيمة هاتفك الحقيقية؟ احصل على سعر عادل.',
    english: 'Do you know your phone\'s true value? Get a fair price.',
    turkish: 'Telefonunun gerçek değerini biliyor musun? Adil fiyat al.' },
  { id: 'q010', category: 'health', enabled: true, weight: 1,
    arabic: 'متى كانت آخر مرة فحصت فيها نظرك؟',
    english: 'When was the last time you had your eyes checked?',
    turkish: 'En son ne zaman göz muayenesi oldun?' },
  { id: 'q011', category: 'success', enabled: true, weight: 1,
    arabic: 'هل أنت راضٍ عن إنجازاتك اليوم؟ ابدأ الآن.',
    english: 'Are you satisfied with today\'s achievements? Start now.',
    turkish: 'Bugünkü başarılarından memnun musun? Şimdi başla.' },
  { id: 'q012', category: 'happiness', enabled: true, weight: 1,
    arabic: 'ما هو أصغر شيء أسعدك اليوم؟',
    english: 'What is the smallest thing that made you happy today?',
    turkish: 'Bugün seni mutlu eden en küçük şey neydi?' },
  { id: 'q013', category: 'parents', enabled: true, weight: 1,
    arabic: 'هل تعلم أن الجنة تحت أقدام الأمهات؟',
    english: 'Did you know paradise is under the feet of mothers?',
    turkish: 'Cennetin annelerin ayakları altında olduğunu biliyor muydun?' },
  { id: 'q014', category: 'responsibility', enabled: true, weight: 1,
    arabic: 'هل أنت شخص مسؤول؟ اكتشف صفاتك القيادية.',
    english: 'Are you a responsible person? Discover your leadership qualities.',
    turkish: 'Sorumlu bir insan mısın? Liderlik özelliklerini keşfet.' },
  { id: 'q015', category: 'optimism', enabled: true, weight: 1,
    arabic: 'هل ترى الزجاجة نصف ممتلئة أم نصف فارغة؟',
    english: 'Do you see the glass half full or half empty?',
    turkish: 'Bardağı yarı dolu mu yoksa yarı boş mu görüyorsun?' },
];

export function getWisdomByCategory(category: WisdomCategory): WisdomEntry[] {
  return WISDOM_DATA.filter(w => w.category === category && w.enabled);
}

export function getWisdomById(id: string): WisdomEntry | undefined {
  return WISDOM_DATA.find(w => w.id === id);
}

export function getRandomWisdom(category?: WisdomCategory): WisdomEntry {
  const pool = category ? getWisdomByCategory(category) : WISDOM_DATA.filter(w => w.enabled);
  if (pool.length === 0) return WISDOM_DATA[0]!;
  const totalWeight = pool.reduce((s, w) => s + w.weight, 0);
  let random = Math.random() * totalWeight;
  for (const w of pool) {
    random -= w.weight;
    if (random <= 0) return w;
  }
  return pool[pool.length - 1]!;
}

export function getQuestionsByCategory(category: WisdomCategory): QuestionEntry[] {
  return QUESTION_DATA.filter(q => q.category === category && q.enabled);
}

export function getRandomQuestion(category?: WisdomCategory): QuestionEntry {
  const pool = category ? getQuestionsByCategory(category) : QUESTION_DATA.filter(q => q.enabled);
  if (pool.length === 0) return QUESTION_DATA[0]!;
  const totalWeight = pool.reduce((s, w) => s + w.weight, 0);
  let random = Math.random() * totalWeight;
  for (const q of pool) {
    random -= q.weight;
    if (random <= 0) return q;
  }
  return pool[pool.length - 1]!;
}

export function getAllCategories(): WisdomCategory[] {
  return [...WISDOM_CATEGORIES];
}

export function getAllWisdom(): WisdomEntry[] {
  return [...WISDOM_DATA];
}

export function getAllQuestions(): QuestionEntry[] {
  return [...QUESTION_DATA];
}

export function getCategoriesWithCount(): { category: WisdomCategory; count: number }[] {
  return WISDOM_CATEGORIES.map(c => ({
    category: c,
    count: WISDOM_DATA.filter(w => w.category === c && w.enabled).length,
  }));
}



