import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/error";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("ingest_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ jobs: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}
