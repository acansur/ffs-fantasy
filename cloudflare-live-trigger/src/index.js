// GitHub Actions "live-scores" workflow'unu workflow_dispatch ile tetikler.
// Token (GH_TOKEN) Cloudflare'de ŞİFRELİ secret olarak saklanır — kodda YAZMAZ.

const DISPATCH_URL =
  'https://api.github.com/repos/acansur/ffs-fantasy/actions/workflows/live-scores.yml/dispatches'

async function triggerWorkflow(env) {
  const res = await fetch(DISPATCH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'ffs-live-trigger', // GitHub API bunu ZORUNLU ister
    },
    body: JSON.stringify({ ref: 'main' }),
  })
  // Başarı = 204 No Content. Diğer her şey hata (metni logla).
  if (res.status === 204) {
    console.log('OK: live-scores workflow tetiklendi')
    return { ok: true, status: 204 }
  }
  const text = await res.text().catch(() => '')
  console.log('HATA:', res.status, text)
  return { ok: false, status: res.status, text }
}

export default {
  // Her 5 dakikada bir Cloudflare tarafından otomatik çağrılır (asıl iş bu).
  async scheduled(event, env, ctx) {
    ctx.waitUntil(triggerWorkflow(env))
  },

  // Tarayıcıdan Worker adresini açınca elle test için (bir kez tetikler).
  // İstemezsen bu fetch bloğunu silebilirsin; cron yine çalışır.
  async fetch(request, env) {
    const r = await triggerWorkflow(env)
    return new Response(
      r.ok ? 'Tetiklendi ✓ (GitHub Actions > live-scores çalışmalarını kontrol et)' : `Hata: ${r.status} ${r.text || ''}`,
      { status: r.ok ? 200 : 500, headers: { 'content-type': 'text/plain; charset=utf-8' } }
    )
  },
}
