"use strict";

const APLUS_TYPES = new Set(["PREMIUM_APLUS", "STANDARD_APLUS", "PHONE_APLUS"]);
const SP_APLUS_TYPES = new Set(["SELLING_POINT", ...APLUS_TYPES]);
const SP_LAYOUTS = ["概览", "功能", "品质", "场景"];
const TEXTGEN_TYPES = new Set([
  "SCENE",
  "CLOSE_UP",
  "SELLING_POINT",
  "PREMIUM_APLUS",
  "STANDARD_APLUS",
  "PHONE_APLUS",
]);
const DIRECT_TYPES = new Set(["WHITE_BG"]);

const TYPE_LABELS = {
  WHITE_BG: "白底图",
  SCENE: "场景图",
  CLOSE_UP: "特写图",
  SELLING_POINT: "卖点图",
  PREMIUM_APLUS: "高级A+图",
  STANDARD_APLUS: "普通A+图",
  PHONE_APLUS: "手机A+图",
};

const DEFAULT_RATIOS = {
  WHITE_BG: "1:1",
  SCENE: "1:1",
  CLOSE_UP: "1:1",
  SELLING_POINT: "1:1",
  PREMIUM_APLUS: "1464:600",
  STANDARD_APLUS: "970:600",
  PHONE_APLUS: "600:450",
};

const ASSET_SLOT = {
  WHITE_BG: "main",
  SCENE: "main",
  CLOSE_UP: "main",
  SELLING_POINT: "main",
  PREMIUM_APLUS: "aplus",
  STANDARD_APLUS: "aplus",
  PHONE_APLUS: "aplus",
};

const VARIANT = {
  variant: "product",
  default_plan_d: [
    ["SELLING_POINT", 3],
    ["SCENE", 2],
    ["WHITE_BG", 1],
  ],
  type_labels: TYPE_LABELS,
  s1_template: "s1-reasoning-product.txt",
  needs_s1_scenes: new Set(["B", "C", "D", "F"]),
  extract_brand_gene_scenes: new Set(["D"]),
  write_asset_manifest: true,
};

module.exports = {
  APLUS_TYPES,
  SP_APLUS_TYPES,
  SP_LAYOUTS,
  TEXTGEN_TYPES,
  DIRECT_TYPES,
  TYPE_LABELS,
  DEFAULT_RATIOS,
  ASSET_SLOT,
  VARIANT,
};
