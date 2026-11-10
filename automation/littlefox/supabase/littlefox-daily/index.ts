/**
 * Dedicated yqxyy Little Fox course runner (not a website function).
 * Deploy to Supabase Edge Functions with verify_jwt=true. No R2 writes until
 * LF_RUN_ENABLED=1, LF_DRY_RUN=0 and LF_ALLOW_PUBLISH=1 are configured.
 * Scheduled invocation: 06:00 UTC Monday–Friday == 14:00 Beijing time.
 */
import { daily } from "./core.mjs";

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {status:405});
  }
  if (Deno.env.get("LF_RUN_ENABLED") !== "1") {
    return Response.json({status:"disabled",reason:"LF_RUN_ENABLED is not 1"}, {status:503});
  }
  const keys = ["LF_RUN_ENABLED","LF_DRY_RUN","LF_ALLOW_PUBLISH", "LF_OPENAI_API_KEY", "LF_COURSE_MODEL", "R2_ENDPOINT","R2_BUCKET","R2_ACCESS_KEY_ID","R2_SECRET_ACCESS_KEY"];
  const env = Object.fromEntries(keys.map(k=>[k,Deno.env.get(k) || ""]));
  try {
    const report = await daily({env});
    const code = report.status === "complete" || report.status === "weekend" ? 200 : 207;
    return Response.json(report,{status:code});
  } catch(e) {
    return Response.json({status:"failed",error:String(e?.message||e)},{status:500});
  }
});