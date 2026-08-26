# Newlywed Pooper Scoopers — Squarespace Codebase

This repository is the source of truth for the custom code used by the Newlywed Pooper Scoopers Squarespace site.

## Structure

- `squarespace/styles.css` — site styling loaded by Squarespace
- `squarespace/quote.js` — quote-calculator behavior loaded by Squarespace
- `squarespace/head-fonts.html` — Google Font tags used by the site
- `squarespace/homepage.html` — reference copy of the homepage HTML when maintained here

## Recommended Squarespace setup

Use GitHub Pages to publish this repository, then reference the hosted CSS and JavaScript from Squarespace Code Injection. The page HTML can remain in a Squarespace Code Block while CSS and JavaScript are maintained here.

### Header injection

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Titan+One&family=Fraunces:ital,wght@0,400;0,500;0,600;1,500;1,600&family=Caveat:wght@600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="YOUR_GITHUB_PAGES_URL/squarespace/styles.css">
```

### Footer injection

```html
<script src="YOUR_GITHUB_PAGES_URL/squarespace/quote.js"></script>
```

## Important: quote form

The current quote calculator UI works, but the form submission still needs to be connected to a real lead destination before launch. The existing behavior should not be treated as confirmed lead delivery until that backend is wired up.

## Updating the site

Once Squarespace references the GitHub Pages CSS and JS URLs, changes committed to those files can flow through to the live site without manually pasting the entire CSS or JavaScript again.
