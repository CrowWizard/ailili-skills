"use strict";

const assert = require("node:assert/strict");
const {
  buildPrompt,
  sceneToEnv,
  inferModelSubject,
  defaultTypeList,
  refsForType,
  productDescription,
} = require("./prompts.cjs");

const product = {
  product_description_for_prompt: "black floral V-neck dress with ruffle hem",
  garment_position: "full-body",
  input_image_type: "flat_lay",
  selling_points: [
    { zh: "交叉领口", en: "Cross-strap neckline", visual_keywords: ["cross-strap V-neck"] },
    { zh: "碎花印花", en: "Floral print", visual_keywords: ["floral print"] },
    { zh: "荷叶边", en: "Ruffle hem", visual_keywords: ["ruffle hemline"] },
  ],
  target_scenes: ["海边度假", "咖啡馆"],
  target_scene_envs: ["tropical beach, golden sand", "cozy café interior"],
  target_audience: "18-30岁年轻女性",
};

const white = buildPrompt("white_bg", { product, lang: "zh", hasProductRef: true });
assert.match(white, /RGB 255,255,255/);
assert.match(white, /88% of frame/);
assert.match(white, /Product reference image is provided/);
assert.doesNotMatch(white, /Render ALL text/);

const kf = buildPrompt("key_features", { product, lang: "zh" });
assert.match(kf, /magnifying glass|为什么选择我们/);
assert.match(kf, /Simplified Chinese/);

const beach = sceneToEnv("海边度假");
assert.match(beach, /tropical beach/);

assert.equal(inferModelSubject("18-30岁年轻女性", "asian"), "Asian female model");
assert.equal(inferModelSubject("男士商务", "western"), "Caucasian male model");

const one = defaultTypeList(["front.jpg"], product);
assert.ok(one.includes("three_angle_view"));
assert.ok(one.includes("model"));
const noModel = defaultTypeList(["a.jpg", "b.jpg"], { garment_position: "non-apparel" });
assert.ok(!noModel.includes("model"));
assert.ok(!noModel.includes("three_angle_view"));

const refs = refsForType("material", ["front.jpg", "back.jpg"], "");
assert.deepEqual(refs, ["back.jpg"]);
const modelRefs = refsForType("lifestyle", ["front.jpg"], "model.png");
assert.deepEqual(modelRefs, ["model.png", "front.jpg"]);

assert.match(productDescription(product), /black floral/);

const angle = buildPrompt("three_angle_view", { product, lang: "zh", hasModelRef: true, modelImage: "x" });
assert.match(angle, /FRONT VIEW/);
assert.match(angle, /Two reference images are provided/);

console.log("ok");
