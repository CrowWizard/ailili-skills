"use strict";

const TYPE_LABELS = {
  white_bg: "白底主图",
  key_features: "核心卖点图",
  selling_pt: "卖点图",
  material: "材质图",
  lifestyle: "场景展示图",
  model: "模特展示图",
  multi_scene: "多场景拼图",
  ecommerce_detail: "电商详情图",
  three_angle_view: "三角度拼图",
};

const TYPE_IMAGE_SLOT = {
  white_bg: 0,
  key_features: 0,
  selling_pt: 0,
  material: 1,
  lifestyle: 0,
  model: 0,
  multi_scene: 0,
  ecommerce_detail: 0,
  three_angle_view: 0,
};

const MODEL_TYPES = new Set(["model", "lifestyle", "multi_scene", "three_angle_view"]);

const DEFAULT_TYPES = [
  "white_bg",
  "key_features",
  "selling_pt",
  "material",
  "lifestyle",
  "model",
  "multi_scene",
  "ecommerce_detail",
];

const INPUT_TYPE_COMPOSITIONS = {
  flat_lay:
    "displayed flat on pure white background (RGB 255,255,255), front view, slight 5-degree product tilt, natural fabric drape, subtle soft shadow beneath",
  flat_lay_front_back:
    "displayed flat on pure white background (RGB 255,255,255), front view, slight 5-degree product tilt, natural fabric drape, subtle soft shadow beneath, showcasing the full front design and silhouette",
  hanging:
    "hanging naturally on an invisible hook on pure white background (RGB 255,255,255), full length, front view, fabric draping naturally",
  hanging_front_back:
    "hanging naturally on an invisible hook on pure white background (RGB 255,255,255), full length, front view, fabric draping naturally",
  model:
    "product isolated on pure white background (RGB 255,255,255), front view, product shape preserved, no model",
};

const QUALITY =
  "shot on Sony A7R V, 85mm f/2.0 lens, natural diffused studio lighting, " +
  "authentic commercial product photography, true-to-life colors no heavy post-processing, " +
  "realistic fabric texture and natural drape, professional e-commerce visual style. " +
  "CRITICAL: Keep the EXACT same product design, color, print, proportions and all details. " +
  "Do NOT alter any design element. " +
  "Do NOT redesign, recolor, replace, or rotate the product into a different structure.";

const PRODUCT_REF_LOCK =
  "CRITICAL HIGHEST PRIORITY: Product reference image is provided. " +
  "You MUST use the reference image as the EXACT basis for the product. " +
  "Keep EXACT same: silhouette, print pattern, print position, all colors, neckline, sleeves, hem, fabric texture. " +
  "DO NOT change: the print design, color scheme, silhouette shape, fabric appearance. " +
  "You may ONLY change: background scene, camera angle, lighting, model pose. " +
  "The product must look IDENTICAL to the reference image - same dress, same pattern, same colors.";

const MODEL_REALISM = " natural hair flyaway, subtle hand movement, authentic candid posture.";

function spField(sp, i, keys) {
  const pt = Array.isArray(sp) ? sp[i] : null;
  if (!pt || typeof pt !== "object") return "";
  for (const key of keys) {
    const val = pt[key];
    if (val) return String(val);
  }
  return "";
}

function spTitle(sp, i, lang) {
  return lang === "zh" ? spField(sp, i, ["zh_title", "zh", "title"]) : spField(sp, i, ["en_title", "en", "title"]);
}

function spDesc(sp, i, lang) {
  return lang === "zh"
    ? spField(sp, i, ["zh_desc", "description", "zh"])
    : spField(sp, i, ["en_desc", "en", "description"]);
}

function spVisualDetail(sp, i) {
  const pt = Array.isArray(sp) ? sp[i] : null;
  if (!pt || typeof pt !== "object") return "";
  const kw = pt.visual_keywords;
  if (Array.isArray(kw) && kw.length) return kw.slice(0, 2).map(String).join(", ");
  return pt.en_desc || pt.en || "";
}

function inferPairing(garmentPosition) {
  if (garmentPosition === "top") return "paired with light blue denim shorts";
  if (garmentPosition === "bottom") return "paired with a simple white T-shirt";
  return "";
}

function sceneToEnv(sceneZh, productType) {
  const s = String(sceneZh || "");
  const hit = (keys) => keys.some((k) => s.includes(k));
  if (hit(["居家", "睡", "卧室", "内衣", "睡衣", "室内", "家中", "闺蜜"])) {
    return "cozy bedroom interior, soft ambient lamp light, satin bedding, intimate home setting";
  }
  if (hit(["海边", "沙滩", "度假", "海滩", "海岛"])) {
    return "tropical beach, golden sand, turquoise ocean backdrop, sunlit coastal scene";
  }
  if (hit(["约会", "浪漫", "晚宴", "romantic", "date", "情侣"])) {
    return "intimate romantic restaurant terrace, warm candlelight, evening ambient glow";
  }
  if (hit(["运动", "健身", "瑜伽", "跑步", "gym", "sport"])) {
    return "modern fitness studio or park path, natural light, clean athletic atmosphere";
  }
  if (hit(["派对", "聚会", "party", "gathering", "社交"])) {
    return "chic social venue, warm ambient lighting, stylish gathering atmosphere";
  }
  if (hit(["办公", "通勤", "上班", "商务", "office", "work"])) {
    return "modern office or minimalist café workspace, clean professional atmosphere";
  }
  if (hit(["校园", "学校", "课堂", "campus", "school"])) {
    return "sunny campus green lawn or café, shallow depth of field, youthful atmosphere";
  }
  if (hit(["户外", "公园", "街头", "城市", "散步", "逛街", "出行"])) {
    return "lush outdoor park or urban street, golden hour natural light, soft bokeh";
  }
  if (hit(["旅行", "出游", "旅游", "travel", "trip"])) {
    return "scenic travel destination, open air, natural bright light, wanderlust vibe";
  }
  if (hit(["咖啡", "下午茶", "café", "coffee"])) {
    return "cozy café interior, wooden table, warm natural window light, lifestyle mood";
  }
  if (hit(["客厅", "沙发", "起居", "living room"])) {
    return "bright modern living room, clean sofa and wooden floor, warm natural light";
  }
  if (hit(["厨房", "餐厅", "烹饪", "kitchen"])) {
    return "clean modern kitchen counter, marble surface, soft overhead lighting";
  }
  if (hit(["书房", "书桌", "学习", "阅读", "study", "desk"])) {
    return "tidy home study room, wooden desk, soft warm desk lamp, bookshelf background";
  }
  if (hit(["办公桌", "工作台", "workspace"])) {
    return "minimalist office desk setup, clean workspace, natural window light";
  }
  if (hit(["床头", "睡前", "bedside"])) {
    return "serene bedroom setting, bedside table, soft ambient lamp glow";
  }
  if (hit(["清洁", "打扫", "吸尘", "拖地", "clean"])) {
    return "bright clean home interior, polished floor, natural daylight, tidying scene";
  }
  if (hit(["装修", "家装", "布置", "decor", "interior"])) {
    return "stylish home interior during decoration, warm ambient light, modern furniture";
  }
  if (hit(["庭院", "花园", "园艺", "garden"])) {
    return "sunlit backyard garden, lush green plants, natural bright outdoor daylight";
  }
  const pt = String(productType || "").toLowerCase();
  if (["家居", "home", "furniture", "家具"].some((k) => pt.includes(k))) {
    return "bright Scandinavian-style living room, clean surfaces, warm natural light";
  }
  if (["3c", "数码", "电器", "electronics", "appliance"].some((k) => pt.includes(k))) {
    return "clean minimalist workspace or kitchen counter, soft studio-style lighting";
  }
  if (["美妆", "beauty", "cosmetic", "护肤"].some((k) => pt.includes(k))) {
    return "elegant vanity desk, soft diffused light, fresh white background, beauty mood";
  }
  if (["食品", "food", "零食", "beverage"].some((k) => pt.includes(k))) {
    return "warm kitchen countertop with natural ingredients, rustic wooden surface, fresh daylight";
  }
  return "bright authentic lifestyle setting, natural light, shallow depth of field";
}

function getSceneEnv(envs, index, scenes, productType) {
  if (Array.isArray(envs) && envs[index]) {
    const env = String(envs[index]).trim();
    if (env) return env;
  }
  if (Array.isArray(scenes) && scenes[index]) return sceneToEnv(scenes[index], productType);
  return sceneToEnv("", productType);
}

function inferModelSubject(targetAudience, modelEthnicity) {
  const s = String(targetAudience || "").toLowerCase();
  const gender = ["男", "男士", "男性", "先生", "men", "male", "gentleman", "boy"].some((k) => s.includes(k))
    ? "male"
    : "female";
  const child = ["儿童", "小孩", "宝宝", "孩子", "children", "child", "kids", "6岁", "8岁", "10岁", "12岁"].some((k) =>
    s.includes(k)
  );
  const ethnicity = String(modelEthnicity || "asian").toLowerCase();
  const race = ethnicity === "western" ? "Caucasian" : ethnicity === "mixed" ? "ethnically diverse" : "Asian";
  if (child) return `${race} child model aged 6-12`;
  return `${race} ${gender} model`;
}

function productDescription(product) {
  if (!product || typeof product !== "object") return "product";
  const direct = product.product_description_for_prompt;
  if (direct) return String(direct);
  const name = product.product_name || "product";
  const vf = product.visual_features;
  if (vf && typeof vf === "object" && !Array.isArray(vf)) {
    const parts = [name];
    for (const key of ["main_color", "pattern", "neckline", "silhouette", "hemline", "fabric_texture"]) {
      if (vf[key]) parts.push(vf[key]);
    }
    return parts.join(" ");
  }
  if (Array.isArray(vf)) return `${name} ${vf.slice(0, 4).join(" ")}`.trim();
  return name;
}

function textRender(lang) {
  if (lang === "en") {
    return (
      "EXTREMELY IMPORTANT: Render ALL text in English ONLY. " +
      "Use clean modern bold sans-serif typography (Helvetica Neue, Arial, or similar). " +
      "Text must be perfectly sharp, highly legible, excellent hierarchy, proper kerning. " +
      "Use subtle drop shadow (black 30% opacity) for readability. " +
      "Professional commercial layout, balanced spacing, no distortion, no overlapping."
    );
  }
  return (
    "EXTREMELY IMPORTANT: Render ALL text in Simplified Chinese ONLY. " +
    "Use clean modern bold sans-serif typography (思源黑体 / Alibaba PuHuiTi or similar). " +
    "Text must be perfectly sharp, highly legible, excellent hierarchy, proper kerning. " +
    "Use subtle drop shadow (black 30% opacity) for readability. " +
    "Professional commercial layout, balanced spacing, no distortion, no overlapping."
  );
}

function pickKeyFeaturesStyle({ keyFeaturesStyle, perTypeTemplates, isApparel }) {
  if (keyFeaturesStyle) return keyFeaturesStyle;
  const kfTpl = perTypeTemplates && perTypeTemplates.key_features;
  if (kfTpl === 2) return "annotation";
  if (kfTpl === 3) return "split";
  if (kfTpl === 4) return "badge";
  if (kfTpl === 5) return "gold_bubble";
  return isApparel ? "magnifier" : "icon_list";
}

function buildPrompt(typeId, opts) {
  const product = opts.product || {};
  const desc = opts.desc || productDescription(product);
  const sp = product.selling_points || opts.sellingPoints || [];
  const lang = opts.lang || "zh";
  const templateSet = Number(opts.templateSet || opts.template_set || 1);
  const garmentPosition = product.garment_position || opts.garmentPosition || "full-body";
  const isApparel = garmentPosition !== "non-apparel";
  const hasProductRef = opts.hasProductRef !== false;
  const hasModelRef = Boolean(opts.hasModelRef);
  const inputImageType = product.input_image_type || opts.inputImageType || "flat_lay";
  const printLock = product.print_design_lock || opts.printDesignLock || "";
  const targetScenes = product.target_scenes || product.usage_scenes || opts.targetScenes || [];
  const targetSceneEnvs = product.target_scene_envs || opts.targetSceneEnvs || [];
  const productStyle = product.product_style || product.product_subtype || product.product_category || "";
  const targetAudience = product.target_audience || "";
  const productType = product.product_type || "";
  const modelEthnicity = product.model_ethnicity || opts.modelEthnicity || "asian";
  const modelStyle = opts.modelStyle || opts.model_style || "standard";
  const perTypeTemplates = opts.perTypeTemplates || opts.per_type_templates || {};
  const TEXT = textRender(lang);
  const refTail = hasProductRef ? ` ${PRODUCT_REF_LOCK}` : "";
  const lockTail = printLock ? ` ${printLock}` : "";
  const modelSubject = inferModelSubject(targetAudience, modelEthnicity);
  const pairing = inferPairing(garmentPosition);
  const outfit = isApparel ? `wearing ${desc} ${pairing}`.trim() : `showcasing ${desc}`;
  const MODEL_REF_LOCK = hasModelRef
    ? `CRITICAL: Two reference images are provided. First image: Model reference — MUST use EXACTLY the same ${modelSubject}: identical face, skin tone, hair, body shape, expression and ethnicity. Do not replace or change the model. Second image: Product reference — MUST use EXACTLY the same garment design: silhouette, print pattern, print position, all colors, neckline, sleeves, hem, fabric texture. The model must WEAR the EXACT SAME garment from the second image. Do NOT change the garment design, color, or style.`
    : "";
  const spModelLock = hasModelRef ? ` ${MODEL_REF_LOCK}` : "";

  const kfHeading = lang === "zh" ? "为什么选择我们" : "WHY CHOOSE US";
  const kfLabels = [0, 1, 2].map((i) => spTitle(sp, i, lang) || (lang === "zh" ? `卖点${i + 1}` : `Feature ${i + 1}`));
  const spHeading = spTitle(sp, 1, lang) || spTitle(sp, 0, lang);
  const spSub1 = spDesc(sp, 1, lang) || spDesc(sp, 0, lang);
  const spSub2 = spDesc(sp, 2, lang) || spDesc(sp, 1, lang);
  const matHeading = spTitle(sp, 0, lang);
  const matSub1 = spDesc(sp, 0, lang);
  const matSub2 = spDesc(sp, 2, lang) || spDesc(sp, 1, lang);
  const ts = targetScenes.filter(Boolean);
  const lsHeading =
    (productStyle && String(productStyle).slice(0, 20)) ||
    spTitle(sp, 2, lang) ||
    spTitle(sp, 0, lang) ||
    (lang === "zh" ? "多场景百搭" : "VERSATILE EVERYDAY STYLE");
  const lsSub1 = (ts[0] && String(ts[0]).slice(0, 15)) || spTitle(sp, 0, lang) || (lang === "zh" ? "精选面料" : "Premium Quality");
  const lsSub2 = (ts[1] && String(ts[1]).slice(0, 15)) || spTitle(sp, 1, lang) || (lang === "zh" ? "品质设计" : "Elegant Design");
  const msHeading = spTitle(sp, 2, lang) || (lang === "zh" ? "一件多穿，随心切换" : "VERSATILE FOR ANY OCCASION");
  const msLeft = (ts[0] && String(ts[0]).slice(0, 12)) || (lang === "zh" ? "居家休闲" : "Home Casual");
  const msRight = (ts[1] && String(ts[1]).slice(0, 12)) || (lang === "zh" ? "日常出行" : "Daily Lifestyle");
  const whiteBgComposition =
    INPUT_TYPE_COMPOSITIONS[inputImageType] ||
    "centered on pure white background, front 3/4 view, slight angle, subtle shadow beneath, 88% frame";
  const materialView =
    inputImageType === "flat_lay_front_back" || inputImageType === "hanging_front_back"
      ? "back surface, showing reverse-side fabric detail"
      : "surface detail";
  const kfDetail = [
    spVisualDetail(sp, 0) || "fabric texture and stitching",
    spVisualDetail(sp, 1) || "design detail and craftsmanship",
    spVisualDetail(sp, 2) || "silhouette and fit",
  ];
  const kfStyle = pickKeyFeaturesStyle({
    keyFeaturesStyle: opts.keyFeaturesStyle || opts.key_features_style || "",
    perTypeTemplates,
    isApparel,
  });

  let keyFeatures;
  if (kfStyle === "icon_list") {
    keyFeatures = `Modern minimalist infographic, light gray gradient bg. Left: ${desc} front view (45%). Right: bold heading "${kfHeading}", three vertical icon+text: "${kfLabels[0]}", "${kfLabels[1]}", "${kfLabels[2]}". Premium layout. ${TEXT}${refTail} ${QUALITY}`;
  } else if (kfStyle === "annotation") {
    keyFeatures = `${desc}, editorial product photography, product centered on warm beige background. Three elegant handwritten-style annotation lines from product details: annotation 1 → "${kfLabels[0]}" (${kfDetail[0]}); annotation 2 → "${kfLabels[1]}" (${kfDetail[1]}); annotation 3 → "${kfLabels[2]}" (${kfDetail[2]}). Kinfolk magazine aesthetic, natural light and shadows, serif typeface. ${TEXT}${refTail} ${QUALITY}`;
  } else if (kfStyle === "split") {
    keyFeatures = `${desc}, ultra-minimalist product photography on pure black background. Product in white spotlight center, single white hairline border frame. Three feature labels in clean white sans-serif: "${kfLabels[0]}", "${kfLabels[1]}", "${kfLabels[2]}". Luxury fashion brand, zero clutter, monochrome palette. ${TEXT}${refTail} ${QUALITY}`;
  } else if (kfStyle === "badge") {
    keyFeatures = `${desc}, high-energy commercial product photography, white background. Bold sunburst starburst in yellow (#FFD700) behind product. Three circular badge labels in vivid red (#E02E24), extra-bold font tilted -3deg: "${kfLabels[0]}!", "${kfLabels[1]}!", "${kfLabels[2]}!". Explosive high-saturation POP art energy. ${TEXT}${refTail} ${QUALITY}`;
  } else if (kfStyle === "gold_bubble") {
    keyFeatures = `${desc}, luxury dark product photography on deep charcoal (#1A1A2E) background. Product lit with golden side light. Three gold-bordered circular callout bubbles with feature labels: "${kfLabels[0]}", "${kfLabels[1]}", "${kfLabels[2]}". Premium fashion editorial dark aesthetic, gold accent (#C8A86C). ${TEXT}${refTail} ${QUALITY}`;
  } else {
    keyFeatures = `${desc}, high-end product photography, centered floating composition, clean softly blurred background; featuring 3 circular magnifying glass insets (callout bubbles) connected by thin elegant lines to specific parts of the main product: Inset 1 (top-left): close-up of [${kfDetail[0]}], label "${kfLabels[0]}"; Inset 2 (top-right): close-up of [${kfDetail[1]}], label "${kfLabels[1]}"; Inset 3 (bottom-right): close-up of [${kfDetail[2]}], label "${kfLabels[2]}". Soft studio lighting, minimalist commercial design, sharp focus on product, bokeh background. ${TEXT}${refTail} ${QUALITY}`;
  }

  const spEnv = getSceneEnv(targetSceneEnvs, 0, targetScenes, productType);
  let sellingPt;
  if (templateSet === 2) {
    sellingPt = isApparel
      ? `Bright café window seat, morning natural light, warm wooden surface. ${desc} casually arranged in lifestyle context. Bold heading "${spHeading}" upper left, "${spSub1}", "${spSub2}". Kinfolk lifestyle mood. ${TEXT}${refTail} ${QUALITY}`
      : `Bright café window seat, morning natural light, warm wooden surface. ${desc} placed as a lifestyle product hero. Bold heading "${spHeading}" upper left, "${spSub1}", "${spSub2}". Kinfolk product mood. ${TEXT}${refTail} ${QUALITY}`;
  } else if (templateSet === 3) {
    sellingPt = `Pure white minimal studio, crisp shadows. ${desc} centered on white surface. Single bold heading "${spHeading}" top, "${spSub1}", "${spSub2}" below. No props, zero clutter. ${TEXT}${refTail} ${QUALITY}`;
  } else if (templateSet === 4) {
    sellingPt = `Vibrant outdoor urban street, high saturation colors, dynamic energy. ${desc} featured prominently. Bold heading "${spHeading}", "${spSub1}", "${spSub2}". Pop art energy. ${TEXT}${refTail} ${QUALITY}`;
  } else if (templateSet === 5) {
    sellingPt = `Dark atmospheric studio, single beam spotlight illuminating ${desc}. Deep moody shadows, cinematic feel. Bold gold heading "${spHeading}", "${spSub1}", "${spSub2}" in white. ${TEXT}${refTail} ${QUALITY}`;
  } else {
    sellingPt = isApparel
      ? `${spEnv.charAt(0).toUpperCase()}${spEnv.slice(1)}, warm natural light. ${desc} worn with relaxed natural pose. Bold heading "${spHeading}" upper left, two lines: "${spSub1}", "${spSub2}". Commercial lifestyle mood. ${TEXT}${refTail} ${QUALITY}`
      : `${spEnv.charAt(0).toUpperCase()}${spEnv.slice(1)}, clean natural light. ${desc} displayed prominently as hero product. Bold heading "${spHeading}" upper left, two lines: "${spSub1}", "${spSub2}". Commercial product mood. ${TEXT}${refTail} ${QUALITY}`;
  }

  let material;
  if (templateSet === 2) {
    material = `${desc} laid flat on natural oak wood or white marble surface, editorial flat lay, top-down bird's eye view, warm morning light. Bold heading "${matHeading}" upper right, "${matSub1}" mid, "${matSub2}" lower. ${TEXT}${refTail} ${QUALITY}`;
  } else if (templateSet === 3) {
    material = `${desc} neatly folded in geometric layers on pure white surface, crisp shadows emphasizing fold lines and fabric weight. Single bold heading "${matHeading}" right, "${matSub1}", "${matSub2}". Architectural minimal aesthetic. ${TEXT}${refTail} ${QUALITY}`;
  } else if (templateSet === 4) {
    material = `${desc} dramatically unfolded showing vivid fabric layers at dynamic angle, high saturation colors, close-up angled shot. Bold heading "${matHeading}" corner, "${matSub1}", "${matSub2}" in red. ${TEXT}${refTail} ${QUALITY}`;
  } else if (templateSet === 5) {
    material = `Extreme close-up of ${desc} fabric (${materialView}) against deep black background, golden rim lighting tracing fabric edge, dramatic contrast. Bold gold heading "${matHeading}" right, "${matSub1}", "${matSub2}" in white. ${TEXT}${refTail} ${QUALITY}`;
  } else {
    material = isApparel
      ? `Extreme macro fabric texture of ${desc} (${materialView}), dramatic side lighting, soft folds. Blurred natural background. Bold heading "${matHeading}" upper right, "${matSub1}" mid, "${matSub2}" lower. Hyper detailed. ${TEXT}${refTail} ${QUALITY}`
      : `Extreme close-up product detail shot of ${desc}, showcasing surface finish, construction quality and material texture. Dramatic side lighting on ${materialView}, clean neutral background. Bold heading "${matHeading}" upper right, "${matSub1}" mid, "${matSub2}" lower. Hyper detailed product photography. ${TEXT}${refTail} ${QUALITY}`;
  }

  const lsEnv = getSceneEnv(targetSceneEnvs, 0, targetScenes, productType);
  let lifestyle;
  if (templateSet === 2) {
    lifestyle = isApparel
      ? `${lsEnv.charAt(0).toUpperCase()}${lsEnv.slice(1)}, natural golden light, soft bokeh. ${modelSubject} ${outfit}, relaxed natural pose, the ${desc} is the visual focus. Bold heading "${lsHeading}" upper left, "${lsSub1}" and "${lsSub2}". Magazine editorial warmth. ${TEXT} ${QUALITY}${lockTail}${refTail}${spModelLock}`
      : `${lsEnv.charAt(0).toUpperCase()}${lsEnv.slice(1)}, warm natural light. ${desc} placed naturally as the visual focus. Bold heading "${lsHeading}" upper left, "${lsSub1}" and "${lsSub2}". ${TEXT} ${QUALITY}${lockTail}${refTail}`;
  } else if (templateSet === 3) {
    lifestyle = isApparel
      ? `Clean minimal interior space, soft diffused natural light, architectural simplicity. ${modelSubject} ${outfit}, simple elegant pose, the ${desc} is the visual focus. Bold heading "${lsHeading}" upper left, "${lsSub1}" and "${lsSub2}". Minimal luxury feel. ${TEXT} ${QUALITY}${lockTail}${refTail}${spModelLock}`
      : `Clean minimal interior, white surfaces, minimal props. ${desc} placed as hero object. Bold heading "${lsHeading}" upper left, "${lsSub1}" and "${lsSub2}". ${TEXT} ${QUALITY}${lockTail}${refTail}`;
  } else if (templateSet === 4) {
    lifestyle = isApparel
      ? `Vibrant dynamic scene with saturated colors, energetic atmosphere. ${modelSubject} ${outfit}, energetic pose, the ${desc} pops with color. Bold heading "${lsHeading}" upper left, "${lsSub1}" and "${lsSub2}". Street fashion energy. ${TEXT} ${QUALITY}${lockTail}${refTail}${spModelLock}`
      : `Vibrant colorful lifestyle context, high energy atmosphere. ${desc} featured boldly as the visual focus. Bold heading "${lsHeading}" upper left, "${lsSub1}" and "${lsSub2}". ${TEXT} ${QUALITY}${lockTail}${refTail}`;
  } else if (templateSet === 5) {
    lifestyle = isApparel
      ? `Moody atmospheric scene, dramatic low-key lighting, deep shadows. ${modelSubject} ${outfit}, cool editorial pose, the ${desc} is the visual focus. Bold heading "${lsHeading}" upper left in gold, "${lsSub1}" and "${lsSub2}" in white. Night fashion mood. ${TEXT} ${QUALITY}${lockTail}${refTail}${spModelLock}`
      : `Moody dark atmospheric scene, cinematic low-key lighting. ${desc} featured in atmospheric dark context. Bold heading "${lsHeading}" upper left, "${lsSub1}" and "${lsSub2}". ${TEXT} ${QUALITY}${lockTail}${refTail}`;
  } else {
    lifestyle = isApparel
      ? `${lsEnv.charAt(0).toUpperCase()}${lsEnv.slice(1)}, warm natural light, shallow DOF. ${modelSubject} ${outfit}, the ${desc} is the absolute visual focus. Bold white heading "${lsHeading}" upper left with shadow, "${lsSub1}" and "${lsSub2}" lower left. ${TEXT} ${QUALITY}${lockTail}${refTail}${spModelLock}`
      : `${lsEnv.charAt(0).toUpperCase()}${lsEnv.slice(1)}, natural light, shallow DOF. ${desc} placed prominently as the visual focus. Bold white heading "${lsHeading}" upper left with shadow, "${lsSub1}" and "${lsSub2}" lower left. ${TEXT} ${QUALITY}${lockTail}${refTail}`;
  }

  let model;
  if (modelStyle === "bodycon") {
    model = `Full-body studio fashion shot, clean solid background. ${modelSubject} wearing ${outfit}. Fitted silhouette showing garment shape. Professional commercial lighting. No text.${refTail} ${QUALITY}${MODEL_REALISM}${spModelLock}`;
  } else if (templateSet === 2) {
    model = `Bright café interior with window. ${modelSubject} sitting ${outfit}. Warm natural light, casual pose. The ${desc} is clearly visible. No text.${refTail} ${QUALITY}${MODEL_REALISM}${spModelLock}`;
  } else if (templateSet === 3) {
    model = `Clean white seamless studio background. ${modelSubject} full body standing ${outfit}. Even professional lighting. The ${desc} is the focus. Minimalist commercial style. No text.${refTail} ${QUALITY}${MODEL_REALISM}${spModelLock}`;
  } else if (templateSet === 4) {
    model = `Modern city street scene. ${modelSubject} walking ${outfit}. Dynamic outdoor setting with natural lighting. The ${desc} is clearly visible. No text.${refTail} ${QUALITY}${MODEL_REALISM}${spModelLock}`;
  } else if (templateSet === 5) {
    model = `Professional dark studio with focused lighting. ${modelSubject} standing ${outfit}. Single light source, clean dark background. The ${desc} is clearly visible. No text.${refTail} ${QUALITY}${MODEL_REALISM}${spModelLock}`;
  } else {
    const modelEnv = getSceneEnv(targetSceneEnvs, 0, targetScenes, productType);
    model = `${modelEnv.charAt(0).toUpperCase()}${modelEnv.slice(1)}. ${modelSubject} wearing ${outfit}. The ${desc} is clearly visible. Natural professional lighting. No text.${refTail} ${QUALITY}${MODEL_REALISM}${spModelLock}`;
  }

  const ms1 = getSceneEnv(targetSceneEnvs, 0, targetScenes, productType);
  const ms2 = getSceneEnv(targetSceneEnvs, 1, targetScenes, productType);
  const ms3 = getSceneEnv(targetSceneEnvs, 2, targetScenes, productType);
  const msL1 = (ts[0] && String(ts[0]).slice(0, 12)) || msLeft;
  const msL2 = (ts[1] && String(ts[1]).slice(0, 12)) || msRight;
  const msL3 = (ts[2] && String(ts[2]).slice(0, 12)) || "";
  const msConsistency = `CRITICAL: ALL panels show the EXACT SAME ${desc} — identical design, color, fabric texture, proportions. Same consistent ${modelSubject} throughout, full-body visible in each panel.`;
  let multiScene;
  if (templateSet === 2) {
    multiScene = isApparel
      ? `[Magazine-style 3-panel collage] ${desc} showcased across 3 lifestyle scenes with thin white card borders. Panel 1: ${ms1} — ${modelSubject} ${outfit}, relaxed natural pose, ${msL1}; Panel 2: ${ms2} — model ${outfit}, candid interaction, ${msL2}; Panel 3: ${ms3} — model ${outfit}, full-body visible, ${msL3}. Heading "${msHeading}" at top. Bottom: "${msLeft}" left, "${msRight}" right. Warm magazine diary aesthetic, natural tones. ${msConsistency} ${TEXT} ${QUALITY}${lockTail}${refTail}${spModelLock}`
      : `[Magazine-style 3-panel collage] ${desc} shown across 3 scenes: Panel 1: ${ms1} (${msL1}); Panel 2: ${ms2} (${msL2}); Panel 3: ${ms3} (${msL3}). Heading "${msHeading}" at top. Warm magazine diary tones. CRITICAL: same ${desc} in all panels. ${TEXT} ${QUALITY}${lockTail}${refTail}`;
  } else if (templateSet === 3) {
    multiScene = `[Minimal 2-panel split] Clean bold dividing line at center. LEFT: ${ms1}, ${isApparel ? `${modelSubject} ${outfit}` : desc}, ${msL1}. RIGHT: ${ms2}, ${isApparel ? `model ${outfit}` : desc}, ${msL2}. Centered heading "${msHeading}". Bottom: "${msLeft}" left, "${msRight}" right. Luxury minimal aesthetic, high contrast. ${msConsistency} ${TEXT} ${QUALITY}${lockTail}${refTail}${spModelLock}`;
  } else if (templateSet === 4) {
    multiScene = `[Dynamic diagonal collage] 45-degree bold split. Upper-left: ${ms1}, ${isApparel ? `${modelSubject} ${outfit}` : desc}, ${msL1}. Lower-right: ${ms2}, ${isApparel ? `model ${outfit}` : desc}, ${msL2}. Centered heading "${msHeading}" bold. Bottom: "${msLeft}" left, "${msRight}" right. High-energy POP composition, saturated vibrant tones. ${msConsistency} ${TEXT} ${QUALITY}${lockTail}${refTail}${spModelLock}`;
  } else if (templateSet === 5) {
    multiScene = `[Cinematic 3-panel collage] Deep dark aesthetic, moody lighting. Panel 1: ${ms1}, ${msL1}; Panel 2: ${ms2}, ${msL2}; Panel 3: ${ms3}, ${msL3}. Heading "${msHeading}" in gold. Bottom: "${msLeft}" left, "${msRight}" right. ${msConsistency} ${TEXT} ${QUALITY}${lockTail}${refTail}${spModelLock}`;
  } else {
    multiScene = isApparel
      ? `[Commercial Product Showcase Collage] A single ${desc} showcased across 3 distinct lifestyle scenes, emphasizing versatility. All panels show SAME product worn by consistent relatable ${modelSubject}, full-body visible. Scene ①: ${ms1} — ${msL1}, natural light, authentic interaction; Scene ②: ${ms2} — ${msL2}, dynamic natural pose, genuine atmosphere; Scene ③: ${ms3} — ${msL3}, scenic backdrop, full-body shot. Layout: 3 equal vertical panels, thin white dividing lines. Centered heading "${msHeading}" at top with subtle shadow. Bottom-left: "${msLeft}". Bottom-right: "${msRight}". Style: photorealistic commercial photography, soft focus backgrounds, clean composition. Color: warm inviting tones, natural saturation, no oversaturation. ${msConsistency} ${TEXT} ${QUALITY}${lockTail}${refTail}${spModelLock}`
      : `[Commercial Product Showcase Collage] A single ${desc} featured across 3 distinct usage scenes. Scene ①: ${ms1} — ${msL1}; Scene ②: ${ms2} — ${msL2}; Scene ③: ${ms3} — ${msL3}. Layout: 3 equal panels, thin white dividers. Centered heading "${msHeading}" at top. Bottom: "${msLeft}" left, "${msRight}" right. CRITICAL: same ${desc} in ALL panels — identical design, color, proportions. ${TEXT} ${QUALITY}${lockTail}${refTail}`;
  }

  const threeAngle = isApparel
    ? `[Three-Angle Product View - Front/Side/Back Collage] A single image divided into THREE EQUAL-SIZED PANELS showing ${modelSubject} wearing ${desc} from different angles. LEFT PANEL: Front view - model facing forward, full body from head to toe visible, showing front design, neckline, and overall silhouette. MIDDLE PANEL: Side view - model standing in profile, full body visible, showing side silhouette, sleeve/sleeveless detail, and fabric drape. RIGHT PANEL: Back view - model with back to camera, full body visible, showing back neckline, back design, and complete back silhouette. CRITICAL REQUIREMENTS: 1. All three panels must show the EXACT SAME ${desc} - identical design, color, print pattern, proportions. 2. All panels must be FULL-BODY shots including head, hair, shoulders, torso, legs, feet. NO cropping or body cutoffs. 3. All three panels must be the SAME SIZE and arranged horizontally with equal width. 4. Use thin white dividers between panels. 5. Clean white/light gray studio background, soft even lighting, professional commercial photography. 6. Sharp focus, natural skin tones, realistic fabric rendering. Layout: [FRONT VIEW | SIDE VIEW | BACK VIEW] - three equal horizontal panels. ${msConsistency} ${QUALITY}${lockTail}${refTail}${spModelLock}`
    : `[Three-Angle Product View - Front/Side/Back Collage] A single image divided into THREE EQUAL-SIZED PANELS showing ${desc} from different angles. LEFT PANEL: Front view. MIDDLE PANEL: Side view. RIGHT PANEL: Back view. CRITICAL: same product in all panels, equal panel size, thin white dividers, clean white/light gray studio background. Layout: [FRONT VIEW | SIDE VIEW | BACK VIEW]. ${QUALITY}${lockTail}${refTail}`;

  const ecdTitle = spTitle(sp, 0, lang) || (lang === "zh" ? "产品详情" : "PRODUCT DETAILS");
  const ecdSub = spDesc(sp, 0, lang) || (lang === "zh" ? "精选品质，值得拥有" : "Premium Quality, Worth Owning");
  const ecommerceDetail = `High-end e-commerce product detail page layout. CRITICAL: ${desc} is the absolute hero product in 80% of frame, right-aligned 45-degree angle, complete structure, sharp edges, no cropping, intact design. TOP MODULE: Main heading "${ecdTitle}", sub-heading "${ecdSub}". FEATURE ICONS: "${kfLabels[0]}"; "${kfLabels[1]}"; "${kfLabels[2]}"; "${spTitle(sp, 3, lang) || "Featured"}". BOTTOM: three-view drawing, parameter table, six feature cards, usage scenes ${ts[0] || "Outdoor"} / ${ts[1] || "Indoor"} / ${ts[2] || "Daily"}. ${TEXT}${refTail} ${QUALITY}`;

  const prompts = {
    white_bg: `${desc}, ${whiteBgComposition}, product occupies 88% of frame, clean studio lighting with soft shadow. No text.${refTail} ${QUALITY}`,
    key_features: keyFeatures,
    selling_pt: sellingPt,
    material,
    lifestyle,
    model,
    multi_scene: multiScene,
    ecommerce_detail: ecommerceDetail,
    three_angle_view: threeAngle,
  };
  const prompt = prompts[typeId];
  if (!prompt) throw new Error(`未知套图类型: ${typeId}`);
  return prompt;
}

function resolveProductImages(job) {
  const fromList = job.productImages || job.product_images;
  if (Array.isArray(fromList) && fromList.length) return fromList.filter(Boolean);
  const urls = job.imageUrls || job.images || [];
  return Array.isArray(urls) ? urls.filter(Boolean) : [];
}

function defaultTypeList(productImages, product) {
  const types = DEFAULT_TYPES.slice();
  const garment = product && product.garment_position;
  if (garment === "non-apparel") {
    const idx = types.indexOf("model");
    if (idx >= 0) types.splice(idx, 1);
  }
  if (productImages.length === 1 && !types.includes("three_angle_view")) {
    const at = types.indexOf("multi_scene");
    if (at >= 0) types.splice(at, 0, "three_angle_view");
    else types.push("three_angle_view");
  }
  return types;
}

function parseTypesSpec(typesSpec) {
  if (!typesSpec) return null;
  if (typeof typesSpec === "string") {
    return typesSpec.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (!Array.isArray(typesSpec)) return null;
  const out = [];
  for (const item of typesSpec) {
    if (typeof item === "string") out.push(item);
    else if (item && item.type) {
      const n = Math.max(1, Number(item.count || 1));
      for (let i = 0; i < n; i += 1) out.push(item.type);
    }
  }
  return out.length ? out : null;
}

function refsForType(typeId, productImages, modelImage) {
  const slot = TYPE_IMAGE_SLOT[typeId] || 0;
  const product = productImages[slot] || productImages[0];
  if (MODEL_TYPES.has(typeId) && modelImage && product) return [modelImage, product];
  if (MODEL_TYPES.has(typeId) && modelImage) return [modelImage];
  return product ? [product] : [];
}

function captionForType(typeId, product, lang) {
  const sp = (product && product.selling_points) || [];
  if (typeId === "white_bg") return "纯白底主图";
  if (typeId === "key_features") return spTitle(sp, 0, lang) || "核心卖点";
  if (typeId === "selling_pt") return spTitle(sp, 1, lang) || spTitle(sp, 0, lang) || "卖点";
  if (typeId === "material") return spTitle(sp, 0, lang) || "材质细节";
  if (typeId === "lifestyle") return (product && product.target_scenes && product.target_scenes[0]) || "场景展示";
  if (typeId === "model") return "模特展示";
  if (typeId === "multi_scene") return "多场景";
  if (typeId === "three_angle_view") return "三角度";
  if (typeId === "ecommerce_detail") return "详情页";
  return TYPE_LABELS[typeId] || typeId;
}

module.exports = {
  TYPE_LABELS,
  TYPE_IMAGE_SLOT,
  MODEL_TYPES,
  DEFAULT_TYPES,
  buildPrompt,
  productDescription,
  sceneToEnv,
  inferModelSubject,
  resolveProductImages,
  defaultTypeList,
  parseTypesSpec,
  refsForType,
  captionForType,
};
