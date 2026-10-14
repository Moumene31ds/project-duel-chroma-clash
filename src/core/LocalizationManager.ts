import { Language, MinigameId, RankedTier } from './types';

export interface MinigameText {
  title: string;
  subtitle: string;
  category: string;
  badge: string;
  desc: string;
  instructions: string;
}

export class LocalizationManager {
  private static instance: LocalizationManager;
  private currentLang: Language = 'ar';
  private listeners: Set<(lang: Language) => void> = new Set();

  private constructor() {}

  public static getInstance(): LocalizationManager {
    if (!LocalizationManager.instance) {
      LocalizationManager.instance = new LocalizationManager();
    }
    return LocalizationManager.instance;
  }

  public getLanguage(): Language {
    return this.currentLang;
  }

  public setLanguage(lang: Language) {
    this.currentLang = lang;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    if (lang === 'ar') {
      document.body.classList.add('lang-ar');
      document.body.classList.remove('lang-en');
    } else {
      document.body.classList.add('lang-en');
      document.body.classList.remove('lang-ar');
    }
    for (const listener of this.listeners) {
      listener(lang);
    }
  }

  public toggleLanguage(): Language {
    const next = this.currentLang === 'ar' ? 'en' : 'ar';
    this.setLanguage(next);
    return next;
  }

  public subscribe(listener: (lang: Language) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // --- Translation Dictionary ---
  private translations: Record<Language, Record<string, string>> = {
    ar: {
      app_title: 'PROJECT DUEL: صراع الألوان',
      solar_arena_badge: '☀️ حلبة السولار // الإصدار العالمي الخارق v2.0',
      hero_title: 'PROJECT DUEL',
      hero_subtitle: 'CHROMA CLASH // 20 لعبة أسطورية 1v1',
      mode_2p: '👥 مواجهة محلية 1V1',
      mode_ai: '🤖 لاعب ضد الذكاء الاصطناعي',
      mode_gauntlet: '⚡ قهر الروبوتات GAUNTLET',
      diff_casual: 'روبوت سهل',
      diff_adaptive: 'ذكاء متكيف',
      diff_pro: 'سايبر محترف 🔥',
      party_hero_tag: '🌟 طور المنافسة الكبرى الجديد',
      party_hero_title: '👑 لوح الحفلات PARTY BOARD (1v1)',
      party_hero_sub: 'ارمِ نرد السايبر • اجمع النجوم • اسلب العملات • وفجر مبارزات الألعاب المصغرة!',
      start_party: 'بدء معركة اللوح 🎲',
      p1_label: 'اللاعب 1',
      p2_label: 'اللاعب 2',
      ai_label: 'الذكاء الاصطناعي',
      wins_count: 'انتصارات',
      trophies_count: 'كؤوس',
      quick_shuffle: 'قرعة عشوائية سريعة 🎲',
      play_now: 'العب الآن',
      btn_party: '👑 اللوح',
      btn_rank: '🏆 الرتبة',
      btn_quests: '📜 المهام',
      btn_passport: '🛂 الجواز',
      btn_cups: '⚔️ البطولات',
      btn_locker: '🎨 المظهر',
      btn_settings: '⚙️ الإعدادات',
      btn_gauntlet: '⚡ الزعماء',
      btn_fullscreen: '⛶ ملء الشاشة',
      theme_day: 'نهاري',
      theme_night: 'ليلي',
      rematch: 'إعادة النزال',
      return_menu: 'العودة للقائمة',
      match_point: 'نقطة الحسم!',
      victory: 'فوز مستحق!',
      share_snap: '📸 مشاركة لقطة النصر',
      pause_title: 'اللعبة متوقفة مؤقتاً',
      resume: 'استئناف',
      restart: 'إعادة الجولة',
      quit: 'خروج',
      close: 'إغلاق',
      sound_settings: 'إعدادات الصوت والمؤثرات',
      master_volume: 'مستوى الصوت العام',
      music_volume: 'موسيقى السايبر Synthwave',
      sfx_volume: 'المؤثرات الصوتية SFX',
      haptics: 'الاهتزاز اللمسي (Haptics)',
      voice_announcer: 'المعلق الصوتي الديناميكي',
      crt_scanlines: 'تأثير شاشات الآركيد (CRT Scanlines)',
      enabled: 'مفعل',
      disabled: 'معطل',
      chassis_mode: 'إطار الجهاز',
      chassis_phone: 'هاتف رائد 📱',
      chassis_tablet: 'لوحي آيباد 📱',
      chassis_full: 'بدون إطار (شاشة كاملة) 🖥️',
      device_rotate: 'الرجاء تدوير الهاتف للوضع العمودي',
      device_rotate_sub: 'هذه اللعبة صممت خصيصاً للمواجهة وجهاً لوجه 1v1 على نفس الجهاز',
      // Mutators
      mutators_title: 'معدلات الفوضى واللعب',
      mutator_turbo: 'السرعة التوربينية 1.5x',
      mutator_gravity: 'جاذبية منخفضة للقمر',
      mutator_chaos: 'عناصر فوضوية عشوائية',
      mutator_sudden: 'الموت المفاجئ (الهدف: 1 نقطة)',
      mutator_bouncy: 'ارتداد كهرومغناطيسي فائق',
      mutator_ghost: 'الكرات الخفية (Ghost Mode)',
      mutator_mega: 'أحجام عملاقة (Mega Size)',
      mutator_invert: 'انعكاس الجاذبية الأرضية',
      mutator_mirror: 'عكس التحكم (Mirror Mode)',
      mutator_fever: 'الحماس الخارق (Hyper Fever 2x)',
      // Gauntlet
      gauntlet_title: '⚡ تحدي قهر الروبوتات (AI GAUNTLET)',
      gauntlet_sub: 'اهزم نخبة روبوتات السايبر على التوالي بدون خسارة قلوبك!',
      gauntlet_lives: 'القلوب المتبقية',
      gauntlet_stage: 'المرحلة',
      gauntlet_start: 'خوض التحدي ⚡',
      gauntlet_defeat: 'سقطت في المعركة! حاول مجدداً',
      gauntlet_cleared: 'أسطورة السايبر! لقد قهرت جميع الروبوتات!',
      // Trophies / Ranks
      rank_bronze: 'برونزي',
      rank_silver: 'فضي',
      rank_gold: 'ذهبي',
      rank_diamond: 'ماسي',
      rank_cyber_master: 'سيد السايبر',
      rank_celestial: 'كوني خارق 🌌',
      btn_daily: '📅 اليومي',
      btn_achieve: '🏅 الإنجازات',
      btn_online: '🌐 أونلاين',
      btn_replays: '🎬 الإعادة',
      btn_a11y: '♿ الوصول',
      btn_cloud: '☁️ السحابة',
      btn_practice: '🎯 تدريب',
      daily_title: '⚡ التحدي اليومي',
      ach_title: '🏅 الإنجازات',
      online_title: '🌐 غرفة أونلاين',
      replay_title: '🎬 الإعادات المحفوظة',
      a11y_title: '♿ إمكانية الوصول',
      cloud_title: '☁️ الحفظ السحابي',
      practice_title: '🎯 وضع التدريب',
      tutorial_title: '📖 كيف تلعب',
      dock_title: '🧰 كل الأقسام',
      btn_reward_ad: '🎁 مكافأة مجانية',
      ad_gift_title: 'هدية العملات المجانية 🎁',
      ad_gift_desc: 'شاهد إعلاناً قصيراً لربح +100 عملة سايبر فوراً!',
      ad_gift_claimed: '🎉 تمت إضافة +100 عملة سايبر إلى رصيدك بنجاح!',
      ad_double_reward: '🎁 مضاعفة الجائزة 2X (شاهد إعلان)',
      ad_double_claimed: '✨ تم مضاعفة الكؤوس والعملات بنجاح 2X!',
      ad_revive_gauntlet: '❤️ استعادة قلب ومتابعة المعركة (إعلان)',
      ad_revive_claimed: '💖 تمت استعادة القلب بنجاح! تابع قهر الروبوتات!',
      cat_all: '⚡ الكل',
      cat_trending: '🔥 الرائجة',
      cat_action_duel: '⚔️ الأكشن والمبارزات',
      cat_speed_reflex: '🚀 السرعة وردة الفعل',
      cat_memory_puzzle: '🧠 الذكاء والذاكرة',
      cat_favorites: '⭐ المفضلة',
      search_placeholder: '🔍 ابحث عن لعبة، مهارة، أو نمط...',
      search_no_results: 'لا توجد ألعاب مطابقة لبحثك',
      random_pick: '🎲 اختيار عشوائي',
      sort_label: 'ترتيب:',
      sort_default: '🔀 الافتراضي',
      sort_popular: '🏆 الأكثر لعباً',
      sort_newest: '✨ الأحدث أولاً',
      spotlight_title: '🌟 لعبة السايبر المميزة',
      spotlight_play: '⚡ العب الآن',
      btn_nav_home: 'الرئيسية',
      btn_nav_party: 'الحفلة',
      btn_nav_gauntlet: 'الزعماء',
      btn_nav_cups: 'البطولات',
      btn_nav_more: 'المزيد',
      drawer_title: '🧰 أدوات وخدمات السايبر',
      drawer_close: 'إغلاق ✕',
      fav_added: 'تمت الإضافة إلى المفضلة ⭐',
      fav_removed: 'تمت الإزالة من المفضلة',
    },
    en: {
      app_title: 'PROJECT DUEL: Chroma Clash',
      solar_arena_badge: '☀️ SOLAR ARENA // WORLD #1 EDITION v2.0',
      hero_title: 'PROJECT DUEL',
      hero_subtitle: 'CHROMA CLASH // 20 LEGENDARY 1V1 GAMES',
      mode_2p: '👥 1V1 LOCAL MULTIPLAYER',
      mode_ai: '🤖 1P VS AI BOT',
      mode_gauntlet: '⚡ AI BOSS GAUNTLET',
      diff_casual: 'CASUAL BOT',
      diff_adaptive: 'ADAPTIVE AI',
      diff_pro: 'CYBER PRO 🔥',
      party_hero_tag: '🌟 NEW 1V1 COMPETITIVE MODE',
      party_hero_title: '👑 PARTY BOARD GAME (1v1)',
      party_hero_sub: 'Roll Cyber Dice • Claim Stars • Steal Coins • Trigger Minigame Duels!',
      start_party: 'START PARTY BATTLE 🎲',
      p1_label: 'PLAYER 1',
      p2_label: 'PLAYER 2',
      ai_label: 'CYBER BOT',
      wins_count: 'WINS',
      trophies_count: 'TROPHIES',
      quick_shuffle: 'QUICK SHUFFLE DUEL 🎲',
      play_now: 'PLAY NOW',
      btn_party: '👑 PARTY',
      btn_rank: '🏆 RANK',
      btn_quests: '📜 QUESTS',
      btn_passport: '🛂 PASSPORT',
      btn_cups: '⚔️ CUPS',
      btn_locker: '🎨 LOCKER',
      btn_settings: '⚙️ SETTINGS',
      btn_gauntlet: '⚡ GAUNTLET',
      btn_fullscreen: '⛶ FULLSCREEN',
      theme_day: 'Day',
      theme_night: 'Night',
      rematch: 'REMATCH',
      return_menu: 'RETURN TO MENU',
      match_point: 'MATCH POINT!',
      victory: 'VICTORY!',
      share_snap: '📸 SHARE VICTORY SNAP',
      pause_title: 'MATCH PAUSED',
      resume: 'RESUME',
      restart: 'RESTART',
      quit: 'QUIT TO MENU',
      close: 'CLOSE',
      sound_settings: 'AUDIO & VISUAL SETTINGS',
      master_volume: 'Master Volume',
      music_volume: 'Synthwave BGM Volume',
      sfx_volume: 'Sound Effects (SFX)',
      haptics: 'Haptic Vibration',
      voice_announcer: 'Dynamic Voice Announcer',
      crt_scanlines: 'Retro CRT Scanlines',
      enabled: 'ENABLED',
      disabled: 'DISABLED',
      chassis_mode: 'Hardware Chassis',
      chassis_phone: 'Smartphone 📱',
      chassis_tablet: 'Tablet / iPad 📱',
      chassis_full: 'Borderless Fullscreen 🖥️',
      device_rotate: 'Rotate device to Portrait mode',
      device_rotate_sub: 'Designed exclusively for face-to-face 1v1 same-device showdowns',
      // Mutators
      mutators_title: 'GAMEPLAY MUTATORS',
      mutator_turbo: 'Turbo Speed (1.5x)',
      mutator_gravity: 'Low Moon Gravity',
      mutator_chaos: 'Chaos Random Spawns',
      mutator_sudden: 'Sudden Death (Target 1 Pt)',
      mutator_bouncy: 'Super Kinetic Bounciness',
      mutator_ghost: 'Ghost Ball Invisibility',
      mutator_mega: 'Mega Giant Scale',
      mutator_invert: 'Gravitational Inversion',
      mutator_mirror: 'Mirror Inverted Controls',
      mutator_fever: 'Hyper Fever (2x Speed & Score)',
      // Gauntlet
      gauntlet_title: '⚡ AI BOSS GAUNTLET',
      gauntlet_sub: 'Defeat elite cyber bot masters consecutively without losing your lives!',
      gauntlet_lives: 'Lives Remaining',
      gauntlet_stage: 'STAGE',
      gauntlet_start: 'START GAUNTLET ⚡',
      gauntlet_defeat: 'FALLEN IN BATTLE! TRY AGAIN',
      gauntlet_cleared: 'CYBER LEGEND! ALL BOSSES CONQUERED!',
      // Trophies / Ranks
      rank_bronze: 'Bronze',
      rank_silver: 'Silver',
      rank_gold: 'Gold',
      rank_diamond: 'Diamond',
      rank_cyber_master: 'Cyber Master',
      rank_celestial: 'Celestial 🌌',
      btn_daily: '📅 DAILY',
      btn_achieve: '🏅 AWARDS',
      btn_online: '🌐 ONLINE',
      btn_replays: '🎬 REPLAYS',
      btn_a11y: '♿ ACCESS',
      btn_cloud: '☁️ CLOUD',
      btn_practice: '🎯 PRACTICE',
      daily_title: '⚡ DAILY CHALLENGE',
      ach_title: '🏅 ACHIEVEMENTS',
      online_title: '🌐 ONLINE ROOM',
      replay_title: '🎬 SAVED REPLAYS',
      a11y_title: '♿ ACCESSIBILITY',
      cloud_title: '☁️ CLOUD SAVE',
      practice_title: '🎯 PRACTICE MODE',
      tutorial_title: '📖 HOW TO PLAY',
      dock_title: '🧰 ALL SECTIONS',
      btn_reward_ad: '🎁 FREE REWARD',
      ad_gift_title: 'FREE CYBER COINS 🎁',
      ad_gift_desc: 'Watch a short sponsor video to claim +100 Cyber Coins!',
      ad_gift_claimed: '🎉 +100 Cyber Coins successfully added to your vault!',
      ad_double_reward: '🎁 DOUBLE 2X REWARDS (WATCH AD)',
      ad_double_claimed: '✨ Victory Trophies & Coins Doubled 2X!',
      ad_revive_gauntlet: '❤️ REVIVE 1 LIFE & CONTINUE (AD)',
      ad_revive_claimed: '💖 Life Restored! Continue conquering the bosses!',
      cat_all: '⚡ ALL',
      cat_trending: '🔥 TRENDING',
      cat_action_duel: '⚔️ ACTION & DUELS',
      cat_speed_reflex: '🚀 SPEED & REFLEX',
      cat_memory_puzzle: '🧠 MIND & MEMORY',
      cat_favorites: '⭐ FAVORITES',
      search_placeholder: '🔍 Search minigames, skills...',
      search_no_results: 'No minigames match your search',
      random_pick: '🎲 Random Game',
      sort_label: 'Sort:',
      sort_default: '🔀 Default',
      sort_popular: '🏆 Most Played',
      sort_newest: '✨ Newest First',
      spotlight_title: '🌟 FEATURED MINIGAME',
      spotlight_play: '⚡ PLAY NOW',
      btn_nav_home: 'Home',
      btn_nav_party: 'Party',
      btn_nav_gauntlet: 'Gauntlet',
      btn_nav_cups: 'Cups',
      btn_nav_more: 'More',
      drawer_title: '🧰 CYBER HUB & UTILITIES',
      drawer_close: 'Close ✕',
      fav_added: 'Added to Favorites ⭐',
      fav_removed: 'Removed from Favorites',
    }
  };

  private minigameTranslations: Record<Language, Record<MinigameId, MinigameText>> = {
    ar: {
      cyber_hoops: {
        title: 'كرة السلة السايبر 1v1',
        subtitle: 'رميات منحنية وسلاسل احتراق شباك',
        category: 'أكشن ورياضة',
        badge: '🏀 رميات شباك نيونية',
        desc: 'اسحب وصوب الرميات المنحنية بدقة متناهية، واشعل وضع الاحتراق الناري وسلاسل التسجيل وصد كرات الخصم في منتصف الملعب.',
        instructions: 'اسحب وافلت للتصويب! انقر في منتصف الملعب للصد الدفاعي!'
      },
      laser_pinball: {
        title: 'مبارزة البنبول الليزري',
        subtitle: 'طاولة كهرومغناطيسية وكرات متعددة',
        category: 'أكشن ورياضة',
        badge: '🏓 كرات متعددة 1V1',
        desc: 'طاولة بينبول وجهاً لوجه بمضارب نيونية ومصدات حركية مع تفجير قلب الاندماج لإطلاق 3 كرات ليزرية في آن واحد.',
        instructions: 'المس يميناً ويساراً لتحريك المضارب وصد الكرات!'
      },
      chroma_reaction: {
        title: 'رد الفعل اللوني (ستروب)',
        subtitle: 'اختبار تركيز فائق الدقة بالمللي ثانية',
        category: 'ذاكرة وذكاء',
        badge: '⚡ انعكاس ستروب السريع',
        desc: 'سباق ذهني فائق السرعة يعتمد على تأثير ستروب: طابق اللون الحقيقي مع النص تحت ضغط الوقت مع تسجيل سرعة الاستجابة.',
        instructions: 'انقر على الزر المطابق حسب الشرط المعروض بأسرع ما يمكن!'
      },
      chroma_pairs: {
        title: 'صراع البطاقات الكمومية',
        subtitle: 'مطابقة بطاقات هولوجرامية متقدمة',
        category: 'ذاكرة وذكاء',
        badge: '🃏 هولوجرام ثلاثي الأبعاد',
        desc: 'مطابقة بطاقات ثلاثية الأبعاد بصرية مع النجمة الذهبية الحرة (⭐) وسلاسل الكومبو وروابط البرق عالية التردد.',
        instructions: 'اقلب بطاقتين لمطابقة الرموز النيونية قبل الخصم!'
      },
      cyber_hockey: {
        title: 'هوكي السايبر 2.0',
        subtitle: 'هوكي هوائي بدقة CCD فائقة',
        category: 'أكشن ورياضة',
        badge: '⚡ كينيتيك فائق 2.0',
        desc: 'طاولة هوكي هوائي متطورة مع مصدات ليزرية متحركة، شحن الضربة الخارقة وقذائف بلازما متفجرة نحو مرمى الخصم.',
        instructions: 'حرك مقبضك لصد القرص واضربه بقوة لشحن الضربة الخارقة!'
      },
      physics_sumo: {
        title: 'سومو الفيزياء الفيزيائية',
        subtitle: 'تدافع دوغمائي وحلبة متكسرة',
        category: 'أكشن ورياضة',
        badge: '🤼 ضربة ميجا-سلام',
        desc: 'قتال مصارعة فيزيائية بالدفع الزخمي وضربات الاندفاع الساحق مع حواف حلبة حمم تتكسر وتتقلص بمرور الوقت.',
        instructions: 'اسحب للتوجيه وافلت للاندفاع ودفع الخصم خارج الحلبة!'
      },
      tactical_tanks: {
        title: 'الدبابات التكتيكية',
        subtitle: 'معركة مدرعات وقذائف مرتدة',
        category: 'أكشن ورياضة',
        badge: '🎯 بيئة قابلة للتدمير',
        desc: 'مبارزة دبابات بذراعين افتراضيين مع ارتداد قذائف الليزر عن الجدران ومربعات طوب قابلة للهدم وشعاع توجيه ليزري.',
        instructions: 'عصا القيادة للحركة وعصا المدفع للتصويب والإطلاق!'
      },
      counter_dash: {
        title: 'الاندفاع والمباغتة (ساموراي)',
        subtitle: 'صد احترافي بوقف الإطارات',
        category: 'أكشن ورياضة',
        badge: '⚔️ باري هيدستوب',
        desc: 'مبارزة ساموراي سايبر بـ 60 إطاراً في الثانية مع تجمد إطار الصد المتقن (Parry Hitstop) والضربات المرتدة الحاسمة.',
        instructions: 'المس للاندفاع، والمس التوقيت المتقن للصد والرد الساحق!'
      },
      laser_drift: {
        title: 'سباق التفحيط الليزري',
        subtitle: 'انجراف مداري ونيترو خارق',
        category: 'أكشن ورياضة',
        badge: '🏎️ دفعة نيترو نيون',
        desc: 'حلبة سباق تفحيط ميكرو في شاشة واحدة مع منصات تسريع نيترو وأدخنة إطارات نيونية وجولات سريعة مشتعلة.',
        instructions: 'المس يميناً ويساراً للانجراف بسلاسة حول المنعطفات!'
      },
      neon_orbit: {
        title: 'كاسر المدار النيوني',
        subtitle: 'جاذبية الثقب الأسود ومقلاع الطاقة',
        category: 'أكشن ورياضة',
        badge: '🪐 جاذبية الثقب الأسود',
        desc: 'مبارزة انحناء طاقة كهرومغناطيسية: ابنِ مدار قرص الطاقة حول جاذبية الثقب الأسود المركزي بمضارب مدارية مقوسة.',
        instructions: 'حرك مقبضك المداري لصد القرص وتوجيهه عبر جاذبية المركز!'
      },
      memory_matrix: {
        title: 'مصفوفة الذاكرة النيونية',
        subtitle: 'حفظ الرموز الهارمونية 3x3',
        category: 'ذاكرة وذكاء',
        badge: '🧠 مصفوفة الرموز',
        desc: 'عرض فلاشي لتسلسل رموز على لوحة 3x3 وتذكر متزامن وجهاً لوجه مع تسارع مستمر في طول الأنماط.',
        instructions: 'احفظ التسلسل النيوني وكرره بدقة على شبكتك!'
      },
      cyber_simon: {
        title: 'سايمون السايبر المتناغم',
        subtitle: 'حلقة النغمات الضوئية الترددية',
        category: 'ذاكرة وذكاء',
        badge: '⚡ صدى الأوتار النيونية',
        desc: 'حلقة إشعاع متعددة الترددات: استمع وشاهد ثم كرر تسلسل الأوتار الصوتية والومضات الملونة المتزايدة.',
        instructions: 'اضغط على الأقواس الملونة بنفس ترتيب النغمات!'
      },
      neon_volley: {
        title: 'كرة الطائرة النيونية 1v1',
        subtitle: 'قفزات هوائية وضربات ساحقة مشتعلة',
        category: 'أكشن ورياضة',
        badge: '🏐 سوبر سبايك خارق',
        desc: 'مبارزة كرة طائرة جانبية فوق شبكة ليزر نيونية، مع فيزياء ارتداد حركية، قفز هوائي، وضربات ساحقة بلهب متوهج.',
        instructions: 'تحرك واقفز لصد الكرة، واضربها في قمة القفزة لتنفيذ السوبر سبايك!'
      },
      quantum_tug: {
        title: 'حرب الحبال الكمومية',
        subtitle: 'شد الحبل التجاذبي والنواة المشحونة',
        category: 'أكشن ورياضة',
        badge: '⚡ شد حبل كمومي',
        desc: 'معركة جذب نواة البلازما الكمومية نحو دوامة الخصم عبر نقرات إيقاعية في المنطقة الذهبية وموجات تفريغ طاقة هائلة.',
        instructions: 'انقر بسرعة في المنطقة الخضراء الذهبية لسحب النواة بقوة خارقة!'
      },
      astro_blast: {
        title: 'مواجهة صائدو الفضاء',
        subtitle: 'مناورات سفن الفضاء ومدافع البلازما',
        category: 'أكشن ورياضة',
        badge: '🚀 دوج فايت فضائي',
        desc: 'قتال سفن فضائية نيونية: تحكم بالدفع النفاث والانعطاف، اطلق قذائف البلازما، فعّل الدروع واستولِ على صناديق التطوير.',
        instructions: 'المس للتوجيه والدفع النفاث، وزر الإطلاق لإمطار الخصم بالبلازما!'
      },
      cyber_slicer: {
        title: 'قاطع السايبر',
        subtitle: 'مبارزة الشفرات النيونية فائقة السرعة',
        category: 'أكشن ورياضة',
        badge: '⚔️ شفرة النيون',
        desc: 'مرر واقطع كرات الطاقة المتطايرة بدقة متناهية، وحقق سلاسل الكومبو وتجنب قنابل النبضة الكهرومغناطيسية المتفجرة.',
        instructions: 'اسحب إصبعك لتقطيع كرات الطاقة وتفادي القنابل!'
      },
      synthwave_rhythm: {
        title: 'إيقاع السينث ويف',
        subtitle: 'صراع النغمات والمسارات الإيقاعية',
        category: 'أكشن ورياضة',
        badge: '🎵 نبض السينث',
        desc: 'انقر على النغمات النيونية بتزامن دقيق مع الإيقاع، وفعّل مضاعف الحماس وتفوق على منافسك في روعة التوقيت.',
        instructions: 'انقر على النغمات بمجرد وصولها إلى خط الإيقاع!'
      },
      gravity_runner: {
        title: 'عداء الجاذبية',
        subtitle: 'ركض سريع مع عكس الجاذبية وتفادي العوائق',
        category: 'أكشن ورياضة',
        badge: '🌌 ركض انعدام الوزن',
        desc: 'اقلب الجاذبية بسرعة فائقة للركض على الأسقف والأرضيات، وتفادَ أشعة الليزر القاتلة واصمد أطول من خصمك.',
        instructions: 'انقر لعكس الجاذبية وتجنب العقبات أثناء الركض السريع!'
      },
      neon_blade: {
        title: 'مبارزة سيوف السايبر',
        subtitle: 'سرعة رد الفعل الخاطفة ومبارزة الساموراي',
        category: 'أكشن ورياضة',
        badge: '⚔️ ضربة خاطفة',
        desc: 'مواجهة ترقب شديدة التوتر: انتظر إشارة اضرب! واقطع الشاشة بأجزاء الملي ثانية. أي لمس مبكر يعتبر خطأً فادحاً!',
        instructions: 'انتظر إشارة اضرب! واقطع الشاشة أولاً! التسرع المبكر = خطأ فوري!'
      },
      cyber_bomb: {
        title: 'قنبلة السايبر المتفجرة',
        subtitle: 'صد وتمرير قنبلة البلازما المتسارعة',
        category: 'أكشن ورياضة',
        badge: '💣 فتيل البلازما',
        desc: 'رد قنبلة البلازما الحارقة بدرعك المغناطيسي، وسرّع من اشتعال الفتيل مع كل صدة وفجر ضربة السوبر السريعة.',
        instructions: 'حرك درع البلازما لرد القنبلة! التمرير السريع يفجر ضربة خارقة!'
      }
    },
    en: {
      cyber_hoops: {
        title: 'Cyber Hoops 1v1',
        subtitle: 'Parabolic Drag & Swish Streaks',
        category: 'Action & Speed',
        badge: '🏀 KINETIC SWISH',
        desc: 'Parabolic trajectory drag-and-aim basketball, swish streaks, "ON FIRE" flame mode & mid-court defensive blocks.',
        instructions: 'Drag & release to shoot! Tap mid-court to block opponent shots!'
      },
      laser_pinball: {
        title: 'Laser Pinball Duel',
        subtitle: 'Kinetic Bumpers & Fusion Core Multiball',
        category: 'Action & Speed',
        badge: '🏓 MULTIBALL 1V1',
        desc: 'Dual flipper face-to-face pinball table with kinetic bumpers and central Fusion Core multiball frenzy.',
        instructions: 'Tap left/right flippers to deflect and blast laser balls!'
      },
      chroma_reaction: {
        title: 'Chroma Reaction',
        subtitle: 'Stroop Reflex Speed Sprint',
        category: 'Memory & Reflex',
        badge: '⚡ STROOP REFLEX',
        desc: 'Cognitive Stroop-effect reflex sprint: match color vs word under high pressure with millisecond precision telemetry.',
        instructions: 'Tap the matching color or word button as fast as possible!'
      },
      chroma_pairs: {
        title: 'Chroma Pairs Duel',
        subtitle: '3D Hologram Card Matching',
        category: 'Memory & Reflex',
        badge: '🃏 3D QUANTUM',
        desc: '3D quantum hologram card matching with Wild Star (⭐), combo streaks, and high-voltage lightning links.',
        instructions: 'Flip two cards to match holographic symbols before your rival!'
      },
      cyber_hockey: {
        title: 'Cyber Hockey 2.0',
        subtitle: 'CCD Air Hockey & Kinetic Hyper-Shots',
        category: 'Action & Speed',
        badge: '⚡ KINETIC 2.0',
        desc: 'CCD air hockey table with moving laser bumpers, kinetic Hyper-Shot charging & explosive plasma shots.',
        instructions: 'Move your mallet to strike the puck and charge hyper-velocity shots!'
      },
      physics_sumo: {
        title: 'Physics Sumo',
        subtitle: 'Active Ragdoll Mega-Slam & Crumbling Rim',
        category: 'Action & Speed',
        badge: '🤼 MEGA-SLAM',
        desc: 'Active ragdoll momentum pushes, Mega-Slam lunges, and a crumbling perimeter rim that collapses over time.',
        instructions: 'Drag to aim and release to lunge and knock your rival off the rim!'
      },
      tactical_tanks: {
        title: 'Tactical Tanks',
        subtitle: 'Dual Stick Destructible Arena Duel',
        category: 'Action & Speed',
        badge: '🎯 DESTRUCTIBLE',
        desc: 'Dual joystick tank duel with specular ricochets, destructible brick obstacles, and laser sightlines.',
        instructions: 'Left stick to steer and right stick to aim and fire lasers!'
      },
      counter_dash: {
        title: 'Counter-Dash',
        subtitle: 'Samurai Frame-Freeze Parry & Counter-Slash',
        category: 'Action & Speed',
        badge: '⚔️ PARRY HITSTOP',
        desc: 'High-tension 60 FPS samurai duel with frame-freeze parry hitstop & automatic counter-slashes.',
        instructions: 'Tap to dash, time your block perfectly to execute a brutal parry!'
      },
      laser_drift: {
        title: 'Laser Drift Racers',
        subtitle: 'Micro-Drift Circuit & Nitro Boost Pads',
        category: 'Action & Speed',
        badge: '🏎️ NITRO BOOST',
        desc: 'Micro-drifting split-screen circuit racing with nitro boost pads and neon tire smoke trails.',
        instructions: 'Tap left and right steering to drift through hairpin laser curves!'
      },
      neon_orbit: {
        title: 'Neon Orbit Breaker',
        subtitle: 'Gravitational Slingshot & Black Hole Vortex',
        category: 'Action & Speed',
        badge: '🪐 GRAVITY VORTEX',
        desc: 'Gravitational slingshot duel: bend energy discs through black hole gravity using orbital arc paddles.',
        instructions: 'Slide along the orbital ring to deflect the gravitational singularity disc!'
      },
      memory_matrix: {
        title: 'Memory Matrix',
        subtitle: 'Dual 3x3 Harmonic Glyph Sequences',
        category: 'Memory & Reflex',
        badge: '🧠 GLYPH MATRIX',
        desc: 'Dual 3x3 pattern flash & face-to-face recall sprint: memorize harmonic glyph sequences.',
        instructions: 'Memorize the flashing sequence and recreate it without mistakes!'
      },
      cyber_simon: {
        title: 'Cyber Simon Duel',
        subtitle: 'Polyphonic Sensory Ring Echo',
        category: 'Memory & Reflex',
        badge: '⚡ CHORD ECHO',
        desc: 'Polyphonic sensory ring duel: replicate expanding light and synthesizer chord patterns.',
        instructions: 'Tap the sensory arcs matching the acoustic light sequence!'
      },
      neon_volley: {
        title: 'Neon Volley 1v1',
        subtitle: 'Aerial Spikes & Kinetic Net Physics',
        category: 'Action & Speed',
        badge: '🏐 SUPER SPIKE',
        desc: 'Side-court aerial volleyball over a pulsing neon net with curve trajectories, dive saves, and flaming super spikes.',
        instructions: 'Move and jump to bump the ball; strike at the peak for a devastating Super Spike!'
      },
      quantum_tug: {
        title: 'Quantum Tug Duel',
        subtitle: 'Gravitational Singularity Rope Clash',
        category: 'Action & Speed',
        badge: '⚡ QUANTUM TUG',
        desc: 'Tug-of-war across a quantum gravity tether: hit rhythmic sweet-spot pulses to drag the plasma core into the hazard vortex.',
        instructions: 'Tap rhythmically inside the green sweet-spot zone to reel in the singularity!'
      },
      astro_blast: {
        title: 'Astro Blast Duel',
        subtitle: 'Zero-G Space Dogfight & Orbital Lasers',
        category: 'Action & Speed',
        badge: '🚀 VOID DOGFIGHT',
        desc: 'Zero-gravity split-space dogfight: rotate & thrust, fire twin plasma cannons, deflect with shields, and grab powerups.',
        instructions: 'Thrust and steer your ship, tap fire to unleash rapid-fire plasma salvos!'
      },
      cyber_slicer: {
        title: 'Cyber Slicer',
        subtitle: 'High-Velocity Neon Blade Duel',
        category: 'Action & Speed',
        badge: '⚔️ NEON BLADE',
        desc: 'Swipe and slice incoming energy orbs with razor precision, trigger combo streaks, and avoid volatile EMP bombs.',
        instructions: 'Swipe across falling orbs to slice! Avoid EMP bombs!'
      },
      synthwave_rhythm: {
        title: 'Synthwave Rhythm',
        subtitle: 'Beat-Synced Neon Track Duel',
        category: 'Action & Speed',
        badge: '🎵 SYNTH PULSE',
        desc: 'Tap rhythmic notes in perfect sync with synthwave beats, build maximum fever multipliers, and out-groove your rival.',
        instructions: 'Tap incoming notes right on the rhythm line to score!'
      },
      gravity_runner: {
        title: 'Gravity Runner',
        subtitle: 'Inverted Gravity Dash & Hazard Run',
        category: 'Action & Speed',
        badge: '🌌 ZERO-G DASH',
        desc: 'Flip gravity at high speed to sprint across ceilings and floors, dodge deadly lasers, and outlast your opponent.',
        instructions: 'Tap to flip gravity and avoid obstacles while sprinting!'
      },
      neon_blade: {
        title: 'Neon Blade Duel',
        subtitle: 'Cyber Katana Millisecond Quickdraw',
        category: 'Action & Speed',
        badge: '⚔️ QUICKDRAW',
        desc: 'High-tension samurai standoff: wait for the SLASH! signal and slice across screen in milliseconds. Premature tap = FOUL!',
        instructions: 'Wait for the SLASH! signal. Tap or swipe first! Premature strike = FOUL!'
      },
      cyber_bomb: {
        title: 'Cyber Bomb Relay',
        subtitle: 'High-Voltage Plasma Fuse Deflection',
        category: 'Action & Speed',
        badge: '💣 PLASMA FUSE',
        desc: 'Deflect the volatile plasma bomb using kinetic magnetic shields. Accelerate fuse speed and unleash super smash rallies.',
        instructions: 'Drag shield to deflect the bomb! Fast swipe triggers SUPER SMASH!'
      }
    }
  };

  public t(key: string): string {
    const table = this.translations[this.currentLang] || this.translations.en;
    return table[key] || this.translations.en[key] || key;
  }

  public getMinigameText(id: MinigameId): MinigameText {
    const list = this.minigameTranslations[this.currentLang] || this.minigameTranslations.en;
    return list[id] || this.minigameTranslations.en[id];
  }

  public getRankName(tier: RankedTier): string {
    return this.t(`rank_${tier}`);
  }
}
