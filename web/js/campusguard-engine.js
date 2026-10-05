/*
 * CampusGuard engine (JavaScript) — a 1:1 port of campusguard/predict.py.
 *
 * Runs the trained model entirely in the browser: the pasted message never leaves the
 * device, nothing is stored, and links are only read as text (never visited).
 * Parity with the Python reference is checked by tests/parity_test.js.
 *
 * Usage:  const cg = CampusGuardEngine.create(CG_MODEL);  const r = cg.analyze(text, sender);
 */
(function (root) {
  "use strict";

  // ---------------------------------------------------------------- python-compatible helpers
  function pyRound(x, nd) {
    if (!isFinite(x)) return x;
    if (!nd) {
      const f = Math.floor(x), d = x - f;
      if (Math.abs(d - 0.5) < 1e-12) return (f % 2 === 0) ? f : f + 1;
      return Math.round(x);
    }
    return Number(x.toFixed(nd));
  }
  function rx(src, flags) {
    return new RegExp(src, (flags || "").replace(/[^im]/g, "") + "g");
  }
  function rx1(src, flags) { // non-global
    return new RegExp(src, (flags || "").replace(/[^im]/g, ""));
  }
  function stripChars(s, chars) {
    let a = 0, b = s.length;
    while (a < b && chars.indexOf(s[a]) !== -1) a++;
    while (b > a && chars.indexOf(s[b - 1]) !== -1) b--;
    return s.slice(a, b);
  }
  function pyStrip(s) { return s.replace(/^[\s\x1c-\x1f\x85]+|[\s\x1c-\x1f\x85]+$/g, ""); }
  function finditer(re, text) {
    const out = [];
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      out.push(m);
      if (m[0].length === 0) re.lastIndex++;
    }
    return out;
  }
  function count(s, sub) { return s.split(sub).length - 1; }
  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function rfindBefore(text, ch, i) { // python text.rfind(ch, 0, i)
    if (i <= 0) return -1;
    return text.lastIndexOf(ch, i - 1);
  }

  function create(M) {
    const MM = M.message_model, UM = M.url_model, C = M.config, INF = M.infer;
    const P = {};
    for (const k in M.patterns) P[k] = rx(M.patterns[k][0], M.patterns[k][1]);
    const URL_FULL = rx1("^(?:" + M.patterns.url[0] + ")$", "i");
    const EMAIL_FULL = rx1("^(?:" + M.patterns.email[0] + ")$", "i");
    const EMAIL_ONE = rx1(M.patterns.email[0], "i");
    const ENTITY_RE = /&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z0-9]{2,8});/gi;
    const TOKEN_RE = new RegExp(MM.token_src, "g");
    const TEXT_FLAGS = M.text_flags.map(f => ({ name: f.name, label: f.label, why: f.why, res: f.patterns.map(p => rx(p, "i")) }));
    const FLAG_NAMES = TEXT_FLAGS.map(f => f.name);
    const NEG = rx1(M.negation_src, "i");
    const URL_FLAG_NAMES = ["url_ip_host", "url_lookalike", "url_many_subdomains", "url_shortener",
      "url_suspicious_tld", "url_at_or_redirect", "url_sensitive_words", "url_non_campus_official"];
    const ENG = MM.engineered;
    const vocab = new Map();
    MM.terms.forEach((t, i) => vocab.set(t, i));
    const brandKeys = Object.keys(C.trusted_brands);
    const brandVals = brandKeys.map(k => C.trusted_brands[k]);
    const trustedAll = C.trusted_campus_domains.concat(brandKeys);
    const SHOUT = /\b[A-Z]{4,}(?:\s+[A-Z]{2,})+\b|!{2,}/g;
    const DISPLAY = /^\s*"?([^"<]*?)"?\s*</;
    const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
    const IP_ODD = /^(0x[0-9a-f]+|\d+)(\.(0x[0-9a-f]+|\d+)){3}$/i;
    const FILE_RX = /\.(php|html?|asp|aspx|cgi|exe|zip)\b/i;
    const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
    const BARE2 = /^([a-z][a-z0-9+.-]*:\/\/)?[\w-]+(\.[\w-]+)*\.[a-z]{2,}\.?(:\d+)?(\/\S*)?$|^[a-z][a-z0-9+.-]*:\/\/\S+$/i;

    // PSL
    const pslNormal = new Set(), pslWild = new Set(), pslExc = new Set();
    for (const r of M.psl) {
      if (r[0] === "!") pslExc.add(r.slice(1));
      else if (r.startsWith("*.")) pslWild.add(r.slice(2));
      else pslNormal.add(r);
    }
    function splitHost(host) {
      host = stripChars((host || ""), ".").toLowerCase();
      if (!host) return ["", "", ""];
      const labels = host.split(".");
      let sl = 0;
      for (let i = 0; i < labels.length; i++) {
        const cand = labels.slice(i).join(".");
        if (pslExc.has(cand)) { sl = labels.length - i - 1; break; }
        if (pslNormal.has(cand)) { sl = labels.length - i; break; }
        const parent = labels.slice(i + 1).join(".");
        if (parent && pslWild.has(parent)) { sl = labels.length - i; break; }
      }
      if (sl === 0) sl = labels.length > 1 ? 1 : 0;
      if (sl >= labels.length) return ["", "", labels.join(".")];
      const suffix = sl ? labels.slice(labels.length - sl).join(".") : "";
      const domain = labels[labels.length - sl - 1];
      const sub = labels.slice(0, labels.length - sl - 1).join(".");
      return [sub, domain, suffix];
    }

    // ------------------------------------------------------------ preprocess
    function unescape(text) {
      return text.replace(ENTITY_RE, function (m0, e) {
        const el = e.toLowerCase();
        try {
          if (el.startsWith("#x")) return String.fromCodePoint(parseInt(el.slice(2), 16));
          if (el.startsWith("#")) return String.fromCodePoint(parseInt(el.slice(1), 10));
        } catch (err) { return m0; }
        return Object.prototype.hasOwnProperty.call(M.entities, el) ? M.entities[el] : m0;
      });
    }
    function sub(name, rep, t) { P[name].lastIndex = 0; return t.replace(P[name], rep); }
    function normaliseRaw(text) {
      if (typeof text !== "string") return "";
      let t = text.split("\r\n").join("\n");
      t = sub("script_style", " ", t);
      t = sub("tag", " ", t);
      t = unescape(t);
      t = sub("zero_width", "", t);
      t = sub("uni_space", " ", t);
      t = sub("header_line", " ", t);
      t = sub("header_token", " ", t);
      t = sub("footer", " ", t);
      t = sub("apos_split", "$1'$2", t);
      t = sub("space_before_punct", "$1", t);
      t = sub("space_after_punct", "$1", t);
      t = sub("multi_space", " ", t);
      t = sub("multi_newline", "\n\n", t);
      return pyStrip(t);
    }
    function cleanForTfidf(norm) {
      let t = norm;
      t = sub("email", " emailtoken ", t);
      t = sub("url", " urltoken ", t);
      t = sub("source_names", " ", t);
      t = sub("money", " moneytoken ", t);
      t = sub("digits", " 0 ", t);
      t = sub("non_ascii", " ", t);
      t = sub("whitespace", " ", t.toLowerCase());
      return pyStrip(t);
    }

    // ------------------------------------------------------------ URL structure
    function homoglyph(s) { let o = ""; for (const c of s) o += (C.homoglyph[c] || c); return o; }
    function isIp(host) {
      const h = stripChars(host, "[]");
      if (IPV4.test(h)) return h.split(".").every(p => parseInt(p, 10) <= 255);
      if (h.indexOf(":") !== -1) {
        if (!/^[0-9a-f:.]+$/i.test(h)) return false;
        const dbl = count(h, "::");
        if (dbl > 1) return false;
        const groups = h.split(":").filter(g => g !== "");
        return dbl === 1 ? groups.length <= 7 : groups.length === 8;
      }
      return IP_ODD.test(h) || (/^[0-9]+$/.test(h) && h.length >= 8);
    }
    function lev(a, b) {
      if (a === b) return 0;
      if (Math.abs(a.length - b.length) > 2) return 3;
      let prev = []; for (let j = 0; j <= b.length; j++) prev.push(j);
      for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        for (let j = 1; j <= b.length; j++) cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0)));
        prev = cur;
      }
      return prev[b.length];
    }
    function entropy(s) {
      if (!s) return 0;
      const c = new Map();
      for (const ch of s) c.set(ch, (c.get(ch) || 0) + 1);
      const n = [...s].length;
      let e = 0;
      for (const v of c.values()) e += v / n * Math.log2(v / n);
      return -e;
    }
    function parseUrl(url) {
      let u = stripChars(pyStrip(url), ".,;:!?)]}>\"'");
      u = u.replace(/^hxxp/i, "http");
      if (!SCHEME.test(u)) u = "http://" + u;
      const rest = u.slice(u.indexOf("://") + 3);
      let cut = rest.length;
      for (const ch of "/?#") { const i = rest.indexOf(ch); if (i !== -1 && i < cut) cut = i; }
      const authority = rest.slice(0, cut), tail = rest.slice(cut);
      let host = authority.slice(authority.lastIndexOf("@") + 1), port = "";
      if (host.startsWith("[")) {
        const end = host.indexOf("]");
        port = (end !== -1 && host.slice(end + 1, end + 2) === ":") ? host.slice(end + 2) : "";
        host = end !== -1 ? host.slice(1, end) : host;
      } else if (count(host, ":") === 1) {
        const p = host.split(":"); host = p[0]; port = p[1];
      }
      let path = tail, query = "";
      if (path.indexOf("#") !== -1) path = path.slice(0, path.indexOf("#"));
      if (path.indexOf("?") !== -1) { query = path.slice(path.indexOf("?") + 1); path = path.slice(0, path.indexOf("?")); }
      return [rest, stripChars(host.toLowerCase(), "."), port, path, query];
    }
    function lookalikeOf(sld, sub_, registered) {
      if (!registered || trustedAll.indexOf(registered) !== -1) return "";
      const sldN = homoglyph(sld).split("-").join("");
      const subN = homoglyph(sub_.toLowerCase());
      for (const dom of trustedAll) {
        const base = dom.split(".")[0];
        if (base.length < 4 && base !== "aamu") continue;
        if (sld.indexOf(base) !== -1 && sld !== base) return dom;
        if (sldN.length >= 4 && lev(sldN, base) <= (base.length <= 5 ? 1 : 2)) return dom;
        if (subN.indexOf(base) !== -1) return dom;
      }
      for (const kw of C.lookalike_keywords) {
        if (sld.indexOf(kw) !== -1 || sub_.toLowerCase().indexOf(kw) !== -1) return stripChars(kw, "-");
      }
      return "";
    }
    function urlStruct(url) {
      const [rest, host, port, path, query] = parseUrl(url);
      const ip = host ? isIp(host) : false;
      let sub_, sld, suffix, registered;
      if (ip || !host) { sub_ = ""; sld = host; suffix = ""; registered = host; }
      else { [sub_, sld, suffix] = splitHost(host); registered = suffix ? sld + "." + suffix : sld; }
      const tldParts = suffix ? suffix.split(".") : [""];
      const tld = tldParts[tldParts.length - 1];
      const subParts = sub_.split(".").filter(s => s && s !== "www");
      const lowerRest = rest.toLowerCase();
      const pathQ = (path + (query ? "?" + query : "")).toLowerCase();
      const hostTokens = host.split(/[.-]/).filter(Boolean);
      const look = ip ? "" : lookalikeOf(sld, sub_, registered);
      let digits = 0; for (const ch of rest) if (ch >= "0" && ch <= "9") digits++;
      let hostDigits = 0; for (const ch of host) if (ch >= "0" && ch <= "9") hostDigits++;
      let special = 0; for (const ch of "-_=&%~+") special += count(lowerRest, ch);
      const subL = sub_.toLowerCase();
      return {
        host: host, registered_domain: registered, lookalike_target: look,
        ip_host: ip ? 1 : 0, lookalike: look ? 1 : 0, n_subdomains: subParts.length,
        shortener: (C.shorteners.indexOf(registered) !== -1 || C.shorteners.indexOf(host) !== -1) ? 1 : 0,
        suspicious_tld: C.suspicious_tlds.indexOf(tld) !== -1 ? 1 : 0,
        common_tld: ["com", "org", "net", "edu", "gov"].indexOf(tld) !== -1 ? 1 : 0,
        at_symbol: rest.indexOf("@") !== -1 ? 1 : 0,
        double_slash: rest.slice(1).indexOf("//") !== -1 ? 1 : 0,
        hyphen_host: count(host, "-"), digits_host: ip ? 0 : hostDigits,
        digit_ratio: digits / Math.max(rest.length, 1),
        punycode: host.indexOf("xn--") !== -1 ? 1 : 0,
        has_port: ["", "80", "443"].indexOf(port) === -1 ? 1 : 0,
        url_len: rest.length, host_len: host.length, path_depth: count(path, "/"),
        query_len: query.length, n_special: special, n_dots: count(host, "."),
        longest_host_token: hostTokens.reduce((a, t) => Math.max(a, t.length), 0),
        host_entropy: entropy(host),
        sensitive_words: C.sensitive_url_words.reduce((a, w) => a + (lowerRest.indexOf(w) !== -1 ? 1 : 0), 0),
        brand_in_path: brandVals.some(b => b.length > 4 && pathQ.indexOf(b) !== -1) ? 1 : 0,
        brand_in_sub: (brandVals.some(b => b.length > 4 && subL.indexOf(b) !== -1) || subL.indexOf("aamu") !== -1) ? 1 : 0,
        php_or_html: FILE_RX.test(pathQ) ? 1 : 0,
        campus_domain: C.trusted_campus_domains.indexOf(registered) !== -1 ? 1 : 0,
        trusted_brand: brandKeys.indexOf(registered) !== -1 ? 1 : 0,
      };
    }

    // ------------------------------------------------------------ message features
    function sentence(text, i) {
      const a = Math.max(rfindBefore(text, ".", i), rfindBefore(text, "!", i), rfindBefore(text, "?", i), rfindBefore(text, "\n", i)) + 1;
      const ends = [text.indexOf(".", i), text.indexOf("!", i), text.indexOf("?", i), text.indexOf("\n", i)].filter(x => x !== -1);
      return text.slice(a, ends.length ? Math.min(...ends) : text.length);
    }
    function findTextFlags(text) {
      const out = {};
      for (const f of TEXT_FLAGS) {
        let spans = [];
        for (const re of f.res) {
          for (const m of finditer(re, text)) {
            if (m[0].length === 0) continue;
            if (M.negated_flags.indexOf(f.name) !== -1 && NEG.test(sentence(text, m.index))) continue;
            spans.push([m.index, m.index + m[0].length, m[0]]);
          }
        }
        spans.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
        const merged = [];
        for (const s of spans) { if (merged.length && s[0] < merged[merged.length - 1][1]) continue; merged.push(s); }
        out[f.name] = merged;
      }
      return out;
    }
    function extractUrls(text) {
      const out = [];
      for (const m of finditer(P.url, text)) {
        if (m.index > 0 && text[m.index - 1] === "@") continue;
        out.push([m.index, m.index + m[0].length, m[0]]);
      }
      return out;
    }
    function mentionsCampus(lower) { return C.campus_names.some(n => lower.indexOf(n) !== -1); }

    function messageFeatures(text) {
      const lower = text.toLowerCase();
      const tflags = findTextFlags(text);
      const urls = extractUrls(text);
      const structs = urls.map(([s, e, u]) => Object.assign({ url: u, start: s, end: e }, urlStruct(u)));
      const officialClaim = tflags.impersonation.length > 0 || mentionsCampus(lower);
      const urlEv = {}; URL_FLAG_NAMES.forEach(k => urlEv[k] = []);
      for (const st of structs) {
        const sp = [st.start, st.end, st.url];
        if (st.ip_host) urlEv.url_ip_host.push(sp);
        if (st.lookalike) urlEv.url_lookalike.push(sp);
        if (st.n_subdomains >= 3) urlEv.url_many_subdomains.push(sp);
        if (st.shortener) urlEv.url_shortener.push(sp);
        if (st.suspicious_tld) urlEv.url_suspicious_tld.push(sp);
        if (st.at_symbol || st.double_slash) urlEv.url_at_or_redirect.push(sp);
        if (st.sensitive_words >= 1 && !(st.campus_domain || st.trusted_brand)) urlEv.url_sensitive_words.push(sp);
        if (mentionsCampus(lower) && !(st.campus_domain || st.trusted_brand)) urlEv.url_non_campus_official.push(sp);
      }
      const addr = finditer(P.email, text).map(m => [m.index, m.index + m[0].length, m[0]]);
      const free = addr.filter(a => C.free_mail.indexOf(a[2].split("@").pop().toLowerCase()) !== -1);
      const freemailOfficial = (officialClaim && free.length > 0) ? 1 : 0;
      let nl = 0, nu = 0;
      for (const c of text) { if (/[A-Za-z]/.test(c)) { nl++; if (c >= "A" && c <= "Z") nu++; } }
      const caps = nl ? nu / nl : 0;
      const shout = finditer(SHOUT, text).map(m => [m.index, m.index + m[0].length, m[0]]);
      const shouting = Math.min(1, Math.max(0, (caps - 0.15) * 3)) + Math.min(shout.length, 5) / 5;
      const feats = {};
      FLAG_NAMES.forEach(n => feats[n] = Math.min(tflags[n].length, 5));
      URL_FLAG_NAMES.forEach(n => feats[n] = Math.min(urlEv[n].length, 3));
      feats.sender_freemail_official = freemailOfficial;
      feats.shouting = shouting;
      feats.n_urls = Math.log1p(urls.length);
      const evidence = Object.assign({}, tflags, urlEv, {
        sender_freemail_official: freemailOfficial ? free : [], shouting: shout, n_urls: urls });
      return { text, feats, evidence, structs };
    }

    const OFFICIAL_DISPLAY_WORDS = ["office", "aid", "help desk", "helpdesk", "it ", "services", "support", "admin",
      "department", "registrar", "bursar", "payroll", "security", "university", "team"];
    function senderProfile(sender) {
      if (!sender || !pyStrip(sender)) return null;
      const dm = DISPLAY.exec(sender);
      const displayRaw = dm ? pyStrip(dm[1]) : "";
      const m = EMAIL_ONE.exec(sender);
      const prof = { raw: pyStrip(sender), display_name: displayRaw, address: "", local: "", host: "", subdomain: "", domain: "",
        freemail: false, official: false, lookalike: "", claims: [], official_words: [], hits: [] };
      if (!m) return prof;
      const addr = m[0].toLowerCase();
      const localRaw = addr.split("@")[0], dom = addr.split("@").pop();
      const [sb, sld, suffix] = splitHost(dom);
      const registered = suffix ? sld + "." + suffix : sld;
      const display = displayRaw.toLowerCase();
      const look = lookalikeOf(sld, sb, registered);
      const claimsCampus = mentionsCampus(display);
      const claimsBrand = brandVals.filter(b => b.length > 4 && display.split(" ").join("").indexOf(b) !== -1);
      const local = localRaw.split(".").join(" ").split("_").join(" ").split("-").join(" ") + " ";
      const words = [];
      OFFICIAL_DISPLAY_WORDS.filter(w => (display + " ").indexOf(w) !== -1).concat(C.official_local_words.filter(w => local.indexOf(w) !== -1))
        .forEach(w => { const t = pyStrip(w); if (words.indexOf(t) === -1) words.push(t); });
      const freemail = C.free_mail.indexOf(registered) !== -1;
      const trusted = C.trusted_campus_domains.indexOf(registered) !== -1 || brandKeys.indexOf(registered) !== -1;
      const hits = [];
      if (look) hits.push(["sender_lookalike", addr, look]);
      if (!trusted && !look && (claimsCampus || (claimsBrand.length && !freemail))) hits.push(["sender_display_mismatch", addr, display]);
      if (freemail && (claimsBrand.length || words.length)) hits.push(["sender_freemail", addr, display]);
      Object.assign(prof, { address: addr, local: localRaw, host: dom, subdomain: sb, domain: registered, freemail,
        official: trusted && !freemail, lookalike: look, claims: (claimsCampus ? ["AAMU"] : []).concat(claimsBrand), official_words: words, hits });
      return prof;
    }
    function senderRules(sender) { const p = senderProfile(sender); return p ? p.hits : []; }

    function buildSenderCheck(prof, effect, rate, content, fin, riskyRequest) {
      const P = x => pyRound(x * 100, 0);
      if (!prof) return { provided: false, summary: "No sender given. Add the From line to include it in the check.",
        content_score: pyRound(content, 4), final_score: pyRound(fin, 4), effect: "none", rate: 0, formula: "", checks: [] };
      const d = prof.domain, hn = prof.hits.map(h => h[0]);
      const checks = [];
      if (!prof.address) {
        checks.push({ id: "address", label: "Email address found", hit: true, detail: "No email address in the From line, so only the content counts" });
      } else {
        checks.push({ id: "lookalike", label: "Imitates a trusted domain", hit: hn.indexOf("sender_lookalike") !== -1,
          detail: prof.lookalike ? "@" + d + " imitates " + prof.lookalike : "@" + d + " doesn't imitate a trusted name" });
        let det;
        if (hn.indexOf("sender_display_mismatch") !== -1) det = 'Name says "' + prof.display_name + '" but the address is @' + d;
        else if (!prof.display_name) det = "No display name to compare";
        else det = "Name and address don't contradict each other";
        checks.push({ id: "display_mismatch", label: "Name doesn't match the address", hit: hn.indexOf("sender_display_mismatch") !== -1, detail: det });
        if (hn.indexOf("sender_freemail") !== -1) det = "@" + d + " is a personal mailbox, but the sender sounds official (" + prof.official_words.concat(prof.claims).join(", ") + ")";
        else if (prof.freemail) det = "@" + d + " is a personal mailbox, which is normal for a person";
        else det = "@" + d + " is not a personal mailbox";
        checks.push({ id: "freemail", label: "Official-sounding sender on a personal mailbox", hit: hn.indexOf("sender_freemail") !== -1, detail: det });
        checks.push({ id: "official", label: "On the trusted-domain list", hit: prof.official,
          detail: prof.official ? d + " is on the trusted list" : d + " is not on the trusted list" });
        if (prof.official) checks.push({ id: "risky_request", label: "Message asks for passwords, codes or money", hit: riskyRequest,
          detail: riskyRequest ? "Yes, so the official address earns no discount" : "No" });
      }
      const pc = P(content), pf = P(fin);
      let formula, summary;
      if (effect === "raise") { formula = pc + "% + " + rate.toFixed(2) + " \u00d7 (100% \u2212 " + pc + "%) = " + pf + "%";
        summary = "The sender looks suspicious, so it closes " + P(rate) + "% of the gap to 100%. The content still leads."; }
      else if (effect === "lower") { formula = pc + "% \u00d7 (1 \u2212 " + rate.toFixed(2) + ") = " + pf + "%";
        summary = "Official sender and only official links, so the risk drops by " + P(rate) + "%. That's the most a sender can lower it."; }
      else if (effect === "no_discount") { formula = pc + "% (no change)";
        summary = "The address is official, but the message asks for something risky, so it gets no discount. Real accounts get hacked."; }
      else if (effect === "official_links_elsewhere") { formula = pc + "% (no change)";
        summary = "The address is official, but some links go to other sites, so it gets no discount."; }
      else { formula = pc + "% (no change)"; summary = "Nothing unusual about the sender. The score comes from the content alone."; }
      return { provided: true, raw: prof.raw, display_name: prof.display_name, address: prof.address, local: prof.local, host: prof.host,
        subdomain: prof.subdomain, domain: d, checks, effect, rate, content_score: pyRound(content, 4), final_score: pyRound(fin, 4),
        formula, summary, max_raise: Math.max(...Object.values(INF.sender_pull)), max_lower: INF.trusted_sender_discount };
    }

    function flagMeta(name) {
      for (const f of TEXT_FLAGS) if (f.name === name) return [f.label, f.why];
      if (M.meta[name]) return M.meta[name];
      return [name, ""];
    }

    // ------------------------------------------------------------ model
    function analyzer(clean) {
      const toks = clean.match(TOKEN_RE) || [];
      const grams = toks.slice();
      for (let i = 0; i < toks.length - 1; i++) grams.push(toks[i] + " " + toks[i + 1]);
      return { toks, grams };
    }
    function vectorise(clean, feats) {
      const { toks, grams } = analyzer(clean);
      const counts = new Map();
      for (const g of grams) { const j = vocab.get(g); if (j !== undefined) counts.set(j, (counts.get(j) || 0) + 1); }
      const vals = new Map();
      let ss = 0;
      for (const [j, c] of counts) { const v = (1 + Math.log(c)) * MM.idf[j]; vals.set(j, v); ss += v * v; }
      const norm = Math.sqrt(ss) || 1;
      const x = new Map();
      for (const [j, v] of vals) x.set(j, v / norm);
      ENG.forEach((name, k) => {
        const v = feats[name] / MM.eng_scale[k] * MM.eng_weight;
        if (v !== 0) x.set(MM.n_words + k, v);
      });
      return { x, toks, grams, counts };
    }
    const sigmoid = z => (z > -700 ? 1 / (1 + Math.exp(-z)) : 0);

    function treePredictExplain(x) {
      const contrib = new Array(x.length).fill(0);
      let total = UM.init;
      for (const t of UM.trees) {
        let node = 0;
        const val = t.v[0];
        if (UM.kind === "rf") total += UM.scale * val;
        while (t.l[node] !== -1) {
          const f = t.f[node];
          const nxt = x[f] <= t.t[node] ? t.l[node] : t.r[node];
          contrib[f] += UM.scale * (t.v[nxt] - t.v[node]);
          node = nxt;
        }
        if (UM.kind === "rf") total += UM.scale * (t.v[node] - val);
        else total += UM.scale * t.v[node];
      }
      const p = UM.kind === "gb" ? 1 / (1 + Math.exp(-total)) : total;
      return { p, contrib, logit: total };
    }

    function scoreUrl(url) {
      const st = urlStruct(url);
      const xv = UM.features.map(k => Number(st[k]));
      let { p, contrib } = treePredictExplain(xv);
      const order = contrib.map((c, i) => i).sort((a, b) => (contrib[b] - contrib[a]) || (a - b));
      let reasons = order.slice(0, 4).filter(i => contrib[i] > 0.05 && xv[i] > 0 && UM.features[i] !== "common_tld")
        .map(i => UM.labels[UM.features[i]]);
      const hard = [["ip_host", "Uses a raw IP address instead of a name"], ["lookalike", "Domain imitates a trusted name"],
        ["punycode", "Uses look-alike foreign characters (punycode)"], ["at_symbol", "Contains '@', which can redirect the link"],
        ["shortener", "Shortened link hides the destination"]];
      for (const [k, lab] of hard.slice().reverse()) {
        if (st[k]) { const ix = reasons.indexOf(lab); if (ix !== -1) reasons.splice(ix, 1); reasons.unshift(lab); }
      }
      if (st.lookalike) reasons[reasons.indexOf("Domain imitates a trusted name")] = "Domain imitates " + st.lookalike_target;
      if (st.ip_host || st.lookalike || st.punycode) p = Math.max(p, 0.85);
      if (st.campus_domain && st.n_subdomains <= 2 && !st.at_symbol) { p = Math.min(p, 0.1); reasons = ["Official campus domain"]; }
      else if (st.trusted_brand && !st.at_symbol && st.n_subdomains <= 3) { p = Math.min(p, 0.2); reasons = ["Known trusted domain"]; }
      return {
        url, domain: st.registered_domain, risk_score: pyRound(p, 4), risky: p >= UM.threshold, reasons: reasons.slice(0, 5),
        parts: { host: st.host, registered_domain: st.registered_domain, subdomains: st.n_subdomains, ip_host: !!st.ip_host,
          lookalike_target: st.lookalike_target, shortener: !!st.shortener, suspicious_tld: !!st.suspicious_tld },
        _struct: st, _contrib: UM.features.map((f, i) => ({ feature: f, label: UM.labels[f], value: xv[i], contribution: contrib[i] })),
      };
    }

    function level(p) { return p >= MM.high_threshold ? "high" : p >= MM.threshold ? "medium" : "low"; }

    function buildFlags(contrib, x, text, evidence) {
      const flags = [], highlights = [];
      ENG.forEach((name, k) => {
        const j = MM.n_words + k;
        const c = contrib.has(j) ? contrib.get(j) : 0;
        if (!x.has(j) || c <= 0.02) return;
        const [label, why] = flagMeta(name);
        const ev = evidence[name] || [];
        const uniq = [];
        for (const e of ev) if (uniq.indexOf(e[2]) === -1) uniq.push(e[2]);
        flags.push({ flag: name, label, why, contribution: pyRound(c, 4), evidence: uniq.slice(0, 5) });
        for (const [s, e, frag] of ev.slice(0, 8)) if (s >= 0) highlights.push({ start: s, end: e, text: frag, flag: name });
      });
      const ph = new Set(INF.placeholders);
      const words = [];
      for (const [j, c] of contrib) {
        if (j < MM.n_words && c > 0.02) {
          const w = MM.terms[j];
          if (!w.split(" ").some(p => ph.has(p))) words.push([c, w]);
        }
      }
      words.sort((a, b) => (b[0] - a[0]) || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
      const top = words.slice(0, 8);
      if (top.length) {
        flags.push({ flag: "suspicious_wording", label: "Wording common in scams",
          why: "These words and phrases show up far more often in scam messages.",
          contribution: pyRound(top.reduce((a, t) => a + t[0], 0), 4), evidence: top.map(t => t[1]) });
        const lower = text.toLowerCase();
        for (const [, w] of top) {
          const re = new RegExp("\\b" + w.split(" ").map(escapeRe).join("[\\W_]+") + "\\b", "gi");
          finditer(re, lower).slice(0, 3).forEach(m => highlights.push({ start: m.index, end: m.index + m[0].length,
            text: text.slice(m.index, m.index + m[0].length), flag: "suspicious_wording" }));
        }
      }
      flags.sort((a, b) => b.contribution - a.contribution);
      const total = flags.reduce((a, f) => a + f.contribution, 0) || 1;
      for (const f of flags) {
        const share = f.contribution / total;
        f.severity = share >= 0.25 ? "High" : share >= 0.10 ? "Medium" : "Low";
        if (INF.floor_medium.indexOf(f.flag) !== -1 && f.severity === "Low") f.severity = "Medium";
      }
      highlights.sort((a, b) => (a.start - b.start) || ((b.end - b.start) - (a.end - a.start)));
      const merged = [];
      for (const h of highlights) { if (merged.length && h.start < merged[merged.length - 1].end) continue; merged.push(h); }
      return { flags, highlights: merged };
    }

    function plainEnglish(lvl, risk, flags, urls) {
      const pct = pyRound(risk * 100, 0);
      if (lvl === "low") {
        const head = "This looks safe (" + pct + "% risk).";
        const minor = flags.filter(f => f.flag !== "suspicious_wording" && f.severity === "High");
        return head + (!minor.length ? " We didn't find strong warning signs." : " One thing to keep in mind: " + minor[0].label.toLowerCase() + ".");
      }
      const head = (lvl === "high" ? "This looks like a scam" : "This message is suspicious") + " (" + pct + "% risk).";
      const content = flags.filter(f => f.flag.indexOf("sender_") !== 0);
      const ordered = content.filter(f => f.flag !== "suspicious_wording").concat(content.filter(f => f.flag === "suspicious_wording"));
      const parts = [];
      for (const f of ordered.slice(0, 3)) {
        const ev = f.evidence || [];
        const q = (ev.length && f.flag !== "n_urls" && f.flag !== "url") ? ' ("' + ev[0] + '")' : "";
        parts.push(f.label.toLowerCase() + q);
      }
      const bad = urls.filter(u => u.risky);
      if (bad.length && !flags.some(f => f.flag === "url")) parts.push("its link goes to " + (bad[0].domain || bad[0].url) + ", which isn't a trusted address");
      const snd = flags.filter(f => f.flag.indexOf("sender_") === 0);
      if (snd.length) parts.push("also, " + snd[0].label.toLowerCase());
      return head + (parts.length ? " Warning signs: " + parts.join("; ") + "." : "");
    }
    function action(lvl, flags) {
      if (lvl === "low") return INF.safe_action;
      if (flags.some(f => f.flag === "sender_trusted_risky_request")) return INF.actions.sender_trusted_risky_request;
      for (const f of flags) if (INF.actions[f.flag]) return INF.actions[f.flag];
      return INF.default_action;
    }
    function isBareUrl(s) {
      if (!s || pyStrip(s).split(/\s+/).length !== 1 || EMAIL_FULL.test(s)) return false;
      return URL_FULL.test(s) || BARE2.test(s);
    }

    function analyzeMessage(content, sender) {
      const norm = normaliseRaw(content);
      const clean = cleanForTfidf(norm);
      const mf = messageFeatures(norm);
      const vec = vectorise(clean, mf.feats);
      let z = MM.intercept;
      for (const [j, v] of vec.x) z += MM.coef[j] * v;
      const pMsg = sigmoid(z);
      const contrib = new Map();
      for (const [j, v] of vec.x) contrib.set(j, MM.coef[j] * (v - MM.mean[j]));
      const { flags, highlights } = buildFlags(contrib, vec.x, mf.text, mf.evidence);
      const seen = new Set(), urlReports = [];
      for (const s of mf.structs) {
        if (seen.has(s.url) || urlReports.length >= INF.max_urls) continue;
        seen.add(s.url); urlReports.push(scoreUrl(s.url));
      }
      const pUrl = urlReports.reduce((a, r) => Math.max(a, r.risk_score), 0);
      let risk = !urlReports.length ? pMsg : Math.max(pMsg, 0.5 * pMsg + 0.5 * pUrl);
      const fusedRisk = risk;
      const rulesApplied = [];
      // ---- 1. content score (text model + links); dangerous link structure is content
      if (mf.structs.some(s => s.ip_host || s.lookalike || s.punycode)) {
        if (INF.struct_floor > risk) rulesApplied.push({ rule: "Dangerous link structure", floor: INF.struct_floor });
        risk = Math.max(risk, INF.struct_floor);
      }
      const contentRisk = risk;
      // ---- 2. From line: a bounded nudge that can never outweigh the content
      const good = [], senderFlags = [];
      const prof = senderProfile(sender);
      const hits = prof ? prof.hits : [];
      const isOfficial = d => C.trusted_campus_domains.indexOf(d) !== -1 || brandKeys.indexOf(d) !== -1;
      const allLinksOfficial = urlReports.every(r => isOfficial(r.parts.registered_domain));
      if (urlReports.length && allLinksOfficial) good.push("All links go to official websites");
      let effect = "none", rate = 0, riskyAsks = [];
      if (hits.length) {
        effect = "raise"; rate = Math.max(...hits.map(h => INF.sender_pull[h[0]]));
        risk = risk + rate * (1 - risk);
        for (const [name, addr, detail] of hits) {
          const [label, why] = flagMeta(name);
          const ev = [addr].concat(name === "sender_lookalike" ? ["imitates " + detail] : []);
          senderFlags.push({ flag: name, label, why, contribution: null, severity: name === "sender_lookalike" ? "High" : "Medium", evidence: ev });
        }
      } else if (prof && prof.official) {
        good.unshift("Sent from an official domain (" + prof.domain + ")");
        riskyAsks = INF.risky_request_flags.filter(n => (mf.feats[n] || 0) > 0);
        if (riskyAsks.length) {
          effect = "no_discount";
          const [label, why] = flagMeta("sender_trusted_risky_request");
          const ev = [prof.domain].concat([].concat(...riskyAsks.map(n => (mf.evidence[n] || []).map(e => e[2]))).slice(0, 2));
          senderFlags.push({ flag: "sender_trusted_risky_request", label, why, contribution: null, severity: "High", evidence: ev });
        } else if (allLinksOfficial) {
          effect = "lower"; rate = INF.trusted_sender_discount;
          risk = risk * (1 - INF.trusted_sender_discount);
        } else effect = "official_links_elsewhere";
      }
      const senderCheck = buildSenderCheck(prof, effect, rate, contentRisk, risk, riskyAsks.length > 0);
      if (effect === "raise" || effect === "lower") rulesApplied.push({ rule: effect === "raise" ? "Sender adjustment (suspicious sender)" : "Sender adjustment (official sender)", from: contentRisk, to: risk });
      for (const f of senderFlags) flags.push(f);
      const lvl = level(risk);
      // ---- trace (for the "how it works" animation)
      const termContrib = [];
      for (const [j, c] of contrib) if (j < MM.n_words) termContrib.push({ term: MM.terms[j], tfidf: vec.x.get(j), contribution: c });
      termContrib.sort((a, b) => b.contribution - a.contribution);
      const engContrib = ENG.map((name, k) => ({ name, label: flagMeta(name)[0], value: mf.feats[name],
        contribution: contrib.has(MM.n_words + k) ? contrib.get(MM.n_words + k) : 0 })).filter(e => e.value !== 0);
      const trace = {
        raw: content, normalised: norm, cleaned: clean, tokens: vec.toks, n_tokens: vec.toks.length,
        n_grams: vec.grams.length, vocab_hits: vec.counts.size, vocab_size: MM.n_words,
        flag_hits: FLAG_NAMES.map(n => ({ name: n, label: flagMeta(n)[0], count: mf.evidence[n].length,
          examples: mf.evidence[n].slice(0, 3).map(e => e[2]) })),
        term_contrib: termContrib, eng_contrib: engContrib, intercept: MM.intercept, z, p_msg: pMsg,
        url_reports: urlReports, p_url: urlReports.length ? pUrl : null, fused: fusedRisk, content: contentRisk, rules: rulesApplied, sender_check: senderCheck,
        final: risk, threshold: MM.threshold, high_threshold: MM.high_threshold,
      };
      return {
        input_type: "message", verdict: INF.verdicts[lvl], risk_level: lvl, risk_score: pyRound(risk, 4), content_score: pyRound(contentRisk, 4),
        message_model_score: pyRound(pMsg, 4), url_model_score: urlReports.length ? pyRound(pUrl, 4) : null,
        red_flags: flags, highlights, analyzed_text: mf.text, urls: urlReports.map(stripPriv),
        good_signs: good.concat(normalWords(contrib)), sender_check: senderCheck,
        explanation: plainEnglish(lvl, risk, flags, urlReports), recommended_action: action(lvl, flags), trace,
      };
    }
    function senderDomain(sender) {
      if (!sender) return "";
      const m = EMAIL_ONE.exec(sender);
      if (!m) return "";
      const [, sld, suffix] = splitHost(m[0].toLowerCase().split("@").pop());
      return suffix ? sld + "." + suffix : sld;
    }
    function normalWords(contrib) {
      const ph = new Set(INF.placeholders);
      const neg = [];
      for (const [j, c] of contrib) {
        if (j < MM.n_words && c < -0.05) { const w = MM.terms[j]; if (!w.split(" ").some(p => ph.has(p))) neg.push([c, w]); }
      }
      neg.sort((a, b) => (a[0] - b[0]) || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
      if (!neg.length) return [];
      return ["Reads like normal conversation: " + neg.slice(0, 4).map(t => '"' + t[1] + '"').join(", ")];
    }
    function stripPriv(r) { const o = Object.assign({}, r); delete o._struct; delete o._contrib; return o; }

    function analyzeUrlOnly(url) {
      const r = scoreUrl(url);
      const lvl = r.risk_score >= 0.8 ? "high" : r.risky ? "medium" : "low";
      const flags = r.reasons.filter(x => x !== "Official campus domain" && x !== "Known trusted domain")
        .map((x, i) => ({ flag: "url", label: x, why: "", severity: i === 0 ? "High" : "Medium", contribution: null, evidence: [url] }));
      return {
        input_type: "url", verdict: INF.verdicts[lvl], risk_level: lvl, risk_score: r.risk_score,
        message_model_score: null, url_model_score: r.risk_score, red_flags: flags,
        highlights: lvl !== "low" ? [{ start: 0, end: url.length, text: url, flag: "url" }] : [],
        analyzed_text: url, urls: [stripPriv(r)],
        good_signs: r.reasons.filter(x => x === "Official campus domain" || x === "Known trusted domain"),
        explanation: plainEnglish(lvl, r.risk_score, flags, [r]),
        recommended_action: lvl !== "low" ? INF.default_action : "Looks OK, but only enter passwords on sites you typed in yourself.",
        trace: { url_only: true, raw: url, url_report: r, final: r.risk_score, threshold: UM.threshold },
      };
    }

    function analyze(content, sender) {
      const t0 = (typeof performance !== "undefined" ? performance.now() : Date.now());
      content = pyStrip(content || "");
      sender = pyStrip(sender || "") || null;
      let out;
      if (!content) out = { input_type: "empty", verdict: "Nothing to check", risk_level: "low", risk_score: 0, red_flags: [],
        highlights: [], urls: [], analyzed_text: "", good_signs: [], explanation: "Paste a message or a link to check it.", recommended_action: "" };
      else if (isBareUrl(content)) out = analyzeUrlOnly(content);
      else out = analyzeMessage(content, sender);
      out.model_version = M.version;
      out.latency_ms = pyRound((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0, 1);
      return out;
    }

    function llmPrompt(result) {
      const flags = result.red_flags.slice(0, 6).map(f => "- " + f.label + ": " + (f.evidence || []).join(", ")).join("\n");
      return "You explain phishing warnings to college students in plain, friendly English. Max 70 words, no jargon, no markdown.\n" +
        "Verdict: " + result.verdict + " (" + pyRound(result.risk_score * 100, 0) + "% risk).\n" +
        "Red flags found by the detector:\n" + (flags || "- none") + "\n" +
        "Explain why these signs matter and what the student should do next. Do not invent red flags that are not listed and do not change the verdict.";
    }

    return { analyze, llmPrompt, version: M.version, _internals: { normaliseRaw, cleanForTfidf, urlStruct, splitHost, messageFeatures, senderRules } };
  }

  const api = { create };
  root.CampusGuardEngine = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis);
