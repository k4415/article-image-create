import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/error";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();
    const { data, error } = await supabase.from("ingest_jobs").select("*").eq("id", id).single();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ job: data });
  } catch (error) {
    return jsonError(error);
  }
}
