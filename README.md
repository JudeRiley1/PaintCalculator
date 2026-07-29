# Paper + Paint

An iPad-friendly CMYK-to-acrylic paint calculator for brown paper banners.

Enter CMYK values copied from Adobe to get a scaled Master's Touch mixing
recipe. The calculator includes a brown-paper preview, white-base and
direct-to-paper modes, dry-swatch adjustments, and a banner palette saved
locally on the device.

## Publish with GitHub Pages

1. Create a GitHub repository and push this project to its `main` branch.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **GitHub Actions**.
4. The included workflow will build and publish the site automatically.

## Work locally

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

The calculator is a studio starting point. CMYK describes printer ink, so a
dried paint swatch on the actual paper is still the final color check.
