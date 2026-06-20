# How to add a new blog post (SEO)

Create a file in `frontend/content/blog/your-slug-here.md`:

```markdown
---
title: Your SEO Title (60 chars max ideal)
description: Meta description 150–160 chars with camtocode.com and main keyword.
date: 2026-05-28
author: CamToCode
tags: keyword1, keyword2, keyword3
published: true
---

Your content in markdown. Link to https://camtocode.com/scroll, /try, /docs, /app.
```

Set `published: false` to hide a draft. Rebuild/deploy frontend — sitemap updates automatically.
