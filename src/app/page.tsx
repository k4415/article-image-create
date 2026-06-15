"use client";

/* eslint-disable @next/next/no-img-element, react-hooks/set-state-in-effect */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Film, Image as ImageIcon, RefreshCw, Search, X } from "lucide-react";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { IMAGE_CATEGORIES, PROBLEM_CATEGORIES } from "@/lib/assets/categories";
import { normalizeTargetAgeBand, normalizeTargetGender } from "@/lib/assets/category-normalization";
import { hasFirstViewSource } from "@/lib/assets/first-view";
import { getPrimaryArticleUrl } from "@/lib/assets/source-links";
import type { AssetWithAnnotation } from "@/lib/db/types";

type SearchMode = "keyword" | "semantic";

const MEDIA_OPTIONS = [
  { value: "", label: "すべて" },
  { value: "image", label: "画像" },
  { value: "video_frame", label: "動画ラストカット" },
];
const TARGET_GENDER_ORDER = ["女性", "男性", "男女共通", "不明"];

function mediaTypeLabel(mediaType: AssetWithAnnotation["media_type"]) {
  return mediaType === "video_frame" ? "動画ラストカット" : "画像";
}

function buildCountOptions(
  baseLabels: string[],
  values: Array<string | null | undefined>,
  normalize: (value: string | null | undefined) => string | null = (value) => value?.trim() || null,
  orderedLabels?: string[],
) {
  const counts = new Map<string, number>();
  values
    .map((value) => normalize(value))
    .filter((value): value is string => Boolean(value))
    .forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));

  const orderIndex = new Map((orderedLabels ?? []).map((value, index) => [value, index]));

  return Array.from(new Set([...baseLabels, ...counts.keys()]))
    .sort((left, right) => {
      const leftIndex = orderIndex.get(left);
      const rightIndex = orderIndex.get(right);
      if (leftIndex !== undefined || rightIndex !== undefined) {
        return (leftIndex ?? Number.MAX_SAFE_INTEGER) - (rightIndex ?? Number.MAX_SAFE_INTEGER);
      }
      return left.localeCompare(right, "ja");
    })
    .map((value) => ({ value, label: value, count: counts.get(value) ?? 0 }));
}

function assetImageLabels(asset: AssetWithAnnotation) {
  const annotationCategory = asset.asset_annotations?.image_category;
  return [
    hasFirstViewSource(asset) ? "ファーストビュー" : null,
    annotationCategory && annotationCategory !== "ファーストビュー" ? annotationCategory : null,
  ];
}

function AssetPreview({ asset }: { asset: AssetWithAnnotation }) {
  const src = asset.thumbnail_url || asset.public_url || "";
  if (!src) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-100 text-slate-400">
        <ImageIcon size={28} />
      </div>
    );
  }

  return <img className="h-full w-full object-contain p-1" src={src} alt={asset.asset_annotations?.description ?? ""} />;
}

function AssetCard({ asset }: { asset: AssetWithAnnotation }) {
  const annotation = asset.asset_annotations;
  const articleUrl = getPrimaryArticleUrl(asset);
  return (
    <article className="overflow-hidden rounded-lg border border-slate-200 bg-white transition hover:border-emerald-500 hover:shadow-sm">
      <Link href={`/assets/${asset.id}`} className="block">
        <div className="aspect-[4/3] bg-slate-100">
          <AssetPreview asset={asset} />
        </div>
      </Link>
      <div className="space-y-3 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
            {asset.media_type === "video_frame" ? <Film size={13} /> : <ImageIcon size={13} />}
            {mediaTypeLabel(asset.media_type)}
          </span>
          {typeof asset.similarity === "number" ? (
            <span className="text-xs font-medium text-emerald-700">{asset.similarity.toFixed(3)}</span>
          ) : null}
        </div>
        <div>
          <Link href={`/assets/${asset.id}`} className="group/detail block">
            <p className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-slate-950 group-hover/detail:text-emerald-800">
              {annotation?.description || asset.product_name || "未分類素材"}
            </p>
          </Link>
          <p className="mt-1 truncate text-xs text-slate-500">{articleUrl ?? asset.source_article_url}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {[asset.problem_category, ...assetImageLabels(asset), annotation?.lp_section_role]
            .filter(Boolean)
            .slice(0, 3)
            .map((label, index) => (
              <span key={`${label}-${index}`} className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                {label}
              </span>
            ))}
        </div>
        <div className="flex items-center justify-between gap-2 pt-1">
          <Link
            href={`/assets/${asset.id}`}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            詳細
          </Link>
          {articleUrl ? (
            <a
              href={articleUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
            >
              <ExternalLink size={13} />
              元記事
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default function Home() {
  const [assets, setAssets] = useState<AssetWithAnnotation[]>([]);
  const [query, setQuery] = useState("");
  const [mediaType, setMediaType] = useState("");
  const [problemCategories, setProblemCategories] = useState<string[]>([]);
  const [imageCategories, setImageCategories] = useState<string[]>([]);
  const [targetGenders, setTargetGenders] = useState<string[]>([]);
  const [targetAgeBands, setTargetAgeBands] = useState<string[]>([]);
  const [searchMode, setSearchMode] = useState<SearchMode>("keyword");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const problemOptions = useMemo(
    () => buildCountOptions(PROBLEM_CATEGORIES, assets.map((asset) => asset.problem_category)),
    [assets],
  );
  const imageOptions = useMemo(
    () => buildCountOptions(IMAGE_CATEGORIES, assets.flatMap((asset) => assetImageLabels(asset))),
    [assets],
  );
  const genderOptions = useMemo(
    () => buildCountOptions([], assets.map((asset) => asset.target_gender), normalizeTargetGender, TARGET_GENDER_ORDER),
    [assets],
  );
  const ageBandOptions = useMemo(
    () => buildCountOptions([], assets.map((asset) => asset.target_age_band), normalizeTargetAgeBand),
    [assets],
  );

  async function loadAssets(nextSearchMode = searchMode) {
    setLoading(true);
    setError("");
    try {
      if (nextSearchMode === "semantic" && query.trim()) {
        const response = await fetch("/api/search/semantic", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            query,
            limit: 40,
            filters: {
              problemCategories,
              imageCategories,
              targetGenders,
              targetAgeBands,
            },
          }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "検索に失敗しました");
        setAssets(payload.assets ?? []);
        return;
      }

      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (mediaType) params.set("mediaType", mediaType);
      targetGenders.forEach((gender) => params.append("targetGender", gender));
      targetAgeBands.forEach((ageBand) => params.append("targetAgeBand", ageBand));
      problemCategories.forEach((category) => params.append("problemCategory", category));
      imageCategories.forEach((category) => params.append("imageCategory", category));
      const response = await fetch(`/api/assets?${params.toString()}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "素材取得に失敗しました");
      setAssets(payload.assets ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "素材取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAssets("keyword");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-[calc(100vh-56px)] bg-slate-50">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-xl font-semibold text-slate-950">素材一覧</h1>
              <p className="mt-1 text-sm text-slate-500">{assets.length}件の素材を表示中</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1">
                {(["keyword", "semantic"] as SearchMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setSearchMode(mode)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                      searchMode === mode ? "bg-white text-slate-950 shadow-sm" : "text-slate-600"
                    }`}
                  >
                    {mode === "keyword" ? "キーワード" : "意味検索"}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void loadAssets()}
                className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                {loading ? <RefreshCw className="animate-spin" size={16} /> : <Search size={16} />}
                検索
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_160px_180px_180px_220px_220px]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void loadAssets();
                }}
                className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm outline-none focus:border-emerald-600"
                placeholder="高齢者向けの悩みを喚起する画像"
              />
            </label>
            <select
              value={mediaType}
              onChange={(event) => setMediaType(event.target.value)}
              className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600"
            >
              {MEDIA_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <MultiSelectFilter label="性別" options={genderOptions} selectedValues={targetGenders} onChange={setTargetGenders} />
            <MultiSelectFilter label="年齢" options={ageBandOptions} selectedValues={targetAgeBands} onChange={setTargetAgeBands} />
            <MultiSelectFilter
              label="悩みカテゴリ"
              options={problemOptions}
              selectedValues={problemCategories}
              onChange={setProblemCategories}
            />
            <MultiSelectFilter label="画像要素" options={imageOptions} selectedValues={imageCategories} onChange={setImageCategories} />
          </div>
          {problemCategories.length > 0 || imageCategories.length > 0 || targetGenders.length > 0 || targetAgeBands.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                ...targetGenders.map((value) => ({ value, type: "gender" as const })),
                ...targetAgeBands.map((value) => ({ value, type: "age" as const })),
                ...problemCategories.map((value) => ({ value, type: "problem" as const })),
                ...imageCategories.map((value) => ({ value, type: "image" as const })),
              ].map((item) => (
                <button
                  key={`${item.type}-${item.value}`}
                  type="button"
                  onClick={() => {
                    if (item.type === "gender") {
                      setTargetGenders((current) => current.filter((value) => value !== item.value));
                    } else if (item.type === "age") {
                      setTargetAgeBands((current) => current.filter((value) => value !== item.value));
                    } else if (item.type === "problem") {
                      setProblemCategories((current) => current.filter((value) => value !== item.value));
                    } else {
                      setImageCategories((current) => current.filter((value) => value !== item.value));
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800"
                >
                  {item.value}
                  <X size={12} />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-6">
        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>
        ) : null}
        {!error && assets.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-sm font-medium text-slate-700">素材がまだありません</p>
            <Link
              href="/ingest"
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
            >
              <ExternalLink size={16} />
              URL追加へ
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {assets.map((asset) => (
              <AssetCard key={asset.id} asset={asset} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
