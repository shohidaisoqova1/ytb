const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Range",
  "Access-Control-Max-Age": "86400",
};

const INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi-libre.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://pipedapi.reallyaweso.me",
  "https://api.piped.yt",
  "https://pipedapi.leptons.xyz",
  "https://pipedapi.drgns.space",
  "https://pipedapi.syncpundit.io",
];

function extractId(input) {
  if (!input) return null;
  input = String(input).trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(input)) return input;
  try {
    const u = new URL(input);
    if (u.hostname.includes("youtu.be")) {
      const p = u.pathname.split("/").filter(Boolean)[0];
      if (p && /^[A-Za-z0-9_-]{11}$/.test(p)) return p;
    }
    const v = u.searchParams.get("v");
    if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
    const parts = u.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && /^[A-Za-z0-9_-]{11}$/.test(last)) return last;
  } catch {}
  const m = input.match(/[A-Za-z0-9_-]{11}/);
  return m ? m[0] : null;
}

function cleanStream(s) {
  return {
    url: s.url || "",
    quality: s.quality || s.qualityLabel || "",
    format: s.format || "",
    mimeType: s.mimeType || "",
    codec: s.codec || "",
    bitrate: s.bitrate || 0,
    width: s.width || 0,
    height: s.height || 0,
    fps: s.fps || 0,
    size: s.contentLength || 0,
    videoOnly: !!s.videoOnly,
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json;charset=UTF-8", ...CORS },
  });
}

async function handleApi(url) {
  const raw = url.searchParams.get("id") || url.searchParams.get("v") || url.searchParams.get("url") || "";
  const id = extractId(raw);
  if (!id) return json({ error: "Noto‘g‘ri havola. YouTube havola yoki video ID kiriting." }, 400);

  for (const base of INSTANCES) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 9000);
      const res = await fetch(base + "/streams/" + id, {
        headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok) continue;
      const data = await res.json();
      if (!data || data.error || !data.title) continue;

      let allVideo = [...(data.videoStreams || [])];
      let allAudio = [...(data.audioStreams || [])];
      if (data.adaptiveFormats && Array.isArray(data.adaptiveFormats)) {
        for (const f of data.adaptiveFormats) {
          if (f.mimeType && f.mimeType.includes("audio")) allAudio.push(f);
          else if (f.mimeType && f.mimeType.includes("video")) allVideo.push(f);
        }
      }

      const muxed = allVideo.filter((s) => !s.videoOnly).map(cleanStream).sort((a, b) => b.height - a.height);
      const videoOnly = allVideo.filter((s) => s.videoOnly).map(cleanStream).sort((a, b) => b.height - a.height);
      const audio = allAudio.map(cleanStream).sort((a, b) => b.bitrate - a.bitrate);

      return json({
        id,
        title: data.title,
        uploader: data.uploader || "",
        uploaderAvatar: data.uploaderAvatar || "",
        thumbnail: data.thumbnailUrl || data.thumbnail || "",
        duration: data.duration || 0,
        views: data.views || 0,
        muxed,
        video: videoOnly,
        audio,
        instance: base,
      });
    } catch {
      continue;
    }
  }
  return json({ error: "API hozir ishlamayapti. Birozdan so‘ng qayta urinib ko‘ring." }, 502);
}

async function handleProxy(url, request) {
  const target = url.searchParams.get("url");
  const filename = url.searchParams.get("name") || "video.mp4";
  if (!target || !target.startsWith("https://")) {
    return new Response("Noto‘g‘ri havola", { status: 400, headers: CORS });
  }
  try {
    const headers = {};
    const range = request.headers.get("Range");
    if (range) headers["Range"] = range;
    const res = await fetch(target, { headers });
    const outHeaders = new Headers(res.headers);
    outHeaders.set("Access-Control-Allow-Origin", "*");
    outHeaders.set("Content-Disposition", 'attachment; filename="' + filename.replace(/"/g, "") + '"');
    return new Response(res.body, { status: res.status, headers: outHeaders });
  } catch {
    return new Response("Yuklab olishda xatolik", { status: 502, headers: CORS });
  }
}

const HTML = `<!DOCTYPE html>
<html lang="uz">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>yukla.</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0a0a;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;min-height:100vh}
.wrap{max-width:600px;margin:0 auto;padding:110px 20px 60px}
.logo{text-align:center;font-size:30px;font-weight:800;letter-spacing:-1px;margin-bottom:28px}
.logo span{color:#666}
.search{display:flex;gap:8px;background:#151515;border:1px solid #262626;padding:6px;border-radius:999px}
.search:focus-within{border-color:#444}
.search input{flex:1;min-width:0;background:transparent;border:none;outline:none;color:#fff;padding:12px 16px;font-size:15px}
.search input::placeholder{color:#666}
.search button{background:#fff;color:#000;border:none;padding:12px 22px;border-radius:999px;font-weight:700;font-size:14px;cursor:pointer;white-space:nowrap}
.search button:disabled{opacity:.6}
.search button:active{transform:scale(.98)}
#error{display:none;background:#1c1212;border:1px solid #3a1a1a;color:#ff9a9a;padding:12px 14px;border-radius:12px;font-size:14px;margin-top:16px;text-align:center}
#loading{display:none;text-align:center;color:#888;font-size:14px;margin-top:20px}
.thumb{margin-top:28px}
.thumb img{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:18px;background:#1a1a1a;display:block}
.meta{margin-top:14px}
.meta h2{font-size:18px;line-height:1.4;font-weight:700}
.meta p{color:#888;font-size:13px;margin-top:6px}
.sec{margin:24px 0 10px;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:#888;font-weight:700}
.row{display:flex;align-items:center;justify-content:space-between;gap:12px;background:#141414;border:1px solid #222;border-radius:14px;padding:12px 14px;margin-bottom:8px}
.row-info b{display:block;font-size:14px}
.row-info span{font-size:12px;color:#888}
.dl{background:#fff;color:#000;padding:9px 14px;border-radius:999px;font-size:13px;font-weight:700;text-decoration:none;white-space:nowrap}
.dl:hover{opacity:.9}
.empty{color:#888;font-size:14px;text-align:center;padding:20px 0}
@media(max-width:520px){.wrap{padding-top:70px}.search{flex-direction:column;background:transparent;border:none;padding:0}.search input{background:#151515;border:1px solid #262626;border-radius:999px}.search button{padding:14px}}
</style>
</head>
<body>
<div class="wrap">
<div class="logo">yukla<span>.</span></div>
<div class="search">
<input id="input" type="text" placeholder="YouTube havola yoki ID ni joylang..." autocomplete="off" spellcheck="false">
<button id="btn">Yuklab olish</button>
</div>
<div id="error"></div>
<div id="loading">Yuklanmoqda...</div>
<div id="result"></div>
</div>
<script>
var input=document.getElementById("input");
var btn=document.getElementById("btn");
var result=document.getElementById("result");
var errorBox=document.getElementById("error");
var loading=document.getElementById("loading");
function esc(s){return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}
function hideError(){errorBox.style.display="none"}
function showError(m){errorBox.textContent=m;errorBox.style.display="block"}
function fmtDur(s){if(!s)return "";var m=Math.floor(s/60);var sec=s%60;return m+":"+(sec<10?"0":"")+sec}
function fmtSize(b){if(!b)return "";var mb=b/1024/1024;return mb>=1?mb.toFixed(1)+" MB":(b/1024).toFixed(0)+" KB"}
function fmtBitrate(b){if(!b)return "";return Math.round(b/1000)+" kbps"}
function rowHtml(s, label, sub){
  var direct = s.url;
  return '<div class="row"><div class="row-info"><b>'+esc(label)+'</b><span>'+esc(sub)+'</span></div><a class="dl" href="'+esc(direct)+'" target="_blank" rel="noopener">Yuklab olish</a></div>';
}
function render(d){
  var html="";
  if(d.thumbnail){
    html+='<div class="thumb"><img src="'+esc(d.thumbnail)+'" alt=""><div class="meta"><h2>'+esc(d.title)+'</h2><p>'+esc(d.uploader||"")+' · '+fmtDur(d.duration)+'</p></div></div>';
  } else {
    html+='<div class="meta"><h2>'+esc(d.title)+'</h2><p>'+esc(d.uploader||"")+'</p></div>';
  }
  if(d.muxed && d.muxed.length){
    html+='<div class="sec">Video + Audio — Tayyor</div>';
    for(var i=0;i<d.muxed.length;i++){
      var s=d.muxed[i];
      var label=(s.quality||(s.height+"p")||"Video")+" • "+(s.format||"mp4").toUpperCase();
      var sub=(s.width&&s.height?s.width+"x"+s.height+" • ":"")+(s.fps?s.fps+" fps • ":"")+fmtSize(s.size);
      html+=rowHtml(s,label,sub);
    }
  }
  if(d.audio && d.audio.length){
    html+='<div class="sec">Faqat Audio</div>';
    for(var j=0;j<d.audio.length;j++){
      var a=d.audio[j];
      var alabel=(a.quality||fmtBitrate(a.bitrate)||"Audio")+" • "+(a.format||"m4a").toUpperCase();
      var asub=(a.codec?a.codec+" • ":"")+fmtBitrate(a.bitrate)+" • "+fmtSize(a.size);
      html+=rowHtml(a,alabel,asub);
    }
  }
  if(d.video && d.video.length){
    html+='<div class="sec">Faqat Video — Ovozsiz</div>';
    for(var k=0;k<d.video.length;k++){
      var v=d.video[k];
      var vlabel=(v.quality||(v.height+"p")||"Video")+" • "+(v.format||"mp4").toUpperCase();
      var vsub=(v.width&&v.height?v.width+"x"+v.height+" • ":"")+(v.fps?v.fps+" fps • ":"")+fmtSize(v.size);
      html+=rowHtml(v,vlabel,vsub);
    }
  }
  if((!d.muxed||!d.muxed.length)&&(!d.audio||!d.audio.length)&&(!d.video||!d.video.length)){
    html+='<div class="empty">Bu video uchun oqim topilmadi.</div>';
  }
  result.innerHTML=html;
}
async function load(){
  var val=input.value.trim();
  hideError();
  if(!val){showError("Havolani kiriting.");return}
  result.innerHTML="";
  loading.style.display="block";
  btn.disabled=true;
  btn.textContent="...";
  try{
    var res=await fetch("/api?id="+encodeURIComponent(val));
    var data=await res.json();
    if(!res.ok || data.error){throw new Error(data.error||"Xatolik yuz berdi.")}
    render(data);
  }catch(e){
    showError(e.message||"Xatolik yuz berdi. Qayta urinib ko‘ring.");
  }finally{
    loading.style.display="none";
    btn.disabled=false;
    btn.textContent="Yuklab olish";
  }
}
btn.addEventListener("click",load);
input.addEventListener("keydown",function(e){if(e.key==="Enter")load()});
</script>
</body>
</html>`;

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(HTML, {
        headers: { "Content-Type": "text/html;charset=UTF-8", ...CORS },
      });
    }
    if (url.pathname === "/api") {
      return handleApi(url);
    }
    if (url.pathname === "/proxy") {
      return handleProxy(url, request);
    }
    return new Response("Not Found", { status: 404, headers: CORS });
  },
};
