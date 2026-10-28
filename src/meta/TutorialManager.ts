import { MinigameId } from '../core/types';

export interface TutorialStep {
  title: string;
  body: string;
  tip?: string;
}

// Short per-game onboarding (shown before first play of each minigame)
export class TutorialManager {
  private static readonly STEPS: Record<MinigameId, TutorialStep[]> = {
    cyber_hockey: [
      { title: 'Move', body: 'Drag your mallet to intercept the puck.', tip: 'Stay near your goal when defending.' },
      { title: 'Strike', body: 'Flick fast to charge a Hyper-Shot.' }
    ],
    physics_sumo: [
      { title: 'Push', body: 'Drag to aim, release to lunge.', tip: 'Time lunges when rival is near the edge.' }
    ],
    tactical_tanks: [
      { title: 'Drive', body: 'Left side drag steers your tank.', tip: 'Use walls for ricochet shots.' },
      { title: 'Fire', body: 'Right side tap fires the cannon.' }
    ],
    counter_dash: [
      { title: 'Parry', body: 'Tap left half to parry (110ms window).', tip: 'Double-tap right cancels into feint.' },
      { title: 'Strike', body: 'Tap right half to slash.' }
    ],
    laser_drift: [{ title: 'Drift', body: 'Hold left/right to steer through checkpoints.' }],
    neon_orbit: [{ title: 'Orbit', body: 'Slide along the ring to deflect the disc through gravity.' }],
    memory_matrix: [{ title: 'Memorize', body: 'Watch the flash, then repeat the 3x3 sequence.' }],
    cyber_simon: [{ title: 'Echo', body: 'Repeat the light + sound sequence in order.' }],
    chroma_pairs: [{ title: 'Match', body: 'Flip two cards to match symbols. ⭐ is wild.' }],
    cyber_hoops: [{ title: 'Shoot', body: 'Drag & release to shoot arcs. 3 swishes = ON FIRE.' }],
    laser_pinball: [{ title: 'Flip', body: 'Tap left/right to flip. Hit Fusion Core 3x for multiball.' }],
    chroma_reaction: [{ title: 'React', body: 'Tap the correct color/word under Stroop pressure.' }],
    neon_volley: [{ title: 'Volley', body: 'Move + jump; strike at peak for Super Spike.' }],
    quantum_tug: [{ title: 'Pull', body: 'Tap in the green sweet-spot for 2.4x pull.' }],
    astro_blast: [{ title: 'Dogfight', body: 'Thrust to steer, fire plasma, shield to block.' }],
    cyber_slicer: [
      { title: 'Slice', body: 'Swipe across orbs to slice. ⭐ = 2pts.', tip: 'Never slice 💣 bombs (-1).' },
      { title: 'Combo', body: 'Chain 3+ slices fast for bonus points.' }
    ],
    synthwave_rhythm: [
      { title: 'Beat', body: 'Tap the lane when a note crosses the line.', tip: 'Within 16px = Perfect (2pts).' },
      { title: 'Fever', body: '8 hits in a row activates Fever bonus (+1 per note).' }
    ],
    gravity_runner: [
      { title: 'Flip', body: 'Tap to invert gravity between floor & ceiling.', tip: 'Gold gates show the safe side.' },
      { title: 'Survive', body: 'Each gate cleared = +1. Hits cost -1.' }
    ],
    neon_blade: [
      { title: 'Standoff', body: 'Wait patiently for the SLASH! signal.', tip: 'Tapping before the signal is an instant FOUL!' },
      { title: 'Strike', body: 'When SLASH! flashes, swipe across your zone immediately.' }
    ],
    cyber_bomb: [
      { title: 'Deflect', body: 'Drag your shield to deflect the ticking plasma bomb.', tip: 'Rallies increase bomb speed and danger.' },
      { title: 'Smash', body: 'Swipe rapidly when deflecting to trigger a blazing SUPER SMASH.' }
    ]
  };

  private static readonly STEPS_AR: Record<MinigameId, TutorialStep[]> = {
    cyber_hockey: [
      { title: 'التحريك والدفاع', body: 'اسحب مقبضك لصد القرص وحماية شباكك.', tip: 'ابقَ قريباً من مرماك للتصدي السريع.' },
      { title: 'الضربة الخارقة', body: 'اضرب القرص بحركة خاطفة وسريعة لشحن قذيفة بلازما متفجرة.' }
    ],
    physics_sumo: [
      { title: 'الاندفاع والتوجيه', body: 'اسحب في الاتجاه المعاكس للتصويب وأفلت للاندفاع بقوة كينيتيك.', tip: 'باغت خصمك عندما يقترب من حافة الحلبة السايبرانية.' }
    ],
    tactical_tanks: [
      { title: 'القيادة والمناورة', body: 'المس واسحب الجانب الأيسر لتوجيه وتحريك الدبابة.', tip: 'استغل ارتداد قذائف الليزر عن الجدران لصيد الخصم خلف الملاجئ.' },
      { title: 'التصويب والإطلاق', body: 'المس واسحب الجانب الأيمن للتصويب وأفلت لإطلاق القذيفة الليزرية.' }
    ],
    counter_dash: [
      { title: 'الصد المتقن (باري)', body: 'انقر على النصف الأيسر للصد في نافذة 110ms لتجميد حركة الخصم.', tip: 'الصد الناجح يمنحك هجوماً مرتداً ساحقاً!' },
      { title: 'الهجوم السريع', body: 'انقر على النصف الأيمن للاندفاع وشن ضربة سيف نيونية خاطفة.' }
    ],
    laser_drift: [
      { title: 'التفحيط المداري', body: 'اضغط يميناً أو يساراً للتفحيط بسلاسة عبر البوابات الليزرية.', tip: 'حافظ على الانجراف المستمر لملء عداد النيترو الخارق.' }
    ],
    neon_orbit: [
      { title: 'المصد المداري', body: 'حرك مقبضك على القوس المداري لصد القرص وتوجيهه عبر جاذبية الثقب الأسود.', tip: 'استغل انحناء مسار الجاذبية لخداع دفاع الخصم.' }
    ],
    memory_matrix: [
      { title: 'حفظ النمط النيوني', body: 'راقب وميض الرموز الهارمونية على الشبكة 3x3 بدقة.', tip: 'أعد تكرار النمط بنفس الترتيب بأسرع وقت لتسجيل نقطة.' }
    ],
    cyber_simon: [
      { title: 'التناغم والترديد', body: 'استمع للنغمات وشاهد الألوان، ثم أعد النغمة واللون بالترتيب.', tip: 'يزداد طول التسلسل النغمي مع كل جولة ناجحة.' }
    ],
    chroma_pairs: [
      { title: 'مطابقة البطاقات', body: 'اقلب بطاقتين لمطابقة الرموز النيونية المتطابقة.', tip: 'النجمة الذهبية ⭐ ورقة حرة تطابق أي رمز وتمنحك ضربة إضافية!' }
    ],
    cyber_hoops: [
      { title: 'التصويب والرمي', body: 'اسحب من منطقتك الخلفية وحدد القوس ثم أفلت للتسديد نحو السلة.', tip: '3 رميات نظيفة متتالية تشعل كرة النار الشمسية!' },
      { title: 'الصد الدفاعي', body: 'المس منطقة منتصف الملعب لإنشاء حاجز دفاعي يشتت كرات الخصم.' }
    ],
    laser_pinball: [
      { title: 'المضارب الليزرية', body: 'انقر يميناً ويساراً لتحريك الزعانف وصد الكرة للأعلى.', tip: 'اضرب قلب المفاعل 3 مرات لتفعيل كرات الليزر المتعددة (Multiball)!' }
    ],
    chroma_reaction: [
      { title: 'تأثير ستروب السريع', body: 'طابق الكلمة مع اللون الحقيقي بأقصى سرعة ممكنة.', tip: 'لا تنخدع بلون الخط؛ اقرأ الشرط المطلوب أعلى الشاشة بدقة.' }
    ],
    neon_volley: [
      { title: 'القفز والضرب الساحق', body: 'تحرك واقفز لملاقاة الكرة، واضربها في قمة الارتفاع للضربة الساحقة.', tip: 'الضربة الساحقة بسرعة تفوق دفاع المنافس!' }
    ],
    quantum_tug: [
      { title: 'شد الحبل الكمومي', body: 'انقر عندما يدخل المؤشر في المنطقة الخضراء للحصول على قوة جذب 2.4x.', tip: 'النقر العشوائي يضعف الشد؛ ركز على التوقيت الذهبي!' }
    ],
    astro_blast: [
      { title: 'المعارك الفضائية', body: 'وجه سفينتك، أطلق قذائف البلازما، وفعل الدرع لصد الهجمات.', tip: 'اجمع حزم الطاقة العائمة لتعزيز قدرات مركبتك.' }
    ],
    cyber_slicer: [
      { title: 'التقطيع السريع', body: 'مرر إصبعك عبر الكرات النيونية لتقطيعها وحصد النقاط.', tip: 'إياك وتقطيع القنابل المتفجرة 💣 حتى لا تخصم نقاطك!' },
      { title: 'سلسلة الكومبو', body: 'اقطع 3 كرات أو أكثر بحركة واحدة لمضاعفة نقاط الكومبو.' }
    ],
    synthwave_rhythm: [
      { title: 'موسيقى السنتثويف', body: 'انقر على المسار فور ملامسة النوتة لخط الإيقاع.', tip: 'التوقيت المتقن يمنحك نقطتين ويشعل حماس الفيفير 🔥!' }
    ],
    gravity_runner: [
      { title: 'قلب الجاذبية', body: 'المس الشاشة لعكس الجاذبية فوراً بين الأرضية والسقف.', tip: 'البوابات الذهبية تكشف لك المسار الآمن الخالي من العوائق.' }
    ],
    neon_blade: [
      { title: 'المواجهة الحاسمة', body: 'انتظر بهدوء وتركيز تام حتى تظهر إشارة الهجوم!', tip: 'الهجوم قبل الإشارة يعتبر خطأً فادحاً ويمنح الفوز للمنافس!' },
      { title: 'الضربة القاضية', body: 'اسحب فوراً عبر شاشتك في جزء من الثانية عند وميض الإشارة.' }
    ],
    cyber_bomb: [
      { title: 'صد القنبلة الموقوتة', body: 'حرك مضربك لصد قنبلة البلازما المتكتكة نحو الخصم.', tip: 'كل صدّة تزيد من سرعة القنبلة وخطورة انفجارها!' },
      { title: 'الصدّة الساحقة', body: 'حرك مضربك بسرعة هجومية أثناء الارتطام لإطلاق ضربة ساحقة لا تصد.' }
    ]
  };

  public static stepsFor(id: MinigameId, lang: 'ar' | 'en' = 'en'): TutorialStep[] {
    const table = lang === 'ar' ? TutorialManager.STEPS_AR : TutorialManager.STEPS;
    return table[id] ?? (lang === 'ar'
      ? [{ title: 'طريقة اللعب', body: 'سجل أهدافاً ونقاطاً وتفوق على منافسك لتحقيق الفوز!' }]
      : [{ title: 'Play', body: 'Score before your rival to win!' }]);
  }

  private static seenKey(id: MinigameId): string {
    return `duel_tutorial_seen_${id}`;
  }

  public static hasSeen(id: MinigameId): boolean {
    try { return localStorage.getItem(TutorialManager.seenKey(id)) === '1'; } catch { return true; }
  }

  public static markSeen(id: MinigameId): void {
    try { localStorage.setItem(TutorialManager.seenKey(id), '1'); } catch { /* noop */ }
  }
}
