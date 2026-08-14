const DEFAULT_CONTENT = { appName: "Productor Musical Pro", version: 1, courses: [] };

function json(data, status=200, extraHeaders={}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

function corsFor(request, env, publicRead=false) {
  const origin = request.headers.get("origin") || "";
  if (publicRead) return {"access-control-allow-origin":"*"};
  const allowed = (env.ADMIN_ORIGIN || "").trim();
  if (!allowed) return {"access-control-allow-origin": origin || "*", "vary":"Origin"};
  if (origin === allowed) return {"access-control-allow-origin": allowed, "vary":"Origin"};
  return {};
}

function sanitizeContent(input) {
  if (!input || !Array.isArray(input.courses)) throw new Error("courses requerido");
  const courses = input.courses.map((c, ci) => ({
    id: String(c.id || `curso-${ci+1}`),
    title: String(c.title || "Sin título"),
    type: c.type === "premium" ? "premium" : "free",
    category: String(c.category || ""),
    instructor: String(c.instructor || ""),
    banner: String(c.banner || ""),
    description: String(c.description || ""),
    enabled: c.enabled !== false,
    lessons: Array.isArray(c.lessons) ? c.lessons.map((l, li) => ({
      id: String(l.id || `${c.id || `curso-${ci+1}`}-${li+1}`),
      title: String(l.title || `Clase ${li+1}`),
      videoId: String(l.videoId || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32),
      thumbnail: String(l.thumbnail || ""),
    })).filter(l => l.videoId) : [],
  }));
  return {appName:"Productor Musical Pro", version:Date.now(), courses};
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const adminCors = corsFor(request, env, false);

    if (request.method === "OPTIONS") {
      if ((env.ADMIN_ORIGIN || "") && request.headers.get("origin") !== env.ADMIN_ORIGIN) {
        return new Response(null, {status:403});
      }
      return new Response(null, {headers:{...adminCors,"access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"authorization,content-type","access-control-max-age":"86400"}});
    }

    if (url.pathname === "/api/content" && request.method === "GET") {
      const saved = await env.PMP_CONTENT.get("content");
      return new Response(saved || JSON.stringify(DEFAULT_CONTENT), {
        headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...corsFor(request, env, true)}
      });
    }

    if (url.pathname === "/api/admin/content" && request.method === "POST") {
      if ((env.ADMIN_ORIGIN || "") && request.headers.get("origin") !== env.ADMIN_ORIGIN) {
        return json({ok:false,error:"Origen no autorizado"},403,adminCors);
      }
      const auth = request.headers.get("authorization") || "";
      if (!env.ADMIN_TOKEN || auth !== `Bearer ${env.ADMIN_TOKEN}`) {
        return json({ok:false,error:"Token no autorizado"},401,adminCors);
      }
      try {
        const body = await request.json();
        const clean = sanitizeContent(body);
        await env.PMP_CONTENT.put("content", JSON.stringify(clean));
        return json({ok:true,version:clean.version,courses:clean.courses.length},200,adminCors);
      } catch (e) {
        return json({ok:false,error:e.message || "JSON inválido"},400,adminCors);
      }
    }

    if (url.pathname === "/health") return json({ok:true,service:"Productor Musical Pro CMS"},200,corsFor(request,env,true));
    return new Response("Productor Musical Pro CMS", {headers:{"content-type":"text/plain; charset=utf-8"}});
  }
};
