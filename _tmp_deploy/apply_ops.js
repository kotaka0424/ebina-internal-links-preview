// Apply internal-link deploy ops (from make_deploy_ops.py) to a page's raw post_content.
// Works in the browser (WP admin, REST) and in Node (local test against extracted raws).
// returns {raw: newRaw, log: [...], failed: [...]}
function applyOps(raw, entry) {
  const crlf = raw.includes("\r\n");
  let s = raw.replace(/\r\n/g, "\n");
  const log = [], failed = [];
  const WHITE_END = /\s*(?:<p>)?\s*<!--end div#contents-->\s*(?:<\/p>)?\s*<\/div>\s*(?:<p>)?\s*<!--end div#inside_outside-->\s*(?:<\/p>)?\s*<\/div>/g;
  const count = (hay, needle) => hay.split(needle).length - 1;
  function whiteEnd() {
    // the white section end right before the beige band, or (no beige band) the first one after inside_outside_top
    const bs = s.indexOf('<div class="inside_outside_b_short">');
    WHITE_END.lastIndex = 0;
    let m, best = null;
    const top = s.indexOf('<div class="inside_outside_top');
    while ((m = WHITE_END.exec(s))) {
      if (bs >= 0) { if (m.index + m[0].length <= bs && /^\s*$/.test(s.slice(m.index + m[0].length, bs))) { best = m; break; } }
      else if (m.index > top) { best = m; break; }
    }
    return best;
  }
  for (const op of entry.ops) {
    if (op.op === "ctx") {
      let found = -1, used = "";
      const tries = [];
      for (const pre of [op.prefix, op.prefix.slice(-10), op.prefix.slice(-5)])
        for (const suf of [op.suffix, op.suffix.slice(0, 4), ""]) tries.push([pre, suf]);
      // fallback: context including tags (keyword filling a whole element)
      for (const pre of [op.prefix2 || "", (op.prefix2 || "").slice(-25), (op.prefix2 || "").slice(-12)])
        for (const suf of [op.suffix2 || "", (op.suffix2 || "").slice(0, 8), ""]) tries.push([pre, suf]);
      for (const [pre, suf] of tries) {
        if (!pre && !suf) continue;
        const needle = pre + op.kw + suf;
        if (count(s, needle) === 1) { found = s.indexOf(needle) + pre.length; used = needle; break; }
      }
      if (found < 0) { failed.push("ctx:" + op.kw + " (" + op.prefix + "|" + op.suffix + ")"); continue; }
      // do not link inside an existing <a>
      const before = s.slice(0, found);
      if (before.lastIndexOf("<a ") > before.lastIndexOf("</a>")) { failed.push("ctx-in-a:" + op.kw); continue; }
      s = s.slice(0, found) + op.html + s.slice(found + op.kw.length);
      log.push("ctx " + op.kw + " -> " + op.href);
    } else if (op.op === "repl") {
      const n = count(s, op.find);
      if (!n) { failed.push("repl:" + op.find); continue; }
      s = s.split(op.find).join(op.to);
      log.push("repl " + op.find + " x" + n);
    } else if (op.op === "block") {
      const html = "\n" + op.html + "\n";
      if (op.anchor === "end") {
        s = s.replace(/\s*$/, "") + "\n" + html;
        log.push("block end: " + op.label);
      } else if (op.anchor === "bshort_start") {
        const m = /<div class="inside_outside_b_short">\s*<div class="contents">\s*/.exec(s);
        if (!m) { failed.push("anchor bshort_start: " + op.label); continue; }
        const at = m.index + m[0].length;
        s = s.slice(0, at) + op.html + "\n" + s.slice(at);
        log.push("block bshort_start: " + op.label);
      } else {
        const m = whiteEnd();
        if (!m) { failed.push("anchor " + op.anchor + ": " + op.label); continue; }
        const at = op.anchor === "white_end_before" ? m.index : m.index + m[0].length;
        s = s.slice(0, at) + html + s.slice(at);
        log.push("block " + op.anchor + ": " + op.label);
      }
    }
  }
  return { raw: crlf ? s.replace(/\n/g, "\r\n") : s, log, failed };
}
if (typeof module !== "undefined") module.exports = { applyOps };
