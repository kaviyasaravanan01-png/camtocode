# CamToCode SEO & Marketing Guide

**Site:** [https://camtocode.com](https://camtocode.com)  
**Sitemap:** https://camtocode.com/sitemap.xml  
**Blog:** https://camtocode.com/blog  

---

## What is already implemented (technical SEO)

| Item | Status |
|------|--------|
| `metadataBase` → camtocode.com | ✅ |
| Per-page titles, descriptions, canonical URLs | ✅ `/scroll`, `/docs`, `/try`, `/blog/*` |
| Open Graph + Twitter cards | ✅ |
| `robots.txt` + sitemap.xml | ✅ (blog posts auto-included) |
| JSON-LD: WebSite, SoftwareApplication, Organization, Blog, BlogPosting | ✅ |
| Expanded keywords (scroll, office laptop, etc.) | ✅ |
| Internal links (footer, nav, blog → /try, /scroll, /app) | ✅ |
| Mobile PWA manifest | ✅ |

**Vercel env:** set `NEXT_PUBLIC_SITE_URL=https://camtocode.com`

---

## How to add blog posts (content SEO)

1. Create `frontend/content/blog/your-slug.md`
2. Use frontmatter (see `frontend/content/blog/README.md`)
3. Include keywords naturally + links to camtocode.com pages
4. Deploy frontend → sitemap updates automatically
5. Request indexing in Google Search Console for new URLs

**Post ideas (high search intent):**
- "how to scan python code from laptop screen"
- "OCR for coding interview preparation"
- "copy code from screen without typing"
- "best free OCR for developers 2026"
- "scan MCQ from phone camera"

Aim for **1–2 posts per month**, 800–1200 words, real screenshots.

---

## Increase SEO ranking (action checklist)

### Week 1 — Foundation
- [ ] Verify domain in **Google Search Console** → submit sitemap
- [ ] Verify **Bing Webmaster Tools**
- [ ] Set `NEXT_PUBLIC_SITE_URL=https://camtocode.com` on Vercel
- [ ] Confirm all pages return 200 (no redirect chains)

### Week 2 — Content
- [ ] Publish 2 more blog posts targeting long-tail keywords
- [ ] Add FAQ schema to landing (already has FAQ section — ensure visible)
- [ ] Link blog posts from Reddit r/learnprogramming, Dev.to (canonical link to camtocode.com)

### Ongoing — Authority
- [ ] **Backlinks:** list on Product Hunt, Indie Hackers, AlternativeTo, SaaS directories
- [ ] **YouTube:** demo video with description linking camtocode.com + /scroll
- [ ] **GitHub:** public docs repo or awesome-list PR mentioning CamToCode
- [ ] **Nexcraft site:** product page linking to camtocode.com (do-follow)

### Technical
- [ ] Add real OG image (1200×630 PNG) — replace icon.svg for social shares
- [ ] Core Web Vitals: keep landing lightweight (already good on Vercel)
- [ ] HTTPS only (Vercel default)

---

## Marketing — get users

### Free channels (start here)

| Channel | Action |
|---------|--------|
| **Product Hunt** | Launch with demo video + free tier hook |
| **Reddit** | r/programming, r/learnpython, r/webdev — help first, link in comments |
| **Dev.to / Hashnode** | Republish blog posts with canonical URL |
| **YouTube Shorts / Reels** | 30s: phone scans laptop → code appears. Link in bio |
| **LinkedIn** | Target developers + students; post Scroll Automation angle |
| **WhatsApp / Telegram** | Share `/try` link in dev groups |
| **College / bootcamp** | Offer free tier for students |

### Paid (when ready)

| Channel | Budget | Target |
|---------|--------|--------|
| Google Ads | ₹500–2000/mo | "OCR code", "scan code from image" |
| Meta / Instagram | ₹500/mo | Student/developer interest targeting |
| YouTube pre-roll | Low budget | Dev tool channels |

### Conversion funnel

```
Awareness → camtocode.com or /try (1 free scan)
         → Sign up (free tier)
         → Habit (Scroll + recapture)
         → Upgrade ($5–24/mo)
```

**Key messages:**
- "No install — works on office laptop"
- "Free Scroll Automation — only on CamToCode"
- "Free to start — 3 AI scans/day"

### Referral ideas
- Share buttons in History (already added)
- "Share CamToCode" on landing (ShareButtons component)
- Future: referral credits for invites

---

## Metrics to track

- Google Search Console: impressions, clicks, queries
- Vercel Analytics or Plausible (privacy-friendly)
- Supabase: sign-ups per day
- Razorpay: conversion to paid
- `/try` vs `/app` traffic ratio

---

## Nexcraft cross-promotion

Add CamToCode to Nexcraft portfolio using `docs/NEXCRAFT_PRODUCT_CAMTOCODE.md`.  
Link **camtocode.com** from Nexcraft footer "Products" — helps SEO backlink.

---

## Google Flow video (marketing asset)

Use screen recordings in demo sections; upload to YouTube with:

**Title:** CamToCode — Scan Code From Your Phone Camera | Free AI OCR  
**Description:** First 2 lines = value prop + link https://camtocode.com  
**Tags:** camera to code, OCR, developer tools, camtocode  

Embed YouTube on landing page later for engagement + SEO.

---

*Last updated: May 2026*
