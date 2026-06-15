import * as cheerio from "cheerio";
import { inferCanonicalProblemCategory } from "@/lib/assets/category-normalization";

export type ArticleContext = {
  articleUrl: string;
  text: string;
  title: string | null;
  productName: string | null;
  targetGender: string | null;
  targetAgeBand: string | null;
  problemCategory: string | null;
};

const PRODUCT_PATTERNS = [
  "威徳",
  "リリィジュRICH",
  "ノルクスK錠",
  "明目腎気丸",
  "トメラックEX",
];

export function extractArticleText(html: string) {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg").remove();
  return $("body").text().replace(/\s+/g, " ").trim();
}

export function inferArticleContext(articleUrl: string, html: string): ArticleContext {
  const $ = cheerio.load(html);
  const text = extractArticleText(html);
  const title = $("title").first().text().trim() || null;

  return {
    articleUrl,
    text,
    title,
    productName: inferProductName(text),
    targetGender: inferTargetGender(text),
    targetAgeBand: inferTargetAgeBand(text),
    problemCategory: inferProblemCategory(text),
  };
}

export function inferProductName(text: string): string | null {
  const known = PRODUCT_PATTERNS.find((product) => text.includes(product));
  if (known) {
    return known;
  }

  const quoted = text.match(/[『「]([^』」]{2,30})[』」]/);
  return quoted?.[1] ?? null;
}

export function inferProblemCategory(text: string): string | null {
  return inferCanonicalProblemCategory(text);
}

export function inferTargetGender(text: string): string | null {
  if (text.includes("女性") && !text.includes("男性")) {
    return "女性";
  }
  if (text.includes("男性") && !text.includes("女性")) {
    return "男性";
  }
  return null;
}

export function inferTargetAgeBand(text: string): string | null {
  const bands = ["40代", "50代", "60代", "70代", "シニア", "高齢"];
  const found = bands.filter((band) => text.includes(band));
  if (found.length === 0) {
    return null;
  }
  if (found.includes("シニア") || found.includes("高齢")) {
    return "シニア層";
  }
  return `${found[0]}以上`;
}
