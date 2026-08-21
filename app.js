/* trends
   Pulls the top 100 repositories created in the last 7 days (GitHub Search API,
   the closest public proxy for github.com/trending) and renders 12 animated
   Chart.js charts that tell the week's story. No build step, no key. */

(() => {
  "use strict";

  // ---------- palette (validated 8-slot dark categorical) ----------
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  const SERIES = [v("--s1"), v("--s2"), v("--s3"), v("--s4"), v("--s5"), v("--s6"), v("--s7"), v("--s8")];
  const INK2 = v("--ink-2");
  const MUTED = v("--muted");
  const GRID = v("--grid");
  const SURFACE = v("--surface");

  // Chart.js global defaults
  Chart.defaults.font.family = '"IBM Plex Mono", ui-monospace, monospace';
  Chart.defaults.font.size = 11;
  Chart.defaults.color = MUTED;
  Chart.defaults.borderColor = GRID;
  Chart.defaults.plugins.legend.labels.boxWidth = 10;
  Chart.defaults.plugins.legend.labels.boxHeight = 10;
  Chart.defaults.plugins.legend.labels.color = INK2;
  Chart.defaults.plugins.tooltip.backgroundColor = "#0d0d0d";
  Chart.defaults.plugins.tooltip.borderColor = "rgba(255,255,255,0.18)";
  Chart.defaults.plugins.tooltip.borderWidth = 1;
  Chart.defaults.plugins.tooltip.titleColor = "#ffffff";
  Chart.defaults.plugins.tooltip.bodyColor = INK2;
  Chart.defaults.plugins.tooltip.padding = 10;

  const fmt = new Intl.NumberFormat("en-US");
  const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

  // staggered per-bar entrance
  const staggered = {
    animation: { duration: 400, easing: "easeOutQuart" },
    animations: { y: { from: (ctx) => ctx.chart.scales.y ? ctx.chart.scales.y.getPixelForValue(0) : 0 } },
  };
  const delayByIndex = (ctx) => (ctx.type === "data" ? ctx.dataIndex * 25 : 0);

  // ---- tiny tick icons (language logos + owner avatars) ----
  const LANG_ICON = {
    JavaScript:      "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/javascript/javascript-original.svg",
    TypeScript:      "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/typescript/typescript-original.svg",
    Python:          "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/python/python-original.svg",
    Rust:            "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/rust/rust-original.svg",
    Go:              "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/go/go-original-wordmark.svg",
    Java:            "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/java/java-original.svg",
    "C++":           "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/cplusplus/cplusplus-original.svg",
    C:               "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/c/c-original.svg",
    Ruby:            "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/ruby/ruby-original.svg",
    PHP:             "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/php/php-original.svg",
    Swift:           "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/swift/swift-original.svg",
    Kotlin:          "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/kotlin/kotlin-original.svg",
    Shell:           "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/bash/bash-original.svg",
    Dart:            "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/dart/dart-original.svg",
    Lua:             "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/lua/lua-original.svg",
    CSS:             "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/css3/css3-original.svg",
    HTML:            "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/html5/html5-original.svg",
    Dockerfile:      "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/docker/docker-original.svg",
    "Jupyter Notebook": "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/jupyter/jupyter-original-wordmark.svg",
    Vue:             "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/vuejs/vuejs-original.svg",
    Zig:             "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/zig/zig-original.svg",
  };

  function loadImg(src) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;
    return img;
  }

  // axis: 'x' draws below bar bottoms | 'y' draws inside bars at the left edge
  function axisImgPlugin(imgArr, axis) {
    const SZ = 18;
    let scheduled = false;
    return {
      id: "axisImgs_" + axis + "_" + Math.random().toString(36).slice(2),
      afterDraw(chart) {
        const scale = chart.scales[axis];
        if (!scale) return;
        const { ctx, chartArea } = chart;
        let allReady = true;
        imgArr.forEach((img, i) => {
          if (!img?.complete || !img.naturalWidth) { allReady = false; return; }
          let cx, cy;
          if (axis === "x") {
            cx = scale.getPixelForValue(i);
            cy = scale.bottom + 13;
          } else {
            cx = chartArea.left + SZ / 2 + 3;
            cy = scale.getPixelForValue(i);
          }
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, SZ / 2, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(img, cx - SZ / 2, cy - SZ / 2, SZ, SZ);
          ctx.restore();
        });
        if (!allReady && !scheduled) {
          scheduled = true;
          Promise.all(imgArr.filter(Boolean).map((img) =>
            img.complete ? Promise.resolve() : new Promise((r) => img.addEventListener("load", r, { once: true }))
          )).then(() => { scheduled = false; chart.update("none"); });
        }
      },
    };
  }

  const barScales = (horizontal) => {
    const valueAxis = {
      grid: { color: GRID, drawTicks: false },
      border: { color: v("--baseline") },
      ticks: { callback: (val) => compact.format(val) },
    };
    const categoryAxis = {
      grid: { color: "transparent", drawTicks: false },
      border: { color: v("--baseline") },
    };
    return horizontal ? { x: valueAxis, y: categoryAxis } : { x: categoryAxis, y: valueAxis };
  };

  // horizontal-bar scales with the y (category) labels made transparent - the gutter space
  // stays reserved so labelLinksPlugin can overlay real, clickable <a> repo links there.
  const linkableScales = () => {
    const s = barScales(true);
    s.y = { ...s.y, ticks: { color: "transparent" } };
    return s;
  };

  // ---------- data (cache-first: each view is fetched from GitHub at most once,
  //            then served from cache on every later filter change + refresh) ----------
  const CACHE_TTL = 6 * 60 * 60 * 1000;   // 6h - reuse across filter switches and refreshes
  const cacheKey = (days) => `gvt-v2-${days}`;
  const mem = new Map();       // in-session cache -> instant, zero network
  const inflight = new Map();  // de-dupe concurrent fetches of the same view

  function cacheGet(key) {
    if (mem.has(key)) return mem.get(key);
    try {
      const hit = JSON.parse(localStorage.getItem(key) || "null");
      if (hit && Date.now() - hit.at < CACHE_TTL) { mem.set(key, hit.items); return hit.items; }
    } catch (_) {}
    return null;
  }
  function cacheSet(key, items) {
    mem.set(key, items);
    try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), items })); } catch (_) {}
  }
  // cache -> in-flight promise -> a single network call, in that order
  function load(key, fetcher) {
    const cached = cacheGet(key);
    if (cached) return Promise.resolve(cached);
    if (inflight.has(key)) return inflight.get(key);
    const p = fetcher()
      .then((items) => { cacheSet(key, items); inflight.delete(key); return items; })
      .catch((err) => { inflight.delete(key); throw err; });
    inflight.set(key, p);
    return p;
  }

  // one GitHub repo object -> our compact shape (shared by both loaders)
  const mapRepo = (r) => ({
    name: r.full_name, short: r.name, stars: r.stargazers_count, forks: r.forks_count,
    issues: r.open_issues_count, language: r.language || "Unknown",
    license: r.license ? r.license.spdx_id : "None", ownerType: r.owner.type,
    owner: r.owner.login, topics: r.topics || [], created: r.created_at, url: r.html_url,
  });

  // Real github.com/trending repos - week of 2026-08-10
  const REAL_TRENDING_REPOS = [
    "huangruiteng/loopx",
    "firecrawl/pdf-inspector",
    "TencentCloud/TencentDB-Agent-Memory",
    "zhaoxuya520/reverse-skill",
    "esengine/DeepSeek-Reasonix",
    "lyogavin/airllm",
    "semantica-agi/semantica",
    "google/skills",
    "virgiliojr94/book-to-skill",
    "unclebob/swarm-forge",
    "drawdb-io/drawdb",
    "usekaneo/kaneo",
    "microsoft/AI-For-Beginners",
    "Comfy-Org/ComfyUI",
    "vitali87/code-graph-rag",
    "goauthentik/authentik",
    "DataExpert-io/data-engineer-handbook",
  ];

  function fetchRealTrending() {
    return load("gvt-trending-2026-08-10", async () => {
      const results = await Promise.all(
        REAL_TRENDING_REPOS.map(async (fullName) => {
          const res = await fetch(`https://api.github.com/repos/${fullName}`, {
            headers: { Accept: "application/vnd.github+json" },
          });
          if (!res.ok) return null;
          return mapRepo(await res.json());
        })
      );
      return results.filter(Boolean);
    });
  }

  const daysAgo = (n) => {
    const d = new Date(Date.now() - n * 864e5);
    return d.toISOString().slice(0, 10);
  };

  function fetchTrending(days) {
    return load(cacheKey(days), async () => {
      const q = encodeURIComponent(`created:>${daysAgo(days)}`);
      const url = `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=100`;
      const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
      if (!res.ok) throw new Error(`GitHub API ${res.status} - ${res.status === 403 ? "rate limited, retry in a minute" : res.statusText}`);
      const json = await res.json();
      return json.items.map(mapRepo);
    });
  }

  // ---------- transforms ----------
  const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);

  function groupBy(items, keyFn) {
    const m = new Map();
    for (const it of items) {
      const k = keyFn(it);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(it);
    }
    return m;
  }

  function topLanguages(items, n) {
    const groups = [...groupBy(items, (r) => r.language)].filter(([k]) => k !== "Unknown");
    return groups.sort((a, b) => b[1].length - a[1].length).slice(0, n);
  }

  const ageDays = (r) => Math.max(1, (Date.now() - new Date(r.created).getTime()) / 864e5);

  // ---------- charts ----------
  function make(id, cfg) {
    return new Chart(document.getElementById(`c-${id}`), cfg);
  }
  function story(id, text) {
    document.getElementById(`story-${id}`).textContent = text;
  }

  // click a bar/point -> open that repo on github.com (new tab); pointer cursor on hover
  function repoLink(urlAt) {
    return {
      onClick: (_e, els) => { if (els.length) { const u = urlAt(els[0].index); if (u) window.open(u, "_blank", "noopener"); } },
      onHover: (e, els) => { e.native.target.style.cursor = els.length ? "pointer" : "default"; },
    };
  }

  // overlay real <a> links over a horizontal-bar chart's y-axis labels, so each repo NAME
  // in the list is a visible, clickable anchor that opens the repo on GitHub. Built with the
  // DOM (no innerHTML) and re-synced only when the layout changes.
  function labelLinksPlugin(getRepos) {
    return {
      id: "labelLinks",
      afterDraw(chart) {
        const y = chart.scales.y, area = chart.chartArea;
        if (!y || !area) return;
        const repos = getRepos();
        const wrap = chart.canvas.parentNode;
        let box = wrap.querySelector(".label-links");
        if (!box) { box = document.createElement("div"); box.className = "label-links"; wrap.appendChild(box); }
        const sig = repos.length + ":" + Math.round(area.left) + ":" + Math.round(y.getPixelForValue(0));
        if (box.dataset.sig === sig && box.childElementCount === repos.length) return;
        box.dataset.sig = sig;
        box.style.width = area.left + "px";
        box.textContent = "";
        repos.forEach((r, i) => {
          const a = document.createElement("a");
          a.className = "label-link";
          a.href = r.url; a.target = "_blank"; a.rel = "noopener";
          a.title = r.name; a.textContent = r.short;
          a.style.top = y.getPixelForValue(i) + "px";
          box.appendChild(a);
        });
      },
    };
  }

  function render(items) {
    if (!items.length) throw new Error("GitHub returned no repositories for this range - try again in a minute");
    const byStars = [...items].sort((a, b) => b.stars - a.stars);

    // 01 - leaderboard: top 10 by stars
    {
      const top = byStars.slice(0, 10);
      story("leaders", `${top[0].name} leads the week with ${fmt.format(top[0].stars)} stars - ` +
        `${(top[0].stars / Math.max(1, top[9].stars)).toFixed(1)}x the #10 spot. Click a bar to open the repo.`);
      make("leaders", {
        type: "bar",
        data: {
          labels: top.map((r) => r.short),
          datasets: [{ data: top.map((r) => r.stars), backgroundColor: SERIES[0], borderRadius: 4, barPercentage: 0.72 }],
        },
        options: {
          indexAxis: "y",
          maintainAspectRatio: false,
          ...repoLink((i) => top[i] && top[i].url),
          animation: { duration: 380, easing: "easeOutQuart", delay: delayByIndex },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { title: (c) => top[c[0].dataIndex].name, label: (c) => ` ${fmt.format(c.parsed.x)} stars` } },
          },
          scales: linkableScales(),
        },
        plugins: [labelLinksPlugin(() => top)],
      });
    }

    // 02 - language share doughnut (top 7 + Other)
    {
      const langs = topLanguages(items, 7);
      const counted = sum(langs, ([, rs]) => rs.length);
      const other = items.length - counted;
      const labels = [...langs.map(([k]) => k), "Other"];
      const data = [...langs.map(([, rs]) => rs.length), other];
      const sharePct = Math.round((langs[0][1].length / items.length) * 100);
      story("langShare", `${langs[0][0]} owns ${sharePct}% of the week's trending repos.`);
      make("langShare", {
        type: "doughnut",
        data: { labels, datasets: [{ data, backgroundColor: SERIES.slice(0, labels.length), borderColor: SURFACE, borderWidth: 2 }] },
        options: {
          maintainAspectRatio: false,
          cutout: "62%",
          animation: { animateRotate: true, duration: 420, easing: "easeOutQuart" },
          plugins: { legend: { position: "right" } },
        },
      });
    }

    // 03 - star velocity: stars per day of life, top 10
    {
      const fast = [...items].sort((a, b) => b.stars / ageDays(b) - a.stars / ageDays(a)).slice(0, 10);
      const rate = (r) => Math.round(r.stars / ageDays(r));
      story("velocity", `${fast[0].short} is gaining ~${fmt.format(rate(fast[0]))} stars per day - the steepest climb this week.`);
      make("velocity", {
        type: "bar",
        data: {
          labels: fast.map((r) => r.short),
          datasets: [{ data: fast.map(rate), backgroundColor: SERIES[5], borderRadius: 4, barPercentage: 0.72 }],
        },
        options: {
          indexAxis: "y",
          maintainAspectRatio: false,
          ...repoLink((i) => fast[i] && fast[i].url),
          animation: { duration: 380, easing: "easeOutQuart", delay: delayByIndex },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { title: (c) => fast[c[0].dataIndex].name, label: (c) => ` ~${fmt.format(c.parsed.x)} stars/day` } },
          },
          scales: linkableScales(),
        },
        plugins: [labelLinksPlugin(() => fast)],
      });
    }

    // 04 - stars vs forks bubble (size = open issues)
    {
      const top40 = byStars.slice(0, 40);
      const maxIssues = Math.max(...top40.map((r) => r.issues), 1);
      const forkiest = [...top40].sort((a, b) => b.forks / Math.max(1, b.stars) - a.forks / Math.max(1, a.stars))[0];
      story("scatter", `Each bubble is a repo (size = open issues). ${forkiest.short} has the highest fork-to-star ratio - people don't just watch it, they take it apart.`);
      make("scatter", {
        type: "bubble",
        data: {
          datasets: [{
            data: top40.map((r) => ({ x: r.stars, y: r.forks, r: 4 + (r.issues / maxIssues) * 14, repo: r })),
            backgroundColor: SERIES[0] + "b3",
            borderColor: SERIES[0],
            borderWidth: 1.5,
          }],
        },
        options: {
          maintainAspectRatio: false,
          ...repoLink((i) => top40[i] && top40[i].url),
          animation: { duration: 420, easing: "easeOutQuart", delay: (ctx) => (ctx.type === "data" ? ctx.dataIndex * 8 : 0) },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: (c) => c[0].raw.repo.name,
                label: (c) => ` ${fmt.format(c.raw.repo.stars)} stars / ${fmt.format(c.raw.repo.forks)} forks / ${fmt.format(c.raw.repo.issues)} issues`,
              },
            },
          },
          scales: {
            x: { type: "logarithmic", title: { display: true, text: "stars (log)" }, grid: { color: GRID }, ticks: { callback: (val) => compact.format(val) } },
            y: { title: { display: true, text: "forks" }, grid: { color: GRID }, ticks: { callback: (val) => compact.format(val) } },
          },
        },
      });
    }

    // 05 - total stars by language (top 8)
    {
      const langs = [...groupBy(items, (r) => r.language)]
        .filter(([k]) => k !== "Unknown")
        .map(([k, rs]) => [k, sum(rs, (r) => r.stars)])
        .sort((a, b) => b[1] - a[1]).slice(0, 8);
      story("langStars", `${langs[0][0]} repos pulled ${compact.format(langs[0][1])} stars combined - the gravity well of the week.`);
      make("langStars", {
        type: "bar",
        data: {
          labels: langs.map(([k]) => k),
          datasets: [{ data: langs.map(([, s]) => s), backgroundColor: SERIES[4], borderRadius: 4, barPercentage: 0.66 }],
        },
        options: {
          maintainAspectRatio: false,
          animation: { duration: 380, easing: "easeOutQuart", delay: delayByIndex },
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${fmt.format(c.parsed.y)} stars total` } } },
          scales: barScales(false),
        },
      });
    }

    // 06 - birth timeline: creations per day
    {
      const byDay = groupBy(items, (r) => r.created.slice(0, 10));
      const days = [...byDay.keys()].sort();
      const busiest = days.reduce((a, b) => (byDay.get(b).length > byDay.get(a).length ? b : a), days[0]);
      story("timeline", `${byDay.get(busiest).length} of this week's risers were born on ${busiest} - launch day matters.`);
      make("timeline", {
        type: "line",
        data: {
          labels: days.map((d) => d.slice(5)),
          datasets: [{
            data: days.map((d) => byDay.get(d).length),
            borderColor: SERIES[6],
            backgroundColor: SERIES[6] + "33",
            fill: true,
            tension: 0.35,
            borderWidth: 2,
            pointRadius: 4,
            pointBackgroundColor: SERIES[6],
          }],
        },
        options: {
          maintainAspectRatio: false,
          animation: { duration: 500, easing: "easeInOutQuart" },
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.parsed.y} repos created` } } },
          scales: {
            x: { grid: { color: "transparent" }, border: { color: v("--baseline") } },
            y: { beginAtZero: true, grid: { color: GRID }, ticks: { precision: 0 } },
          },
        },
      });
    }

    // 07 - license distribution (top 5 + rest)
    {
      const lic = [...groupBy(items, (r) => r.license)].sort((a, b) => b[1].length - a[1].length);
      const top5 = lic.slice(0, 5);
      const rest = sum(lic.slice(5), ([, rs]) => rs.length);
      const labels = [...top5.map(([k]) => (k === "None" ? "No license" : k)), "Other"];
      const data = [...top5.map(([, rs]) => rs.length), rest];
      const noLicense = (lic.find(([k]) => k === "None") || [null, []])[1].length;
      story("licenses", `${noLicense} of ${items.length} trending repos ship with no license at all - use at your own risk.`);
      make("licenses", {
        type: "doughnut",
        data: { labels, datasets: [{ data, backgroundColor: SERIES.slice(0, labels.length), borderColor: SURFACE, borderWidth: 2 }] },
        options: {
          maintainAspectRatio: false,
          cutout: "62%",
          animation: { animateRotate: true, duration: 420, easing: "easeOutQuart" },
          plugins: { legend: { position: "right" } },
        },
      });
    }

    // 08 - orgs vs individuals
    {
      const orgs = items.filter((r) => r.ownerType === "Organization").length;
      const users = items.length - orgs;
      const winner = orgs > users ? "Organizations" : "Individual developers";
      story("owners", `${winner} own this week's trending page: ${orgs} org-backed vs ${users} personal repos.`);
      make("owners", {
        type: "doughnut",
        data: {
          labels: ["Individuals", "Organizations"],
          datasets: [{ data: [users, orgs], backgroundColor: [SERIES[0], SERIES[3]], borderColor: SURFACE, borderWidth: 2 }],
        },
        options: {
          maintainAspectRatio: false,
          cutout: "62%",
          animation: { animateRotate: true, duration: 420, easing: "easeOutQuart" },
          plugins: { legend: { position: "right" } },
        },
      });
    }

    // 09 - average stars per repo by language (min 3 repos)
    {
      const langs = [...groupBy(items, (r) => r.language)]
        .filter(([k, rs]) => k !== "Unknown" && rs.length >= 3)
        .map(([k, rs]) => [k, Math.round(sum(rs, (r) => r.stars) / rs.length), rs.length])
        .sort((a, b) => b[1] - a[1]).slice(0, 8);
      story("avgStars", `Per repo, ${langs[0][0]} runs hottest: ${fmt.format(langs[0][1])} stars on average (languages with 3+ trending repos).`);
      const langImgs = langs.map(([k]) => LANG_ICON[k] ? loadImg(LANG_ICON[k]) : null);
      make("avgStars", {
        type: "bar",
        data: {
          labels: langs.map(([k]) => k),
          datasets: [{ data: langs.map(([, avg]) => avg), backgroundColor: SERIES[2], borderRadius: 4, barPercentage: 0.66 }],
        },
        options: {
          layout: { padding: { bottom: 28 } },
          maintainAspectRatio: false,
          animation: { duration: 380, easing: "easeOutQuart", delay: delayByIndex },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (c) => ` ${fmt.format(c.parsed.y)} avg stars (${langs[c.dataIndex][2]} repos)` } },
          },
          scales: barScales(false),
        },
        plugins: [axisImgPlugin(langImgs, "x")],
      });
    }

    // 10 - open issues on the top 10
    {
      const top = byStars.slice(0, 10);
      const heaviest = [...top].sort((a, b) => b.issues - a.issues)[0];
      story("issues", `Fame has a price: ${heaviest.short} already carries ${fmt.format(heaviest.issues)} open issues.`);
      const ownerImgs = top.map((r) => loadImg(`https://avatars.githubusercontent.com/${r.owner}?s=20`));
      make("issues", {
        type: "bar",
        data: {
          labels: top.map((r) => r.short),
          datasets: [{ data: top.map((r) => r.issues), backgroundColor: SERIES[7], borderRadius: 4, barPercentage: 0.72 }],
        },
        options: {
          indexAxis: "y",
          maintainAspectRatio: false,
          ...repoLink((i) => top[i] && top[i].url),
          animation: { duration: 380, easing: "easeOutQuart", delay: delayByIndex },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { title: (c) => top[c[0].dataIndex].name, label: (c) => ` ${fmt.format(c.parsed.x)} open issues` } },
          },
          scales: linkableScales(),
        },
        plugins: [axisImgPlugin(ownerImgs, "y"), labelLinksPlugin(() => top)],
      });
    }

    // 11 - hot topics
    {
      const counts = new Map();
      for (const r of items) for (const t of r.topics) counts.set(t, (counts.get(t) || 0) + 1);
      const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 10);
      if (top.length) {
        story("topics", `"${top[0][0]}" is the most-tagged topic - on ${top[0][1]} of the week's trending repos.`);
        make("topics", {
          type: "bar",
          data: {
            labels: top.map(([k]) => k),
            datasets: [{ data: top.map(([, n]) => n), backgroundColor: SERIES[1], borderRadius: 4, barPercentage: 0.72 }],
          },
          options: {
            indexAxis: "y",
            maintainAspectRatio: false,
            animation: { duration: 380, easing: "easeOutQuart", delay: delayByIndex },
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` tagged on ${c.parsed.x} repos` } } },
            scales: { ...barScales(true), x: { ...barScales(true).x, ticks: { precision: 0 } } },
          },
        });
      } else {
        story("topics", "No topics tagged on this week's set.");
      }
    }

    // 12 - the long tail: star-class histogram
    {
      const buckets = [
        ["< 100", (s) => s < 100],
        ["100 - 500", (s) => s >= 100 && s < 500],
        ["500 - 1k", (s) => s >= 500 && s < 1000],
        ["1k - 5k", (s) => s >= 1000 && s < 5000],
        ["5k +", (s) => s >= 5000],
      ];
      const data = buckets.map(([, f]) => items.filter((r) => f(r.stars)).length);
      const eliteCount = data[4] + data[3];
      story("classes", `Trending is a pyramid: only ${eliteCount} of ${items.length} repos broke 1k stars this week. The rest are climbing.`);
      make("classes", {
        type: "bar",
        data: {
          labels: buckets.map(([k]) => k),
          datasets: [{ data, backgroundColor: SERIES[3], borderRadius: 4, barPercentage: 0.6 }],
        },
        options: {
          maintainAspectRatio: false,
          animation: { duration: 380, easing: "easeOutQuart", delay: delayByIndex },
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.parsed.y} repos` } } },
          scales: { ...barScales(false), y: { ...barScales(false).y, ticks: { precision: 0 } } },
        },
      });
    }
  }

  // ---------- reveal cards (immediate + staggered on scroll) ----------
  function observeCards() {
    const cards = document.querySelectorAll(".card");
    // show first row immediately
    cards.forEach((c, i) => {
      if (i < 3) { c.style.transitionDelay = `${i * 40}ms`; c.classList.add("in"); }
    });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.style.transitionDelay = "0ms";
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.05 });
    cards.forEach((c, i) => { if (i >= 3) io.observe(c); });
  }

  // ---------- boot ----------
  const loading = document.getElementById("loading");
  const grid = document.getElementById("chartGrid");
  const errorBox = document.getElementById("error");

  async function refreshCharts(days) {
    loading.hidden = false;
    grid.hidden = true;
    errorBox.hidden = true;

    Object.values(Chart.instances || {}).forEach((c) => { try { c.destroy(); } catch (_) {} });
    document.querySelectorAll(".card").forEach((c) => c.classList.remove("in"));

    const isTrending = days === "trending";

    try {
      const items = isTrending ? await fetchRealTrending() : await fetchTrending(days);
      loading.hidden = true;
      grid.hidden = false;
      render(items);
      observeCards();
    } catch (err) {
      loading.hidden = true;
      errorBox.hidden = false;
      document.getElementById("errorMsg").textContent = String(err.message || err);
    }
  }

  document.getElementById("rangeBar").addEventListener("click", (e) => {
    const btn = e.target.closest(".range-btn");
    if (!btn) return;
    document.querySelectorAll(".range-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const val = btn.dataset.days;
    refreshCharts(val === "trending" ? "trending" : Number(val));
  });

  refreshCharts("trending");
})();
