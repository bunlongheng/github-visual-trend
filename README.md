# trends

[github.com/trending](https://github.com/trending) is a list. Lists hide the story.

This project pulls the week's rising repositories from the GitHub Search API and turns
them into **12 animated Chart.js charts** that tell the story visually - who is winning,
in which language, at what velocity, and how lopsided the race really is.

## The 12 charts

| # | Chart | The story it tells |
|---|-------|--------------------|
| 01 | The leaderboard | Top 10 risers by stars, and how far ahead #1 really is |
| 02 | Language share | Which language owns the trending page this week |
| 03 | Star velocity | Stars gained per day of life - the steepest climbers |
| 04 | Stars vs forks | Bubble field: watched vs taken-apart (size = open issues) |
| 05 | Stars by language | Total gravity per language |
| 06 | Birth timeline | Which launch day produced the most risers |
| 07 | License picks | How much of trending ships with no license at all |
| 08 | Orgs vs individuals | Who owns the page: companies or solo devs |
| 09 | Average heat per repo | The language that runs hottest per repo |
| 10 | Issue load at the top | The price of fame in open issues |
| 11 | Hot topics | Most-tagged topics across the set |
| 12 | The long tail | Star-class pyramid: how few actually break 1k |

## How it works

- **Data**: `GET https://api.github.com/search/repositories?q=created:>7-days-ago&sort=stars` - top 100, no API key needed
- **Charts**: Chart.js 4 via CDN, staggered entrance animations, hover tooltips on every mark
- **Caching**: responses cached 30 minutes in `localStorage` to respect the unauthenticated rate limit
- **Zero build**: plain HTML/CSS/JS - open `index.html` or serve the folder

```bash
# run locally
python3 -m http.server 8080
# open http://localhost:8080
```

## Notes on the data

- **Rate limit**: unauthenticated GitHub API allows 60 requests/hour per IP. The 30-minute `localStorage` cache keeps normal browsing well under that; hammer the range buttons and you may hit a `403` (the app shows a "rate limited, retry in a minute" message).
- **The `trending` button**: GitHub has no public API for github.com/trending, so that view is a labeled static snapshot of one week's trending repos (their live star/fork/issue counts are still fetched fresh). Every other range is fully live from the Search API.

## Design notes

- Dark observatory theme, film-grain overlay, Fraunces + IBM Plex Mono
- 8-slot categorical palette validated for colorblind-safe adjacent separation (CVD dE >= 8.4) and 3:1 contrast on the dark surface
- Single axis per chart, direct tooltips, legends only where there are 2+ series
- Fully responsive: 2-column grid collapses to 1 on mobile; respects `prefers-reduced-motion`

## License

MIT
