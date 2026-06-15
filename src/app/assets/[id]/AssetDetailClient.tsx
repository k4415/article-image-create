"use client";

/* eslint-disable @next/next/no-img-element, react-hooks/set-state-in-effect */

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, Save } from "lucide-react";
import { getPrimaryArticleUrl, getUniqueArticleUrls } from "@/lib/assets/source-links";
import type { AssetWithAnnotation } from "@/lib/db/types";

type FormState = {
  productName: string;
  targetGender: string;
  targetAgeBand: string;
  problemCategory: string;
  imageCategory: string;
  lpSectionRole: string;
  appealRole: string;
  description: string;
  visualDescription: string;
  ocrText: string;
  tags: string;
};

function toForm(asset: AssetWithAnnotation): FormState {
  const annotation = asset.asset_annotations;
  return {
    productName: asset.product_name ?? "",
    targetGender: asset.target_gender ?? "",
    targetAgeBand: asset.target_age_band ?? "",
    problemCategory: asset.problem_category ?? "",
    imageCategory: annotation?.image_category ?? "",
    lpSectionRole: annotation?.lp_section_role ?? "",
    appealRole: annotation?.appeal_role ?? "",
    description: annotation?.description ?? "",
    visualDescription: annotation?.visual_description ?? "",
    ocrText: annotation?.ocr_text ?? "",
    tags: annotation?.tags?.join(", ") ?? "",
  };
}

export function AssetDetailClient({ id }: { id: string }) {
  const [asset, setAsset] = useState<AssetWithAnnotation | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadAsset() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/assets/${id}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "素材取得に失敗しました");
      setAsset(payload.asset);
      setForm(toForm(payload.asset));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "素材取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  async function saveAsset() {
    if (!form) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/assets/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productName: form.productName || null,
          targetGender: form.targetGender || null,
          targetAgeBand: form.targetAgeBand || null,
          problemCategory: form.problemCategory || null,
          imageCategory: form.imageCategory || null,
          lpSectionRole: form.lpSectionRole || null,
          appealRole: form.appealRole || null,
          description: form.description || null,
          visualDescription: form.visualDescription || null,
          ocrText: form.ocrText || null,
          tags: form.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "保存に失敗しました");
      setAsset(payload.asset);
      setForm(toForm(payload.asset));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void loadAsset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return <main className="min-h-[calc(100vh-56px)] bg-slate-50 p-6 text-sm text-slate-600">読み込み中...</main>;
  }

  if (!asset || !form) {
    return (
      <main className="min-h-[calc(100vh-56px)] bg-slate-50 p-6">
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error || "素材が見つかりません"}
        </div>
      </main>
    );
  }

  const mediaUrl = asset.public_url ?? "";
  const articleUrl = getPrimaryArticleUrl(asset);
  const articleUrls = getUniqueArticleUrls(asset);

  return (
    <main className="min-h-[calc(100vh-56px)] bg-slate-50">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-5">
          <div>
            <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950">
              <ArrowLeft size={16} />
              素材一覧へ
            </Link>
            <h1 className="mt-2 text-xl font-semibold text-slate-950">素材詳細</h1>
          </div>
          <button
            type="button"
            onClick={() => void saveAsset()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
          >
            <Save size={16} />
            {saving ? "保存中" : "保存"}
          </button>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,520px)_1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="aspect-[4/3] overflow-hidden rounded-lg bg-slate-100">
            <img className="h-full w-full object-contain p-1" src={mediaUrl} alt={form.description} />
          </div>
          <div className="mt-4 space-y-2 text-sm">
            {articleUrl ? (
              <>
                <a
                  className="inline-flex max-w-full items-center gap-2 font-medium text-emerald-700 hover:text-emerald-900"
                  href={articleUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={15} className="shrink-0" />
                  元記事URL
                </a>
                <p className="break-all text-xs text-slate-500">{articleUrl}</p>
              </>
            ) : (
              <p className="break-all text-slate-500">元記事URLなし</p>
            )}
            <a
              className="inline-flex items-center gap-2 font-medium text-emerald-700 hover:text-emerald-900"
              href={asset.source_media_url}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={15} />
              元素材URL
            </a>
            {articleUrls.length > 1 ? (
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-700">出典記事URL {articleUrls.length}件</p>
                <div className="mt-2 space-y-1">
                  {articleUrls.slice(0, 8).map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="block break-all text-xs text-emerald-700 hover:text-emerald-900"
                    >
                      {url}
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          {error ? <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div> : null}
          <div className="grid gap-4 md:grid-cols-2">
            {[
              ["商材名", "productName"],
              ["ターゲット性別", "targetGender"],
              ["ターゲット年齢", "targetAgeBand"],
              ["悩みカテゴリ", "problemCategory"],
              ["画像カテゴリ", "imageCategory"],
              ["LP内役割", "lpSectionRole"],
              ["訴求役割", "appealRole"],
              ["タグ", "tags"],
            ].map(([label, key]) => (
              <label key={key} className="text-sm font-medium text-slate-700">
                {label}
                <input
                  value={form[key as keyof FormState]}
                  onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-emerald-600"
                />
              </label>
            ))}
          </div>

          <label className="mt-4 block text-sm font-medium text-slate-700">
            説明
            <textarea
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              className="mt-1 h-28 w-full rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-emerald-600"
            />
          </label>
          <label className="mt-4 block text-sm font-medium text-slate-700">
            視覚説明
            <textarea
              value={form.visualDescription}
              onChange={(event) => setForm({ ...form, visualDescription: event.target.value })}
              className="mt-1 h-24 w-full rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-emerald-600"
            />
          </label>
          <label className="mt-4 block text-sm font-medium text-slate-700">
            画像内テキスト
            <textarea
              value={form.ocrText}
              onChange={(event) => setForm({ ...form, ocrText: event.target.value })}
              className="mt-1 h-24 w-full rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-emerald-600"
            />
          </label>
        </div>
      </section>
    </main>
  );
}
