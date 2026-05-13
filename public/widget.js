(function () {
  var script = document.currentScript;
  var SUPABASE_URL = script.getAttribute("data-supabase-url");
  var SUPABASE_KEY = script.getAttribute("data-supabase-key");
  var token = "web-" + Math.random().toString(36).slice(2) + Date.now();

  var css = `
  .jb-fab{position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:50%;background:#b89b72;color:#fff;border:none;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.18);font-size:24px;z-index:99999;display:grid;place-items:center}
  .jb-panel{position:fixed;bottom:90px;right:20px;width:340px;max-width:calc(100vw - 40px);height:480px;max-height:calc(100vh - 120px);background:#fff;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.2);display:none;flex-direction:column;overflow:hidden;z-index:99999;font-family:system-ui,sans-serif}
  .jb-panel.open{display:flex}
  .jb-h{background:#b89b72;color:#fff;padding:14px 16px;font-weight:600;font-size:14px}
  .jb-msgs{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;background:#faf8f4}
  .jb-m{padding:8px 12px;border-radius:14px;font-size:13px;max-width:80%;line-height:1.4}
  .jb-u{background:#b89b72;color:#fff;align-self:flex-end;border-bottom-right-radius:4px}
  .jb-a{background:#fff;color:#222;align-self:flex-start;border:1px solid #eee;border-bottom-left-radius:4px;white-space:pre-wrap}
  .jb-in{display:flex;gap:6px;padding:10px;border-top:1px solid #eee;background:#fff}
  .jb-in input{flex:1;padding:8px 12px;border:1px solid #ddd;border-radius:20px;font-size:13px;outline:none}
  .jb-in button{background:#b89b72;color:#fff;border:none;border-radius:20px;padding:0 16px;cursor:pointer;font-size:13px}
  `;
  var s = document.createElement("style"); s.textContent = css; document.head.appendChild(s);

  var fab = document.createElement("button");
  fab.className = "jb-fab"; fab.innerHTML = "💬"; fab.title = "Falar com a loja";
  document.body.appendChild(fab);

  var panel = document.createElement("div");
  panel.className = "jb-panel";
  panel.innerHTML = '<div class="jb-h">Atendimento</div><div class="jb-msgs" id="jb-msgs"></div><div class="jb-in"><input id="jb-input" placeholder="Diga algo…" /><button id="jb-send">Enviar</button></div>';
  document.body.appendChild(panel);

  var msgs = panel.querySelector("#jb-msgs");
  var inp = panel.querySelector("#jb-input");
  var btn = panel.querySelector("#jb-send");

  function add(role, text) {
    var d = document.createElement("div");
    d.className = "jb-m " + (role === "user" ? "jb-u" : "jb-a");
    d.textContent = text;
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function open() {
    panel.classList.add("open");
    if (!msgs.children.length) add("assistant", "Olá! 💛 Como posso ajudar?");
  }

  fab.addEventListener("click", function () { panel.classList.toggle("open"); if (panel.classList.contains("open") && !msgs.children.length) open(); });

  async function send() {
    var text = inp.value.trim(); if (!text) return;
    add("user", text); inp.value = "";
    try {
      var r = await fetch(SUPABASE_URL + "/functions/v1/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY },
        body: JSON.stringify({ sessao_token: token, canal: "site", message: text }),
      });
      var data = await r.json();
      add("assistant", data.reply || data.error || "(sem resposta)");
    } catch (e) { add("assistant", "Erro de conexão."); }
  }
  btn.addEventListener("click", send);
  inp.addEventListener("keydown", function (e) { if (e.key === "Enter") send(); });
})();
